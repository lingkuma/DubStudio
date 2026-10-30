import { create } from "zustand";
import {
  blankProject,
  defaults,
  duration,
  type Project,
  type Settings,
} from "./model";
type State = {
  project: Project;
  settings: Settings;
  selected: string | null;
  time: number;
  playing: boolean;
  past: Project[];
  future: Project[];
  notice: string;
  busy: string;
  progress: number;
  dirty: number;
  set: (s: Partial<State>) => void;
  edit: (fn: (p: Project) => void, history?: boolean) => void;
  undo: () => void;
  redo: () => void;
  load: (p: Project) => void;
  saveSettings: (s: Settings) => void;
};
let saved = {};
try {
  saved = JSON.parse(
    sessionStorage.getItem("dubstudio-settings") ||
      localStorage.getItem("dubstudio-settings") ||
      "{}",
  );
} catch {}
export const useStudio = create<State>((set, get) => ({
  project: blankProject(),
  settings: { ...defaults, ...saved },
  selected: null,
  time: 0,
  playing: false,
  past: [],
  future: [],
  notice: "",
  busy: "",
  progress: 0,
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
    if (!s.past.length) return;
    set({
      project: s.past.at(-1)!,
      past: s.past.slice(0, -1),
      future: [s.project, ...s.future],
      playing: false,
      dirty: s.dirty + 1,
    });
  },
  redo() {
    const s = get();
    if (!s.future.length) return;
    set({
      project: s.future[0],
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
    sessionStorage.setItem("dubstudio-settings", JSON.stringify(s));
    if (s.remember)
      localStorage.setItem("dubstudio-settings", JSON.stringify(s));
    else localStorage.removeItem("dubstudio-settings");
    set({ settings: s });
  },
}));
