import { afterEach, describe, expect, it, vi } from "vitest";
import { restoreSettings } from "./model";
import { api, remoteBlob, workerTarget } from "./providers";

afterEach(() => vi.unstubAllGlobals());

describe("channel connections", () => {
  it("migrates legacy settings while leaving AutoDL direct", () => {
    const s = restoreSettings({ transport: "gateway", gateway: "https://gateway.example/api", aliyunKey: "saved" });
    expect(s.aliyunKey).toBe("saved");
    expect(s.connections.asr).toMatchObject({ transport: "gateway", gateway: "https://gateway.example/api" });
    expect(s.connections.tts.transport).toBe("direct");
    expect(s.connections.ai.transport).toBe("gateway");
    expect(restoreSettings(s)).toEqual(s);
  });

  it("preserves independent saved routes and credentials", async () => {
    const s = restoreSettings(null);
    s.aliyunKey = "aliyun";
    s.autodlKey = "autodl";
    s.aiKey = "ai";
    s.connections.asr.gateway = "/only-asr";
    s.connections.ai.gateway = "/only-ai";
    s.autodlBase = "https://voice.example/team/";
    s.asrBase = "bad-unused-asr-base";
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await api(s, "asr-policy");
    await api(s, "tts-check");
    await api(s, "ai-models");
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "/only-asr", "https://voice.example/team/api/v1/comfyui/workflows/indextts2-v1", "/only-ai",
    ]);
    expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).key).toBe("aliyun");
    expect(fetch.mock.calls[1][1]!.headers).toEqual({ Authorization: "autodl" });
    expect(JSON.parse(fetch.mock.calls[2][1]!.body as string).key).toBe("ai");
  });

  it("supports Worker query, encoded and raw prefix URL formats", () => {
    const target = "https://service.example/result?ak=abc&part=2";
    expect(new URL(workerTarget("https://worker.example/", target)).searchParams.get("url")).toBe(target);
    expect(workerTarget("https://worker.example/?target={url}", target)).toBe("https://worker.example/?target=" + encodeURIComponent(target));
    expect(workerTarget("https://worker.example/{rawUrl}", target)).toBe("https://worker.example/" + target);
    expect(() => workerTarget("", target)).toThrow("Worker");
  });

  it("forwards native request headers and payload only through the selected Worker", async () => {
    const s = restoreSettings(null);
    s.connections.asr.transport = "worker";
    s.connections.asr.workerUrl = "https://worker.example/?url={url}";
    s.aliyunKey = "asr";
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await api(s, "asr-submit", { payload: { fileUrl: "oss://audio.wav", diarization: true } });
    const [url, request] = fetch.mock.calls[0];
    expect(new URL(String(url)).searchParams.get("url")).toBe("https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription");
    expect(request!.headers).toMatchObject({ Authorization: "Bearer asr", "X-DashScope-Async": "enable" });
    expect(JSON.parse(request!.body as string).input.file_urls).toEqual(["oss://audio.wav"]);
  });

  it("uses the originating channel download gateway without leaking API keys", async () => {
    const s = restoreSettings(null);
    s.autodlKey = "secret";
    s.connections.tts.gateway = "/tts-download";
    s.connections.asr.gateway = "/asr-download";
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("CORS")).mockResolvedValueOnce(new Response("audio"));
    vi.stubGlobal("fetch", fetch);
    await remoteBlob(s, "https://media.example/take.wav?ak=keep", undefined, "tts");
    expect(fetch.mock.calls[1][0]).toBe("/tts-download");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ action: "download", url: "https://media.example/take.wav?ak=keep" });
  });

  it("supports disabling download fallback for fully direct channels", async () => {
    const s = restoreSettings(null);
    s.connections.tts.downloadFallback = false;
    const fetch = vi.fn().mockRejectedValue(new TypeError("CORS"));
    vi.stubGlobal("fetch", fetch);
    await expect(remoteBlob(s, "https://media.example/take.wav", undefined, "tts")).rejects.toThrow("结果下载代理");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
