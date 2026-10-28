// Checks the Supabase settings from .env end to end:
//   npm run check:supabase
// the variables, the connection, both tables, and a test write to
// user_injuries (one row for user "__check__", deleted at once).

const { loadEnvFile } = require("../src/config");
loadEnvFile();
const { createSupabase, checkSupabaseEnv, explainSupabaseError } = require("../src/coach/supabase");

const ok = (text) => console.log(`  ✓ ${text}`);
const bad = (text) => console.log(`  ✗ ${text}`);

async function call(supabase, label, resource, options) {
  try {
    const response = await supabase.request(resource, options);
    ok(label);
    return response;
  } catch (error) {
    const [, status = "0", body = ""] = error.message.match(/HTTP (\d+) ([\s\S]*)$/) || [];
    bad(`${label}: ${error.message}`);
    console.log(`    → ${explainSupabaseError(Number(status), body || error.message)}`);
    return null;
  }
}

async function main() {
  console.log("1. Zmienne w .env");
  const { keyName, problems } = checkSupabaseEnv(process.env);
  if (keyName) ok(`klucz z ${keyName} (${process.env[keyName].slice(0, 12)}…, ${process.env[keyName].length} znaków)`);
  if (process.env.SUPABASE_URL) ok(`SUPABASE_URL = ${process.env.SUPABASE_URL}`);
  for (const problem of problems) (problem.level === "error" ? bad : (text) => console.log(`  ! ${text}`))(problem.text);
  if (problems.some((problem) => problem.level === "error")) return 1;

  const supabase = createSupabase({ url: process.env.SUPABASE_URL, serviceKey: process.env[keyName] });
  const user = process.env.GYM_COACH_USER_ID || "local";

  console.log("2. Tabele");
  const injuries = await call(supabase, "user_injuries — odczyt", `user_injuries?user_id=eq.${encodeURIComponent(user)}&select=body_part,status,severity,note,reported_at&order=reported_at.desc`);
  await call(supabase, "workout_sessions — odczyt", `workout_sessions?user_id=eq.${encodeURIComponent(user)}&select=session_id,finished,started_at&order=started_at.desc&limit=3`);
  if (injuries) {
    const rows = await injuries.json();
    console.log(`    kontuzje użytkownika „${user}”: ${rows.length ? rows.map((row) => `${row.body_part} (${row.status})`).join(", ") : "brak"}`);
  }

  console.log("3. Próbny zapis do user_injuries");
  const written = await call(supabase, "zapis (upsert)", "user_injuries?on_conflict=user_id,body_part", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ user_id: "__check__", body_part: "other", status: "active", note: "test check-supabase" }]),
  });
  if (written) await call(supabase, "usunięcie wiersza testowego", "user_injuries?user_id=eq.__check__", { method: "DELETE" });
  return written && injuries ? 0 : 1;
}

main().then((code) => {
  console.log(code ? "\nSą problemy — popraw to, co oznaczone ✗." : "\nSupabase gotowy: kontuzje i dziennik będą zapisywane.");
  process.exit(code);
});
