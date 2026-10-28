import { lazy, Suspense, useEffect, useState } from "react";
import { log } from "../../public/ui/log.js";
import { SessionScreen } from "./screens/SessionScreen.jsx";
import { RestOverlay } from "./workout/RestOverlay.jsx";
import { WorkoutPanel } from "./workout/WorkoutPanel.jsx";

// Loaded only when the server has a YOLO address: without it the camera code is never fetched.
const CameraPanel = lazy(() => import("./camera/CameraPanel.jsx"));

const TEXTS = {
  idle: "Gym Coach — porozmawiajmy o Twoim treningu.",
  voiceHint: "Opowiedz o swoim celu. Głosem: „zróbmy przerwę”, „kończymy”.",
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

export function App() {
  const config = useAppConfig();
  // receivedAt: the rest left is counted from the moment the state arrived.
  const [workout, setWorkout] = useState({ workout: null, receivedAt: 0 });
  const onEvent = (data) => {
    if (data.stage === "workout") setWorkout({ workout: data.workout, receivedAt: Date.now() });
    if (data.stage === "injury_saved") {
      log(data.saved === "known" ? `Kontuzja: ${data.name} — już zapisana wcześniej, bez duplikatu.`
        : data.saved === true ? `Kontuzja: ${data.name} (${data.severity || "bez oceny"}) — zapisana w Supabase.`
        : data.saved === false ? `Kontuzja: ${data.name} — NIE zapisana w Supabase, przyczyna w terminalu serwera.`
          : `Kontuzja: ${data.name} — Supabase wyłączony na serwerze (brak SUPABASE_URL / SUPABASE_SECRET_KEY), bez zapisu.`);
    }
  };
  return (
    <SessionScreen texts={TEXTS} onEvent={onEvent} overlay={<RestOverlay workout={workout.workout} receivedAt={workout.receivedAt} />}>
      {(session) => (
        <>
          <WorkoutPanel workout={workout.workout} receivedAt={workout.receivedAt} />
          {config?.camera && (
            <Suspense fallback={null}>
              <CameraPanel config={config.camera} session={session} />
            </Suspense>
          )}
        </>
      )}
    </SessionScreen>
  );
}
