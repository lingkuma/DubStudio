import { useEffect, useRef, useState } from "react";
import { X, Check, Copy, FileInput, Sparkles, BookOpen, FileText, Trash2, Upload } from "lucide-react";
import { useStudio } from "./store";
import { activeSegments, parseSrt, type Channel, type Connection, type Segment, uid } from "./model";
import { api } from "./providers";
import { report } from "./actions";
import { settingsShareUrl } from "./settings";
import {
  knowledgeAccept,
  knowledgeExtensions,
  readKnowledgeFile,
  type KnowledgeFile,
  type KnowledgeState,
} from "./knowledge";
export function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const timer = setTimeout(
      () =>
        ref.current
          ?.querySelector<HTMLElement>("input,textarea,select,button")
          ?.focus(),
      0,
    );
    return () => {
      clearTimeout(timer);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal" + (wide ? " wide" : "")}
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
          if (e.key === "Tab") {
            const items = Array.from(
              ref.current?.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled):not([type=hidden]),textarea,select",
              ) || [],
            ).filter((el) => el.offsetParent !== null);
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={close} aria-label="关闭">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function SettingsDialog({ close }: { close: () => void }) {
  const st = useStudio(),
    s = st.settings,
    [shareLink, setShareLink] = useState(""),
    [status, statusSet] = useState(""),
    [checking, checkState] = useState(false);
  const update = (change: (current: typeof s) => typeof s) => {
    st.saveSettings(change(useStudio.getState().settings));
    setShareLink("");
  };
  const field = (key: keyof typeof s, value: unknown) =>
    update((current) => ({ ...current, [key]: value }));
  const share = async () => {
    const link = settingsShareUrl(window.location.href, useStudio.getState().settings);
    try {
      await navigator.clipboard.writeText(link);
      statusSet("配置分享链接已复制");
    } catch {
      setShareLink(link);
      statusSet("请复制下方配置分享链接");
    }
  };
  const connectionFields = (channel: Channel, name: string) => {
    const connection = s.connections[channel];
    const change = (key: keyof Connection, value: unknown) =>
      update((current) => ({
        ...current,
        connections: {
          ...current.connections,
          [channel]: { ...current.connections[channel], [key]: value },
        },
      }));
    return (
      <div className="channel-connection">
        <label>
          连接方式
          <select aria-label={name + "连接方式"} value={connection.transport}
            onChange={(e) => change("transport", e.target.value)}>
            <option value="direct">浏览器直连</option>
            <option value="gateway">同站 / 自定义网关</option>
            <option value="worker">自定义 Worker 转发</option>
          </select>
        </label>
        {connection.transport === "gateway" && (
          <label>
            网关地址
            <input aria-label={name + "网关地址"} value={connection.gateway}
              placeholder="/api/gateway 或兼容网关完整地址"
              onChange={(e) => change("gateway", e.target.value)} />
          </label>
        )}
        {connection.transport === "worker" && (
          <>
            <label>
              Worker 地址
              <input aria-label={name + "Worker 地址"} value={connection.workerUrl}
                placeholder="https://proxy.example/?url={url}"
                onChange={(e) => change("workerUrl", e.target.value)} />
            </label>
            <p className="help">{"{url} 传入编码后的目标 URL；{rawUrl} 传入原始 URL。不写占位符时自动添加 ?url= 参数。"}</p>
          </>
        )}
        {channel !== "ai" && connection.transport === "direct" && (
          <>
            <label className="check">
              <input type="checkbox" checked={connection.downloadFallback}
                onChange={(e) => change("downloadFallback", e.target.checked)} />
              结果文件跨域时使用网关下载
            </label>
            {connection.downloadFallback && (
              <label>
                结果下载网关
                <input aria-label={name + "结果下载网关"} value={connection.gateway}
                  onChange={(e) => change("gateway", e.target.value)} />
              </label>
            )}
          </>
        )}
      </div>
    );
  };
  const check = async (type: string) => {
    checkState(true);
    statusSet("正在连接…");
    try {
      await api(s, type);
      statusSet("连接成功");
    } catch (e) {
      statusSet(e instanceof Error ? e.message : String(e));
    } finally {
      checkState(false);
    }
  };
  return (
    <Modal title="API 与工作区设置" close={close} wide>
      <div className="settings-basics">
        <p className="help">修改后自动保存，API Key 保存在当前浏览器。各渠道独立选择连接方式与代理地址。</p>
        <p className="help">分享链接包含当前 Key 和全部设置。朋友打开后自动导入，地址随即恢复干净，方便收藏。</p>
        {st.settingsError && <p role="alert">{st.settingsError}</p>}
      </div>
      <div className="settings-grid">
        <section>
          <h3>语音识别 · 阿里百炼</h3>
          {connectionFields("asr", "百炼")}
          <label>
            API Key
            <input
              type="password"
              autoComplete="off"
              value={s.aliyunKey}
              onChange={(e) => field("aliyunKey", e.target.value)}
              placeholder="sk-…"
            />
          </label>
          <label>
            Base URL
            <input
              value={s.asrBase}
              onChange={(e) =>
                field("asrBase", e.target.value.replace(/\/$/, ""))
              }
            />
          </label>
          <p className="help">模型：qwen-audio-3.1-asr-flash-filetrans</p>
          <label>
            热词（逗号分隔）
            <input
              value={s.hotwords}
              onChange={(e) => field("hotwords", e.target.value)}
              placeholder="人名、品牌、行业词汇"
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.diarization}
              onChange={(e) => field("diarization", e.target.checked)}
            />
            识别说话人（默认开启）
          </label>
          <p className="help">自动区分多人台词，识别后可在人物面板改名或修正归属。</p>
          <button
            disabled={checking || !s.aliyunKey}
            onClick={() => check("asr-policy")}
          >
            测试百炼连接
          </button>
        </section>
        <section>
          <h3>克隆配音 · AutoDL</h3>
          {connectionFields("tts", "AutoDL")}
          <label>
            Base URL
            <input aria-label="AutoDL Base URL" value={s.autodlBase}
              onChange={(e) => field("autodlBase", e.target.value)} />
          </label>
          <label>
            AutoDL Token
            <input
              type="password"
              autoComplete="off"
              value={s.autodlKey}
              onChange={(e) => field("autodlKey", e.target.value)}
              placeholder="填写 AutoDL API Token"
            />
          </label>
          <p className="help">
            工作流：indextts2-v1。默认用每句原视频时间戳内的原声克隆，也可逐句选择自定义音色。
          </p>
          <button
            disabled={checking || !s.autodlKey}
            onClick={() => check("tts-check")}
          >
            测试 AutoDL 连接
          </button>
          <h3>
            <Sparkles size={17} />
            AI 二创助手
          </h3>
          {connectionFields("ai", "AI")}
          <label>
            OpenAI 兼容 Base URL
            <input
              value={s.aiBase}
              onChange={(e) =>
                field("aiBase", e.target.value.replace(/\/$/, ""))
              }
            />
          </label>
          <label>
            AI API Key
            <input
              type="password"
              autoComplete="off"
              value={s.aiKey}
              onChange={(e) => field("aiKey", e.target.value)}
              placeholder="sk-…"
            />
          </label>
          <label>
            模型
            <input
              value={s.aiModel}
              onChange={(e) => field("aiModel", e.target.value)}
            />
          </label>
          <button
            disabled={checking || !s.aiKey}
            onClick={() => check("ai-models")}
          >
            测试 AI 连接
          </button>
        </section>
      </div>
      {status && (
        <p className="connection-status" role="status">
          {status}
        </p>
      )}
      {shareLink && (
        <label className="settings-basics">
          配置分享链接
          <textarea readOnly value={shareLink} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <footer>
        <button onClick={share}><Copy size={15} />复制配置分享链接</button>
        <button className="primary" onClick={close}>完成</button>
      </footer>
    </Modal>
  );
}
export function KnowledgeDialog({
  value,
  error,
  onChange,
  close,
}: {
  value: KnowledgeState;
  error: string;
  onChange: (next: KnowledgeState) => void;
  close: () => void;
}) {
  const [open, openSet] = useState<string | null>(null),
    [status, statusSet] = useState(""),
    [uploading, uploadingSet] = useState(false);
  const active = value.files.filter((f) => f.active).length;
  // Uploads resolve asynchronously; always patch the newest state.
  const latest = useRef(value);
  latest.current = value;
  const patch = (fn: (draft: KnowledgeState) => void) => {
    const next: KnowledgeState = {
      files: latest.current.files.map((f) => ({ ...f })),
      prompt: latest.current.prompt,
    };
    fn(next);
    onChange(next);
  };
  const edit = (id: string, fn: (file: KnowledgeFile) => void) =>
    patch((draft) => {
      const file = draft.files.find((f) => f.id === id);
      if (file) fn(file);
    });
  const upload = async (list: File[]) => {
    if (!list.length) return;
    uploadingSet(true);
    statusSet("");
    const added: KnowledgeFile[] = [],
      failed: string[] = [];
    for (const file of list) {
      try {
        added.push(await readKnowledgeFile(file));
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (added.length) patch((draft) => draft.files.push(...added));
    statusSet(failed.length ? failed.join("；") : `已添加 ${added.length} 个文件`);
    uploadingSet(false);
  };
  return (
    <Modal title="AI 知识库与系统大纲" close={close} wide>
      <div className="knowledge-dialog">
        <section>
          <h3>
            <BookOpen size={17} />
            系统提示词 · 大纲
          </h3>
          <p className="help">
            这段文字会作为固定 system 消息一起发送，用来规定知识库的作用、人物口径和改写尺度。与启用的文件一样，只保存在当前浏览器。
          </p>
          <textarea
            aria-label="AI 系统提示词"
            rows={6}
            value={value.prompt}
            placeholder={"例如：\n以《示例设定集》为准，人名与人物关系不可改动\n术语按设定集对照表统一，不得自创\n二创改写保持每句时长，优先沿用原有梗"}
            onChange={(e) => patch((draft) => void (draft.prompt = e.target.value))}
          />
        </section>
        <section>
          <h3>
            <FileInput size={17} />
            知识库文件
          </h3>
          <div className="knowledge-actions">
            <label className={"upload-button" + (uploading ? " disabled" : "")}>
              <Upload size={14} />
              {uploading ? "正在读取…" : "上传文本文件"}
              <input
                type="file"
                multiple
                accept={knowledgeAccept}
                disabled={uploading}
                onChange={(e) => {
                  // Snapshot before clearing: FileList is live and empties with the input.
                  const files = Array.from(e.target.files || []);
                  e.target.value = "";
                  void upload(files);
                }}
              />
            </label>
            <button
              className="text-button"
              disabled={!value.files.length}
              onClick={() => patch((draft) => draft.files.forEach((f) => void (f.active = true)))}
            >
              全部启用
            </button>
            <button
              className="text-button"
              disabled={!value.files.length}
              onClick={() => patch((draft) => draft.files.forEach((f) => void (f.active = false)))}
            >
              全部停用
            </button>
            <span className="meta">{active}/{value.files.length} 启用 · 仅存本机</span>
          </div>
          {(status || error) && (
            <p className="connection-status" role="status">
              {status || error}
            </p>
          )}
          {!value.files.length ? (
            <p className="help">
              还没有文件。支持 {knowledgeExtensions.join(" / ")}；单个文件建议 20 万字以内，超出部分发送时会被截断。
            </p>
          ) : (
            <div className="knowledge-list">
              {value.files.map((f) => (
                <div className="knowledge-item" key={f.id}>
                  <div className="knowledge-row">
                    <label className="check" title="默认附带在每次对话中">
                      <input
                        type="checkbox"
                        checked={f.active}
                        onChange={(e) =>
                          edit(f.id, (file) => void (file.active = e.target.checked))
                        }
                      />
                      默认激活
                    </label>
                    <button
                      className="text-button knowledge-name"
                      title="查看或修改内容"
                      onClick={() => openSet(open === f.id ? null : f.id)}
                    >
                      <FileText size={13} />
                      {f.name}
                    </button>
                    <span className="meta">{[...f.text].length} 字</span>
                    <button
                      className="icon"
                      title={"删除 " + f.name}
                      onClick={() =>
                        patch((draft) => void (draft.files = draft.files.filter((x) => x.id !== f.id)))
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {open === f.id && (
                    <textarea
                      aria-label={f.name + " 内容"}
                      rows={10}
                      value={f.text}
                      onChange={(e) =>
                        edit(f.id, (file) => void (file.text = e.target.value))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
      <footer>
        <button className="primary" onClick={close}>
          <Check size={15} />
          完成
        </button>
      </footer>
    </Modal>
  );
}
export function ImportDialog({
  close,
  onAI,
}: {
  close: () => void;
  onAI: (text: string) => void;
}) {
  const { project: p, edit, set } = useStudio(),
    [text, change] = useState(""),
    [mode, setMode] = useState<"lines" | "srt" | "ai">("lines"),
    [target, setTarget] = useState("both"),
    [error, errorSet] = useState("");
  const rows = activeSegments(p),
    lines = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((x) => x.trim()),
    cues = parseSrt(text);
  const apply = () => {
    try {
      if (mode === "ai") {
        onAI(text);
        close();
        return;
      }
      if (mode === "lines") {
        if (lines.length !== rows.length)
          throw new Error(
            "当前有 " +
              rows.length +
              " 句，导入了 " +
              lines.length +
              " 行。请保持行数一致，或使用 AI 匹配。",
          );
        edit((p) => {
          rows.forEach((row, i) => {
            const s = p.segments.find((x) => x.id === row.id)!;
            if (target !== "subtitle") s.text = lines[i];
            if (target !== "text") s.subtitle = lines[i];
            s.syncText = target === "both";
          });
        });
      } else {
        if (!cues.length) throw new Error("没有找到有效的 SRT 时间戳");
        const prepared: Segment[] = [];
        for (const q of cues) {
          const c = p.videos.find(
            (c) =>
              q.start >= c.start - 0.01 &&
              q.end <= c.start + c.out - c.in + 0.01,
          );
          if (!c)
            throw new Error(
              "某条字幕跨越剪辑边界或超出视频范围，请先调整时间戳",
            );
          prepared.push({
            id: uid(),
            clipId: c.id,
            sourceStart: c.in + q.start - c.start,
            sourceEnd: c.in + q.end - c.start,
            original: q.text,
            text: q.text,
            subtitle: q.text,
            syncText: true,
            voiceId: "",
            takes: [],
            status: "idle",
            dubOffset: 0,
            subtitleOffset: 0,
            gain: 1,
            fit: "fit",
            muted: false,
          });
        }
        edit((p) => {
          p.segments = prepared;
        });
      }
      set({ notice: "字幕导入完成" });
      close();
    } catch (e) {
      errorSet(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <Modal title="导入台词与字幕" close={close} wide>
      <div className="import-modes">
        {[
          ["lines", "按行替换"],
          ["srt", "SRT 时间轴"],
          ["ai", "AI 智能匹配"],
        ].map(([k, t]) => (
          <button
            key={k}
            className={mode === k ? "active-toggle" : ""}
            onClick={() => setMode(k as typeof mode)}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="help">
        {mode === "lines"
          ? "每行对应现有的一句，保留原时间戳和配音历史。"
          : mode === "srt"
            ? "读取 SRT 中的时间轴，替换现有字幕分段；视频素材保持不变。"
            : "让 AI 将外部文稿与原字幕匹配。先查看逐句修改建议，再应用。"}
      </p>
      <label className="file-pick">
        <FileInput size={16} />
        读取 TXT / SRT 文件
        <input
          type="file"
          accept=".txt,.srt"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) change(await f.text());
          }}
        />
      </label>
      <textarea
        className="import-text"
        aria-label="导入字幕内容"
        value={text}
        onChange={(e) => change(e.target.value)}
        placeholder="在这里粘贴新台词或 SRT 字幕…"
      />
      {mode === "lines" && (
        <div className="import-summary">
          <span>
            现有 {rows.length} 句 / 导入 {lines.length} 行
          </span>
          <select
            aria-label="导入更新目标"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="both">更新配音文本与字幕</option>
            <option value="text">仅更新配音文本</option>
            <option value="subtitle">仅更新字幕</option>
          </select>
        </div>
      )}
      {mode === "srt" && (
        <p className="help">识别到 {cues.length} 条带时间戳的字幕。</p>
      )}
      {error && <p className="error-text">{error}</p>}
      <footer>
        <button onClick={close}>取消</button>
        <button className="primary" disabled={!text.trim()} onClick={apply}>
          {mode === "ai" ? "交给 AI 匹配" : "导入并替换"}
        </button>
      </footer>
    </Modal>
  );
}
