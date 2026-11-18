import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ClonePage from "./ClonePage";
import "./styles.css";
import { useStudio } from "./store";
if (import.meta.env.DEV) (window as any).__studio = useStudio;
const cloneRoute = (hash: string) =>
  hash.replace(/^#\/?/, "").split(/[?/]/)[0].toLowerCase() === "clone";
function Router() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const sync = () => setHash(window.location.hash);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return cloneRoute(hash) ? <ClonePage /> : <App />;
}
class Boundary extends React.Component<
  { children: React.ReactNode },
  { error: string }
> {
  state = { error: "" };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  render() {
    return this.state.error ? (
      <div style={{ padding: 40 }}>
        <h1>编辑器遇到问题</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>重新加载</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <Boundary>
    <Router />
  </Boundary>,
);
