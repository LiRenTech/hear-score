export type ThemePreference = "light" | "dark" | "system";
export const THEME_KEY = "hearscore-theme";
export function readTheme(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === "light" || value === "dark") return value;
  } catch { /* Storage can be unavailable in private or restricted contexts. */ }
  return "system";
}
export function applyTheme(preference: ThemePreference) {
  const dark = preference === "dark" ||
    (preference === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#14131b" : "#f7f7fb");
}
