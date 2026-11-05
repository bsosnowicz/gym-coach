// Gym Coach: three tabs (Start, Trening, Historia) around one session. The tabs
// are hidden, not unmounted: the session and its avatar video live through them all.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { log } from "../../public/ui/log.js";
import { HistoryScreen } from "./screens/HistoryScreen.jsx";
import { SessionScreen } from "./screens/SessionScreen.jsx";
import { StartScreen } from "./screens/StartScreen.jsx";
import { useSession } from "./session/useSession.js";
import { Button, CoachPicker, Dialog, NavBar } from "./ui/index.js";
import { workoutPhase } from "./workout/plan-view.js";
import { WorkoutView } from "./workout/WorkoutView.jsx";

// Loaded only when the server has a YOLO address: without it the camera code is never fetched.
const CameraPanel = lazy(() => import("./camera/CameraPanel.jsx"));

// The coach's joy after a finished set or workout: hops and sparks.
const CHEER_MS = 2000;

// Overrides of session/texts.js: the coach is a mascot or an avatar, so "trener" in both.
const TEXTS = {
  idle: "Naciśnij „Zaczynamy” na Starcie, żeby zacząć rozmowę.",
  connecting: "Łączę z trenerem…",
  reconnecting: "Krótka przerwa — odnawiam połączenie z trenerem…",
  greeting: "Trener się wita…",
  speaking: "Trener mówi…",
  farewell: "Trener się żegna…",
  finished: "Trening zakończony. Na Starcie zaczniesz nowy.",
  disconnected: "Połączenie z trenerem zostało przerwane.",
  voiceHint: "Opowiedz o swoim celu. Głosem: „zróbmy przerwę”, „kończymy”.",
  breakTitle: "Przerwa",
  breakHint: "Wszystko wstrzymane, odliczanie też. Powiedz „wracamy” albo naciśnij przycisk.",
  endTitle: "Zakończyć trening?",
  endFinish: "Tak, kończę",
  endHint: "Możesz też powiedzieć: „tak, kończę” albo „nie, wracamy”.",
  audioUnlock: "Nie słychać trenera? Kliknij, żeby włączyć dźwięk",
  micPermissionText: "Przeglądarka pyta o dostęp do mikrofonu — zezwól w okienku (na komputerze: przy pasku adresu). Bez tego trener Cię nie usłyszy.",
  micAudioText: "Przeglądarka wstrzymała dźwięk do pierwszego kliknięcia. Kliknij przycisk, a trener zacznie Cię słyszeć.",
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

// The chosen mascot and scene, kept in this browser.
function useStored(key, fallback) {
  const [value, setValue] = useState(() => {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  });
  const store = (next) => {
    setValue(next);
    try { localStorage.setItem(key, next); } catch {}
  };
  return [value, store];
}

export function App() {
  const config = useAppConfig();
  const [tab, setTab] = useState("start");
  const [picker, setPicker] = useState(false);
  const [mascot, setMascot] = useStored("gc.mascot", "trener");
  const [scene, setScene] = useStored("gc.scene", "silownia");
  // receivedAt: the rest left is counted from the moment the state arrived.
  const [workout, setWorkout] = useState({ workout: null, receivedAt: 0 });
  const [cheer, setCheer] = useState(false);
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
    if (data.stage === "injury_saved") {
      log(data.saved === "known" ? `Kontuzja: ${data.name} — już zapisana wcześniej, bez duplikatu.`
        : data.saved === true ? `Kontuzja: ${data.name} (${data.severity || "bez oceny"}) — zapisana w Supabase.`
        : data.saved === false ? `Kontuzja: ${data.name} — NIE zapisana w Supabase, przyczyna w terminalu serwera.`
          : `Kontuzja: ${data.name} — Supabase wyłączony na serwerze (brak SUPABASE_URL / SUPABASE_SECRET_KEY), bez zapisu.`);
    }
  };

  const videoRef = useRef(null);
  const session = useSession(videoRef, { texts: TEXTS, onEvent });

  // Must stay a direct click handler: the session creates its audio player in it (iOS).
  function start() {
    setWorkout({ workout: null, receivedAt: 0 });
    lastProgress.current = null;
    setTab("session");
    session.start();
  }

  const current = workout.workout;
  const phase = workoutPhase(current);
  const progress = current?.progress;
  const totalSets = current?.plan?.exercises.reduce((sum, item) => sum + item.sets, 0);
  const doneText = progress && totalSets ? `${progress.completed} z ${totalSets}` : null;

  return (
    <div className="gc-app" data-tab={tab}>
      <NavBar active={tab} onNavigate={setTab} mascot={mascot} onCoach={() => setPicker(true)} live={session.running} />
      <main className="gc-main">
        <div hidden={tab !== "start"}>
          <StartScreen mascot={mascot} onMascot={setMascot} scene={scene} onScene={setScene}
            onStart={start} busy={session.phase !== "idle"} texts={session.texts} />
        </div>
        <div hidden={tab !== "session"}>
          <SessionScreen
            session={session}
            videoRef={videoRef}
            phase={phase}
            mascot={mascot}
            scene={scene}
            cheer={cheer}
            doneText={doneText}
            onGoStart={() => setTab("start")}
            main={current?.plan ? <WorkoutView workout={current} receivedAt={workout.receivedAt} /> : null}
            aside={config?.camera && (
              <Suspense fallback={null}>
                <CameraPanel config={config.camera} session={session} />
              </Suspense>
            )}
          />
        </div>
        <div hidden={tab !== "history"}>
          <HistoryScreen />
        </div>
      </main>

      <Dialog open={picker} title="Wybierz trenera" onCancel={() => setPicker(false)}
        actions={<Button variant="primary" size="lg" onClick={() => setPicker(false)}>Gotowe</Button>}>
        <CoachPicker value={mascot} onChange={setMascot} scene={scene} onSceneChange={setScene} />
      </Dialog>
    </div>
  );
}
