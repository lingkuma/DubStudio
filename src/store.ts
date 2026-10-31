import { create } from "zustand";
import { blankProject, duration, type Project, type Settings } from "./model";
import { initializeSettings, persistSettings } from "./settings";
import { normalizeConcurrency } from "./generationPool";
function savedConcurrency() {
  try {
    const saved = localStorage.getItem("dubstudio:concurrency");
    return saved === null ? 10 : normalizeConcurrency(Number(saved));
  } catch {
    return 10;
  }
}
// Editing while cloud jobs run must not make undo resurrect a frozen task or
// discard audio that finished after the edit's history snapshot was captured.
function restoreHistory(snapshot: Project, current: Project) {
  const restored = structuredClone(snapshot);
  for (const row of restored.segments) {
    const latest = current.segments.find((s) => s.id === row.id);
    if (!latest) continue;
    if (
      latest.takes.length > row.takes.length ||
      ["queued", "generating"].includes(row.status)
    ) {
      Object.assign(row, {
        takes: structuredClone(latest.takes),
        takeId: latest.takeId,
        status: latest.status,
        error: latest.error,
        taskId: latest.taskId,
        jobText: latest.jobText,
        jobVoiceId: latest.jobVoiceId,
        jobReferenceKey: latest.jobReferenceKey,
      });
    }
  }
  const needed = new Set(
    restored.segments.flatMap((s) => s.takes.map((t) => t.assetId)),
  );
  for (const asset of current.assets) {
    if (needed.has(asset.id) && !restored.assets.some((a) => a.id === asset.id))
      restored.assets.push(asset);
  }
  return restored;
}
type State = {
  project: Project;
  settings: Settings;
  settingsError: string;
  selected: string | null;
  time: number;
  playing: boolean;
  auditioning: string | null;
  past: Project[];
  future: Project[];
  notice: string;
  busy: string;
  progress: number;
  generationActive: number;
  generationQueued: number;
  generationConcurrency: number;
  setGenerationConcurrency: (value: number) => void;
  dirty: number;
  set: (s: Partial<State>) => void;
  edit: (fn: (p: Project) => void, history?: boolean) => void;
  undo: () => void;
  redo: () => void;
  load: (p: Project) => void;
  saveSettings: (s: Settings) => void;
};
const initialSettings = initializeSettings();
export const useStudio = create<State>((set, get) => ({
  project: blankProject(),
  settings: initialSettings.settings,
  settingsError: initialSettings.settingsError,
  selected: null,
  time: 0,
  playing: false,
  auditioning: null,
  past: [],
  future: [],
  notice: initialSettings.notice,
  busy: "",
  progress: 0,
  generationActive: 0,
  generationQueued: 0,
  generationConcurrency: savedConcurrency(),
  setGenerationConcurrency(value) {
    const count = normalizeConcurrency(value);
    try {
      localStorage.setItem("dubstudio:concurrency", String(count));
    } catch {
      /* Session-only preference. */
    }
    set({ generationConcurrency: count });
  },
  dirty: 0,
  set,
  edit(fn, history = true) {
    const st = get(),
      p = structuredClone(st.project);
    fn(p);
    p.updated = Date.now();
    set({
      project: p,
      past: history ? [...st.past.slice(-39), st.project] : st.past,
      future: history ? [] : st.future,
      dirty: st.dirty + 1,
      time: Math.min(st.time, duration(p)),
      playing: false,
    });
  },
  undo() {
    const s = get();
    if (s.generationActive || s.generationQueued) return;
    if (!s.past.length) return;
    set({
      project: restoreHistory(s.past.at(-1)!, s.project),
      past: s.past.slice(0, -1),
      future: [s.project, ...s.future],
      playing: false,
      dirty: s.dirty + 1,
    });
  },
  redo() {
    const s = get();
    if (s.generationActive || s.generationQueued) return;
    if (!s.future.length) return;
    set({
      project: restoreHistory(s.future[0], s.project),
      future: s.future.slice(1),
      past: [...s.past, s.project],
      playing: false,
      dirty: s.dirty + 1,
    });
  },
  load(p) {
    p.messages ??= [];
    set({
      project: p,
      selected: null,
      time: 0,
      playing: false,
      past: [],
      future: [],
      dirty: 0,
    });
  },
  saveSettings(s) {
    set({ settings: s, settingsError: persistSettings(s) });
  },
}));
