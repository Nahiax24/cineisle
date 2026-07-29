const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const test = require("node:test");

const TOKEN = "cineisle-test-token";

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for test server");
}

async function jsonRequest(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

test("passive context cannot move playback, but explicit controls still can", async t => {
  const port = await freePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {...process.env, PORT: String(port), CINEISLE_TOKEN: TOKEN},
    stdio: ["ignore", "ignore", "pipe"]
  });
  t.after(() => child.kill());

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForServer(baseUrl, child);

  const created = await jsonRequest(baseUrl, "/api/rooms", {
    method: "POST",
    body: JSON.stringify({title: "Look Away", assistantName: "Sol"})
  });
  const roomId = created.room.id;

  await jsonRequest(baseUrl, `/api/rooms/${roomId}/playback`, {
    method: "POST",
    body: JSON.stringify({
      currentTime: 3480,
      duration: 6183.744,
      paused: true,
      fileName: "Look Away.mp4",
      actor: "Nahia"
    })
  });

  const subtitle = await jsonRequest(baseUrl, `/api/rooms/${roomId}/context`, {
    method: "POST",
    body: JSON.stringify({
      currentTime: 3479.5,
      duration: 6183.744,
      paused: false,
      fileName: "Look Away.mp4",
      currentSubtitle: "A real subtitle",
      recentSubtitles: ["Earlier line"],
      actor: "Nahia"
    })
  });
  assert.equal(subtitle.room.currentTime, 3480);
  assert.equal(subtitle.room.paused, true);
  assert.equal(subtitle.room.lastActor, "Nahia");
  assert.equal(subtitle.context.currentSubtitle, "A real subtitle");

  const passive = await jsonRequest(baseUrl, `/api/rooms/${roomId}/context`, {
    method: "POST",
    body: JSON.stringify({
      currentTime: 0,
      duration: 0,
      paused: true,
      fileName: "",
      currentSubtitle: "",
      recentSubtitles: [],
      actor: "Sol",
      assistantName: "观影助手"
    })
  });
  assert.equal(passive.ignored, true);
  assert.equal(passive.room.currentTime, 3480);
  assert.equal(passive.room.paused, true);
  assert.equal(passive.room.lastActor, "Nahia");
  assert.equal(passive.room.assistantName, "Sol");
  assert.equal(passive.context.currentSubtitle, "A real subtitle");

  const controlled = await jsonRequest(baseUrl, `/api/rooms/${roomId}/playback`, {
    method: "POST",
    body: JSON.stringify({currentTime: 3475, paused: false, actor: "Sol"})
  });
  assert.equal(controlled.room.currentTime, 3475);
  assert.equal(controlled.room.paused, false);
  assert.equal(controlled.room.lastActor, "Sol");
});
