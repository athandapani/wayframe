"use client";

// PROTOTYPE shared plumbing — resize is not the question under test (all
// three variants answer it the same way: a document property, sized by
// dragging a corner handle, exactly like BlufCallout.tsx's existing
// drag-to-reposition). What differs per variant is the authoring surface
// for the text itself, which is why this is factored out instead of
// reimplemented three times.
import { useRef, useState } from "react";

export interface BoxSize {
  width: number;
  height: number | "auto";
}

export const DEFAULT_SIZE: BoxSize = { width: 384, height: "auto" };

export function useBoxSize(initial: BoxSize = DEFAULT_SIZE) {
  const [size, setSize] = useState<BoxSize>(initial);
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  function onHandlePointerDown(e: React.PointerEvent, currentHeightPx: number) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: size.width, startH: currentHeightPx };
  }
  function onHandlePointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setSize({ width: Math.max(220, d.startW + (e.clientX - d.startX)), height: Math.max(90, d.startH + (e.clientY - d.startY)) });
  }
  function onHandlePointerUp() {
    dragRef.current = null;
  }

  return { size, onHandlePointerDown, onHandlePointerMove, onHandlePointerUp };
}

export function ResizeHandle({
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
}) {
  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="Drag to resize"
      className="absolute right-0.5 bottom-0.5 h-3 w-3 cursor-nwse-resize opacity-40 hover:opacity-90"
    >
      <svg viewBox="0 0 10 10" className="h-full w-full">
        <path d="M9 1 L1 9 M9 5 L5 9 M9 9 L9 9" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </div>
  );
}
