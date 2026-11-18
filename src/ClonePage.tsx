import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  AudioLines,
  Check,
  Download,
  LoaderCircle,
  Mic,
  Play,
  Settings,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { useStudio } from "./store";
import type { Voice } from "./model";
import { pollTts, submitTts } from "./providers";
import { download } from "./storage";
import { SettingsDialog } from "./Dialogs";

const MAX_AUDIO = 2_000_000;
const DEFAULT_TEXT_CAP = 2048;
const EMOTIONS = [
  ["emo_happy", "开心"],
  ["emo_calm", "平静"],
  ["emo_sad", "悲伤"],
  ["emo_angry", "生气"],
  ["emo_afraid", "害怕"],
  ["emo_disgusted", "厌恶"],
  ["emo_surprised", "惊讶"],
  ["emo_melancholic", "低落"],
] as const;
const DEFAULT_EMOTIONS: Record<string, number> = {
  emo_calm: 0.3,
  emo_happy: 0.5,
  emo_sad: 0,
  emo_angry: 0,
  emo_afraid: 0,
  emo_disgusted: 0,
  emo_surprised: 0,
  emo_melancholic: 0,
};
type AudioFile = { file: File; url: string; duration: number };
type CloneResult = { blob: Blob; url: string; duration: number };

function probeDuration(url: string) {
  return new Promise<number>((resolve) => {
    const audio = new Audio();
    let settled = false;
    const done = (value: number) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute("src");
      resolve(value);
    };
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? audio.duration : 0);
    audio.onerror = () => done(0);
    audio.src = url;
    setTimeout(() => done(audio.duration || 0), 8000);
  });
}

async function readAudio(file: File): Promise<AudioFile> {
  if (file.size > MAX_AUDIO) throw new Error("音频需小于 2MB，请截取更短的一段");
  if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|ogg)$/i.test(file.name))
    throw new Error("请选择 MP3 或 WAV 音频");
  const url = URL.createObjectURL(file);
  const duration = await probeDuration(url);
  if (!duration) {
    URL.revokeObjectURL(url);
    throw new Error("浏览器无法读取这个音频，请使用 MP3 或 WAV");
  }
  return { file, url, duration };
}

const formatSize = (size: number) =>
  size < 1024 * 1024
    ? Math.round(size / 1024) + " KB"
    : (size / 1048576).toFixed(1) + " MB";

const statusLabel = (value: string) => {
  const status = value.toUpperCase();
  if (status.includes("QUEUE") || status.includes("PEND")) return "排队等待 GPU";
  if (status.includes("RUN") || status.includes("PROCESS"))
    return "正在生成克隆语音";
  if (status.includes("SUCC") || status.includes("COMPLET")) return "生成完成";
  return "云端状态：" + value;
};

function AudioDrop({
  label,
  accept,
  drag,
  onDrag,
  onPick,
  onFile,
}: {
  label: string;
  accept: string;
  drag: boolean;
  onDrag: (value: boolean) => void;
  onPick: () => void;
  onFile: (file: File) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={"clone-drop" + (drag ? " drag" : "")}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        onDrag(true);
      }}
      onDragLeave={() => onDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        onDrag(false);
        const file = Array.from(e.dataTransfer.files).find(
          (f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg)$/i.test(f.name),
        );
        if (file) onFile(file);
      }}
      aria-label={label}
    >
      <Mic size={24} />
      <strong>{label}</strong>
      <span className="meta">{accept}</span>
    </div>
  );
}

export default function ClonePage() {
  const { settings } = useStudio();
  const [reference, setReference] = useState<AudioFile | null>(null);
  const [emotion, setEmotion] = useState<AudioFile | null>(null);
  const [text, setText] = useState("");
  const [method, setMethod] = useState("与音色参考音频相同");
  const [emotions, setEmotions] = useState<Record<string, number>>({
    ...DEFAULT_EMOTIONS,
  });
  const [random, setRandom] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CloneResult | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragTarget, setDragTarget] = useState("");
  const referenceInput = useRef<HTMLInputElement>(null);
  const emotionInput = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const referenceRef = useRef<AudioFile | null>(null);
  const emotionRef = useRef<AudioFile | null>(null);
  const resultRef = useRef<CloneResult | null>(null);

  referenceRef.current = reference;
  emotionRef.current = emotion;
  resultRef.current = result;

  useEffect(
    () => () => {
      abort.current?.abort();
      if (referenceRef.current) URL.revokeObjectURL(referenceRef.current.url);
      if (emotionRef.current) URL.revokeObjectURL(emotionRef.current.url);
      if (resultRef.current) URL.revokeObjectURL(resultRef.current.url);
    },
    [],
  );

  const pick = async (
    file: File | undefined,
    target: "reference" | "emotion",
  ) => {
    if (!file) return;
    setError("");
    try {
      const audio = await readAudio(file);
      if (target === "reference") {
        setReference((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return audio;
        });
      } else {
        setEmotion((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return audio;
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const remove = (target: "reference" | "emotion") => {
    if (target === "reference") {
      setReference((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    } else {
      setEmotion((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
    }
  };

  const clearResult = () => {
    setResult((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const stop = () => abort.current?.abort();

  const run = async () => {
    if (running) return;
    setError("");
    if (!reference) {
      setError("请先上传音色参考音频");
      return;
    }
    if (!text.trim()) {
      setError("请输入要克隆的台词");
      return;
    }
    if (text.length > DEFAULT_TEXT_CAP) {
      setError("单句文本不能超过 2048 字符");
      return;
    }
    if (method === "使用情感参考音频" && !emotion) {
      setError("请上传情感参考音频");
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    clearResult();
    setRunning(true);
    setStatus("提交克隆任务");
    try {
      const voice: Voice = {
        id: "",
        name: "克隆台参考",
        assetId: "",
        method,
        emotions,
        random,
      };
      const current = useStudio.getState().settings;
      const id = await submitTts(
        text.trim(),
        voice,
        current,
        controller.signal,
        reference.file,
        emotion?.file,
      );
      setStatus("云端生成中");
      const blob = await pollTts(
        id,
        current,
        (value) => setStatus(statusLabel(value)),
        controller.signal,
      );
      const url = URL.createObjectURL(blob);
      const audio: CloneResult = {
        blob,
        url,
        duration: await probeDuration(url),
      };
      setResult((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return audio;
      });
      setStatus("");
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "AbortError"
          ? "已停止本地等待。已提交的云端任务可能仍在运行，稍后可重新克隆。"
          : e instanceof Error
            ? e.message
            : String(e),
      );
      setStatus("");
    } finally {
      if (abort.current === controller) abort.current = null;
      setRunning(false);
    }
  };

  const fileCard = (
    audio: AudioFile,
    target: "reference" | "emotion",
    replace: () => void,
  ) => (
    <div className="clone-file-card">
      <div className="clone-file">
        <Mic size={16} />
        <div>
          <b>{audio.file.name}</b>
          <span className="meta">
            {formatSize(audio.file.size)} · {audio.duration.toFixed(2)}s
          </span>
        </div>
        <button
          className="icon"
          aria-label="移除音频"
          onClick={() => remove(target)}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <audio controls src={audio.url} aria-label="试听音频" />
      <button className="text-button" onClick={replace}>
        <Upload size={14} />
        更换音频
      </button>
    </div>
  );

  return (
    <div className="clone-page">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <AudioLines size={21} />
          </span>
          <b>
            Dub<span>Studio</span>
          </b>
        </div>
        <div className="header-divider" />
        <div className="clone-heading">
          <strong>音色克隆</strong>
          <span className="meta">IndexTTS2 · 单段参考音频克隆</span>
        </div>
        <div className="spacer" />
        <button
          className="compact-button"
          title="返回剪辑工作台"
          onClick={() => {
            window.location.hash = "#/";
          }}
        >
          <ArrowLeft size={16} />
          返回工作台
        </button>
        <button
          className="icon"
          title="API 设置"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings size={18} />
        </button>
      </header>
      <main className="clone-workspace">
        <section className="clone-card">
          <header>
            <span className="clone-step">1</span>
            <h2>音色参考音频</h2>
          </header>
          <p className="help">
            IndexTTS2 会用这段音频的音色朗读台词。建议 3–15 秒干净人声，MP3 或
            WAV，小于 2MB。
          </p>
          <input
            ref={referenceInput}
            hidden
            type="file"
            accept="audio/mpeg,audio/wav,.mp3,.wav"
            onChange={(e) => {
              void pick(e.target.files?.[0], "reference");
              e.target.value = "";
            }}
          />
          {reference ? (
            fileCard(reference!, "reference", () => referenceInput.current?.click())
          ) : (
            <AudioDrop
              label="上传音色参考音频"
              accept="MP3 / WAV · 小于 2MB"
              drag={dragTarget === "reference"}
              onDrag={(value) => setDragTarget(value ? "reference" : "")}
              onPick={() => referenceInput.current?.click()}
              onFile={(file) => void pick(file, "reference")}
            />
          )}
        </section>

        <section className="clone-card">
          <header>
            <span className="clone-step">2</span>
            <h2>克隆参数</h2>
          </header>
          <label>
            克隆台词
            <textarea
              aria-label="克隆台词"
              rows={5}
              value={text}
              maxLength={DEFAULT_TEXT_CAP}
              placeholder="输入要由这个音色读出的台词…"
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="meta clone-count">
            {text.length} / {DEFAULT_TEXT_CAP} 字符
          </p>
          <label>
            情绪控制方式
            <select
              aria-label="情绪控制方式"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option>与音色参考音频相同</option>
              <option>使用情感向量控制</option>
              <option>使用情感参考音频</option>
            </select>
          </label>
          {method === "使用情感向量控制" && (
            <>
              <div className="clone-emotions">
                {EMOTIONS.map(([key, label]) => (
                  <label className="slider-label" key={key}>
                    <span>
                      {label}
                      <b>{(emotions[key] || 0).toFixed(1)}</b>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="1.4"
                      step=".1"
                      value={emotions[key] || 0}
                      onChange={(e) =>
                        setEmotions((prev) => ({
                          ...prev,
                          [key]: +e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="text-button"
                onClick={() =>
                  setEmotions(
                    Object.fromEntries(EMOTIONS.map(([key]) => [key, 0])),
                  )
                }
              >
                清零情绪向量
              </button>
            </>
          )}
          {method === "使用情感参考音频" && (
            <>
              <input
                ref={emotionInput}
                hidden
                type="file"
                accept="audio/mpeg,audio/wav,.mp3,.wav"
                onChange={(e) => {
                  void pick(e.target.files?.[0], "emotion");
                  e.target.value = "";
                }}
              />
              {emotion ? (
                fileCard(emotion!, "emotion", () =>
                  emotionInput.current?.click(),
                )
              ) : (
                <AudioDrop
                  label="上传情感参考音频"
                  accept="MP3 / WAV · 小于 2MB"
                  drag={dragTarget === "emotion"}
                  onDrag={(value) => setDragTarget(value ? "emotion" : "")}
                  onPick={() => emotionInput.current?.click()}
                  onFile={(file) => void pick(file, "emotion")}
                />
              )}
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={random}
              onChange={(e) => setRandom(e.target.checked)}
            />
            随机情绪采样（emo_random）
          </label>
          <p className="help">
            克隆参数会以 indextts2-v1 工作流提交，参考音频与情感参考音频都以
            data URL 传入。
          </p>
        </section>

        <section className="clone-card">
          <header>
            <span className="clone-step">3</span>
            <h2>克隆结果</h2>
          </header>
          {!settings.autodlKey && (
            <p className="clone-warning">
              尚未填写 AutoDL Token，克隆会直接失败。
              <button
                className="text-button"
                onClick={() => setSettingsOpen(true)}
              >
                前往设置
              </button>
            </p>
          )}
          <button
            className="primary clone-run"
            disabled={running || !reference || !text.trim()}
            onClick={() => void run()}
          >
            {running ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Mic size={16} />
            )}
            {running ? "克隆中…" : "开始克隆"}
          </button>
          {running && (
            <div className="clone-progress" role="status">
              <LoaderCircle size={14} className="spin" />
              <span>{status}</span>
              <button onClick={stop}>
                <Square size={12} />
                停止
              </button>
            </div>
          )}
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          {result ? (
            <div className="clone-result">
              <div className="clone-status">
                <Check size={14} />
                克隆完成
                {result.duration > 0 && (
                  <span className="meta">{result.duration.toFixed(2)}s</span>
                )}
              </div>
              <audio controls src={result.url} aria-label="克隆结果" />
              <div className="clone-actions">
                <button
                  className="primary"
                  onClick={() =>
                    download(
                      result.blob,
                      (reference?.file.name.replace(/\.[^.]+$/, "") || "克隆") +
                        "-克隆.wav",
                    )
                  }
                >
                  <Download size={15} />
                  下载 WAV
                </button>
                <button className="text-button" onClick={clearResult}>
                  清空结果
                </button>
              </div>
            </div>
          ) : (
            !running &&
            !error && (
              <div className="clone-result-empty">
                <Play size={20} />
                <span>上传参考音频并点击克隆，结果会显示在这里。</span>
              </div>
            )
          )}
        </section>
      </main>
      {settingsOpen && <SettingsDialog close={() => setSettingsOpen(false)} />}
    </div>
  );
}
