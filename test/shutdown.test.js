// Server stop (SIGTERM/SIGINT): live avatar sessions are closed within a
// budget instead of being left running at the provider. From yoga-startup.

const test = require("node:test");
const assert = require("node:assert/strict");

const { closeAllSessions, getSession } = require("../src/engine/session");
const { fakeLlm, fakeAvatar, liveSession } = require("./helpers");

test("zatrzymanie serwera zamyka każdą sesję i zostawia wpis w rejestratorze", async () => {
  const first = await liveSession({ llm: fakeLlm() });
  const second = await liveSession({ llm: fakeLlm() });

  const closed = await closeAllSessions({ signal: "SIGTERM", budgetMs: 1000 });

  assert.equal(closed, 2);
  for (const { session, avatar } of [first, second]) {
    assert.equal(session.closed, true);
    assert.equal(getSession(session.id), undefined);
    assert.ok(avatar.commands.includes("stop"));
    const types = session.recorder.events(session.id).map((event) => event.type);
    assert.deepEqual(types.slice(-2), ["session.server_stop", "session.ended"]);
  }
});

test("dostawca, który nie odpowiada na zamknięcie, nie wstrzymuje zatrzymania ponad budżet", async () => {
  const avatar = fakeAvatar();
  const start = avatar.start;
  avatar.start = async (handlers) => ({ ...(await start(handlers)), stop: () => new Promise(() => {}) });
  const { session } = await liveSession({ llm: fakeLlm(), avatar });

  const startedAt = Date.now();
  await closeAllSessions({ signal: "SIGINT", budgetMs: 50 });

  assert.ok(Date.now() - startedAt < 1000);
  assert.equal(session.closed, true);
});

test("bez sesji zatrzymanie kończy się od razu", async () => {
  assert.equal(await closeAllSessions({ signal: "SIGTERM", budgetMs: 5000 }), 0);
});
