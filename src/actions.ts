import { useStudio } from "./store";
import {
  activeSegments,
  canResumeGeneration,
  duration,
  parseTranscript,
  placement,
  takeFor,
  needsGeneration,
  referenceKey,
  speakerRoster,
  uid,
  type Segment,
  type Voice,
} from "./model";
import {
  asrAudio,
  extractAudioSegment,
  registerMedia,
  renderVideo,
} from "./media";
import { download, getMedia, mediaUrl } from "./storage";
import { pollTts, submitTts, transcribe } from "./providers";
import { GenerationPool } from "./generationPool";
let controller: AbortController | null = null;
export function cancelTask() {
  controller?.abort();
}
export const report = (error: unknown) =>
  useStudio
    .getState()
    .set({ notice: error instanceof Error ? error.message : String(error) });
export async function task<T>(
  label: string,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T | undefined> {
  if (
    useStudio.getState().busy ||
    useStudio.getState().generationActive ||
    useStudio.getState().generationQueued
  ) {
    report("请等待当前任务完成，或先停止当前任务");
    return;
  }
  controller = new AbortController();
  useStudio.getState().set({ busy: label, progress: 0, playing: false });
  try {
    return await fn(controller.signal);
  } catch (e) {
    report(
      e instanceof DOMException && e.name === "AbortError"
        ? "已停止本地等待。已提交的云端任务可能继续运行，可在句子上恢复查询。"
        : e,
    );
    return;
  } finally {
    controller = null;
    useStudio.getState().set({ busy: "", progress: 0 });
  }
}
export async function addVideo(files: File[]) {
  await task("正在导入素材", async () => {
    for (const f of files) {
      const a = await registerMedia(f, f.name, "video");
      useStudio.getState().edit((p) => {
        const first = !p.videos.length;
        p.assets.push(a);
        p.videos.push({
          id: uid(),
          assetId: a.id,
          start: duration(p),
          in: 0,
          out: a.duration,
          volume: 1,
        });
        if (first) {
          p.name = f.name.replace(/\.[^.]+$/, "");
          p.width = a.width % 2 ? a.width + 1 : a.width;
          p.height = a.height % 2 ? a.height + 1 : a.height;
          p.subtitleSize = Math.round(p.height * 0.052);
        }
      });
    }
    useStudio
      .getState()
      .set({ notice: "视频已导入，点击「识别字幕」开始逐句编辑" });
  });
}
export async function addVoice(file: File, emotion = false, voiceId?: string) {
  if (file.size > 2_000_000) throw new Error("请选择小于 2MB 的短参考音频");
  const a = await registerMedia(file, file.name, "audio");
  useStudio.getState().edit((p) => {
    p.assets.push(a);
    if (emotion) {
      const v = p.voices.find((v) => v.id === voiceId) || p.voices[0];
      if (!v) throw new Error("请先上传音色参考");
      v.emotionAssetId = a.id;
      return;
    }
    const id = uid();
    p.voices.push({
      id,
      name: file.name.replace(/\.[^.]+$/, ""),
      assetId: a.id,
      method: "与音色参考音频相同",
      emotions: {
        emo_calm: 0.3,
        emo_happy: 0.5,
        emo_sad: 0,
        emo_angry: 0,
        emo_afraid: 0,
        emo_disgusted: 0,
        emo_surprised: 0,
        emo_melancholic: 0,
      },
      random: false,
    });
  });
  return a;
}
export async function addMusic(file: File) {
  const a = await registerMedia(file, file.name, "audio");
  useStudio.getState().edit((p) => {
    p.assets.push(a);
    p.music.push({
      id: uid(),
      assetId: a.id,
      start: 0,
      in: 0,
      out: Math.min(a.duration, duration(p) || a.duration),
      volume: 1,
    });
  });
}
export async function recognize() {
  await task("准备语音识别", async (signal) => {
    const initial = useStudio.getState().project;
    if (!initial.videos.length) throw new Error("请先导入视频");
    const sources = [...new Set(initial.videos.map((v) => v.assetId))],
      result: Segment[] = [];
    for (let i = 0; i < sources.length; i++) {
      const id = sources[i];
      useStudio
        .getState()
        .set({ busy: "提取音频 " + (i + 1) + " / " + sources.length });
      const blob = await asrAudio(id);
      const data = await transcribe(
        blob,
        useStudio.getState().settings,
        (busy) => useStudio.getState().set({ busy }),
        signal,
      );
      const p = useStudio.getState().project;
      for (const clip of p.videos.filter((c) => c.assetId === id))
        result.push(...parseTranscript(data, clip));
    }
    if (!result.length) throw new Error("没有识别到语音，请检查视频音轨");
    useStudio.getState().edit((p) => {
      p.segments = result;
      p.speakers = speakerRoster(p);
    });
    useStudio.getState().set({
      notice: "识别完成，共 " + result.length + " 个句子",
      selected: result[0].id,
      time: placement(useStudio.getState().project, result[0])!.start,
    });
  });
}
const generationPool = new GenerationPool(
  () => useStudio.getState().generationConcurrency,
  (generationActive, generationQueued) =>
    useStudio.getState().set({ generationActive, generationQueued }),
);
export function cancelGeneration() {
  generationPool.cancel();
}
useStudio.subscribe((state, previous) => {
  if (state.project.id !== previous.project.id) {
    cancelGeneration();
    stopAudition();
  }
  if (state.generationConcurrency !== previous.generationConcurrency)
    generationPool.pump();
  if ((state.playing && !previous.playing) || (state.busy && !previous.busy))
    stopAudition();
});
export async function generate(ids: string[], resume?: boolean) {
  if (useStudio.getState().busy) {
    report("请等待当前任务完成后再生成配音");
    return;
  }
  if (!ids.length) {
    report("没有需要生成的句子");
    return 0;
  }
  const projectId = useStudio.getState().project.id;
  const jobs = [...new Set(ids)].flatMap((id) => {
    const key = projectId + ":" + id;
    if (!useStudio.getState().project.segments.some((s) => s.id === id))
      return [];
    if (!generationPool.has(key))
      useStudio.getState().edit((p) => {
        const s = p.segments.find((s) => s.id === id)!;
        s.status = "queued";
        s.error = "";
      }, false);
    return [
      generationPool.enqueue(
        key,
        async (signal) => {
          const ensureCurrent = () => {
            signal.throwIfAborted();
            if (
              useStudio.getState().project.id !== projectId ||
              !useStudio.getState().project.segments.some((s) => s.id === id)
            )
              throw new Error("工程或句子已变更");
          };
          try {
            ensureCurrent();
            const state = useStudio.getState(),
              seg = state.project.segments.find((s) => s.id === id)!;
            // Batch generation resumes a matching cloud job rather than paying twice.
            const shouldResume =
              resume ?? canResumeGeneration(state.project, seg);
            let jobId = shouldResume ? seg.taskId : undefined;
            const selectedVoiceId = jobId
              ? (seg.jobVoiceId ?? seg.voiceId ?? "")
              : seg.voiceId || "";
            const generationReferenceKey = jobId
              ? seg.jobReferenceKey
              : referenceKey(state.project, seg);
            let voice: Voice | undefined = state.project.voices.find(
              (v) => v.id === selectedVoiceId,
            );
            if (!jobId && selectedVoiceId && !voice)
              throw new Error("所选自定义音色已不存在，请重新选择音源");
            const text =
              shouldResume && seg.taskId ? seg.jobText || seg.text : seg.text;
            if (!text.trim()) throw new Error("请输入配音文本");
            let originalReference: Blob | undefined;
            if (!jobId && !voice) {
              const clip = state.project.videos.find(
                (v) => v.id === seg.clipId,
              );
              if (!clip) throw new Error("找不到这句话对应的视频素材");
              originalReference = await extractAudioSegment(
                clip.assetId,
                seg.sourceStart,
                seg.sourceEnd - seg.sourceStart,
              );
              voice = {
                id: "",
                name: "当前句子原声",
                assetId: "",
                method: "与音色参考音频相同",
                emotions: {},
                random: false,
              };
            }
            ensureCurrent();
            state.edit((p) => {
              const s = p.segments.find((s) => s.id === id)!;
              s.status = "queued";
              s.error = "";
              s.jobText = text;
              s.jobVoiceId = selectedVoiceId;
              s.jobReferenceKey = generationReferenceKey;
              s.taskId = jobId;
            }, false);
            if (!jobId)
              jobId = await submitTts(
                text,
                voice!,
                state.settings,
                signal,
                originalReference,
              );
            // Keep a returned job ID even if the user just stopped local waiting.
            if (useStudio.getState().project.id !== projectId)
              throw new Error("工程已切换");
            useStudio.getState().edit((p) => {
              const s = p.segments.find((s) => s.id === id);
              if (s) {
                s.taskId = jobId;
                s.status = "generating";
              }
            }, false);
            ensureCurrent();
            const blob = await pollTts(
              jobId,
              state.settings,
              (status) => {
                if (
                  ["FAILED", "FAILURE", "ERROR", "CANCELLED"].includes(status)
                ) {
                  ensureCurrent();
                  useStudio.getState().edit((p) => {
                    const row = p.segments.find((s) => s.id === id);
                    if (row) row.taskId = undefined;
                  }, false);
                }
              },
              signal,
            );
            ensureCurrent();
            const asset = await registerMedia(
              blob,
              "配音 " + text.slice(0, 18) + ".wav",
              "audio",
            );
            ensureCurrent();
            useStudio.getState().edit((p) => {
              p.assets.push(asset);
              const s = p.segments.find((s) => s.id === id);
              if (!s) return;
              const take = {
                id: uid(),
                assetId: asset.id,
                text,
                voiceId: selectedVoiceId,
                referenceKey: generationReferenceKey,
                created: Date.now(),
                duration: asset.duration,
              };
              s.takes.push(take);
              s.takeId = take.id;
              s.status = "ready";
              s.taskId = undefined;
            }, false);
            return true;
          } catch (e) {
            if (useStudio.getState().project.id === projectId)
              useStudio.getState().edit((p) => {
                const s = p.segments.find((s) => s.id === id);
                if (s) {
                  s.status = "error";
                  s.error = signal.aborted
                    ? "已停止本地等待。云端任务可能继续，可点击继续查询。"
                    : e instanceof Error
                      ? e.message
                      : String(e);
                }
              }, false);
            return false;
          }
        },
        () => {
          if (useStudio.getState().project.id !== projectId) return;
          useStudio.getState().edit((p) => {
            const s = p.segments.find((s) => s.id === id);
            if (s) {
              s.status = s.taskId ? "error" : "idle";
              s.error = "已取消排队";
            }
          }, false);
        },
      ),
    ];
  });
  const results = await Promise.all(jobs);
  const completed = results.filter(Boolean).length;
  if (useStudio.getState().project.id === projectId)
    report(
      "已完成 " +
        completed +
        " / " +
        jobs.length +
        " 段克隆配音" +
        (completed < jobs.length ? "，未完成的句子可查看原因后重试" : ""),
    );
  return completed;
}
let audition: HTMLAudioElement | undefined;
let auditionRequest = 0;
let auditionCleanup: (() => void) | undefined;
export function stopAudition() {
  auditionRequest++;
  audition?.pause();
  auditionCleanup?.();
  auditionCleanup = undefined;
  audition = undefined;
  useStudio.getState().set({ auditioning: null });
}
export async function auditionSegment(
  id: string,
  source: "original" | "dub" = "dub",
) {
  if (useStudio.getState().auditioning === id + ":" + source) {
    stopAudition();
    return;
  }
  stopAudition();
  const request = auditionRequest;
  useStudio.getState().set({ playing: false, auditioning: id + ":" + source });
  try {
    const p = useStudio.getState().project,
      s = p.segments.find((v) => v.id === id);
    if (!s) throw new Error("找不到这句话");
    const clip = p.videos.find((c) => c.id === s.clipId),
      take = takeFor(s);
    if (source === "dub" && !take)
      throw new Error("这句话还没有配音，请先生成");
    if (source === "original" && !clip) throw new Error("找不到原视频");
    const url = await mediaUrl(
      source === "original" ? clip!.assetId : take!.assetId,
    );
    if (request !== auditionRequest) return;
    const audio = new Audio(url);
    audition = audio;
    audio.onended = () => request === auditionRequest && stopAudition();
    audio.onerror = () => {
      if (request !== auditionRequest) return;
      stopAudition();
      report("音频播放失败，请检查素材音轨或重新导入");
    };
    if (source === "original") {
      const end = s.sourceEnd;
      const timer = setInterval(() => {
        if (audio.currentTime >= end) stopAudition();
      }, 25);
      auditionCleanup = () => {
        clearInterval(timer);
        audio.onloadedmetadata = null;
      };
      audio.onloadedmetadata = () => {
        if (request === auditionRequest) audio.currentTime = s.sourceStart;
      };
    }
    await audio.play();
    if (request !== auditionRequest) audio.pause();
  } catch (e) {
    if (request !== auditionRequest) return;
    stopAudition();
    throw e;
  }
}
export async function exportVideo() {
  return task("准备导出视频", async (signal) => {
    const p = structuredClone(useStudio.getState().project);
    const stale = activeSegments(p).filter(
      (s) => takeFor(s) && !s.muted && needsGeneration(p, s),
    );
    if (stale.length)
      throw new Error(
        "有 " +
          stale.length +
          " 句配音与当前文本不一致，请重新生成或切换到对应文本后再导出",
      );
    const blob = await renderVideo(
      p,
      (progress) =>
        useStudio.getState().set({ progress, busy: "正在导出 MP4" }),
      signal,
    );
    download(blob, p.name + ".mp4");
    useStudio.getState().set({ notice: "视频已导出到下载目录" });
    return blob;
  });
}
export async function voiceFromSegment(id: string) {
  const st = useStudio.getState(),
    s = st.project.segments.find((v) => v.id === id);
  if (!s) throw new Error("请先选择一句话");
  const clip = st.project.videos.find((v) => v.id === s.clipId)!;
  const len = s.sourceEnd - s.sourceStart;
  const out = await extractAudioSegment(clip.assetId, s.sourceStart, len);
  await addVoice(
    new File([out], "原声参考 " + s.original.slice(0, 10) + ".wav", {
      type: "audio/wav",
    }),
  );
}
export const saveTake = async (id: string) => {
  const s = useStudio.getState().project.segments.find((v) => v.id === id),
    t = s && takeFor(s);
  if (t) download(await getMedia(t.assetId), "配音.wav");
};
