// The mascot's mouth while the coach speaks (voice mode): one of four shapes,
// set as --level on the scene element every frame. A CSS variable, not React
// state: 60 renders a second of the session screen otherwise.
import { useEffect } from "react";
import { createMouth, smooth } from "../../../public/session/voice-level.js";

// The design's four mouth shapes (closed, slightly, half, wide), by shape index.
export const MOUTH_LEVELS = [0, 0.33, 0.66, 1];

// getShape(): the shape for the letters being said, or null without them;
// getLevel(): the loudness 0-1, which picks the shape when there are no letters.
export function useMouth(sceneRef, speaking, getLevel, getShape) {
  useEffect(() => {
    const element = sceneRef.current;
    if (!speaking || !element || !getLevel) return undefined;
    const mouth = createMouth();
    let level = 0;
    let shape = -1;
    let frame = requestAnimationFrame(function tick(now) {
      level = smooth(level, getLevel());
      const said = getShape?.() ?? null;
      const next = said === null ? mouth.update(now, level) : mouth.show(now, said);
      if (next !== shape) element.style.setProperty("--level", String(MOUTH_LEVELS[(shape = next)]));
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      element.style.setProperty("--level", "0");
    };
  }, [sceneRef, speaking, getLevel, getShape]);
}
