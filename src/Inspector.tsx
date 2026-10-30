import { useRef } from "react";
import { Mic, Plus, Download, Music2, Volume2 } from "lucide-react";
import { useStudio } from "./store";
import { placement, takeFor, type Segment, type Voice } from "./model";
import {
  addMusic,
  addVoice,
  report,
  saveTake,
  voiceFromSegment,
} from "./actions";
import { mediaUrl } from "./storage";
export default function Inspector({ tab }: { tab: "properties" | "voice" }) {
  const { project: p, selected, edit, busy } = useStudio(),
    s = p.segments.find((x) => x.id === selected),
    clip =
      p.videos.find((v) => v.id === selected) ||
      p.music.find((v) => v.id === selected),
    ref = useRef<HTMLInputElement>(null),
    emotion = useRef<HTMLInputElement>(null),
    music = useRef<HTMLInputElement>(null),
    emotionTarget = useRef<string>("");
  const patch = (v: Partial<Segment>) =>
    edit((p) => {
      Object.assign(
        p.segments.find((x) => x.id === selected)!,
        v,
      );
    });
  const vp = (id: string, v: Partial<Voice>) =>
    edit((p) =>
      Object.assign(
        p.voices.find((v) => v.id === id)!,
        v,
      ),
    );
  const at = s && placement(p, s),
    take = s && takeFor(s);
  if (tab === "voice")
    return (
      <div className="inspector">
        <input
          ref={ref}
          hidden
          type="file"
          accept="audio/mpeg,audio/wav"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addVoice(f).catch(report);
            e.target.value = "";
          }}
        />
        <input
          ref={emotion}
          hidden
          type="file"
          accept="audio/mpeg,audio/wav"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addVoice(f, true, emotionTarget.current).catch(report);
            e.target.value = "";
          }}
        />
        <div className="section-title">
          <h3>音色参考</h3>
          <button
            className="icon"
            title="上传参考音频"
            disabled={!!busy}
            onClick={() => ref.current?.click()}
          >
            <Plus size={17} />
          </button>
        </div>
        <p className="help">
          选择清晰、干净的短音频。IndexTTS2 每次生成都会使用这段声音。
        </p>
        {!p.voices.length && (
          <button className="upload-voice" onClick={() => ref.current?.click()}>
            <Mic size={22} />
            <strong>上传参考声音</strong>
            <span>MP3 / WAV，小于 2 MB</span>
          </button>
        )}
        {p.voices.map((v) => (
          <section className="voice-item" key={v.id}>
            <input
              aria-label="音色名称"
              value={v.name}
              onChange={(e) => vp(v.id, { name: e.target.value })}
            />
            <div className="voice-actions">
              <button
                onClick={async () => {
                  const a = new Audio(await mediaUrl(v.assetId));
                  a.play().catch(report);
                }}
              >
                试听参考
              </button>
              <button
                disabled={!!busy}
                onClick={() =>
                  edit((p) =>
                    p.segments.forEach((s) => {
                      s.voiceId = v.id;
                    }),
                  )
                }
              >
                应用到全部句子
              </button>
            </div>
            <label>
              情绪控制
              <select
                value={v.method}
                onChange={(e) => vp(v.id, { method: e.target.value })}
              >
                <option>与音色参考音频相同</option>
                <option>使用情感向量控制</option>
                <option>使用情感参考音频</option>
              </select>
            </label>
            {v.method === "使用情感参考音频" && (
              <button
                onClick={() => {
                  emotionTarget.current = v.id;
                  emotion.current?.click();
                }}
              >
                上传情感参考 {v.emotionAssetId ? "✓" : ""}
              </button>
            )}
            {v.method === "使用情感向量控制" &&
              [
                ["emo_happy", "开心"],
                ["emo_calm", "平静"],
                ["emo_sad", "悲伤"],
                ["emo_angry", "生气"],
                ["emo_afraid", "害怕"],
                ["emo_disgusted", "厌恶"],
                ["emo_surprised", "惊讶"],
                ["emo_melancholic", "低落"],
              ].map(([key, label]) => (
                <label className="slider-label" key={key}>
                  <span>
                    {label}
                    <b>{(v.emotions[key] || 0).toFixed(1)}</b>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1.4"
                    step=".1"
                    value={v.emotions[key] || 0}
                    onChange={(e) =>
                      vp(v.id, {
                        emotions: { ...v.emotions, [key]: +e.target.value },
                      })
                    }
                  />
                </label>
              ))}
            <label className="check">
              <input
                type="checkbox"
                checked={v.random}
                onChange={(e) => vp(v.id, { random: e.target.checked })}
              />
              随机情绪采样
            </label>
          </section>
        ))}
        {s && (
          <button onClick={() => voiceFromSegment(s.id).catch(report)}>
            从选中句子的原声提取音色
          </button>
        )}
      </div>
    );
  return (
    <div className="inspector">
      {s ? (
        <>
          <h3>当前句子</h3>
          <p className="help">
            {at?.start.toFixed(2)}s — {at?.end.toFixed(2)}s
          </p>
          <label>
            原素材语音起点（秒）
            <input
              type="number"
              min="0"
              step=".01"
              value={s.sourceStart}
              onChange={(e) =>
                patch({
                  sourceStart: Math.max(
                    0,
                    Math.min(s.sourceEnd - 0.04, +e.target.value),
                  ),
                })
              }
            />
          </label>
          <label>
            原素材语音终点（秒）
            <input
              type="number"
              min={s.sourceStart + 0.04}
              step=".01"
              value={s.sourceEnd}
              onChange={(e) => {
                const v = p.videos.find((v) => v.id === s.clipId)!,
                  asset = p.assets.find((a) => a.id === v.assetId)!;
                patch({
                  sourceEnd: Math.max(
                    s.sourceStart + 0.04,
                    Math.min(asset.duration, +e.target.value),
                  ),
                });
              }}
            />
          </label>
          <label>
            配音音色
            <select
              value={s.voiceId}
              onChange={(e) => patch({ voiceId: e.target.value })}
            >
              <option value="">选择参考声音</option>
              {p.voices.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            配音时长
            <select
              value={s.fit}
              onChange={(e) => patch({ fit: e.target.value as Segment["fit"] })}
            >
              <option value="fit">匹配原句 · 保持音高</option>
              <option value="natural">自然时长 · 允许延伸</option>
            </select>
          </label>
          {take && (
            <p className="help">
              生成 {take.duration.toFixed(2)}s / 原句{" "}
              {(s.sourceEnd - s.sourceStart).toFixed(2)}s
              {take.duration / (s.sourceEnd - s.sourceStart) > 1.35
                ? "。差异较大，建议缩短台词以获得更自然的声音。"
                : ""}
            </p>
          )}
          <label className="slider-label">
            <span>
              本句音量<b>{Math.round(s.gain * 100)}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="2"
              step=".05"
              value={s.gain}
              onChange={(e) => patch({ gain: +e.target.value })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={s.muted}
              onChange={(e) => patch({ muted: e.target.checked })}
            />
            禁用此句配音
          </label>
          <label>
            配音偏移（秒）
            <input
              type="number"
              step=".05"
              value={s.dubOffset}
              onChange={(e) => patch({ dubOffset: +e.target.value })}
            />
          </label>
          <label>
            字幕偏移（秒）
            <input
              type="number"
              step=".05"
              value={s.subtitleOffset}
              onChange={(e) => patch({ subtitleOffset: +e.target.value })}
            />
          </label>
          {s.takes.length > 0 && (
            <>
              <label>
                生成历史
                <select
                  value={s.takeId}
                  onChange={(e) => patch({ takeId: e.target.value })}
                >
                  {s.takes.map((t, i) => (
                    <option key={t.id} value={t.id}>
                      版本 {i + 1} · {t.duration.toFixed(1)}s ·{" "}
                      {t.text.slice(0, 14)}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => saveTake(s.id).catch(report)}>
                <Download size={15} />
                下载这一句
              </button>
            </>
          )}
        </>
      ) : clip ? (
        <>
          <h3>片段属性</h3>
          <label>
            时间轴起点（秒）
            <input
              type="number"
              min="0"
              step=".05"
              value={clip.start}
              onChange={(e) =>
                edit((p) => {
                  const c =
                    p.videos.find((c) => c.id === clip.id) ||
                    p.music.find((c) => c.id === clip.id);
                  if (c) c.start = Math.max(0, +e.target.value);
                })
              }
            />
          </label>
          <label>
            素材入点（秒）
            <input
              type="number"
              min="0"
              max={clip.out - 0.04}
              step=".05"
              value={clip.in}
              onChange={(e) =>
                edit((p) => {
                  const c =
                    p.videos.find((c) => c.id === clip.id) ||
                    p.music.find((c) => c.id === clip.id);
                  if (c)
                    c.in = Math.max(0, Math.min(c.out - 0.04, +e.target.value));
                })
              }
            />
          </label>
          <label>
            素材出点（秒）
            <input
              type="number"
              min={clip.in + 0.04}
              step=".05"
              value={clip.out}
              onChange={(e) =>
                edit((p) => {
                  const c =
                    p.videos.find((c) => c.id === clip.id) ||
                    p.music.find((c) => c.id === clip.id);
                  if (c)
                    c.out = Math.max(
                      c.in + 0.04,
                      Math.min(
                        p.assets.find((a) => a.id === c.assetId)!.duration,
                        +e.target.value,
                      ),
                    );
                })
              }
            />
          </label>
        </>
      ) : (
        <>
          <h3>工程设置</h3>
          <p className="help">选择台词或时间轴片段，查看对应属性。</p>
        </>
      )}
      <hr />
      <h3>
        <Volume2 size={15} />
        混音
      </h3>
      <label>
        原声策略
        <select
          value={p.originalMode}
          onChange={(e) =>
            edit((p) => {
              p.originalMode = e.target.value as typeof p.originalMode;
            })
          }
        >
          <option value="replace">仅替换已生成配音的区间</option>
          <option value="mute">静音全部原声</option>
          <option value="mix">保留原声，与配音叠加</option>
        </select>
      </label>
      <p className="help">
        替换区间会连同原视频中的背景声一起静音。独立背景音乐可另行导入。
      </p>
      {[
        ["originalVolume", "原声"],
        ["dubVolume", "配音"],
        ["musicVolume", "音乐"],
      ].map(([k, t]) => (
        <label className="slider-label" key={k}>
          <span>
            {t}
            <b>{Math.round(Number(p[k as keyof typeof p]) * 100)}%</b>
          </span>
          <input
            type="range"
            min="0"
            max="1.5"
            step=".05"
            value={Number(p[k as keyof typeof p])}
            onChange={(e) =>
              edit((p) => {
                (p as any)[k] = +e.target.value;
              })
            }
          />
        </label>
      ))}
      <input
        ref={music}
        hidden
        type="file"
        accept="audio/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void addMusic(f).catch(report);
          e.target.value = "";
        }}
      />
      <button disabled={!!busy} onClick={() => music.current?.click()}>
        <Music2 size={15} />
        添加背景音乐
      </button>
      <hr />
      <h3>字幕样式</h3>
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
        预览与导出显示字幕
      </label>
      <label>
        字号
        <input
          type="number"
          min="12"
          max="120"
          value={p.subtitleSize}
          onChange={(e) =>
            edit((p) => {
              p.subtitleSize = Math.max(12, Math.min(120, +e.target.value));
            })
          }
        />
      </label>
      <label>
        文字颜色
        <input
          type="color"
          value={p.subtitleColor}
          onChange={(e) =>
            edit((p) => {
              p.subtitleColor = e.target.value;
            })
          }
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={p.subtitleBackground}
          onChange={(e) =>
            edit((p) => {
              p.subtitleBackground = e.target.checked;
            })
          }
        />
        半透明字幕底色
      </label>
      <label className="slider-label">
        <span>字幕垂直位置</span>
        <input
          type="range"
          min=".15"
          max=".95"
          step=".01"
          value={p.subtitleY}
          onChange={(e) =>
            edit((p) => {
              p.subtitleY = +e.target.value;
            })
          }
        />
      </label>
    </div>
  );
}
