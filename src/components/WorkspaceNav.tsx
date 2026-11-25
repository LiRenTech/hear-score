import { Drum, Piano } from "lucide-react";
export default function WorkspaceNav({ drums = false }: { drums?: boolean }) {
  return <nav className="workspace-nav" aria-label="扒谱模式">
    <a href="#/" aria-current={drums ? undefined : "page"}><Piano size={16} /><span>旋律扒谱</span></a>
    <a href="#/drums" aria-current={drums ? "page" : undefined}><Drum size={16} /><span>架子鼓</span></a>
  </nav>;
}
