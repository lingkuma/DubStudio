import { afterEach, describe, it, expect, vi } from "vitest";
import gateway, { dispatch } from "../api/gateway.js";
afterEach(() => vi.unstubAllGlobals());
describe("API adapter routing", () => {
  it("keeps AutoDL raw auth and Alibaba Bearer auth separate", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await dispatch({
      action: "tts-submit",
      key: "tts-key",
      payload: {
        prompt_text: "你好",
        prompt_simple: "data:audio/wav;base64,AA==",
      },
    });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("tts-key");
    await dispatch({
      action: "asr-submit",
      key: "asr-key",
      payload: { fileUrl: "oss://test.wav" },
    });
    const request = fetch.mock.calls[1][1];
    expect(request.headers.Authorization).toBe("Bearer asr-key");
    expect(request.headers["X-DashScope-Async"]).toBe("enable");
    expect(JSON.parse(request.body).input.file_urls).toEqual([
      "oss://test.wav",
    ]);
  });
  it("rejects credential-bearing and private proxy targets while allowing custom HTTPS targets", async () => {
    await expect(
      dispatch({ action: "download", url: "https://127.0.0.1/private" }),
    ).rejects.toThrow();
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await dispatch({ action: "ai-chat", key: "k", aiBase: "https://example.com/v1" });
    expect(fetch).toHaveBeenCalled();
    expect(fetch.mock.calls[0][0]).toBe("https://example.com/v1/chat/completions");
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
    await expect(
      dispatch({
        action: "asr-policy",
        key: "k",
        base: "https://u:p@dashscope.aliyuncs.com",
      }),
    ).rejects.toThrow();
  });
  it("routes custom ASR and TTS bases independently and keeps raw TTS auth", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await dispatch({ action: "tts-check", key: "tts", base: "invalid-asr", ttsBase: "https://voice.example:8443/team" });
    expect(fetch.mock.calls[0][0]).toBe("https://voice.example:8443/team/api/v1/comfyui/workflows/indextts2-v1");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("tts");
    await dispatch({ action: "asr-policy", key: "asr", base: "https://asr.example/team" });
    expect(fetch.mock.calls[1][0]).toContain("https://asr.example/team/api/v1/uploads?");
  });
  it("downloads arbitrary public result hosts without API credentials", async () => {
    const fetch = vi.fn(async () => new Response("audio"));
    vi.stubGlobal("fetch", fetch);
    await dispatch({ action: "download", url: "https://media.example/take.wav?ak=keep-me" });
    expect(String(fetch.mock.calls[0][0])).toBe("https://media.example/take.wav?ak=keep-me");
    expect(fetch.mock.calls[0][1].headers).toBeUndefined();
    expect(fetch.mock.calls[0][1].redirect).toBe("error");
  });
  it("rejects literal local networks and credentials before fetching", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    for (const base of ["https://10.0.0.1/v1", "https://localhost/v1", "https://[::1]/v1", "https://169.254.169.254/", "https://user:pass@api.example/v1"])
      await expect(dispatch({ action: "ai-models", key: "k", aiBase: base })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("forwards AI model selection and non-streaming output", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    const payload = {
      model: "gemini-4-argon",
      messages: [{ role: "user", content: "改写" }],
      stream: false,
    };
    await dispatch({ action: "ai-chat", key: "ai", payload });
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.0-0.pro/v1/chat/completions",
    );
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(payload);
  });
  it("decodes UTF8 correctly when a Chinese character crosses request chunks", async () => {
    let body;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, opt) => {
        body = JSON.parse(opt.body);
        return new Response("{}");
      }),
    );
    const bytes = Buffer.from(
      JSON.stringify({
        action: "tts-submit",
        key: "k",
        payload: { prompt_text: "克隆姐姐声音" },
      }),
    );
    const i = bytes.indexOf(Buffer.from("姐姐")) + 1;
    const req = {
      method: "POST",
      async *[Symbol.asyncIterator]() {
        yield bytes.subarray(0, i);
        yield bytes.subarray(i);
      },
    };
    const res = { setHeader() {}, end() {}, statusCode: 0 };
    await gateway(req, res);
    expect(res.statusCode).toBe(200);
    expect(body.prompt_text).toBe("克隆姐姐声音");
  });
});
