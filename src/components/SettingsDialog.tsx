import { useEffect, useRef } from "react";
import { X, RotateCcw } from "lucide-react";
import Select from "./Select";
import ThemePicker from "./ThemePicker";
import { DEFAULT_SETTINGS, WHEEL_ACTIONS, type InteractionSettings, type WheelAction } from "../lib/settings";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: InteractionSettings;
  onChange: (settings: InteractionSettings) => void;
}
const bindings = [
  ["altWheel", "Alt / Option ⌥ + 滚轮"],
  ["shiftWheel", "Shift + 滚轮"],
  ["commandWheel", "Ctrl / Command ⌘ + 滚轮"],
] as const;

export default function SettingsDialog({ open, onClose, settings, onChange }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="settings-dialog" aria-labelledby="settings-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}>
      <header className="settings-heading">
        <h2 id="settings-title">设置</h2>
        <button autoFocus aria-label="关闭设置" onClick={onClose}><X size={20} /></button>
      </header>
      <p className="settings-description">修改即时生效，自动保存在当前浏览器。</p>
      <section className="settings-group" aria-labelledby="appearance-title">
        <h3 id="appearance-title">外观</h3>
        <div className="settings-row"><span>颜色主题</span><ThemePicker /></div>
      </section>
      <section className="settings-group" aria-labelledby="interaction-title">
        <h3 id="interaction-title">卷帘操作</h3>
        {bindings.map(([key, label]) => (
          <div className="settings-row" key={key}>
            <span>{label}</span>
            <Select<WheelAction> label={label} value={settings[key]}
              onChange={(value) => onChange({ ...settings, [key]: value })}
              options={Object.entries(WHEEL_ACTIONS).map(([value, name]) => ({ value: value as WheelAction, label: name }))} />
          </div>
        ))}
        <label className="settings-row">
          <span>中键拖拽移动视野</span>
          <input type="checkbox" checked={settings.middleDrag}
            onChange={(event) => onChange({ ...settings, middleDrag: event.target.checked })} />
        </label>
        <p className="settings-description">未按修饰键时保持普通滚动。多个修饰键同时按下时，依次优先使用 Alt、Ctrl / Command、Shift。</p>
      </section>
      <footer className="settings-footer">
        <button onClick={() => onChange({ ...DEFAULT_SETTINGS })}><RotateCcw size={14} />恢复操作默认设置</button>
        <button className="settings-done" onClick={onClose}>完成</button>
      </footer>
    </dialog>
  );
}
