import { useEffect, useRef, useState } from "react";
import { X, Check, Settings2, FileInput, Sparkles } from "lucide-react";
import { useStudio } from "./store";
import { activeSegments, parseSrt, type Segment, uid } from "./model";
import { api } from "./providers";
import { report } from "./actions";
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
    [s, update] = useState(st.settings),
    [status, statusSet] = useState(""),
    [checking, checkState] = useState(false);
  const field = (key: keyof typeof s, value: unknown) =>
    update({ ...s, [key]: value });
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
      <div className="settings-grid">
        <section>
          <h3>
            <Settings2 size={17} />
            连接方式
          </h3>
          <label>
            请求方式
            <select
              value={s.transport}
              onChange={(e) => field("transport", e.target.value)}
            >
              <option value="gateway">同站代理 · Vercel 默认推荐</option>
              <option value="direct">浏览器直连 · 需要 API 支持跨域</option>
            </select>
          </label>
          {s.transport === "gateway" && (
            <label>
              代理路径
              <input
                value={s.gateway}
                onChange={(e) => field("gateway", e.target.value)}
              />
            </label>
          )}
          <p className="help">
            视频处理在本地浏览器完成。同站函数仅转发 API 与结果文件。Key
            默认仅保存于本次浏览器会话。
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={s.remember}
              onChange={(e) => field("remember", e.target.checked)}
            />
            在此设备记住 API Key
          </label>
          <h3>语音识别 · 阿里百炼</h3>
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
            识别说话人
          </label>
          <button
            disabled={checking || !s.aliyunKey}
            onClick={() => check("asr-policy")}
          >
            测试百炼连接
          </button>
        </section>
        <section>
          <h3>克隆配音 · AutoDL</h3>
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
            工作流：indextts2-v1。上传音色参考后，每一句都可独立生成。
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
      <footer>
        <button onClick={close}>取消</button>
        <button
          className="primary"
          onClick={() => {
            st.saveSettings(s);
            close();
            st.set({ notice: "API 设置已保存" });
          }}
        >
          <Check size={15} />
          保存设置
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
            voiceId: p.voices[0]?.id || "",
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
