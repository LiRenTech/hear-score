export const SETTINGS_KEY = "hearscore-interaction-settings";
export const WHEEL_ACTIONS = {
  "zoom-horizontal": "横向缩放（时间）",
  "zoom-vertical": "纵向缩放（音高行）",
  "scroll-horizontal": "横向滚动",
  "scroll-vertical": "纵向滚动",
  none: "不执行操作",
} as const;
export type WheelAction = keyof typeof WHEEL_ACTIONS;
export interface InteractionSettings {
  altWheel: WheelAction;
  shiftWheel: WheelAction;
  commandWheel: WheelAction;
  middleDrag: boolean;
}
export const DEFAULT_SETTINGS: InteractionSettings = {
  altWheel: "zoom-vertical", shiftWheel: "scroll-horizontal",
  commandWheel: "zoom-horizontal", middleDrag: true,
};
export function parseSettings(raw: string | null): InteractionSettings {
  let value: Partial<InteractionSettings> = {};
  try { value = JSON.parse(raw || "{}") || {}; } catch { /* Use defaults. */ }
  const action = (key: "altWheel" | "shiftWheel" | "commandWheel") =>
    typeof value[key] === "string" && Object.hasOwn(WHEEL_ACTIONS, value[key]!)
      ? value[key]! : DEFAULT_SETTINGS[key];
  return {
    altWheel: action("altWheel"), shiftWheel: action("shiftWheel"), commandWheel: action("commandWheel"),
    middleDrag: typeof value.middleDrag === "boolean" ? value.middleDrag : DEFAULT_SETTINGS.middleDrag,
  };
}
export function readSettings(): InteractionSettings {
  try { return parseSettings(localStorage.getItem(SETTINGS_KEY)); } catch { return { ...DEFAULT_SETTINGS }; }
}
export function wheelAction(settings: InteractionSettings, event: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): WheelAction | null {
  if (event.altKey) return settings.altWheel;
  if (event.ctrlKey || event.metaKey) return settings.commandWheel;
  if (event.shiftKey) return settings.shiftWheel;
  return null;
}
