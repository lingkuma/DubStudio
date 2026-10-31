import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreSettings } from "./model";
import { initializeSettings, persistSettings, settingsFromUrl, settingsShareUrl } from "./settings";

afterEach(() => vi.unstubAllGlobals());

function browser(href: string) {
  const makeStorage = () => {
    const data = new Map<string, string>();
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, value); },
      removeItem: (key: string) => { data.delete(key); },
    };
  };
  const local = makeStorage(), session = makeStorage();
  const history = { state: { keep: true }, replaceState: vi.fn() };
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("sessionStorage", session);
  vi.stubGlobal("window", { location: { href }, history });
  return { local, session, history };
}

describe("settings links", () => {
  it("round-trips all settings, independent channels, Unicode and nested URL parameters", () => {
    const s = restoreSettings(null);
    Object.assign(s, {
      aliyunKey: "asr+&=?#%", autodlKey: "tts-key", aiKey: "ai-key",
      asrBase: "https://asr.example/team", autodlBase: "https://tts.example",
      aiBase: "https://ai.example/v1", aiModel: "custom-model",
      hotwords: "犇马, 人名 & 品牌+", diarization: true,
    });
    s.connections.asr = { transport: "worker", workerUrl: "https://worker.example/?url={url}&ak=keep+me", gateway: "/asr", downloadFallback: false };
    s.connections.tts = { transport: "gateway", workerUrl: "tts-worker", gateway: "https://tts-gateway.example", downloadFallback: true };
    s.connections.ai = { transport: "direct", workerUrl: "ai-worker", gateway: "/ai", downloadFallback: false };
    const link = settingsShareUrl("https://studio.example/editor?old=discard#workspace", s);
    const imported = settingsFromUrl(link, restoreSettings(null))!;
    expect(imported.settings).toEqual(s);
    expect(imported.cleanUrl).toBe("/editor#workspace");
    expect(new URL(link).searchParams.has("old")).toBe(false);
  });

  it("supports partial flat parameters and preserves unspecified settings and unrelated URL state", () => {
    const s = restoreSettings({ aiKey: "existing", hotwords: "保留" });
    const params = new URLSearchParams({
      aliyunKey: "new+&key", asrBase: "https://custom.example/",
      "asr.transport": "direct", "tts.transport": "worker",
      "tts.workerUrl": "https://worker.example/{rawUrl}?ak=keep",
      "tts.downloadFallback": "0", diarization: "1", view: "editor",
    });
    const imported = settingsFromUrl(`https://studio.example/?${params}#timeline`, s)!;
    expect(imported.settings).toMatchObject({
      aliyunKey: "new+&key", aiKey: "existing", hotwords: "保留", diarization: true,
      asrBase: "https://custom.example/",
      connections: { asr: { transport: "direct" }, tts: { transport: "worker", downloadFallback: false } },
    });
    expect(imported.cleanUrl).toBe("/?view=editor#timeline");
    expect(s.connections.asr.transport).toBe("gateway");
  });

  it("rejects malformed and incorrectly typed configurations atomically", () => {
    const s = restoreSettings({ aiKey: "keep" });
    for (const config of ["{", "null", "[]", '{"aiKey":42}', '{"connections":{"ai":{"transport":"proxy"}}}', '{"connections":{"tts":{"downloadFallback":"false"}}}']) {
      expect(() => settingsFromUrl(`https://studio.example/?config=${encodeURIComponent(config)}`, s)).toThrow();
    }
    expect(() => settingsFromUrl("https://studio.example/?aiKey=new&diarization=yes", s)).toThrow();
    expect(s.aiKey).toBe("keep");
    expect(settingsFromUrl("https://studio.example/?view=editor", s)).toBeNull();
  });
});

describe("settings persistence and startup", () => {
  const key = "dubstudio-settings";

  it("enables diarization for new and existing installs once, then preserves a user's opt-out", () => {
    const { local } = browser("https://studio.example/");
    expect(initializeSettings().settings.diarization).toBe(true);
    local.setItem(key, JSON.stringify({ aiKey: "keep", diarization: false }));
    const migrated = initializeSettings().settings;
    expect(migrated).toMatchObject({ aiKey: "keep", diarization: true });
    persistSettings({ ...migrated, diarization: false });
    expect(initializeSettings().settings.diarization).toBe(false);
  });

  it("respects an explicit URL opt-out during the default migration", () => {
    browser("https://studio.example/?diarization=false");
    expect(initializeSettings().settings.diarization).toBe(false);
  });

  it("migrates session-only keys into persistent storage and drops the old remember flag", () => {
    const { local, session } = browser("https://studio.example/");
    session.setItem(key, JSON.stringify({ aliyunKey: "session-key", remember: false }));
    expect(initializeSettings().settings.aliyunKey).toBe("session-key");
    expect(JSON.parse(local.getItem(key)!)).toMatchObject({ aliyunKey: "session-key" });
    expect(JSON.parse(local.getItem(key)!)).not.toHaveProperty("remember");
    expect(session.getItem(key)).toBeNull();
    expect(initializeSettings().settings.aliyunKey).toBe("session-key");
  });

  it("persists URL configuration before replacing the current browser history entry", () => {
    const { local, history } = browser("https://studio.example/?aiKey=shared&ai.transport=direct");
    history.replaceState.mockImplementation(() => {
      expect(JSON.parse(local.getItem(key)!).aiKey).toBe("shared");
    });
    const result = initializeSettings();
    expect(result.settings.connections.ai.transport).toBe("direct");
    expect(result.settingsError).toBe("");
    expect(result.notice).toContain("已导入");
    expect(history.replaceState).toHaveBeenCalledExactlyOnceWith(history.state, "", "/");
  });

  it("keeps saved values when a URL is invalid", () => {
    const { local, history } = browser("https://studio.example/?config=broken");
    local.setItem(key, JSON.stringify({ aiKey: "saved" }));
    const result = initializeSettings();
    expect(result.settings.aiKey).toBe("saved");
    expect(result.notice).toContain("无效");
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it("reports blocked storage and keeps the import URL available for retry", () => {
    const { local, history } = browser("https://studio.example/?aiKey=shared");
    vi.spyOn(local, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const result = initializeSettings();
    expect(result.settings.aiKey).toBe("shared");
    expect(result.settingsError).toContain("未能保存");
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(persistSettings(result.settings)).toContain("未能保存");
  });

  it("uses current persistent values rather than an obsolete session copy", () => {
    const { local, session } = browser("https://studio.example/");
    local.setItem(key, JSON.stringify({ aiKey: "new" }));
    session.setItem(key, JSON.stringify({ aiKey: "old" }));
    expect(initializeSettings().settings.aiKey).toBe("new");
    expect(session.getItem(key)).toBeNull();
  });
});
