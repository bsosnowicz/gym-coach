import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { log } from "../../public/ui/log.js";
import { SessionScreen } from "./screens/SessionScreen.jsx";
import { RestOverlay } from "./workout/RestOverlay.jsx";
import { WeekCalendar } from "./workout/WeekCalendar.jsx";
import { WorkoutPanel } from "./workout/WorkoutPanel.jsx";
import { CAMERA_TEST_TEXTS } from "./camera/texts.js";
import { CameraTestStart } from "./camera/CameraTestStart.jsx";

// The mascot's joy after a finished set or workout (voice mode): one hop and a wave.
const CHEER_MS = 2000;

// Loaded only when the server has a YOLO address: without it the camera code is never fetched.
const CameraPanel = lazy(() => import("./camera/CameraPanel.jsx"));
const CameraTest = lazy(() => import("./camera/CameraTest.jsx"));
const CAMERA_TEST_HASH = "#test-kamery";

const TEXTS = {
  idle: "Gym Coach — porozmawiajmy o Twoim treningu.",
  voiceHint: "Bez planu tygodnia trener zaczyna od wywiadu, z planem — od dzisiejszego treningu. Głosem: „zróbmy przerwę”, „kończymy”.",
  finished: "Rozmowa z Gym Coachem zakończona. Naciśnij Start, żeby zacząć od nowa.",
  breakTitle: "Przerwa w treningu",
};

function useAppConfig() {
  const [config, setConfig] = useState(null);
  useEffect(() => {
    fetch("/api/config")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setConfig)
      .catch((error) => log(`Konfiguracja niedostępna (${error.message}) — bez kamery.`));
  }, []);
  return config;
}

function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash;
}

// The weekly plan before a session starts; during one the "week_plan" stage replaces it.
function useWeekPlan() {
  const [plan, setPlan] = useState({ week: null, saving: null });
  useEffect(() => {
    fetch("/api/plan")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => setPlan({ week: data.week, saving: data.saving }))
      .catch((error) => log(`Plan tygodnia niedostępny (${error.message}).`));
  }, []);
  return [plan, setPlan];
}

export function App() {
  const config = useAppConfig();
  const hash = useHash();
  const [plan, setPlan] = useWeekPlan();
  // receivedAt: the rest left is counted from the moment the state arrived.
  const [workout, setWorkout] = useState({ workout: null, receivedAt: 0 });
  const [cheer, setCheer] = useState(false);
  // The kind of the session (training, interview, camera_test), from its "week_plan" event.
  const [mode, setMode] = useState(null);
  const cheerTimer = useRef(null);
  // The last progress seen, read in the event handler: two events may come before a render.
  const lastProgress = useRef(null);
  useEffect(() => () => clearTimeout(cheerTimer.current), []);
  const onEvent = (data) => {
    if (data.stage === "workout") {
      const before = lastProgress.current;
      const after = data.workout?.progress || null;
      lastProgress.current = after;
      if (before && after && (after.completed > before.completed || (after.phase === "done" && before.phase !== "done"))) {
        setCheer(true);
        clearTimeout(cheerTimer.current);
        cheerTimer.current = setTimeout(() => setCheer(false), CHEER_MS);
      }
      setWorkout({ workout: data.workout, receivedAt: Date.now() });
    }
    if (data.stage === "week_plan") {
      setMode(data.mode);
      // A camera test has no plan: the calendar keeps the user's week.
      if (data.mode === "camera_test") return;
      setPlan((old) => ({ ...old, week: data.week }));
      if (data.week) log(`Plan tygodnia: ${data.week.split}, wariant ${data.week.variant || "A"}${data.mode === "interview" ? " (wywiad)" : ""}.`);
    }
    if (data.stage === "injury_saved") {
      log(data.saved === "known" ? `Kontuzja: ${data.name} — już zapisana wcześniej, bez duplikatu.`
        : data.saved === true ? `Kontuzja: ${data.name} (${data.severity || "bez oceny"}) — zapisana w Supabase.`
        : data.saved === false ? `Kontuzja: ${data.name} — NIE zapisana w Supabase, przyczyna w terminalu serwera.`
          : `Kontuzja: ${data.name} — Supabase wyłączony na serwerze (brak SUPABASE_URL / SUPABASE_SECRET_KEY), bez zapisu.`);
    }
  };
  if (hash === CAMERA_TEST_HASH) {
    if (!config?.camera) return <main className="app"><p className="hint">{config ? CAMERA_TEST_TEXTS.noCamera : CAMERA_TEST_TEXTS.loading}</p></main>;
    return <Suspense fallback={null}><CameraTest config={config.camera} /></Suspense>;
  }
  return (
    <SessionScreen texts={TEXTS} onEvent={onEvent} cheer={cheer} overlay={<RestOverlay workout={workout.workout} receivedAt={workout.receivedAt} />}>
      {(session, { start }) => (
        <>
          <WorkoutPanel workout={workout.workout} receivedAt={workout.receivedAt} />
          <WeekCalendar week={plan.week} saving={plan.saving} busy={session.phase !== "idle"} onNewPlan={() => start({ mode: "interview" })} />
          {config?.camera && (
            <Suspense fallback={null}>
              <CameraPanel config={config.camera} session={session} workout={workout.workout} showAngles={session.running && mode === "camera_test"} />
            </Suspense>
          )}
          {/* Not during a session: leaving this page would unmount the avatar's video. */}
          {config?.camera && session.phase === "idle" && <a className="hint" href={CAMERA_TEST_HASH}>{CAMERA_TEST_TEXTS.link}</a>}
          {config?.camera?.scenarios && (
            <CameraTestStart scenarios={config.camera.scenarios} start={start} busy={session.phase !== "idle"} />
          )}
        </>
      )}
    </SessionScreen>
  );
}
