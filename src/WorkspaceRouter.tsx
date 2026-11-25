import { lazy, Suspense, useEffect, useState } from "react";
import App from "./App";
const DrumPage = lazy(() => import("./DrumPage"));
const HummingPage = lazy(() => import("./HummingPage"));
export default function WorkspaceRouter() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  if (route === "#/humming") return <Suspense fallback={<p className="route-loading">正在打开哼唱工作台…</p>}><HummingPage /></Suspense>;
  return route === "#/drums" ? <Suspense fallback={<p className="route-loading">正在打开扒鼓工作台…</p>}><DrumPage /></Suspense> : <App />;
}
