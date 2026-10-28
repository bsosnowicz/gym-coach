// Session without a browser (src/engine/session-watchdog.js), from yoga-startup:
// sessions there played to an empty room for 3 h and 21 h.

const test = require("node:test");
const assert = require("node:assert/strict");

const { clientAttached, clientDetached } = require("../src/engine/session-watchdog");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("sesja bez żadnego strumienia zamyka się po czasie", async () => {
  const session = { id: "w1", sseClients: new Set() };
  const gone = [];
  clientDetached(session, (s) => gone.push(s.id), 20);
  await wait(50);
  assert.deepEqual(gone, ["w1"]);
});

test("ponowne połączenie przed czasem odwołuje zamknięcie", async () => {
  const session = { id: "w2", sseClients: new Set() };
  const gone = [];
  clientDetached(session, () => gone.push("w2"), 30);
  session.sseClients.add({});
  clientAttached(session);
  await wait(60);
  assert.deepEqual(gone, []);
});

test("zamknięcie jednego z dwóch strumieni nie rusza odliczania", async () => {
  const session = { id: "w3", sseClients: new Set([{}]) };
  const gone = [];
  clientDetached(session, () => gone.push("w3"), 10);
  await wait(40);
  assert.deepEqual(gone, []);
});

test("sesja zamknięta w międzyczasie nie jest zamykana drugi raz", async () => {
  const session = { id: "w4", sseClients: new Set() };
  const gone = [];
  clientDetached(session, () => gone.push("w4"), 20);
  session.closed = true;
  await wait(50);
  assert.deepEqual(gone, []);
});

test("błąd przy zamykaniu nie wycieka jako nieobsłużone odrzucenie", async () => {
  const session = { id: "w5", sseClients: new Set() };
  const original = console.error;
  const logged = [];
  console.error = (line) => logged.push(line);
  try {
    clientDetached(session, async () => { throw new Error("dostawca nie odpowiada"); }, 10);
    await wait(40);
  } finally {
    console.error = original;
  }
  assert.match(logged.join("\n"), /dostawca nie odpowiada/);
});
