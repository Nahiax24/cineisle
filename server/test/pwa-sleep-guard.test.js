const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function listenerStore() {
  const listeners = new Map();
  return {
    add(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    emit(type, event = {}) {
      for (const handler of listeners.get(type) || []) handler(event);
    }
  };
}

function fakeClassList() {
  const values = new Set();
  return {
    add(value) { values.add(value); },
    remove(value) { values.delete(value); },
    contains(value) { return values.has(value); }
  };
}

function fakeElement(id) {
  const events = listenerStore();
  return {
    id,
    value: "",
    textContent: "",
    innerHTML: "",
    files: [],
    disabled: false,
    dataset: {},
    style: {},
    classList: fakeClassList(),
    scrollTop: 0,
    scrollHeight: 0,
    src: "",
    paused: true,
    currentTime: 0,
    duration: 0,
    videoWidth: 0,
    videoHeight: 0,
    addEventListener(type, handler) { events.add(type, handler); },
    emit(type, event = {}) { events.emit(type, { target: this, ...event }); },
    appendChild() {},
    load() {},
    showModal() {},
    close() {}
  };
}

async function flushPromises() {
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
}

test("PWA stops all recurring requests while hidden, idle, or manually asleep", async () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../public/app.js"), "utf8");
  const elements = new Map();
  const documentEvents = listenerStore();
  const windowEvents = listenerStore();
  const storage = new Map([[
    "cineisle.settings",
    JSON.stringify({
      serverUrl: "https://cineisle.test",
      token: "test-token",
      name: "Nahia",
      assistantName: "Sol",
      roomId: "ABC123",
      manualSleep: false
    })
  ]]);
  const intervals = new Map();
  const requests = [];
  let nextIntervalId = 1;
  let fakeNow = Date.now();

  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [fakeNow]));
    }
    static now() { return fakeNow; }
  }

  const document = {
    hidden: false,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fakeElement(id));
      return elements.get(id);
    },
    querySelectorAll() { return []; },
    createElement(id) { return fakeElement(id); },
    addEventListener(type, handler) { documentEvents.add(type, handler); }
  };
  const window = {
    addEventListener(type, handler) { windowEvents.add(type, handler); }
  };
  const localStorage = {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  };
  const setInterval = (handler, milliseconds) => {
    const id = nextIntervalId++;
    intervals.set(id, { handler, milliseconds });
    return id;
  };
  const clearInterval = id => intervals.delete(id);
  const fetch = async url => {
    requests.push(String(url));
    const room = {
      id: "ABC123",
      title: "Gotham S01E01",
      messages: [],
      notes: [],
      currentTime: 613,
      paused: false,
      lastActor: "Nahia",
      context: {
        currentSubtitle: "当前台词",
        recentSubtitles: ["前一句", "再前一句", "当前台词"],
        subtitleUpdatedAt: "2026-07-29T20:00:00.000Z"
      }
    };
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ ok: true, room }); }
    };
  };

  vm.runInNewContext(source, {
    console,
    document,
    window,
    localStorage,
    location: { origin: "https://cineisle.test" },
    navigator: {},
    fetch,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    Date: FakeDate,
    URL
  });
  await flushPromises();

  const sleepButton = elements.get("sleepServerBtn");
  const video = elements.get("video");
  const contextState = elements.get("contextState");
  assert.deepEqual([...intervals.values()].map(x => x.milliseconds).sort((a, b) => a - b), [1200, 2500, 15000]);
  assert.equal(sleepButton.textContent, "让服务器休眠");
  assert.equal(contextState.textContent, "AI 字幕视图 · 10:13 · 播放中\n前文：前一句\n前文：再前一句\n当前：当前台词");
  assert.equal(contextState.dataset.remoteSubtitle, "当前台词");
  assert.equal(contextState.dataset.subtitleUpdatedAt, "2026-07-29T20:00:00.000Z");

  document.hidden = true;
  documentEvents.emit("visibilitychange");
  assert.equal(intervals.size, 0);
  assert.equal(sleepButton.textContent, "唤醒房间");

  const hiddenRequestCount = requests.length;
  video.src = "blob:gotham";
  video.duration = 3000;
  video.currentTime = 30;
  video.emit("timeupdate");
  await flushPromises();
  assert.equal(requests.length, hiddenRequestCount);

  document.hidden = false;
  documentEvents.emit("visibilitychange");
  await flushPromises();
  assert.deepEqual([...intervals.values()].map(x => x.milliseconds).sort((a, b) => a - b), [1200, 2500, 15000]);

  sleepButton.emit("click");
  assert.equal(intervals.size, 0);
  assert.equal(sleepButton.textContent, "唤醒房间");
  assert.equal(JSON.parse(storage.get("cineisle.settings")).manualSleep, true);

  const sleepingRequestCount = requests.length;
  video.currentTime = 45;
  video.emit("timeupdate");
  await flushPromises();
  assert.equal(requests.length, sleepingRequestCount);

  sleepButton.emit("click");
  await flushPromises();
  assert.deepEqual([...intervals.values()].map(x => x.milliseconds).sort((a, b) => a - b), [1200, 2500, 15000]);
  assert.equal(JSON.parse(storage.get("cineisle.settings")).manualSleep, false);

  video.paused = true;
  fakeNow += 10 * 60 * 1000 + 1;
  const idleCheck = [...intervals.values()].find(x => x.milliseconds === 15000);
  idleCheck.handler();
  assert.equal(intervals.size, 0);
  assert.equal(sleepButton.textContent, "唤醒房间");

  documentEvents.emit("pointerdown", { target: elements.get("chatInput") });
  await flushPromises();
  assert.deepEqual([...intervals.values()].map(x => x.milliseconds).sort((a, b) => a - b), [1200, 2500, 15000]);

  windowEvents.emit("pagehide");
  assert.equal(intervals.size, 0);
});
