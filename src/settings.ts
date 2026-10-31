import { defaults, restoreSettings, type Settings } from "./model";

const storageKey = "dubstudio-settings";
const channels = ["asr", "tts", "ai"] as const;
const stringFields = [
  "aliyunKey", "autodlKey", "asrBase", "autodlBase", "hotwords",
  "aiBase", "aiKey", "aiModel",
] as const;
const connectionFields = ["transport", "gateway", "workerUrl", "downloadFallback"] as const;
const queryFields = [
  ...stringFields, "diarization",
  ...channels.flatMap((channel) => connectionFields.map((field) => `${channel}.${field}`)),
];

/** Validate URL input before it can replace working local settings. */
function mergeSettings(current: Settings, input: unknown): Settings {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("配置必须是 JSON 对象");
  const patch = input as Record<string, unknown>;
  const next = restoreSettings(current);
  for (const key of stringFields) {
    if (!(key in patch)) continue;
    if (typeof patch[key] !== "string") throw new Error(`${key} 必须是文本`);
    next[key] = patch[key];
  }
  if ("diarization" in patch) {
    if (typeof patch.diarization !== "boolean") throw new Error("diarization 必须是布尔值");
    next.diarization = patch.diarization;
  }
  if ("connections" in patch) {
    if (!patch.connections || typeof patch.connections !== "object" || Array.isArray(patch.connections))
      throw new Error("connections 必须是对象");
    const connections = patch.connections as Record<string, unknown>;
    for (const channel of channels) {
      if (!(channel in connections)) continue;
      const value = connections[channel];
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${channel} 连接配置必须是对象`);
      const connection = value as Record<string, unknown>;
      for (const key of connectionFields) {
        if (!(key in connection)) continue;
        const value = connection[key];
        if (key === "transport") {
          if (value !== "direct" && value !== "gateway" && value !== "worker")
            throw new Error(`${channel}.transport 必须是 direct、gateway 或 worker`);
          next.connections[channel].transport = value;
        } else if (key === "downloadFallback") {
          if (typeof value !== "boolean") throw new Error(`${channel}.${key} 必须是布尔值`);
          next.connections[channel].downloadFallback = value;
        } else {
          if (typeof value !== "string") throw new Error(`${channel}.${key} 必须是文本`);
          next.connections[channel][key] = value;
        }
      }
    }
  }
  return next;
}

function booleanParam(value: string) {
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error("布尔参数请使用 true、false、1 或 0");
}

export function settingsFromUrl(href: string, current: Settings) {
  const url = new URL(href);
  if (!url.searchParams.has("config") && !queryFields.some((key) => url.searchParams.has(key)))
    return null;
  let settings = url.searchParams.has("config")
    ? mergeSettings(current, JSON.parse(url.searchParams.get("config")!))
    : restoreSettings(current);
  const patch: Record<string, unknown> = {};
  for (const key of stringFields)
    if (url.searchParams.has(key)) patch[key] = url.searchParams.get(key)!;
  if (url.searchParams.has("diarization"))
    patch.diarization = booleanParam(url.searchParams.get("diarization")!);
  const connections: Record<string, unknown> = {};
  for (const channel of channels) {
    const connection: Record<string, unknown> = {};
    for (const key of connectionFields) {
      const value = url.searchParams.get(`${channel}.${key}`);
      if (value !== null) connection[key] = key === "downloadFallback" ? booleanParam(value) : value;
    }
    connections[channel] = connection;
  }
  patch.connections = connections;
  settings = mergeSettings(settings, patch);
  for (const key of ["config", ...queryFields]) url.searchParams.delete(key);
  return { settings, cleanUrl: url.pathname + url.search + url.hash };
}

export function settingsShareUrl(href: string, settings: Settings) {
  const url = new URL(href);
  url.search = "";
  // Whitelist every setting; legacy flags or unrelated stored data are not shared.
  url.searchParams.set("config", JSON.stringify(mergeSettings(defaults, settings)));
  return url.href;
}

export function persistSettings(settings: Settings): string {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...settings, speakerDefaultsVersion: 1 }));
  } catch {
    return "浏览器未能保存设置，请允许本站使用本地存储后重试；当前修改仅在本次打开期间有效。";
  }
  // Remove the old session copy so another tab's changes cannot be shadowed.
  try { sessionStorage.removeItem(storageKey); } catch {}
  return "";
}

export function initializeSettings() {
  let settings = restoreSettings(null);
  let notice = "";
  for (const read of [() => localStorage.getItem(storageKey), () => sessionStorage.getItem(storageKey)]) {
    try {
      const saved = read();
      if (saved) {
        const parsed = JSON.parse(saved);
        settings = mergeSettings(defaults, restoreSettings(parsed));
        // Turn on the new default once for existing installs, then respect opt-outs.
        if (parsed.speakerDefaultsVersion !== 1) settings.diarization = true;
        break;
      }
    } catch {}
  }
  let cleanUrl: string | undefined;
  try {
    const imported = settingsFromUrl(window.location.href, settings);
    if (imported) {
      settings = imported.settings;
      cleanUrl = imported.cleanUrl;
    }
  } catch {
    notice = "配置链接无效，未导入。请检查参数格式或重新复制分享链接。";
  }
  const settingsError = persistSettings(settings);
  if (cleanUrl && !settingsError) {
    try {
      window.history.replaceState(window.history.state, "", cleanUrl);
      notice = "配置已导入并自动保存";
    } catch {
      notice = "配置已保存，但地址未能清理，请手动删除配置参数。";
    }
  }
  return { settings, settingsError, notice };
}
