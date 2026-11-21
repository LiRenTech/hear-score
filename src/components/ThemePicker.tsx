import { useEffect, useState } from "react";
import Select from "./Select";
import { Monitor, Moon, Sun } from "lucide-react";
import { applyTheme, readTheme, THEME_KEY, type ThemePreference } from "../lib/theme";

export default function ThemePicker() {
  const [preference, setPreference] = useState<ThemePreference>(readTheme);
  useEffect(() => {
    applyTheme(preference);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyTheme(preference);
    const sync = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === null) setPreference(readTheme());
    };
    media.addEventListener("change", update);
    window.addEventListener("storage", sync);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("storage", sync);
    };
  }, [preference]);
  const Icon = preference === "system" ? Monitor : preference === "dark" ? Moon : Sun;
  return (
    <div className="theme-picker">
      <Icon size={14} aria-hidden="true" />
      <Select<ThemePreference> label="外观模式" value={preference}
        options={[{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }, { value: "system", label: "跟随系统" }]}
        onChange={(value) => {
        setPreference(value);
        applyTheme(value);
        try { localStorage.setItem(THEME_KEY, value); } catch { /* Keep the selection for this session. */ }
      }} />
    </div>
  );
}
