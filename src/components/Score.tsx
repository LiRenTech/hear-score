import { useEffect, useRef } from "react";
import abcjs from "abcjs";
import type { Note } from "../types";
import { buildAbc } from "../lib/notes";
export default function Score({
  notes,
  bpm,
  page,
}: {
  notes: Note[];
  bpm: number;
  page: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    abcjs.renderAbc(ref.current, buildAbc(notes, bpm, page * 8), {
      responsive: "resize",
      staffwidth: 900,
      paddingtop: 28,
      paddingbottom: 28,
      add_classes: true,
      foregroundColor: "#3f3b50",
    });
  }, [notes, bpm, page]);
  return (
    <div className="score-paper">
      <div className="score-title">
        <span>旋律草稿</span>
        <small>4/4 · C 调记谱 · ♩ = {bpm}</small>
      </div>
      <div ref={ref} aria-label="量化后的单声部五线谱" />
      <p>
        按八分音符量化，选取较强音作为旋律；拍号、速度与声部分配需要人工校对。
      </p>
    </div>
  );
}
