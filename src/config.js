const fs = require("fs");
const path = require("path");

// Must run before any module reads process.env. Variables already present in
// the environment win over the file.
function loadEnvFile(filename = process.env.ENV_FILE || path.join(__dirname, "..", ".env")) {
  if (!fs.existsSync(filename)) return;
  for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function requireEnv(name) {
  if (!process.env[name]) {
    const error = new Error(`Brak ${name}. Uzupełnij tę zmienną w pliku .env.`);
    error.statusCode = 503;
    error.expose = true;
    throw error;
  }
  return process.env[name];
}

function envNumber(name, fallback) {
  return Number(process.env[name]) || fallback;
}

module.exports = { loadEnvFile, requireEnv, envNumber };
