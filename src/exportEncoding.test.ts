import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectExportEncoding } from "./exportEncoding";

const video = vi.fn();
const audio = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  for (const key of ["OffscreenCanvas", "VideoDecoder", "VideoFrame", "AudioDecoder", "AudioData"])
    vi.stubGlobal(key, class {});
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("VideoEncoder", { isConfigSupported: video });
  vi.stubGlobal("AudioEncoder", { isConfigSupported: audio });
  audio.mockResolvedValue({ supported: true });
  video.mockResolvedValue({ supported: true });
});
afterEach(() => vi.unstubAllGlobals());

describe("MP4 export compatibility", () => {
  it("uses a fitting level and probes the real frame rate and MP4 format", async () => {
    const selected = await selectExportEncoding(1920, 1080, 30);
    expect(selected.videoCodec).toBe("avc1.42e028");
    expect(video).toHaveBeenCalledWith(expect.objectContaining({
      width: 1920, height: 1080, framerate: 30,
      avc: { format: "avc" }, bitrate: selected.bitrate,
    }));
    expect(audio).toHaveBeenCalledWith({
      codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 128000,
    });
  });
  it("tries other H.264 profiles after unsupported or throwing probes", async () => {
    video.mockRejectedValueOnce(new Error("profile rejected"))
      .mockResolvedValueOnce({ supported: false });
    expect((await selectExportEncoding(1280, 720, 24)).videoCodec).toBe("avc1.64001f");
    expect(video.mock.calls.every(([c]) => c.width === 1280 && c.height === 720 && c.framerate === 24)).toBe(true);
  });
  it("accounts for macroblock rounding and higher frame rates", async () => {
    expect((await selectExportEncoding(1080, 1920, 60)).videoCodec).toBe("avc1.42e02a");
    expect((await selectExportEncoding(3840, 2160, 30)).videoCodec).toBe("avc1.42e033");
  });
  it("passes the software preference selected by a successful fallback", async () => {
    video.mockImplementation(async (c) => ({ supported: c.hardwareAcceleration === "prefer-software" }));
    expect(await selectExportEncoding(1280, 720, 24)).toEqual({
      videoCodec: "avc1.42e01f", bitrate: 4e6, __unsafe_hardwareAcceleration__: "prefer-software",
    });
  });
  it("identifies AAC failures without suggesting a smaller picture", async () => {
    audio.mockResolvedValue({ supported: false });
    await expect(selectExportEncoding(1280, 720, 24)).rejects.toThrow("AAC 音频编码");
    expect(video).not.toHaveBeenCalled();
  });
  it("identifies missing browser APIs and insecure origins", async () => {
    vi.stubGlobal("isSecureContext", false);
    await expect(selectExportEncoding(1280, 720, 24)).rejects.toThrow("HTTPS");
    vi.stubGlobal("isSecureContext", true);
    Reflect.deleteProperty(globalThis, "AudioEncoder");
    await expect(selectExportEncoding(1280, 720, 24)).rejects.toThrow("缺少视频导出接口（AudioEncoder）");
  });
  it("reports the attempted picture settings only after every video fallback fails", async () => {
    video.mockResolvedValue({ supported: false });
    await expect(selectExportEncoding(1920, 1080, 25)).rejects.toThrow("1920 × 1080、25 fps");
    expect(video).toHaveBeenCalledTimes(48);
  });
});
