import { type Project, type Segment } from "./model";

export default function VoiceSourceSelect({
  project,
  segment,
  disabled,
  onChange,
}: {
  project: Project;
  segment: Segment;
  disabled?: boolean;
  onChange: (voiceId: string) => void;
}) {
  return (
    <label className="voice-source-select">
      克隆参考音源
      <select
        aria-label="克隆参考音源"
        value={segment.voiceId || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">原句原声（默认）</option>
        {segment.voiceId &&
          !project.voices.some((v) => v.id === segment.voiceId) && (
            <option value={segment.voiceId} disabled>
              音色已不存在，请重新选择
            </option>
          )}
        {project.voices.map((v) => (
          <option value={v.id} key={v.id}>
            自定义 · {v.name}
          </option>
        ))}
      </select>
    </label>
  );
}
