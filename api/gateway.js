const MODEL = "qwen-audio-3.1-asr-flash-filetrans";
export async function dispatch(body) {
  const { action, key, taskId, payload, url } = body;
  if (action === "download") {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      !/(^|\.)(aliyuncs\.com|myqcloud\.com|autodl\.art|volces\.com)$/.test(
        parsed.hostname,
      )
    )
      throw new Error("仅支持阿里云和 AutoDL 结果地址");
    return fetch(parsed, {
      signal: AbortSignal.timeout(50000),
      redirect: "error",
    });
  }
  if (!key || typeof key !== "string" || key.length > 2000)
    throw new Error("请先在设置中填写 API Key");
  if (action === "ai-chat" || action === "ai-models") {
    const ai = new URL(body.aiBase || "https://api.0-0.pro/v1");
    if (
      ai.protocol !== "https:" ||
      ai.username ||
      ai.port ||
      ai.password ||
      !/(^|\.)(0-0\.pro|openai\.com)$/.test(ai.hostname)
    )
      throw new Error(
        "同站代理支持 0-0.pro / OpenAI 官方域名，其他中转请使用直连或自己的代理",
      );
    return fetch(
      ai.href.replace(/\/$/, "") +
        (action === "ai-chat" ? "/chat/completions" : "/models"),
      {
        method: action === "ai-chat" ? "POST" : "GET",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: action === "ai-chat" ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(50000),
      },
    );
  }
  let base = (body.base || "https://dashscope.aliyuncs.com").replace(/\/$/, "");
  const host = new URL(base);
  if (
    host.protocol !== "https:" ||
    host.username ||
    host.password ||
    host.port ||
    !/(^|\.)(dashscope\.aliyuncs\.com|dashscope-intl\.aliyuncs\.com|maas\.aliyuncs\.com)$/.test(
      host.hostname,
    ) ||
    host.pathname !== "/"
  )
    throw new Error("百炼地址必须为官方 HTTPS 域名");
  const headers = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
  let target,
    method = "GET",
    data;
  switch (action) {
    case "asr-policy":
      target = `${base}/api/v1/uploads?action=getPolicy&model=${MODEL}`;
      break;
    case "asr-submit":
      target = `${base}/api/v1/services/audio/asr/transcription`;
      method = "POST";
      headers["X-DashScope-Async"] = "enable";
      headers["X-DashScope-OssResourceResolve"] = "enable";
      data = {
        model: MODEL,
        input: { file_urls: [payload.fileUrl] },
        parameters: {
          channel_id: [0],
          diarization_enabled: !!payload.diarization,
          ...(payload.vocabulary ? { vocabulary: payload.vocabulary } : {}),
        },
      };
      break;
    case "asr-result":
      target = `${base}/api/v1/tasks/${encodeURIComponent(taskId)}`;
      break;
    case "tts-submit":
      target =
        "https://autodl.art/api/v1/comfyui/comfyui_workflow/indextts2-v1";
      method = "POST";
      headers.Authorization = key;
      data = payload;
      break;
    case "tts-result":
      target = `https://autodl.art/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(taskId)}`;
      headers.Authorization = key;
      break;
    case "tts-check":
      target = "https://autodl.art/api/v1/comfyui/workflows/indextts2-v1";
      headers.Authorization = key;
      break;
    default:
      throw new Error("不支持的操作");
  }
  return fetch(target, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(50000),
  });
}
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }
  try {
    let body = req.body;
    if (!body) {
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        length += buffer.length;
        if (length > 4_000_000)
          throw new Error("请求过大，请使用小于 2MB 的参考音频");
      }
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    if (typeof body === "string") body = JSON.parse(body);
    const response = await dispatch(body);
    res.statusCode = response.status;
    res.setHeader(
      "Content-Type",
      response.headers.get("content-type") || "application/json",
    );
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ message: error.message || "请求失败" }));
  }
}
