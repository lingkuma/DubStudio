import { useStudio } from "./store";
import type { Project } from "./model";
import { subtitleStyle } from "./subtitleStyle";
import NumberField from "./NumberField";

const colors = [
  ["黑色", "#000000"],
  ["白色", "#ffffff"],
  ["深蓝", "#183153"],
  ["蓝色", "#2563eb"],
  ["红色", "#b91c1c"],
  ["黄色", "#facc15"],
  ["绿色", "#166534"],
  ["紫色", "#7e22ce"],
];
export default function SubtitleInspector() {
  const { project: p, selected, edit } = useStudio();
  const style = subtitleStyle(p),
    s = p.segments.find((s) => s.id === selected);
  const patch = (value: Partial<Project>) =>
    edit((p) => {
      Object.assign(p, value);
    });
  return (
    <div className="inspector subtitle-inspector">
      <h3>字幕属性</h3>
      <p className="help">样式应用到全部字幕，预览与导出保持一致。</p>
      <label className="check">
        <input
          type="checkbox"
          checked={p.subtitles}
          onChange={(e) => patch({ subtitles: e.target.checked })}
        />
        显示字幕
      </label>
      {s && (
        <details className="sentence-subtitle-details">
          <summary>当前句字幕</summary>
          <label className="check">
            <input
              type="checkbox"
              checked={s.syncText}
              onChange={(e) =>
                edit((p) => {
                  const row = p.segments.find((v) => v.id === s.id)!;
                  row.syncText = e.target.checked;
                  if (row.syncText) row.subtitle = row.text;
                })
              }
            />
            与配音文本同步
          </label>
          <label>
            字幕文本
            <textarea
              rows={3}
              value={s.subtitle}
              onChange={(e) =>
                edit((p) => {
                  const row = p.segments.find((v) => v.id === s.id)!;
                  row.subtitle = e.target.value;
                  row.syncText = false;
                })
              }
            />
          </label>
          <label>
            字幕偏移（秒）
            <input
              type="number"
              step=".05"
              value={s.subtitleOffset}
              onChange={(e) =>
                edit((p) => {
                  p.segments.find((v) => v.id === s.id)!.subtitleOffset =
                    +e.target.value;
                })
              }
            />
          </label>
        </details>
      )}
      <h3>文字</h3>
      <label>
        字号（画布像素）
        <NumberField
          aria-label="字幕字号"
          min={12}
          max={300}
          value={p.subtitleSize}
          onValueChange={(subtitleSize) => patch({ subtitleSize })}
        />
      </label>
      <label>
        字体
        <select
          value={style.font}
          onChange={(e) => patch({ subtitleFont: e.target.value })}
        >
          <option value="system-ui, sans-serif">系统黑体</option>
          <option value="'Microsoft YaHei', sans-serif">微软雅黑</option>
          <option value="SimSun, serif">宋体</option>
          <option value="KaiTi, serif">楷体</option>
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={style.bold}
          onChange={(e) => patch({ subtitleBold: e.target.checked })}
        />
        加粗
      </label>
      <label>
        文字颜色
        <input
          type="color"
          value={p.subtitleColor}
          onChange={(e) => patch({ subtitleColor: e.target.value })}
        />
      </label>
      <hr />
      <h3>背景</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={p.subtitleBackground}
          onChange={(e) => patch({ subtitleBackground: e.target.checked })}
        />
        启用字幕背景
      </label>
      <fieldset
        className="subtitle-background-controls"
        disabled={!p.subtitleBackground}
      >
        <div
          className="color-presets"
          role="group"
          aria-label="字幕背景预设颜色"
        >
          {colors.map(([name, color]) => (
            <button
              key={color}
              type="button"
              aria-label={name + "字幕背景"}
              title={name}
              aria-pressed={style.background === color}
              style={{ backgroundColor: color }}
              onClick={() => patch({ subtitleBackgroundColor: color })}
            />
          ))}
        </div>
        <label>
          自定义背景色
          <input
            type="color"
            value={style.background}
            onChange={(e) => patch({ subtitleBackgroundColor: e.target.value })}
          />
        </label>
        <label className="slider-label">
          <span>
            背景不透明度<b>{Math.round(style.opacity * 100)}%</b>
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step=".01"
            value={style.opacity}
            onChange={(e) =>
              patch({ subtitleBackgroundOpacity: +e.target.value })
            }
          />
        </label>
      </fieldset>
      <hr />
      <h3>描边与位置</h3>
      <label>
        描边宽度（画布像素）
        <NumberField
          min={0}
          max={20}
          step=".5"
          value={style.outlineWidth}
          onValueChange={(subtitleOutlineWidth) =>
            patch({ subtitleOutlineWidth })
          }
        />
      </label>
      <label>
        描边颜色
        <input
          type="color"
          value={style.outlineColor}
          onChange={(e) => patch({ subtitleOutlineColor: e.target.value })}
        />
      </label>
      <label className="slider-label">
        <span>
          字幕垂直位置<b>{Math.round(p.subtitleY * 100)}%</b>
        </span>
        <input
          type="range"
          min=".15"
          max=".95"
          step=".01"
          value={p.subtitleY}
          onChange={(e) => patch({ subtitleY: +e.target.value })}
        />
      </label>
    </div>
  );
}
