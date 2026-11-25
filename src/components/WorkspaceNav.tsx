import { Drum, Mic, Piano } from "lucide-react";
export default function WorkspaceNav({ mode = "melody" }: { mode?: "melody" | "drums" | "humming" }) {
  return <nav className="workspace-nav" aria-label="扒谱模式">
    <a href="#/" aria-current={mode === "melody" ? "page" : undefined}><Piano size={16} /><span>旋律扒谱</span></a>
    <a href="#/drums" aria-current={mode === "drums" ? "page" : undefined}><Drum size={16} /><span>架子鼓</span></a>
    <a href="#/humming" aria-current={mode === "humming" ? "page" : undefined}><Mic size={16} /><span>哼唱出谱</span></a>
  </nav>;
}
