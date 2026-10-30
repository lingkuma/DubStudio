import { useEffect, useState } from "react";
import {
  Sparkles,
  Send,
  Check,
  RotateCcw,
  FileInput,
  Play,
  LoaderCircle,
} from "lucide-react";
import { useStudio } from "./store";
import {
  activeSegments,
  duration,
  removeVideo,
  splitVideo,
  uid,
  type Project,
} from "./model";
import { askAI, type AIResult } from "./ai";
import { exportVideo, generate, report, task } from "./actions";
export default function AIPanel({
  seed = "",
  clearSeed,
}: {
  seed?: string;
  clearSeed?: () => void;
}) {
  const { project: p, settings, selected, busy, edit, set } = useStudio(),
    [input, setInput] = useState(""),
    [sending, sendState] = useState(false);
  const draft = p.proposal;
  const setDraft = (value: Project["proposal"] | null) =>
    edit((p) => {
      p.proposal = value || undefined;
    }, false);
  useEffect(() => {
    if (!seed) return;
    setInput(
      "请把以下外部文稿与现有台词按语义匹配，给出修改建议，无法匹配的明确列出：\n" +
        seed,
    );
    clearSeed?.();
  }, [seed]);
  const ask = async (prompt = input) => {
    if (!prompt.trim() || busy) return;
    setInput("");
    setDraft(null);
    sendState(true);
    const snapshot = structuredClone(useStudio.getState().project);
    edit((p) => {
      p.messages.push({
        id: uid(),
        role: "user",
        text: prompt,
        created: Date.now(),
      });
    }, false);
    try {
      const res = await task("AI 正在整理台词", (signal) =>
        askAI(
          snapshot,
          settings,
          prompt + (selected ? " 当前选中句子或片段 ID：" + selected : ""),
          signal,
        ),
      );
      if (!res) return;
      edit((p) => {
        p.messages.push({
          id: uid(),
          role: "assistant",
          text:
            res.reply +
            (res.actions.length
              ? "\n待执行操作尚未运行，请检查下方建议并应用。"
              : ""),
          created: Date.now(),
        });
      }, false);
      if (res.edits.length || res.actions.length)
        setDraft({
          result: res,
          before: Object.fromEntries(
            snapshot.segments.map((s) => [
              s.id,
              JSON.stringify([s.text, s.subtitle]),
            ]),
          ),
          projectId: snapshot.id,
          beforeTimeline: JSON.stringify(snapshot.videos),
        });
    } finally {
      sendState(false);
    }
  };
  const apply = async (execute: boolean) => {
    if (!draft) return;
    const current = useStudio.getState().project;
    if (
      current.id !== draft.projectId ||
      JSON.stringify(current.videos) !== draft.beforeTimeline ||
      draft.result.edits.some((e) => {
        const s = current.segments.find((s) => s.id === e.id);
        return (
          !s || JSON.stringify([s.text, s.subtitle]) !== draft.before[e.id]
        );
      })
    ) {
      report("这份建议对应的原文已变化，请重新生成建议");
      return;
    }
    const { result } = draft;
    edit((p) => {
      for (const e of result.edits) {
        const s = p.segments.find((s) => s.id === e.id)!;
        if (e.text !== undefined) {
          s.text = e.text;
          if (s.syncText && e.subtitle === undefined) s.subtitle = e.text;
        }
        if (e.subtitle !== undefined) {
          s.subtitle = e.subtitle;
          if (e.text === undefined) s.syncText = false;
        }
      }
    });
    setDraft(null);
    if (execute) {
      for (const a of result.actions) {
        if (a.type === "seek") {
          set({
            time: Math.min(duration(useStudio.getState().project), a.time || 0),
            playing: false,
          });
        } else if (a.type === "split" && a.clipId) {
          edit((p) => splitVideo(p, a.clipId!, a.time || 0));
        } else if (a.type === "remove" && a.clipId) {
          edit((p) => removeVideo(p, a.clipId!));
        } else if (a.type === "generate") {
          const generated = await generate(
            a.ids || result.edits.map((e) => e.id),
          );
          if (generated === undefined) return;
        } else if (a.type === "export") {
          if (!(await exportVideo())) return;
        }
      }
    }
    set({ notice: "AI 修改已应用，可撤销" });
  };
  return (
    <section className="ai-panel">
      <div className="ai-context">
        <Sparkles size={15} />
        <span>已读取 {activeSegments(p).length} 句台词与时间轴</span>
      </div>
      <div className="chat-messages">
        {!p.messages.length && (
          <div className="ai-welcome">
            <h3>让故事换个说法</h3>
            <p>
              我能读取原字幕，帮你改台词、匹配外部文稿，再调用克隆配音与视频导出。
            </p>
            <button
              onClick={() =>
                setInput(
                  "把全文改成搞笑二创，保留人物对话逻辑，每句字数尽量接近原句，保持全部时间戳。",
                )
              }
            >
              <Sparkles size={15} />
              全文搞笑改写
            </button>
            <button
              onClick={() =>
                setInput(
                  "请改写当前选中的句子，使它更自然，并在应用后克隆这句话。",
                )
              }
            >
              <Play size={15} />
              改一句并克隆
            </button>
            <button
              onClick={() =>
                setInput(
                  "请把以下文稿与现有字幕按语义匹配，仅修改匹配到的句子，无法匹配的指出来： ",
                )
              }
            >
              <FileInput size={15} />
              智能匹配文稿
            </button>
          </div>
        )}
        {p.messages.map((m) => (
          <div className={"message " + m.role} key={m.id}>
            <span>{m.role === "user" ? "你" : "DubStudio AI"}</span>
            <p>{m.text}</p>
          </div>
        ))}
        {sending && (
          <div className="ai-thinking">
            <LoaderCircle className="spin" size={15} />
            正在组织新台词…
          </div>
        )}
        {draft && (
          <div className="ai-proposal">
            <strong>{draft.result.edits.length} 句修改建议</strong>
            <p className="meta">时间戳保持不变。字数差异可用于判断配音长度。</p>
            {draft.result.edits.map((e) => {
              const s = p.segments.find((s) => s.id === e.id)!;
              const next = e.text ?? e.subtitle ?? "";
              return (
                <div className="diff-row" key={e.id}>
                  <small>
                    第 {activeSegments(p).findIndex((s) => s.id === e.id) + 1}{" "}
                    句 · {[...s.text].length} → {[...next].length} 字
                  </small>
                  <del>{s.text}</del>
                  <ins>{next}</ins>
                </div>
              );
            })}
            {draft.result.actions.length > 0 && (
              <p className="action-summary">
                后续操作：
                {draft.result.actions
                  .map(
                    (a) =>
                      ({
                        generate: "生成克隆配音",
                        export: "合并导出视频",
                        seek: "跳转位置",
                        split: "分割视频",
                        remove: "删除片段",
                      })[a.type],
                  )
                  .join(" → ")}
              </p>
            )}
            <button
              className="primary"
              disabled={!!busy}
              onClick={() => apply(false)}
            >
              <Check size={15} />
              应用文字修改
            </button>
            {draft.result.actions.length > 0 && (
              <button disabled={!!busy} onClick={() => apply(true)}>
                <Play size={15} />
                应用并执行操作
              </button>
            )}
            <button className="text-button" onClick={() => setDraft(null)}>
              <RotateCcw size={14} />
              放弃建议
            </button>
          </div>
        )}
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <textarea
          aria-label="与 AI 对话"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例如：把前五句改成职场喜剧，字数接近原文"
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <div>
          <span className="meta">{settings.aiModel} · Ctrl ↵ 发送</span>
          <button
            className="primary icon"
            title="发送给 AI"
            disabled={!input.trim() || !!busy}
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </section>
  );
}
