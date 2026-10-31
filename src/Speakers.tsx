import { ChevronDown, Plus, Users } from "lucide-react";
import {
  activeSegments,
  speakerContext,
  speakerRoster,
  uid,
  type Project,
  type Segment,
  type Speaker,
} from "./model";
import { useStudio } from "./store";

export function SpeakerSelect({
  project,
  segment,
  disabled,
  onChange,
  roster,
}: {
  project: Project;
  segment: Segment;
  disabled?: boolean;
  onChange: (speakerId: string | undefined) => void;
  roster?: Speaker[];
}) {
  return (
    <label className="speaker-select">
      说话人物
      <select
        aria-label="说话人物"
        value={segment.speakerId || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">未分配人物</option>
        {(roster || speakerRoster(project)).map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Speakers() {
  const {
    project: p,
    edit,
    busy,
    generationActive,
    generationQueued,
  } = useStudio();
  const roster = speakerRoster(p);
  const info = speakerContext(p);
  const rows = activeSegments(p);
  const locked = !!busy || generationActive > 0 || generationQueued > 0;
  return (
    <details className="speaker-panel">
      <summary>
        <Users size={14} />
        <span>
          人物 ·{" "}
          {info.speakerCount ? `${info.speakerCount} 位已分配` : "尚未分配"}
        </span>
        <span className="speaker-toggle">
          编辑 <ChevronDown size={13} />
        </span>
        <span className="speaker-summary">
          {info.speakers.map((v) => v.name).join("、") || "展开设置人物"}
        </span>
      </summary>
      <div className="speaker-editor">
        <p className="help">
          人物名称和每句归属会一起发送给 AI。人物与配音音色分别设置。
        </p>
        {info.unassignedLineCount > 0 && (
          <p className="help">
            {info.unassignedLineCount}{" "}
            句尚未分配人物；可重新识别，或在每句下方手动选择。
          </p>
        )}
        {roster.map((v) => (
          <div className="speaker-name-row" key={v.id}>
            <input
              key={v.name}
              aria-label={`人物名称：${v.name}`}
              defaultValue={v.name}
              maxLength={80}
              disabled={locked}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  e.currentTarget.value = v.name;
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => {
                const name = e.target.value.trim() || v.name;
                e.target.value = name;
                if (name !== v.name)
                  edit((p) => {
                    p.speakers = speakerRoster(p);
                    p.speakers.find((s) => s.id === v.id)!.name = name;
                  });
              }}
            />
            <span>{rows.filter((s) => s.speakerId === v.id).length} 句</span>
          </div>
        ))}
        <button
          className="text-button"
          disabled={!rows.length || locked}
          onClick={() =>
            edit((p) => {
              p.speakers = speakerRoster(p);
              p.speakers.push({
                id: uid(),
                name: `人物 ${p.speakers.length + 1}`,
              });
            })
          }
        >
          <Plus size={14} />
          添加人物
        </button>
      </div>
    </details>
  );
}
