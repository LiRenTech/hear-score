import React from "react";
import ReactDOM from "react-dom/client";
import WorkspaceRouter from "./WorkspaceRouter";
import "./styles.css";
import { applyTheme, readTheme } from "./lib/theme";
applyTheme(readTheme());
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkspaceRouter />
  </React.StrictMode>,
);
