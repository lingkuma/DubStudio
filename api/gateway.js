import { isIP } from "node:net";
const MODEL = "qwen-audio-3.1-asr-flash-filetrans";
function publicAddress(address) {
  const ip = address.toLowerCase();
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19)));
  }
  // Only global-unicast IPv6; this also rejects mapped IPv4 and local addresses.
  return isIP(ip) === 6 && /^[23]/.test(ip) && !ip.startsWith("2001:db8:");
}
async function publicUrl(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error("代理地址须为 HTTPS，不能在 URL 中包含用户名或密码");
  const host = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
    throw new Error("代理目标不能是本机或内网地址");
  // Basic URL guard only; this is not caller authentication or DNS isolation.
  // Keep normal proxy/VPN DNS setups working when they use synthetic addresses.
  if (isIP(host) && !publicAddress(host))
    throw new Error("代理目标不能是本机或内网地址");
  return parsed;
}
export async function dispatch(body) {
  const { action, key, taskId, payload, url } = body;
  if (action === "download") {
    const parsed = await publicUrl(url);
    return fetch(parsed, {
      signal: AbortSignal.timeout(50000),
      redirect: "error",
    });
  }
  if (!key || typeof key !== "string" || key.length > 2000)
    throw new Error("请先在设置中填写 API Key");
  if (action === "ai-chat" || action === "ai-models") {
    const ai = await publicUrl(body.aiBase || "https://api.0-0.pro/v1");
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
        redirect: "error",
      },
    );
  }
  const isTts = action.startsWith("tts-");
  const host = await publicUrl(isTts
    ? body.ttsBase || "https://autodl.art"
    : body.base || "https://dashscope.aliyuncs.com");
  const base = host.href.replace(/\/+$/, "");
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
      target = `${base}/api/v1/comfyui/comfyui_workflow/indextts2-v1`;
      method = "POST";
      headers.Authorization = key;
      data = payload;
      break;
    case "tts-result":
      target = `${base}/api/v1/comfyui/comfyui_workflow/result/${encodeURIComponent(taskId)}`;
      headers.Authorization = key;
      break;
    case "tts-check":
      target = `${base}/api/v1/comfyui/workflows/indextts2-v1`;
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
    redirect: "error",
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
