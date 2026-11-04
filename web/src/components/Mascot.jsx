// The coach's mascot and the stage it stands on in voice mode (public/ui/mascots.js,
// public/ui/scenes.js). React renders only empty hosts: the SVGs go into them directly.
import { useEffect, useRef } from "react";
import { mountMascot, setMascotLevel } from "../../../public/ui/mascots.js";
import { mountScene } from "../../../public/ui/scenes.js";
import { MOUTH_OPEN, createMouth, smooth } from "../../../public/session/voice-level.js";

export function Mascot({ id, className, enter = true }) {
  const host = useRef(null);
  useEffect(() => { mountMascot(host.current, id, { enter }); }, [id, enter]);
  return <div ref={host} className={className} aria-hidden="true" />;
}

// state: idle | speaking | listening | thinking | happy | paused, as a class on the
// stage, which both the mascot and the backdrop follow. While the coach speaks the
// mouth takes its shape from the letters being said (getShape(): an index of
// MOUTH_OPEN, or null without them), else from the loudness (getLevel(): 0-1).
export function CoachStage({ hidden, mascotId, sceneId, state, getLevel, getShape }) {
  const stage = useRef(null);
  const sceneHost = useRef(null);

  useEffect(() => { mountScene(sceneHost.current, sceneId); }, [sceneId]);

  // A CSS variable set every frame, not React state: 60 renders a second of the lesson screen otherwise.
  useEffect(() => {
    if (state !== "speaking" || !getLevel) return;
    const element = stage.current;
    const mouth = createMouth();
    let level = 0;
    let shape = -1;
    let frame = requestAnimationFrame(function tick(now) {
      level = smooth(level, getLevel());
      const said = getShape?.() ?? null;
      const next = said === null ? mouth.update(now, level) : mouth.show(now, said);
      if (next !== shape) setMascotLevel(element, MOUTH_OPEN[(shape = next)]);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      setMascotLevel(element, 0);
    };
  }, [state, getLevel, getShape]);

  return (
    <div ref={stage} className={`voice-stage lesson-stage is-${state}`} hidden={hidden} aria-hidden="true">
      {/* mountScene puts the backdrop layers here; they are positioned against the stage. */}
      <div ref={sceneHost} />
      <Mascot className="lesson-mascot" id={mascotId} />
    </div>
  );
}
