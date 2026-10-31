const bitrate = 4e6;

// H.264 level limits: macroblocks per frame and per second.
const levels = [
  [31, 3600, 108000],
  [40, 8192, 245760],
  [42, 8704, 522240],
  [50, 22080, 589824],
  [51, 36864, 983040],
  [52, 36864, 2073600],
  [60, 139264, 4177920],
  [61, 139264, 8355840],
  [62, 139264, 16711680],
];

export async function selectExportEncoding(
  width: number,
  height: number,
  fps: number,
) {
  if (![width, height, fps].every((n) => Number.isFinite(n) && n > 0) ||
    !Number.isInteger(width) || !Number.isInteger(height))
    throw new Error("导出尺寸或帧率无效，请检查工程设置");
  if (!globalThis.isSecureContext)
    throw new Error("视频导出需要安全连接，请通过 HTTPS 或 localhost 打开页面");
  const required = [
    "OffscreenCanvas", "VideoEncoder", "VideoDecoder", "VideoFrame",
    "AudioEncoder", "AudioDecoder", "AudioData",
  ];
  const missing = required.filter((key) => !(key in globalThis));
  if (missing.length)
    throw new Error(`当前浏览器缺少视频导出接口（${missing.join("、")}），请使用最新版 Chrome / Edge`);

  // Match the audio configuration actually used by WebAV, independently of video.
  let audioSupported = false;
  try {
    audioSupported = !!(await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 128000,
    })).supported;
  } catch { /* Report audio failures separately from video failures. */ }
  if (!audioSupported)
    throw new Error("当前浏览器不支持 AAC 音频编码，无法导出带声音的 MP4，请使用最新版 Chrome / Edge");

  const blocks = Math.ceil(width / 16) * Math.ceil(height / 16);
  const fittingLevels = levels.filter(([, maxFrame, maxSecond]) =>
    blocks <= maxFrame && blocks * fps <= maxSecond);
  // Try profiles and levels without changing the requested size or frame rate.
  for (const hardwareAcceleration of ["no-preference", "prefer-software"] as const)
    for (const [level] of fittingLevels)
      for (const profile of ["42e0", "4d40", "6400"]) {
        const videoCodec = `avc1.${profile}${level.toString(16).padStart(2, "0")}`;
        try {
          const { supported } = await VideoEncoder.isConfigSupported({
            codec: videoCodec,
            width,
            height,
            framerate: fps,
            bitrate,
            hardwareAcceleration,
            alpha: "discard",
            avc: { format: "avc" },
          });
          if (supported)
            return { videoCodec, bitrate, __unsafe_hardwareAcceleration__: hardwareAcceleration };
        } catch { /* A rejected profile must not prevent trying the next one. */ }
      }
  throw new Error(`当前浏览器无法以 ${width} × ${height}、${fps} fps 编码 H.264 视频。已尝试兼容配置，请换用最新版 Chrome / Edge，或调整画布尺寸后重试`);
}
