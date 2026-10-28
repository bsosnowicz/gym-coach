// Refreshes data/exercises.json from free-exercise-db (Unlicense, public domain):
//   node scripts/import-exercises.js [commit]
//
// Pinned to a commit, so the catalogue changes only when we bump it. Only the
// structured facts are kept (name, equipment, muscles, level, force, mechanic,
// category): the descriptions and images are left out — the coach does not
// need them, and their original source is not documented upstream.

const fs = require("fs");
const path = require("path");

const REPO = "yuhonas/free-exercise-db";
const DEFAULT_COMMIT = "f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5";
const OUT = path.join(__dirname, "..", "data", "exercises.json");
const KEPT_FIELDS = ["id", "name", "force", "level", "mechanic", "equipment", "primaryMuscles", "secondaryMuscles", "category"];

async function main(commit = DEFAULT_COMMIT) {
  const url = `https://raw.githubusercontent.com/${REPO}/${commit}/dist/exercises.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} dla ${url}`);
  const exercises = (await res.json())
    .map((exercise) => Object.fromEntries(KEPT_FIELDS.map((field) => [field, exercise[field] ?? null])))
    .sort((a, b) => a.id.localeCompare(b.id));
  const data = {
    source: `https://github.com/${REPO}`,
    commit,
    license: "Unlicense (public domain)",
    note: "Tylko fakty strukturalne; bez opisów i zdjęć. Odśwież: node scripts/import-exercises.js [commit]",
    exercises,
  };
  fs.writeFileSync(OUT, `${JSON.stringify(data, null, 1)}\n`);
  console.log(`Zapisano ${exercises.length} ćwiczeń z ${REPO}@${commit.slice(0, 7)} do ${path.relative(process.cwd(), OUT)}.`);
}

main(process.argv[2]).catch((error) => {
  console.error(error.message);
  process.exit(1);
});
