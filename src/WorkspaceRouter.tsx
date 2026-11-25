import { lazy, Suspense, useEffect, useState } from "react";
import App from "./App";
const DrumPage = lazy(() => import("./DrumPage"));
export default function WorkspaceRouter() {
  const [drums, setDrums] = useState(() => window.location.hash === "#/drums");
  useEffect(() => {
    const update = () => setDrums(window.location.hash === "#/drums");
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return drums ? <Suspense fallback={<p className="route-loading">正在打开扒鼓工作台…</p>}><DrumPage /></Suspense> : <App />;
}
