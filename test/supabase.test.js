const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupabase } = require("../src/coach/supabase");

for (const serviceKey of ["sb_secret_test", "legacy-service-role-jwt"]) {
  test(`Supabase authentication: ${serviceKey.startsWith("sb_secret_") ? "secret key" : "legacy JWT"}`, async () => {
    const calls = [];
    const client = createSupabase({
      url: "https://db.example/",
      serviceKey,
      fetchImpl: async (url, options) => {
        calls.push({ url, ...options });
        return new Response(null, { status: 201 });
      },
    });

    await client.request("workout_sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: "[]",
    });

    assert.equal(calls[0].url, "https://db.example/rest/v1/workout_sessions");
    assert.equal(calls[0].headers.apikey, serviceKey);
    assert.equal(calls[0].headers.Authorization, serviceKey.startsWith("sb_secret_") ? undefined : `Bearer ${serviceKey}`);
    assert.equal(calls[0].headers["Content-Type"], "application/json");
    assert.equal(calls[0].headers.Prefer, "return=minimal");
  });
}
