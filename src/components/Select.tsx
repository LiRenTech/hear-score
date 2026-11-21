import { useId, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

interface Props<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** A themed select-only combobox. Popover keeps menus above dialogs and scrollers. */
export default function Select<T extends string>({ label, value, options, onChange }: Props<T>) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = Math.max(0, options.findIndex((option) => option.value === value));
  const [active, setActive] = useState(selected);
  const close = () => menu.current?.hidePopover();
  const show = () => { setActive(selected); menu.current?.showPopover(); };
  const choose = (index: number) => {
    onChange(options[index].value);
    close();
    trigger.current?.focus({ preventScroll: true });
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = trigger.current;
      const popup = menu.current;
      if (!button || !popup) return;
      const rect = button.getBoundingClientRect();
      const width = Math.min(Math.max(190, rect.width), window.innerWidth - 16);
      const below = window.innerHeight - rect.bottom - 12;
      const above = rect.top - 12;
      const upwards = below < Math.min(240, options.length * 38 + 8) && above > below;
      const height = Math.min(280, Math.max(0, upwards ? above : below));
      popup.style.width = `${width}px`;
      popup.style.maxHeight = `${height}px`;
      popup.style.left = `${Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))}px`;
      popup.style.top = upwards ? "auto" : `${rect.bottom + 4}px`;
      popup.style.bottom = upwards ? `${window.innerHeight - rect.top + 4}px` : "auto";
    };
    const scroll = (event: Event) => { if (event.target !== menu.current) place(); };
    const dialog = trigger.current?.closest("dialog");
    const hide = () => menu.current?.hidePopover();
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", scroll, true);
    dialog?.addEventListener("close", hide);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", scroll, true);
      dialog?.removeEventListener("close", hide);
    };
  }, [open, options.length]);
  useLayoutEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, id]);

  return (
    <div className="custom-select">
      <button ref={trigger} type="button" className="select-trigger" role="combobox"
        aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={id}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        onClick={() => open ? close() : show()}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !open) return;
          if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " ", "Escape"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
          }
          if (event.key === "Escape" || event.key === "Tab") { close(); return; }
          if (event.key === "Enter" || event.key === " ") {
            if (open) choose(active); else show();
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            if (!open) show();
            else setActive((index) => Math.max(0, Math.min(options.length - 1, index + (event.key === "ArrowDown" ? 1 : -1))));
          } else if (event.key === "Home" || event.key === "End") {
            if (!open) show();
            setActive(event.key === "Home" ? 0 : options.length - 1);
          }
        }}>
        <span>{options[selected]?.label}</span><ChevronDown size={13} aria-hidden="true" />
      </button>
      <div ref={menu} id={id} popover="auto" role="listbox" aria-label={label}
        className="select-menu" onToggle={() => setOpen(menu.current?.matches(":popover-open") ?? false)}>
        {options.map((option, index) => (
          <div key={option.value} id={`${id}-${index}`} role="option" aria-selected={value === option.value}
            className={`select-option ${index === active ? "is-active" : ""}`}
            onPointerMove={() => setActive(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}>
            <span>{option.label}</span>
            {value === option.value && <Check size={14} aria-hidden="true" />}
          </div>
        ))}
      </div>
    </div>
  );
}
