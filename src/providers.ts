import type { Settings, Voice } from "./model";
import { getMedia } from "./storage";
const MODEL = "qwen-audio-3.1-asr-flash-filetrans";
export async function api(
  s: Settings,
  action: string,
  extra: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<any> {
  const key = action.startsWith("tts")
    ? s.autodlKey
    : action.startsWith("ai")
      ? s.aiKey
      : s.aliyunKey;
  const body = { action, key, base: s.asrBase, aiBase: s.aiBase, ...extra };
  let r: Response;
  if (s.transport === "gateway")
    r = await fetch(s.gateway, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  else {
    let url = "",
      method = "GET",
      data: unknown;
    const headers: Record<string, string> = {
      Authorization: action.startsWith("tts") ? key : "Bearer " + key,
    };
    const p = extra.payload as any;
    switch (action) {
      case "asr-policy":
        url = s.asrBase + "/api/v1/uploads?action=getPolicy&model=" + MODEL;
        break;
      case "asr-submit":
        url = s.asrBase + "/api/v1/services/audio/asr/transcription";
        method = "POST";
        headers["X-DashScope-Async"] = "enable";
        headers["X-DashScope-OssResourceResolve"] = "enable";
        data = {
          model: MODEL,
          input: { file_urls: [p.fileUrl] },
          parameters: {
            channel_id: [0],
            diarization_enabled: p.diarization,
            ...(p.vocabulary ? { vocabulary: p.vocabulary } : {}),
          },
        };
        break;
      case "asr-result":
        url =
          s.asrBase +
          "/api/v1/tasks/" +
          encodeURIComponent(String(extra.taskId));
        break;
      case "tts-submit":
        url = "https://autodl.art/api/v1/comfyui/comfyui_workflow/indextts2-v1";
        method = "POST";
        data = p;
        break;
      case "tts-check":
        url = "https://autodl.art/api/v1/comfyui/workflows/indextts2-v1";
        break;
      case "tts-result":
        url =
          "https://autodl.art/api/v1/comfyui/comfyui_workflow/result/" +
          encodeURIComponent(String(extra.taskId));
        break;
      case "ai-chat":
        url = s.aiBase.replace(/\/$/, "") + "/chat/completions";
        method = "POST";
        data = p;
        break;
      case "ai-models":
        url = s.aiBase.replace(/\/$/, "") + "/models";
        break;
      default:
        throw new Error("未知 API 操作");
    }
    if (data) headers["Content-Type"] = "application/json";
    r = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      signal,
    });
  }
  let d: any;
  try {
    d = await r.json();
  } catch {
    throw new Error(
      "API 返回非 JSON 内容（HTTP " +
        r.status +
        "）。请检查部署是否包含 api/gateway.js。",
    );
  }
  if (!r.ok || (d.code && d.code !== "Success"))
    throw new Error(
      d.error?.message || d.message || d.msg || "HTTP " + r.status,
    );
  return d;
}
export async function remoteBlob(
  s: Settings,
  url: string,
  signal?: AbortSignal,
) {
  let r: Response;
  try {
    r = await fetch(url, { signal });
    if (!r.ok) throw new Error("download");
  } catch (e) {
    if (signal?.aborted) throw e;
    if (s.transport === "direct")
      throw new Error("结果下载被跨域限制，请切换同站代理模式");
    r = await fetch(s.gateway, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "download", url }),
      signal,
    });
  }
  if (!r.ok) throw new Error("结果下载失败：HTTP " + r.status);
  return r.blob();
}
const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("已停止等待", "AbortError"));
      return;
    }
    const abort = () => {
      clearTimeout(t);
      reject(new DOMException("已停止等待", "AbortError"));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
export async function transcribe(
  blob: Blob,
  s: Settings,
  onStatus: (v: string) => void,
  signal?: AbortSignal,
) {
  if (!s.aliyunKey) throw new Error("请在 API 设置中填写百炼 API Key");
  onStatus("获取临时上传凭证");
  const policy = (await api(s, "asr-policy", {}, signal)).data,
    object = policy.upload_dir + "/" + crypto.randomUUID() + ".wav";
  const form = new FormData();
  for (const [k, v] of Object.entries({
    OSSAccessKeyId: policy.oss_access_key_id,
    policy: policy.policy,
    Signature: policy.signature,
    key: object,
    "x-oss-object-acl": policy.x_oss_object_acl,
    "x-oss-forbid-overwrite": policy.x_oss_forbid_overwrite,
    success_action_status: "200",
  }))
    form.append(k, String(v));
  form.append("file", blob, "audio.wav");
  onStatus("上传音频到百炼临时存储");
  const upload = await fetch(policy.upload_host, {
    method: "POST",
    body: form,
    signal,
  });
  if (!upload.ok) throw new Error("音频上传失败：" + upload.status);
  const vocabulary = Object.fromEntries(
    s.hotwords
      .split(/[,，\n]/)
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => [v, 3]),
  );
  const job = await api(
    s,
    "asr-submit",
    {
      payload: {
        fileUrl: "oss://" + object,
        diarization: s.diarization,
        vocabulary,
      },
    },
    signal,
  );
  const id = job.output.task_id;
  for (let i = 0; i < 600; i++) {
    onStatus("正在识别，等待云端结果…");
    await wait(Math.min(2000 + i * 100, 5000), signal);
    const d = await api(s, "asr-result", { taskId: id }, signal),
      out = d.output;
    if (out.task_status === "SUCCEEDED") {
      const result = out.results?.[0] || out.output?.results?.[0] || out,
        url =
          result.transcription_url ||
          out.transcription_url ||
          out.output?.transcription_url;
      if (!url) throw new Error("识别完成但没有结果文件");
      return JSON.parse(await (await remoteBlob(s, url, signal)).text());
    }
    if (["FAILED", "CANCELED", "UNKNOWN"].includes(out.task_status))
      throw new Error(out.message || out.code || "语音识别失败");
  }
  throw new Error("识别等待超时，请稍后重试");
}
export async function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
export async function submitTts(
  text: string,
  voice: Voice,
  s: Settings,
  signal?: AbortSignal,
) {
  if (!s.autodlKey) throw new Error("请在 API 设置中填写 AutoDL Token");
  if (!text.trim()) throw new Error("配音文本不能为空");
  if (text.length > 2048) throw new Error("单句文本不能超过 2048 字符");
  const ref = await getMedia(voice.assetId);
  if (ref.size > 2_000_000)
    throw new Error("参考音频过大，请选用小于 2MB 的短音频");
  const payload: Record<string, unknown> = {
    prompt_text: text,
    prompt_simple: await dataUrl(ref),
    emo_control_method: voice.method,
    emo_random: voice.random,
    ...voice.emotions,
  };
  if (voice.method === "使用情感参考音频") {
    if (!voice.emotionAssetId) throw new Error("请上传情感参考音频");
    payload.emo_ref_audio = await dataUrl(await getMedia(voice.emotionAssetId));
  }
  const d = await api(s, "tts-submit", { payload }, signal);
  return String(d.data.task_id);
}
export async function pollTts(
  id: string,
  s: Settings,
  onStatus: (v: string) => void,
  signal?: AbortSignal,
) {
  for (let i = 0; i < 450; i++) {
    await wait(Math.min(2000 + i * 150, 5000), signal);
    const d = await api(s, "tts-result", { taskId: id }, signal),
      status = String(d.data.status).toUpperCase();
    onStatus(status);
    if (["SUCCESS", "COMPLETED", "SUCCEEDED"].includes(status)) {
      const url = d.data.results?.find((x: any) => x.type === "audio")?.url;
      if (!url) throw new Error("生成任务缺少音频结果");
      return remoteBlob(s, url, signal);
    }
    if (["FAILED", "FAILURE", "ERROR", "CANCELLED"].includes(status))
      throw new Error(d.msg || d.data.message || "配音生成失败");
  }
  throw new Error("等待超时；任务可能仍在云端运行，可稍后继续查询");
}
