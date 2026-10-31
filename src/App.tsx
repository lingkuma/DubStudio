import { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Upload,
  Settings,
  Download,
  Undo2,
  Redo2,
  FolderOpen,
  Save,
  FileInput,
  Search,
  Mic,
  Play,
  Check,
  AlertCircle,
  Sparkles,
  SlidersHorizontal,
  Plus,
  X,
  LoaderCircle,
  Subtitles,
  ChevronDown,
} from "lucide-react";
import { useStudio } from "./store";
import {
  activeSegments,
  blankProject,
  duration,
  placement,
  srt,
  takeFor,
  timecode,
  uid,
  splitVideo,
  needsGeneration,
  canResumeGeneration,
} from "./model";
import {
  addVideo,
  auditionSegment,
  cancelTask,
  exportVideo,
  generate,
  recognize,
  report,
  task,
} from "./actions";
import {
  download,
  exportProject,
  importProject,
  restoreLocal,
  saveLocal,
} from "./storage";
import Preview from "./Preview";
import EditorTimeline from "./Timeline";
import Inspector from "./Inspector";
import VoiceSourceSelect from "./VoiceSourceSelect";
import AIPanel from "./AIPanel";
import { ImportDialog, Modal, SettingsDialog } from "./Dialogs";
export default function App() {
  const st = useStudio(),
    { project: p, selected, time, busy, progress, notice, edit, set } = st,
    [dialog, showDialog] = useState(""),
    [right, setRight] = useState<"ai" | "properties" | "voice">("ai"),
    [search, searchSet] = useState(""),
    [saved, savedSet] = useState("本地工程"),
    [restoreReady, ready] = useState(false),
    [aiSeed, seed] = useState(""),
    [panelOpen, openPanel] = useState(false);
  const input = useRef<HTMLInputElement>(null),
    open = useRef<HTMLInputElement>(null),
    rows = activeSegments(p),
    visible = rows.filter((s) =>
      (s.text + s.original + s.subtitle).includes(search),
    );
  useEffect(() => {
    restoreLocal()
      .then((p) => {
        if (p) {
          for (const s of p.segments) {
            if (["queued", "generating"].includes(s.status)) {
              s.status = "error";
              s.error = "页面重新打开，可继续查询任务";
            }
          }
          st.load(p);
        }
      })
      .catch(report)
      .finally(() => ready(true));
  }, []);
  useEffect(() => {
    if (!restoreReady) return;
    savedSet("保存中…");
    const t = setTimeout(
      () =>
        saveLocal(p)
          .then(() => savedSet("已自动保存"))
          .catch(() => savedSet("本地存储空间不足，请保存工程包")),
      500,
    );
    return () => clearTimeout(t);
  }, [p, restoreReady]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).matches(
          "input,textarea,select,[contenteditable]",
        )
      )
        return;
      const st = useStudio.getState();
      if (st.busy) return;
      if (e.code === "Space") {
        e.preventDefault();
        st.set({ playing: !st.playing });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? st.redo() : st.undo();
      }
      if (e.key.toLowerCase() === "s" && !e.ctrlKey && !e.metaKey) {
        const c = st.project.videos.find(
          (c) => st.time > c.start && st.time < c.start + c.out - c.in,
        );
        if (c) st.edit((p) => splitVideo(p, c.id, st.time));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const choose = (id: string) => {
    const s = p.segments.find((x) => x.id === id);
    set({
      selected: id,
      time: s ? placement(p, s)!.start : time,
      playing: false,
    });
  };
  const addSentence = () => {
    const c = p.videos.find(
      (c) => time >= c.start && time < c.start + c.out - c.in,
    );
    if (!c) {
      report("将播放头移到视频内，再添加句子");
      return;
    }
    const start = c.in + time - c.start,
      id = uid();
    edit((p) =>
      p.segments.push({
        id,
        clipId: c.id,
        sourceStart: start,
        sourceEnd: Math.min(c.out, start + 3),
        original: "",
        text: "",
        subtitle: "",
        syncText: true,
        voiceId: "",
        takes: [],
        status: "idle",
        dubOffset: 0,
        subtitleOffset: 0,
        gain: 1,
        fit: "fit",
        muted: false,
      }),
    );
    set({ selected: id });
  };
  return (
    <div className="app">
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
        <div className="project-title">
          <input
            aria-label="项目名称"
            disabled={!!busy}
            value={p.name}
            onChange={(e) =>
              edit((p) => {
                p.name = e.target.value;
              })
            }
          />
          <span>
            <span className="save-dot" />
            {saved}
          </span>
        </div>
        <div className="spacer" />
        <button
          className="icon panel-toggle"
          title="打开 AI 与属性面板"
          onClick={() => openPanel(!panelOpen)}
        >
          <Sparkles size={18} />
        </button>
        <button
          className="compact-button"
          title="新建工程"
          disabled={!!busy}
          onClick={() => showDialog("new")}
        >
          <Plus size={16} />
        </button>
        <div className="history-buttons">
          <button
            className="icon"
            disabled={!st.past.length || !!busy}
            title="撤销 Ctrl Z"
            onClick={st.undo}
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon"
            disabled={!st.future.length || !!busy}
            title="重做 Ctrl Shift Z"
            onClick={st.redo}
          >
            <Redo2 size={17} />
          </button>
        </div>
        <button
          className="compact-button"
          disabled={!!busy}
          onClick={() => open.current?.click()}
          title="打开工程"
        >
          <FolderOpen size={16} />
          <span>打开</span>
        </button>
        <button
          className="compact-button"
          disabled={!!busy}
          onClick={() => task("打包工程", async () => exportProject(p))}
          title="保存包含素材的工程包"
        >
          <Save size={16} />
          <span>保存</span>
        </button>
        <button
          className="icon"
          title="API 设置"
          onClick={() => showDialog("settings")}
        >
          <Settings size={18} />
        </button>
        <button
          className="primary export-button"
          disabled={!p.videos.length || !!busy}
          onClick={() => showDialog("export")}
        >
          <Download size={16} />
          导出视频
        </button>
      </header>
      <input
        hidden
        ref={input}
        type="file"
        multiple
        accept="video/mp4,video/quicktime"
        onChange={(e) => {
          void addVideo(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      <input
        hidden
        ref={open}
        type="file"
        accept=".dubstudio,.zip"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f)
            void task("打开工程", async () => st.load(await importProject(f)));
          e.target.value = "";
        }}
      />
      <main className="workspace">
        <aside className="transcript-panel">
          <div className="panel-heading">
            <strong>台词工作台</strong>
            <span className="count">{rows.length} 句</span>
            <button
              className="icon"
              title="新增一句"
              disabled={!p.videos.length || !!busy}
              onClick={addSentence}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="transcript-tools">
            <button
              className="primary subtle"
              disabled={!p.videos.length || !!busy}
              onClick={() =>
                rows.length ? showDialog("recognize") : recognize()
              }
            >
              <AudioLines size={15} />
              识别字幕
            </button>
            <button
              disabled={!p.videos.length || !!busy}
              onClick={() => showDialog("import")}
            >
              <FileInput size={15} />
              导入
            </button>
            <button
              className="icon"
              title="导出 SRT 字幕"
              disabled={!rows.length}
              onClick={() =>
                download(
                  new Blob([srt(p)], { type: "text/plain;charset=utf-8" }),
                  p.name + ".srt",
                )
              }
            >
              <Download size={15} />
            </button>
          </div>
          <div className="search-field">
            <Search size={14} />
            <input
              placeholder="搜索台词…"
              aria-label="搜索台词"
              value={search}
              onChange={(e) => searchSet(e.target.value)}
            />
          </div>
          <div className="segment-list">
            {!rows.length && (
              <div className="transcript-empty">
                <Subtitles size={30} />
                <h3>每一句，都可以重来</h3>
                <p>
                  导入视频并识别字幕，或导入已有的 SRT，逐句编辑配音与字幕。
                </p>
                <button
                  disabled={!!busy}
                  onClick={() => input.current?.click()}
                >
                  <Upload size={15} />
                  导入视频
                </button>
              </div>
            )}
            {visible.map((s) => {
              const at = placement(p, s)!,
                take = takeFor(s),
                index = rows.findIndex((x) => x.id === s.id),
                active = time >= at.start && time < at.end,
                stale = take && needsGeneration(p, s),
                resumable = canResumeGeneration(p, s);
              return (
                <article
                  key={s.id}
                  data-segment-id={s.id}
                  className={
                    "segment" +
                    (selected === s.id ? " selected" : "") +
                    (active ? " current" : "")
                  }
                  onClick={() => selected !== s.id && choose(s.id)}
                >
                  <div className="segment-meta">
                    <button
                      className="segment-time"
                      onClick={() => choose(s.id)}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      {timecode(at.start, true)} — {timecode(at.end, true)}
                    </button>
                    <span
                      className={
                        "segment-status " + (stale ? "stale" : s.status)
                      }
                    >
                      {["queued", "generating"].includes(s.status) ? (
                        <LoaderCircle size={12} className="spin" />
                      ) : s.status === "error" ? (
                        <AlertCircle size={12} />
                      ) : take ? (
                        <Check size={12} />
                      ) : null}
                      {stale
                        ? "待更新"
                        : s.status === "error"
                          ? "失败"
                          : s.status === "generating"
                            ? "生成中"
                            : s.status === "queued"
                              ? "排队"
                              : take
                                ? "已配音"
                                : "未配音"}
                    </span>
                  </div>
                  <p className="original-text" title="原始识别结果">
                    {s.original || "手动添加的句子"}
                  </p>
                  <textarea
                    aria-label={"第" + (index + 1) + "句配音文本"}
                    value={s.text}
                    placeholder="输入新台词…"
                    rows={2}
                    disabled={!!busy}
                    onFocus={() => set({ selected: s.id })}
                    onChange={(e) =>
                      edit((p) => {
                        const row = p.segments.find((x) => x.id === s.id)!;
                        row.text = e.target.value;
                        if (row.syncText) row.subtitle = e.target.value;
                      })
                    }
                  />
                  {selected === s.id && (
                    <>
                      <label className="check sync-caption">
                        <input
                          type="checkbox"
                          checked={s.syncText}
                          disabled={!!busy}
                          onChange={(e) =>
                            edit((p) => {
                              const row = p.segments.find(
                                (x) => x.id === s.id,
                              )!;
                              row.syncText = e.target.checked;
                              if (row.syncText) row.subtitle = row.text;
                            })
                          }
                        />
                        字幕与配音文本同步
                      </label>
                      {!s.syncText && (
                        <textarea
                          aria-label={"第" + (index + 1) + "句字幕"}
                          rows={2}
                          value={s.subtitle}
                          disabled={!!busy}
                          onChange={(e) =>
                            edit((p) => {
                              p.segments.find((x) => x.id === s.id)!.subtitle =
                                e.target.value;
                            })
                          }
                        />
                      )}
                    </>
                  )}
                  <VoiceSourceSelect
                    project={p}
                    segment={s}
                    disabled={!!busy}
                    onChange={(voiceId) =>
                      edit((p) => {
                        p.segments.find((row) => row.id === s.id)!.voiceId =
                          voiceId;
                      })
                    }
                  />
                  <div className="segment-actions">
                    <span>
                      {s.text.length} 字 · {(at.end - at.start).toFixed(1)}s
                    </span>
                    <div className="spacer" />
                    <button
                      className="text-button"
                      disabled={!take || !!busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        auditionSegment(s.id).catch(report);
                      }}
                    >
                      <Play size={12} />
                      试听
                    </button>
                    <button
                      className="generate-button"
                      disabled={!!busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void generate([s.id], resumable);
                      }}
                    >
                      <Mic size={12} />
                      {resumable
                        ? "继续查询"
                        : s.taskId
                          ? "按配置生成"
                          : take
                            ? "重新生成"
                            : "克隆"}
                    </button>
                  </div>
                  {s.error && <p className="error-text">{s.error}</p>}
                </article>
              );
            })}
          </div>
          <div className="transcript-footer">
            <span>
              {rows.filter((s) => takeFor(s)).length} / {rows.length} 句已配音
            </span>
            <button
              disabled={!rows.length || !!busy}
              onClick={() =>
                generate(
                  rows
                    .filter((s) => !s.muted && needsGeneration(p, s))
                    .map((s) => s.id),
                )
              }
            >
              <Mic size={14} />
              生成待更新
            </button>
          </div>
        </aside>
        <div className="center-panel">
          <div className="media-toolbar">
            <button disabled={!!busy} onClick={() => input.current?.click()}>
              <Upload size={15} />
              添加视频
            </button>
            <span className="meta">
              {p.videos.length} 个片段 · {timecode(duration(p))}
            </span>
            <div className="spacer" />
            <select
              aria-label="画布比例"
              value={
                Math.abs(p.width / p.height - 16 / 9) < 0.02
                  ? "16:9"
                  : Math.abs(p.width / p.height - 9 / 16) < 0.02
                    ? "9:16"
                    : p.width === p.height
                      ? "1:1"
                      : "source"
              }
              onChange={(e) =>
                edit((p) => {
                  if (e.target.value === "16:9") {
                    p.width = 1280;
                    p.height = 720;
                  }
                  if (e.target.value === "9:16") {
                    p.width = 720;
                    p.height = 1280;
                  }
                  if (e.target.value === "1:1") p.width = p.height = 1080;
                  if (e.target.value === "source") {
                    const a = p.assets.find(
                      (a) => a.id === p.videos[0]?.assetId,
                    );
                    if (a) {
                      p.width = a.width;
                      p.height = a.height;
                    }
                  }
                })
              }
            >
              <option value="source">原始比例</option>
              <option value="16:9">16:9 横屏</option>
              <option value="9:16">9:16 竖屏</option>
              <option value="1:1">1:1 方形</option>
            </select>
          </div>
          <Preview />
          <div className="preview-hint">
            <span>空格 播放／暂停</span>
            <span>S 分割片段</span>
            <span>拖动时间轴调整位置</span>
          </div>
        </div>
        <aside className={"right-panel " + right + (panelOpen ? " open" : "")}>
          <div className="right-tabs">
            <button
              className={right === "ai" ? "active" : ""}
              onClick={() => setRight("ai")}
            >
              <Sparkles size={15} />
              AI 助手
            </button>
            <button
              className={right === "properties" ? "active" : ""}
              onClick={() => setRight("properties")}
            >
              <SlidersHorizontal size={15} />
              属性
            </button>
            <button
              className={right === "voice" ? "active" : ""}
              onClick={() => setRight("voice")}
            >
              <Mic size={15} />
              音色
            </button>
          </div>
          <button
            className="panel-close icon"
            title="关闭侧栏"
            onClick={() => openPanel(false)}
          >
            <X size={16} />
          </button>
          {right === "ai" ? (
            <AIPanel seed={aiSeed} clearSeed={() => seed("")} />
          ) : (
            <fieldset className="inspector-lock" disabled={!!busy}>
              <Inspector tab={right} />
            </fieldset>
          )}
        </aside>
      </main>
      <EditorTimeline />
      {busy && (
        <div className="task-banner" role="status">
          <LoaderCircle size={16} className="spin" />
          <span>{busy}</span>
          {progress > 0 && <progress max="1" value={progress} />}
          <button onClick={cancelTask}>停止</button>
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button
            className="icon"
            aria-label="关闭通知"
            onClick={() => set({ notice: "" })}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {dialog === "settings" && <SettingsDialog close={() => showDialog("")} />}
      {dialog === "new" && (
        <Modal title="新建工程" close={() => showDialog("")}>
          <p>
            新工程会替换当前工作区的自动保存。需要继续使用当前素材和配音时，请先点击保存工程包。
          </p>
          <footer>
            <button onClick={() => showDialog("")}>取消</button>
            <button
              className="primary"
              onClick={() => {
                st.load(blankProject());
                showDialog("");
              }}
            >
              新建空白工程
            </button>
          </footer>
        </Modal>
      )}
      {dialog === "import" && (
        <ImportDialog
          close={() => showDialog("")}
          onAI={(text) => {
            setRight("ai");
            openPanel(true);
            seed(text);
          }}
        />
      )}
      {dialog === "recognize" && (
        <Modal title="重新识别字幕" close={() => showDialog("")}>
          <p>
            重新识别会替换当前台词列表。可先保存工程包，或完成后使用撤销恢复。
          </p>
          <footer>
            <button onClick={() => showDialog("")}>取消</button>
            <button
              className="primary"
              onClick={() => {
                showDialog("");
                void recognize();
              }}
            >
              重新识别
            </button>
          </footer>
        </Modal>
      )}
      {dialog === "export" && (
        <Modal title="导出视频" close={() => showDialog("")}>
          <p className="help">
            所有视频片段、配音、字幕与背景音乐会按当前时间轴合成。
          </p>
          <div className="export-details">
            <span>格式</span>
            <strong>MP4 · H.264 / AAC</strong>
            <span>画面</span>
            <strong>
              {p.width} × {p.height}
            </strong>
            <span>时长</span>
            <strong>{timecode(duration(p), true)}</strong>
          </div>
          <label>
            帧率
            <select
              value={p.fps}
              onChange={(e) =>
                edit((p) => {
                  p.fps = +e.target.value;
                })
              }
            >
              <option value="24">24 fps</option>
              <option value="25">25 fps</option>
              <option value="30">30 fps</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={p.subtitles}
              onChange={(e) =>
                edit((p) => {
                  p.subtitles = e.target.checked;
                })
              }
            />
            把字幕烧录到视频画面
          </label>
          <footer>
            <button onClick={() => showDialog("")}>取消</button>
            <button
              className="primary"
              onClick={() => {
                showDialog("");
                void exportVideo();
              }}
            >
              <Download size={16} />
              开始导出
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
