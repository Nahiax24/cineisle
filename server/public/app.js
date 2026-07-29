(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    serverUrl: "",
    token: "",
    name: "观影人A",
    assistantName: "观影助手",
    roomId: "",
    room: null,
    applyingRemote: false,
    polling: null,
    contextTimer: null,
    lastPlaybackSyncAt: 0,
    lastContextAt: 0,
    lastSubtitleText: "",
    subtitles: [],
    danmakuOn: true,
    seenMessages: new Set(),
    hall: []
  };

  const els = {
    serverUrl: $("serverUrl"), token: $("token"), viewerName: $("viewerName"), assistantName: $("assistantName"),
    joinRoomInput: $("joinRoomInput"), statusLine: $("statusLine"), healthState: $("healthState"), roomTitle: $("roomTitle"), roomBadge: $("roomBadge"),
    video: $("video"), videoFile: $("videoFile"), subtitleFile: $("subtitleFile"), subtitleOverlay: $("subtitleOverlay"), danmakuLayer: $("danmakuLayer"),
    playerState: $("playerState"), chatLog: $("chatLog"), chatInput: $("chatInput"), noteLog: $("noteLog"), noteInput: $("noteInput"),
    quoteInput: $("quoteInput"), cardNoteInput: $("cardNoteInput"), cardTemplate: $("cardTemplate"), cardPreview: $("cardPreview"),
    contextState: $("contextState"), hallList: $("hallList"), installDialog: $("installDialog")
  };

  function cleanUrl(v) { return String(v || "").trim().replace(/\/+$/, ""); }
  function roomCode(v) { return String(v || "").trim().toUpperCase(); }
  function timeLabel(sec) {
    sec = Math.max(0, Math.floor(Number(sec || 0)));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
  }
  function setStatus(text) { els.statusLine.textContent = text; }
  function apiPath(path) {
    const base = state.serverUrl || cleanUrl(location.origin);
    return base + path;
  }
  function headers(json = true) {
    const h = {};
    if (json) h["Content-Type"] = "application/json; charset=utf-8";
    if (state.token) h.Authorization = `Bearer ${state.token}`;
    return h;
  }
  async function request(path, options = {}) {
    const res = await fetch(apiPath(path), { ...options, headers: { ...headers(options.body !== undefined), ...(options.headers || {}) } });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, error: text || `HTTP ${res.status}` }; }
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  function saveSettings() {
    state.serverUrl = cleanUrl(els.serverUrl.value) || cleanUrl(location.origin);
    state.token = els.token.value.trim();
    state.name = els.viewerName.value.trim() || "观影人A";
    state.assistantName = els.assistantName.value.trim() || "观影助手";
    localStorage.setItem("cineisle.settings", JSON.stringify({
      serverUrl: state.serverUrl, token: state.token, name: state.name, assistantName: state.assistantName, roomId: state.roomId
    }));
    setStatus("设置已保存。");
  }
  function loadSettings() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem("cineisle.settings") || "{}"); } catch {}
    state.serverUrl = cleanUrl(s.serverUrl) || cleanUrl(location.origin);
    state.token = s.token || "";
    state.name = s.name || "观影人A";
    state.assistantName = s.assistantName || "观影助手";
    state.roomId = roomCode(s.roomId || "");
    els.serverUrl.value = state.serverUrl;
    els.token.value = state.token;
    els.viewerName.value = state.name;
    els.assistantName.value = state.assistantName;
    els.joinRoomInput.value = state.roomId;
    try { state.hall = JSON.parse(localStorage.getItem("cineisle.hall") || "[]"); } catch { state.hall = []; }
    renderHall();
  }

  async function checkHealth() {
    saveSettings();
    els.healthState.textContent = "检查中";
    try {
      const data = await request("/api/health", { method: "GET" });
      els.healthState.textContent = data.tokenRequired ? "后端在线 · Token" : "后端在线";
      setStatus(`后端在线：${data.app || "CineIsle"}，版本 ${data.version || "unknown"}。`);
    } catch (e) {
      els.healthState.textContent = "连接失败";
      setStatus(`后端检查失败：${e.message}`);
    }
  }

  async function createRoom() {
    saveSettings();
    try {
      const title = els.videoFile.files[0]?.name?.replace(/\.[^.]+$/, "") || "映屿观影房间";
      const data = await request("/api/rooms", {
        method: "POST",
        body: JSON.stringify({ title, assistantName: state.assistantName, partner: state.name, mood: "夜航", inviteNote: "今晚一起登岛看一场电影。" })
      });
      enterRoom(data.room.id, data.room);
      setStatus(`房间已创建：${data.room.id}`);
    } catch (e) { setStatus(`创建失败：${e.message}`); }
  }
  async function joinRoom() {
    saveSettings();
    const id = roomCode(els.joinRoomInput.value);
    if (!id) return setStatus("先输入房间号。");
    try {
      const data = await request(`/api/rooms/${id}`, { method: "GET" });
      enterRoom(id, data.room);
      setStatus(`已加入房间：${id}`);
    } catch (e) { setStatus(`加入失败：${e.message}`); }
  }
  function enterRoom(id, room) {
    state.roomId = roomCode(id);
    state.room = room || state.room;
    els.joinRoomInput.value = state.roomId;
    saveSettings();
    renderRoom(room);
    if (state.polling) clearInterval(state.polling);
    state.polling = setInterval(fetchRoom, 2500);
    if (state.contextTimer) clearInterval(state.contextTimer);
    state.contextTimer = setInterval(syncContextIfNeeded, 1200);
    fetchRoom();
  }
  async function fetchRoom() {
    if (!state.roomId) return;
    try {
      const data = await request(`/api/rooms/${state.roomId}`, { method: "GET" });
      state.room = data.room;
      renderRoom(data.room);
      applyRemotePlayback(data.room);
    } catch (e) { els.playerState.textContent = `轮询失败：${e.message}`; }
  }

  function renderRoom(room) {
    if (!room) return;
    els.roomTitle.textContent = room.title || "映屿观影房间";
    els.roomBadge.textContent = `ROOM ${room.id || state.roomId}`;
    renderMessages(room.messages || []);
    renderNotes(room.notes || []);
    renderCard(room.card);
  }
  function renderMessages(messages) {
    els.chatLog.innerHTML = "";
    messages.slice(-80).forEach(m => {
      const isDanmaku = String(m.text || "").startsWith("弹幕：");
      const text = isDanmaku ? String(m.text).replace(/^弹幕：/, "") : String(m.text || "");
      const item = document.createElement("div");
      item.className = "log-item";
      item.innerHTML = `<div class="log-meta">${escapeHtml(m.name || "观影人")} · ${isDanmaku ? "弹幕" : "聊天"}</div><div>${escapeHtml(text)}</div>`;
      els.chatLog.appendChild(item);
      if (isDanmaku && !state.seenMessages.has(m.id)) {
        state.seenMessages.add(m.id);
        if (state.danmakuOn) flyDanmaku(text);
      }
    });
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }
  function renderNotes(notes) {
    els.noteLog.innerHTML = "";
    notes.slice(-80).forEach(n => {
      const item = document.createElement("div");
      item.className = "log-item";
      item.innerHTML = `<div class="log-meta">${escapeHtml(n.name || "观影人")} · ${timeLabel(n.time)}</div><div>${escapeHtml(n.text || "")}</div>`;
      els.noteLog.appendChild(item);
    });
    els.noteLog.scrollTop = els.noteLog.scrollHeight;
  }
  function renderCard(card) {
    if (!card) { els.cardPreview.textContent = "还没有卡片。"; return; }
    els.cardPreview.textContent = `《${card.title || "未命名影片"}》\n模板：${card.template || "ticket"}\n评分：${card.rating || ""}\n摘录：${card.quote || card.zhiQuote || ""}\n感想：${card.note || card.linNote || ""}\n生成时间：${card.generatedAt || ""}`;
  }
  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[ch]));
  }

  async function sendMessage(danmaku) {
    if (!state.roomId) return setStatus("先创建或加入房间。");
    const text = els.chatInput.value.trim();
    if (!text) return;
    els.chatInput.value = "";
    try {
      await request(`/api/rooms/${state.roomId}/message`, { method: "POST", body: JSON.stringify({ name: state.name, text, danmaku, assistantName: state.assistantName }) });
      fetchRoom();
    } catch (e) { setStatus(`发送失败：${e.message}`); }
  }
  async function addNote() {
    if (!state.roomId) return setStatus("先创建或加入房间。");
    const text = els.noteInput.value.trim();
    if (!text) return;
    els.noteInput.value = "";
    try {
      await request(`/api/rooms/${state.roomId}/note`, { method: "POST", body: JSON.stringify({ name: state.name, text, time: els.video.currentTime || 0, assistantName: state.assistantName }) });
      fetchRoom();
    } catch (e) { setStatus(`记笔记失败：${e.message}`); }
  }
  async function generateCard() {
    if (!state.roomId) return setStatus("先创建或加入房间。");
    try {
      await request(`/api/rooms/${state.roomId}/card`, {
        method: "POST",
        body: JSON.stringify({
          title: state.room?.title || currentVideoTitle(), template: els.cardTemplate.value,
          quote: els.quoteInput.value.trim(), note: els.cardNoteInput.value.trim(), rating: 4.5,
          assistantName: state.assistantName, partner: state.name
        })
      });
      fetchRoom();
    } catch (e) { setStatus(`生成卡片失败：${e.message}`); }
  }

  function currentVideoTitle() { return els.videoFile.files[0]?.name?.replace(/\.[^.]+$/, "") || state.room?.title || "未命名影片"; }
  function handleVideoFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    els.video.src = url;
    els.video.load();
    els.playerState.textContent = `已导入影片：${file.name}`;
    rememberHall(file.name, 0);
    if (state.roomId) syncPlayback(true);
  }
  function rememberHall(fileName, pos) {
    if (!fileName) return;
    const title = fileName.replace(/\.[^.]+$/, "");
    state.hall = state.hall.filter(x => x.fileName !== fileName);
    state.hall.unshift({ fileName, title, lastPosition: Math.floor(pos || 0), updatedAt: new Date().toISOString() });
    state.hall = state.hall.slice(0, 20);
    localStorage.setItem("cineisle.hall", JSON.stringify(state.hall));
    renderHall();
  }
  function renderHall() {
    els.hallList.innerHTML = "";
    if (!state.hall.length) { els.hallList.innerHTML = `<div class="hall-item">还没有本机影片记录。</div>`; return; }
    state.hall.forEach(item => {
      const div = document.createElement("div");
      div.className = "hall-item";
      div.innerHTML = `<strong>${escapeHtml(item.title)}</strong><br><span class="small">${escapeHtml(item.fileName)} · 上次 ${timeLabel(item.lastPosition)} · ${new Date(item.updatedAt).toLocaleString()}</span>`;
      els.hallList.appendChild(div);
    });
  }

  async function syncPlayback(force = false) {
    if (!state.roomId || !els.video.src) return;
    const now = Date.now();
    if (!force && now - state.lastPlaybackSyncAt < 1500) return;
    state.lastPlaybackSyncAt = now;
    rememberHall(els.videoFile.files[0]?.name || state.room?.fileName || "本地影片", els.video.currentTime || 0);
    try {
      await request(`/api/rooms/${state.roomId}/playback`, {
        method: "POST",
        body: JSON.stringify({
          currentTime: els.video.currentTime || 0,
          duration: Number.isFinite(els.video.duration) ? els.video.duration : 0,
          paused: els.video.paused,
          title: currentVideoTitle(), fileName: els.videoFile.files[0]?.name || "",
          actor: state.name, assistantName: state.assistantName
        })
      });
    } catch (e) { els.playerState.textContent = `同步失败：${e.message}`; }
  }
  function applyRemotePlayback(room) {
    if (!room || !els.video.src || state.applyingRemote) return;
    if (room.lastActor === state.name) return;
    const remoteTime = Number(room.currentTime || 0);
    if (Math.abs((els.video.currentTime || 0) - remoteTime) > 3) {
      state.applyingRemote = true;
      els.video.currentTime = remoteTime;
      setTimeout(() => state.applyingRemote = false, 350);
    }
    if (typeof room.paused === "boolean" && room.paused !== els.video.paused) {
      state.applyingRemote = true;
      if (room.paused) els.video.pause(); else els.video.play().catch(() => {});
      setTimeout(() => state.applyingRemote = false, 350);
    }
  }

  async function handleSubtitleFile(file) {
    if (!file) return;
    const text = await file.text();
    state.subtitles = parseSubtitle(text, file.name);
    els.contextState.textContent = `已导入字幕：${file.name}，共 ${state.subtitles.length} 条。`;
  }
  function parseSubtitle(text, name) {
    const lower = String(name || "").toLowerCase();
    if (lower.endsWith(".ass") || lower.endsWith(".ssa") || /\[Events\]/i.test(text)) return parseAss(text);
    return parseSrtVtt(text);
  }
  function parseTime(s) {
    const m = String(s).trim().replace(',', '.').match(/(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?/);
    if (!m) return 0;
    const h = Number(m[1] || 0), min = Number(m[2] || 0), sec = Number(m[3] || 0), ms = Number((m[4] || "0").padEnd(3, "0"));
    return h * 3600 + min * 60 + sec + ms / 1000;
  }
  function cleanAssText(s) {
    return String(s || "").replace(/\{[^}]*\}/g, "").replace(/\\N/g, "\n").replace(/\\h/g, " ").replace(/\s+/g, " ").trim();
  }
  function parseAss(text) {
    return text.split(/\r?\n/).filter(l => /^Dialogue:/i.test(l)).map(line => {
      const parts = line.replace(/^Dialogue:\s*/i, "").split(",");
      if (parts.length < 10) return null;
      return { start: parseTime(parts[1]), end: parseTime(parts[2]), text: cleanAssText(parts.slice(9).join(",")) };
    }).filter(c => c && c.text && c.end > c.start).sort((a,b) => a.start - b.start);
  }
  function parseSrtVtt(text) {
    const blocks = text.replace(/^WEBVTT.*\n/i, "").split(/\n\s*\n/);
    const cues = [];
    for (const block of blocks) {
      const lines = block.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const idx = lines.findIndex(l => l.includes("-->"));
      if (idx < 0) continue;
      const [a,b] = lines[idx].split("-->").map(x => x.trim().split(/\s+/)[0]);
      const body = lines.slice(idx + 1).join(" ").replace(/<[^>]+>/g, "").trim();
      if (body) cues.push({ start: parseTime(a), end: parseTime(b), text: body });
    }
    return cues.sort((a,b) => a.start - b.start);
  }
  function currentSubtitle() {
    const t = els.video.currentTime || 0;
    const cue = state.subtitles.find(c => t >= c.start && t <= c.end);
    return cue ? cue.text : "";
  }
  function recentSubtitles() {
    const t = els.video.currentTime || 0;
    return state.subtitles.filter(c => c.end <= t && c.end >= t - 45).slice(-8).map(c => c.text);
  }
  async function syncContextIfNeeded() {
    if (!els.video.src) {
      els.subtitleOverlay.textContent = "";
      return;
    }
    const text = currentSubtitle();
    els.subtitleOverlay.textContent = text;
    if (!state.roomId) return;
    const now = Date.now();
    if (now - state.lastContextAt < 2500 && text === state.lastSubtitleText) return;
    state.lastContextAt = now;
    state.lastSubtitleText = text;
    try {
      await request(`/api/rooms/${state.roomId}/context`, {
        method: "POST",
        body: JSON.stringify({
          currentTime: els.video.currentTime || 0,
          duration: Number.isFinite(els.video.duration) ? els.video.duration : 0,
          paused: els.video.paused,
          title: currentVideoTitle(), fileName: els.videoFile.files[0]?.name || "",
          currentSubtitle: text, recentSubtitles: recentSubtitles(), actor: state.name, assistantName: state.assistantName
        })
      });
      els.contextState.textContent = text ? `已同步字幕：${text.slice(0, 48)}` : "已同步播放上下文。";
    } catch (e) { els.contextState.textContent = `上下文同步失败：${e.message}`; }
  }
  async function captureFrame() {
    if (!state.roomId) return setStatus("先创建或加入房间。");
    if (!els.video.src || !els.video.videoWidth) return setStatus("先导入并播放一帧影片，再截图。");
    try {
      const canvas = document.createElement("canvas");
      const maxW = 720;
      const scale = Math.min(1, maxW / els.video.videoWidth);
      canvas.width = Math.max(1, Math.round(els.video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(els.video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      ctx.drawImage(els.video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", .62);
      await request(`/api/rooms/${state.roomId}/screenshot`, {
        method: "POST",
        body: JSON.stringify({ dataUrl, width: canvas.width, height: canvas.height, source: "pwa-manual-frame", actor: state.name, assistantName: state.assistantName, note: "映屿 PWA 手动截取当前本地视频帧。" })
      });
      setStatus("当前画面已上传给 AI 看一眼。");
    } catch (e) { setStatus(`截图失败：${e.message}。iOS 浏览器可能限制当前视频帧读取。`); }
  }

  function flyDanmaku(text) {
    const d = document.createElement("div");
    d.className = "danmaku";
    d.textContent = text;
    d.style.top = `${10 + Math.random() * 65}%`;
    d.style.fontSize = `${15 + Math.random() * 7}px`;
    els.danmakuLayer.appendChild(d);
    setTimeout(() => d.remove(), 8500);
  }

  function bindTabs() {
    document.querySelectorAll(".tab").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        document.querySelectorAll(".tab-page").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        $(`tab-${btn.dataset.tab}`).classList.add("active");
      });
    });
  }
  function bindEvents() {
    $("saveSettingsBtn").addEventListener("click", saveSettings);
    $("healthBtn").addEventListener("click", checkHealth);
    $("createRoomBtn").addEventListener("click", createRoom);
    $("joinRoomBtn").addEventListener("click", joinRoom);
    $("sendChatBtn").addEventListener("click", () => sendMessage(false));
    $("sendDanmakuBtn").addEventListener("click", () => sendMessage(true));
    $("addNoteBtn").addEventListener("click", addNote);
    $("generateCardBtn").addEventListener("click", generateCard);
    $("syncNowBtn").addEventListener("click", () => syncPlayback(true));
    $("captureFrameBtn").addEventListener("click", captureFrame);
    $("toggleDanmakuBtn").addEventListener("click", () => {
      state.danmakuOn = !state.danmakuOn;
      $("toggleDanmakuBtn").textContent = state.danmakuOn ? "弹幕 ON" : "弹幕 OFF";
    });
    els.videoFile.addEventListener("change", e => handleVideoFile(e.target.files[0]));
    els.subtitleFile.addEventListener("change", e => handleSubtitleFile(e.target.files[0]));
    els.video.addEventListener("play", () => { if (!state.applyingRemote) syncPlayback(true); });
    els.video.addEventListener("pause", () => { if (!state.applyingRemote) syncPlayback(true); });
    els.video.addEventListener("seeked", () => { if (!state.applyingRemote) syncPlayback(true); });
    els.video.addEventListener("timeupdate", () => { syncContextIfNeeded(); syncPlayback(false); });
    $("clearHallBtn").addEventListener("click", () => { state.hall = []; localStorage.removeItem("cineisle.hall"); renderHall(); });
    $("installTipBtn").addEventListener("click", () => els.installDialog.showModal());
    $("closeInstallDialog").addEventListener("click", () => els.installDialog.close());
    els.chatInput.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(false); });
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
  bindTabs();
  bindEvents();
  loadSettings();
  if (state.roomId) enterRoom(state.roomId, null);
})();
