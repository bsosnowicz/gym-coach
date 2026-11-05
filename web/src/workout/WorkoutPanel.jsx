// The rest's clock for the workout view: the server sends the time left in the
// "workout" event, the page counts it down on its own clock.
import { useEffect, useState } from "react";

// Ticks while a rest counts down; the server sends the time left, not a clock reading.
export function useRestLeft(progress, receivedAt) {
  const [now, setNow] = useState(() => Date.now());
  const counting = progress?.phase === "rest" && !progress.restPaused && progress.restLeftMs !== null;
  useEffect(() => {
    if (!counting) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [counting, receivedAt]);
  if (progress?.phase !== "rest" || progress.restLeftMs === null) return null;
  if (progress.restPaused) return progress.restLeftMs;
  // `now` may predate receivedAt (read before the event came): never count up.
  return Math.max(0, Math.min(progress.restLeftMs, progress.restLeftMs - (now - receivedAt)));
}

export function clock(ms) {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
