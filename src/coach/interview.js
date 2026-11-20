// The interview: the first kind of conversation. The coach gets to know the
// user (goal, level, training days, time, equipment, age, height, weight,
// sex, priority muscles, injuries) and the code builds a plan for the whole
// week from it (src/coach/week-plan.js). As in the one-day flow, the model
// only reports the answers with a marker; the summary, the question "Układam
// plan?" and the plan itself come from code.

const { GOALS, EQUIPMENT_PRESETS, focusOf } = require("./planner");
const { WEEKDAYS, WEEKDAY_NAMES, INTENSITIES } = require("./programming");

const LEVELS = ["beginner", "intermediate", "expert"];
const SEXES = ["male", "female", "other"];

const INTERVIEW_PROMPT = `Jesteś Gym Coachem, trenerem siłowym w aplikacji głosowej z awatarem.
Rozmawiasz po polsku, naturalnie i konkretnie. Odpowiadasz krótko: jedno lub dwa zdania,
bez list, nagłówków, emotikonów i markdownu. Zadajesz najwyżej jedno pytanie naraz.
To jest wywiad przed ułożeniem planu treningowego na cały tydzień. Dowiedz się po kolei:
cel treningu; doświadczenie (od kiedy trenuje, jak regularnie); ile dni w tygodniu chce trenować
i w które dni; ile minut ma na jeden trening; jaki ma sprzęt; wiek; wzrost; wagę; płeć;
czy chce szczególnie popracować nad którąś partią mięśni; czy ma kontuzje albo coś go boli.
Wykorzystuj informacje już podane w historii, zamiast pytać ponownie. Niczego nie zgaduj.
Sprzęt wpisuj tylko z tego, co użytkownik powiedział: „siłownia”, „siłka” to gym; gdy nie padło,
gdzie trenuje, zapytaj. Wiek, wzrost, waga i płeć nie są obowiązkowe: gdy użytkownik nie chce ich podać, nie naciskaj.
Gdy znasz cel, doświadczenie, liczbę dni, czas i sprzęt, a o resztę już zapytałeś, odpowiedz
jednym krótkim zdaniem i dopisz na końcu dokładnie jeden znacznik (aplikacja przeczyta podsumowanie
i zapyta, czy układać plan; gdy użytkownik je poprawia, dopisz znacznik jeszcze raz z poprawkami):
[PROFILE goal=<cel> level=<poziom> equipment=<sprzęt> days=<liczba dni> minutes=<minuty>
weekdays=<dni> age=<lata> sex=<płeć> height=<cm> weight=<kg> priorities=<partie>]
gdzie cel to strength (siła), muscle (masa mięśniowa), endurance (kondycja) albo general (ogólna
sprawność); poziom to beginner (mniej niż pół roku regularnych treningów), intermediate (od pół
roku do 2–3 lat) albo expert (dłużej, regularnie); sprzęt to gym (siłownia), home_dumbbells (dom
z hantlami lub kettlebell) albo bodyweight (bez sprzętu); dni tygodnia po przecinku z listy
mon, tue, wed, thu, fri, sat, sun; płeć male, female albo other; partie po przecinku z listy:
legs (nogi), back (plecy), chest (klatka), shoulders (barki), arms (ramiona), core (brzuch),
glutes (pośladki). Pola weekdays, age, sex, height, weight i priorities pomiń, gdy ich nie podał.
Gdy użytkownik wyraźnie chce lżej albo ciężej, dopisz intensity=light albo intensity=heavy.
Planu nie wymyślaj ani nie wymieniaj ćwiczeń: plan ułoży i przeczyta aplikacja.`;

// Known answers from an earlier interview: the coach confirms instead of asking again.
function knownProfileContext(profile) {
  const fields = [
    profile.goal && `goal=${profile.goal}`, profile.level && `level=${profile.level}`,
    profile.equipment && `equipment=${profile.equipment}`, profile.daysPerWeek && `days=${profile.daysPerWeek}`,
    profile.minutes && `minutes=${profile.minutes}`, profile.weekdays?.length && `weekdays=${profile.weekdays.join(",")}`,
    profile.age && `age=${profile.age}`, profile.sex && `sex=${profile.sex}`,
    profile.heightCm && `height=${profile.heightCm}`, profile.weightKg && `weight=${profile.weightKg}`,
    profile.priorities?.length && `priorities=${profile.priorities.join(",")}`,
  ].filter(Boolean);
  return `Profil z poprzedniego wywiadu: ${fields.join(" ")}. Użytkownik chce nowego planu: zapytaj krótko, `
    + "co się zmieniło (cel, dni, czas, sprzęt, waga), zamiast pytać o wszystko od nowa.";
}

const number = (value, min, max) => {
  const n = Number(String(value || "").replace(",", "."));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const list = (value, allowed) => [...new Set(String(value || "").split(",").map((item) => item.trim()).filter((item) => allowed(item)))];

// { goal, level, equipment, daysPerWeek, minutes, weekdays, age, sex, heightCm, weightKg, priorities, intensity } or null.
function parseProfileMarker(text) {
  const fields = Object.fromEntries([...text.matchAll(/(\w+)=([\w,.-]+)/g)].map(([, key, value]) => [key, value]));
  if (!GOALS.includes(fields.goal) || !LEVELS.includes(fields.level) || !EQUIPMENT_PRESETS[fields.equipment]) return null;
  const days = number(fields.days, 1, 7);
  const minutes = number(fields.minutes, 1, 600);
  if (!days || !minutes) return null;
  return {
    goal: fields.goal,
    level: fields.level,
    equipment: fields.equipment,
    daysPerWeek: Math.round(days),
    // The shortest plan has 10 minutes, as in the one-day flow.
    minutes: Math.min(180, Math.max(10, Math.round(minutes))),
    weekdays: list(fields.weekdays, (day) => WEEKDAYS.includes(day)),
    age: number(fields.age, 10, 100),
    sex: SEXES.includes(fields.sex) ? fields.sex : null,
    heightCm: number(fields.height, 100, 250),
    weightKg: number(fields.weight, 30, 300),
    priorities: list(fields.priorities, (focus) => Boolean(focusOf(focus))),
    intensity: INTENSITIES[fields.intensity] ? fields.intensity : null,
  };
}

const GOAL_NAMES = { strength: "siła", muscle: "masa mięśniowa", endurance: "kondycja", general: "ogólna sprawność" };
const LEVEL_NAMES = { beginner: "początkujący", intermediate: "średniozaawansowany", expert: "zaawansowany" };
const EQUIPMENT_NAMES = { gym: "siłownia", home_dumbbells: "dom z hantlami", bodyweight: "bez sprzętu" };
const SEX_NAMES = { male: "mężczyzna", female: "kobieta" };
const trainings = (n) => (n === 1 ? "trening" : n < 5 ? "treningi" : "treningów");
const years = (n) => (n === 1 ? "rok" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? "lata" : "lat");

// The summary read back before the weekly plan is built.
function describeInterview(profile) {
  const days = profile.weekdays.length ? ` (${profile.weekdays.map((day) => WEEKDAY_NAMES[day]).join(", ")})` : "";
  const priorities = profile.priorities.length ? `, priorytet: ${profile.priorities.map((focus) => focusOf(focus).name).join(", ")}` : "";
  const body = [
    profile.age && `${profile.age} ${years(profile.age)}`,
    profile.heightCm && `${profile.heightCm} cm`,
    profile.weightKg && `${String(profile.weightKg).replace(".", ",")} kg`,
    SEX_NAMES[profile.sex],
  ].filter(Boolean);
  const intensity = profile.intensity ? `, intensywność ${INTENSITIES[profile.intensity].name}` : "";
  return `Podsumuję: cel ${GOAL_NAMES[profile.goal]}, poziom ${LEVEL_NAMES[profile.level]}, ${EQUIPMENT_NAMES[profile.equipment]}, `
    + `${profile.daysPerWeek} ${trainings(profile.daysPerWeek)} w tygodniu${days}, po ${profile.minutes} minut${priorities}${intensity}`
    + `${body.length ? `; ${body.join(", ")}` : ""}. Układam plan na tydzień?`;
}

// Older lifters start without the heaviest loads; the rest of the body data
// is kept in the profile for later (starting weights, progress).
const CAREFUL_AGE = 60;
function weekProfile(profile) {
  const intensity = profile.intensity || (profile.age >= CAREFUL_AGE && profile.goal === "strength" ? "moderate" : null);
  return { ...profile, intensity };
}

module.exports = { INTERVIEW_PROMPT, knownProfileContext, parseProfileMarker, describeInterview, weekProfile };
