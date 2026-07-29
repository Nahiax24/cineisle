const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 8787;
const TOKEN = process.env.CINEISLE_TOKEN || process.env.LINJIAN_CINEMA_TOKEN || "";

app.use(cors());
app.use(express.json({ limit: "6mb" }));
app.use(express.static("public"));

const rooms = new Map();

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random()*chars.length)]).join("");
}
function now(){ return new Date().toISOString(); }
function cleanAssistantName(v) {
  v = String(v || "").trim().slice(0,80);
  return v || "观影助手";
}
function applyAssistantName(r, source) {
  if (source && Object.prototype.hasOwnProperty.call(source, "assistantName")) {
    r.assistantName = cleanAssistantName(source.assistantName);
  }
  return r.assistantName || "观影助手";
}
function defaultAssistant(r) {
  return cleanAssistantName(r && r.assistantName);
}
function ensure(id) {
  id = String(id || "").trim().toUpperCase();
  if (!id) throw new Error("ROOM_REQUIRED");
  if (!rooms.has(id)) rooms.set(id, {
    id, createdAt: now(), updatedAt: now(), title:"未命名影片", fileName:"",
    duration:0, currentTime:0, paused:true, lastActor:"", assistantName:"观影助手", members:[],
    messages:[], notes:[], card:null, theme:"cream", partner:"观影人 A × 观影人 B", mood:"夜航", inviteNote:"今晚一起登岛看一场电影。",
    context:{
      currentSubtitle:"", recentSubtitles:[], subtitleUpdatedAt:null,
      latestFrame:null, frameHistory:[], frameUpdatedAt:null, frameSource:"",
      screenshotRequestId:null, screenshotRequestedAt:null,
      actor:"", observedAt:null
    }
  });
  return rooms.get(id);
}
function compactContext(ctx, includeFrameData) {
  ctx = ctx || {};
  const latestFrame = ctx.latestFrame ? {
    id: ctx.latestFrame.id,
    mime: ctx.latestFrame.mime,
    width: ctx.latestFrame.width,
    height: ctx.latestFrame.height,
    size: ctx.latestFrame.size,
    source: ctx.latestFrame.source || ctx.frameSource || "",
    note: ctx.latestFrame.note || "",
    uploadedAt: ctx.latestFrame.uploadedAt || ctx.frameUpdatedAt || null,
    dataUrl: includeFrameData ? ctx.latestFrame.dataUrl : undefined
  } : null;
  const recentFrames = Array.isArray(ctx.frameHistory) ? ctx.frameHistory.slice(-5).map(f => ({
    id: f.id,
    mime: f.mime,
    width: f.width,
    height: f.height,
    size: f.size,
    source: f.source || "",
    note: f.note || "",
    uploadedAt: f.uploadedAt || null
  })) : [];
  return {
    currentSubtitle: ctx.currentSubtitle || "",
    recentSubtitles: Array.isArray(ctx.recentSubtitles) ? ctx.recentSubtitles.slice(-8) : [],
    subtitleUpdatedAt: ctx.subtitleUpdatedAt || null,
    actor: ctx.actor || "",
    observedAt: ctx.observedAt || null,
    frameUpdatedAt: ctx.frameUpdatedAt || null,
    frameSource: ctx.frameSource || "",
    screenshotRequestId: ctx.screenshotRequestId || null,
    screenshotRequestedAt: ctx.screenshotRequestedAt || null,
    recentFrames,
    latestFrame
  };
}
function pub(r){
  return {...r, messages:r.messages.slice(-80), notes:r.notes.slice(-80), context: compactContext(r.context, false)};
}
function getTokenFromReq(req) {
  return (req.headers.authorization || "").replace(/^Bearer\s+/i,"")
    || req.headers["x-cineisle-token"]
    || req.headers["x-linjian-token"]
    || (req.query && req.query.token)
    || (req.body && req.body.token)
    || (req.body && req.body.params && req.body.params.token)
    || (req.body && req.body.arguments && req.body.arguments.token)
    || "";
}

function isAuthed(req) {
  if (!TOKEN) return true;
  return getTokenFromReq(req) === TOKEN;
}

function auth(req,res,next){
  if (!isAuthed(req)) return res.status(403).json({ok:false,error:"CINEISLE_BAD_TOKEN"});
  next();
}

app.get("/", (req,res)=>res.sendFile(__dirname + "/public/index.html"));
app.get("/server-info", (req,res)=>res.json({ok:true, app:"CineIsle Server", version:"0.4.3-sleep-guard", rooms:rooms.size, tokenRequired:Boolean(TOKEN), mcp:"/mcp", health:"/api/health", time:now()}));
app.get("/api/health",(req,res)=>res.json({ok:true, app:"CineIsle Server", version:"0.4.3-sleep-guard", rooms:rooms.size, tokenRequired:Boolean(TOKEN), time:now()}));

app.post("/api/rooms",(req,res)=>{
  const r = ensure(code());
  r.title = req.body.title || r.title;
  r.theme = req.body.theme || r.theme;
  applyAssistantName(r, req.body);
  r.partner = req.body.partner || r.partner;
  r.mood = req.body.mood || r.mood;
  r.inviteNote = req.body.inviteNote || r.inviteNote;
  res.json({ok:true, room: pub(r)});
});
app.get("/api/rooms/:id",(req,res)=>{
  const r = rooms.get(String(req.params.id).toUpperCase());
  if (!r) return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
  res.json({ok:true, room: pub(r)});
});
app.post("/api/rooms/:id/message", auth, (req,res)=>{
  const r = ensure(req.params.id);
  applyAssistantName(r, req.body);
  const m = { id:Date.now()+"", name:req.body.name || "观影人", text:String(req.body.text || "").slice(0,500), at:now() };
  r.messages.push(m); r.updatedAt = now();
  res.json({ok:true, message:m, room:pub(r)});
});
app.post("/api/rooms/:id/playback", auth, (req,res)=>{
  const r = ensure(req.params.id);
  applyAssistantName(r, req.body);
  if (typeof req.body.currentTime === "number") r.currentTime = Math.max(0, req.body.currentTime);
  if (typeof req.body.duration === "number") r.duration = Math.max(0, req.body.duration);
  if (typeof req.body.paused === "boolean") r.paused = req.body.paused;
  if (req.body.title) r.title = String(req.body.title).slice(0,100);
  if (req.body.fileName) r.fileName = String(req.body.fileName).slice(0,180);
  if (req.body.partner) r.partner = String(req.body.partner).slice(0,80);
  if (req.body.mood) r.mood = String(req.body.mood).slice(0,80);
  if (req.body.inviteNote) r.inviteNote = String(req.body.inviteNote).slice(0,240);
  r.lastActor = req.body.actor || req.body.name || "观影人";
  r.updatedAt = now();
  res.json({ok:true, room:pub(r)});
});
app.post("/api/rooms/:id/note", auth, (req,res)=>{
  const r = ensure(req.params.id);
  applyAssistantName(r, req.body);
  const n = { id:Date.now()+"", name:req.body.name || "观影人", text:String(req.body.text || "").slice(0,800), type:req.body.type || "note", time:req.body.time || r.currentTime, at:now() };
  r.notes.push(n); r.updatedAt = now();
  res.json({ok:true, note:n, room:pub(r)});
});
app.post("/api/rooms/:id/card", auth, (req,res)=>{
  const r = ensure(req.params.id);
  applyAssistantName(r, req.body);
  r.card = {
    title:req.body.title || r.title,
    rating:req.body.rating || 4.5,
    template:req.body.template || "ticket",
    partner:req.body.partner || r.partner || "",
    mood:req.body.mood || r.mood || "",
    inviteNote:req.body.inviteNote || r.inviteNote || "",
    quote:req.body.quote || "",
    note:req.body.note || "",
    zhiQuote:req.body.viewerAQuote || req.body.zhiQuote || req.body.userQuote || "",
    linQuote:req.body.viewerBQuote || req.body.linQuote || req.body.aiQuote || "",
    zhiNote:req.body.viewerANote || req.body.zhiNote || req.body.userNote || "",
    linNote:req.body.viewerBNote || req.body.linNote || req.body.aiNote || "",
    generatedAt:now()
  };
  r.updatedAt = now();
  res.json({ok:true, card:r.card, room:pub(r)});
});

app.post("/api/rooms/:id/context", auth, (req,res)=>{
  const r = ensure(req.params.id);
  const ctx = r.context || (r.context = {});
  const hasLocalMedia = Number(req.body.duration) > 0 || Boolean(String(req.body.fileName || "").trim());
  if (!hasLocalMedia) {
    return res.json({ok:true, ignored:true, reason:"LOCAL_MEDIA_REQUIRED", context: compactContext(ctx, false), room: pub(r)});
  }
  applyAssistantName(r, req.body);
  ctx.recentSubtitles = Array.isArray(req.body.recentSubtitles)
    ? req.body.recentSubtitles.map(x => String(x || "").slice(0,500)).filter(Boolean).slice(-8)
    : [];
  let subtitleText = String(req.body.currentSubtitle || "").slice(0,500);
  if (!subtitleText && ctx.recentSubtitles.length) {
    subtitleText = String(ctx.recentSubtitles[ctx.recentSubtitles.length - 1] || "").slice(0,500);
  }
  ctx.currentSubtitle = subtitleText;
  ctx.actor = String(req.body.actor || req.body.name || "观影人").slice(0,80);
  ctx.observedAt = req.body.observedAt || now();
  ctx.subtitleUpdatedAt = now();
  r.updatedAt = now();
  res.json({ok:true, context: compactContext(ctx, false), room: pub(r)});
});

app.post("/api/rooms/:id/screenshot", auth, (req,res)=>{
  const r = ensure(req.params.id);
  applyAssistantName(r, req.body);
  const ctx = r.context || (r.context = {});
  const raw = String(req.body.dataUrl || req.body.imageBase64 || "");
  if (!raw) return res.status(400).json({ok:false,error:"IMAGE_REQUIRED"});
  const dataUrl = raw.startsWith("data:") ? raw : `data:${req.body.mime || "image/jpeg"};base64,${raw}`;
  if (dataUrl.length > 5_500_000) return res.status(413).json({ok:false,error:"IMAGE_TOO_LARGE"});
  ctx.latestFrame = {
    id: Date.now()+"",
    dataUrl,
    mime: String(req.body.mime || (dataUrl.match(/^data:([^;]+)/)||[])[1] || "image/jpeg").slice(0,50),
    width: Number(req.body.width || 0),
    height: Number(req.body.height || 0),
    size: dataUrl.length,
    source: String(req.body.source || "accessibility").slice(0,80),
    note: String(req.body.note || "").slice(0,240),
    uploadedAt: now()
  };
  ctx.frameUpdatedAt = ctx.latestFrame.uploadedAt;
  ctx.frameSource = ctx.latestFrame.source;
  ctx.frameHistory = Array.isArray(ctx.frameHistory) ? ctx.frameHistory : [];
  ctx.frameHistory.push(ctx.latestFrame);
  while (ctx.frameHistory.length > 5) ctx.frameHistory.shift();
  ctx.screenshotRequestId = null;
  ctx.screenshotRequestedAt = null;
  ctx.actor = String(req.body.actor || req.body.name || ctx.actor || "观影人").slice(0,80);
  ctx.observedAt = now();
  r.updatedAt = now();
  res.json({ok:true, frame: compactContext(ctx, false).latestFrame, room: pub(r)});
});

app.post("/api/rooms/:id/screenshot-request", auth, (req,res)=>{
  const r = rooms.get(String(req.params.id).toUpperCase());
  if (!r) return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
  const requestId = Date.now() + "";
  r.context.screenshotRequestId = requestId;
  r.context.screenshotRequestedAt = now();
  r.context.frameSource = "request-pending";
  applyAssistantName(r, req.body);
  r.context.actor = req.body.actor || req.body.name || defaultAssistant(r);
  r.updatedAt = now();
  res.json({ok:true, requestId, requestedAt:r.context.screenshotRequestedAt, room:pub(r)});
});
app.get("/api/rooms/:id/screenshot-request", auth, (req,res)=>{
  const r = rooms.get(String(req.params.id).toUpperCase());
  if (!r) return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
  const since = String(req.query.since || "");
  const requestId = r.context.screenshotRequestId || "";
  res.json({
    ok:true,
    pending: Boolean(requestId && requestId !== since),
    requestId,
    requestedAt: r.context.screenshotRequestedAt || null
  });
});

app.get("/api/rooms/:id/context", auth, (req,res)=>{
  const r = rooms.get(String(req.params.id).toUpperCase());
  if (!r) return res.status(404).json({ok:false,error:"ROOM_NOT_FOUND"});
  const includeFrame = String(req.query.includeFrame || req.query.includeScreenshot || "") === "1";
  res.json({ok:true, room: pub(r), context: compactContext(r.context, includeFrame)});
});

app.get("/api/rooms/:id/latest-frame.jpg", auth, (req,res)=>{
  const r = rooms.get(String(req.params.id).toUpperCase());
  if (!r || !r.context || !r.context.latestFrame || !r.context.latestFrame.dataUrl) {
    return res.status(404).json({ok:false,error:"FRAME_NOT_FOUND"});
  }
  const frame = r.context.latestFrame;
  const m = String(frame.dataUrl).match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return res.status(500).json({ok:false,error:"BAD_FRAME_DATA"});
  const buf = Buffer.from(m[2], "base64");
  res.setHeader("Content-Type", m[1] || frame.mime || "image/jpeg");
  res.setHeader("Cache-Control", "no-store");
  res.send(buf);
});


function mcpTools() {
  return [
    {
      name: "create_room",
      description: "创建一个映屿 CineIsle 观影房间",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "电影或房间标题" },
          theme: { type: "string", description: "主题皮肤，可选 cream/night/galaxy/matcha/film/dusk" },
          partner: { type: "string", description: "观影人显示名" },
          assistantName: { type: "string", description: "AI 观影搭子的名字，不填时为观影助手" },
          mood: { type: "string", description: "今晚观影氛围" },
          inviteNote: { type: "string", description: "观影邀请卡开场备注" }
        }
      }
    },
    {
      name: "get_room_state",
      description: "读取观影房间状态、播放进度、聊天、笔记和小卡片",
      inputSchema: {
        type: "object",
        properties: {
          room: { type: "string", description: "房间号" }
        },
        required: ["room"]
      }
    },
    {
      name: "send_room_message",
      description: "向观影房间发送聊天或弹幕",
      inputSchema: {
        type: "object",
        properties: {
          room: { type: "string", description: "房间号" },
          name: { type: "string", description: "发送者昵称" },
          text: { type: "string", description: "消息内容" },
          danmaku: { type: "boolean", description: "是否作为弹幕发送" }
        },
        required: ["room", "text"]
      }
    },
    {
      name: "control_playback",
      description: "同步控制播放状态，例如暂停、继续、跳转到某个秒数",
      inputSchema: {
        type: "object",
        properties: {
          room: { type: "string", description: "房间号" },
          currentTime: { type: "number", description: "播放进度，单位秒" },
          paused: { type: "boolean", description: "是否暂停" },
          actor: { type: "string", description: "操作者" }
        },
        required: ["room"]
      }
    },
    {
      name: "add_note",
      description: "给观影房间添加一条观影笔记",
      inputSchema: {
        type: "object",
        properties: {
          room: { type: "string", description: "房间号" },
          name: { type: "string", description: "记录者昵称" },
          text: { type: "string", description: "笔记内容" },
          time: { type: "number", description: "对应播放时间，单位秒" }
        },
        required: ["room", "text"]
      }
    },
    {
      name: "request_screenshot",
      description: "请求手机端在映屿前台立即上传一张低频画面截图；类似掌心窗 peek，但只在用户开启映屿截图权限后生效",
      inputSchema: {
        type: "object",
        properties: {
          room: { type: "string", description: "房间号" },
          actor: { type: "string", description: "请求者" }
        },
        required: ["room"]
      }
    },
    {
      name: "get_viewing_context",
      description: "读取映屿 CineIsle 当前观影上下文：播放状态、当前字幕、最近字幕，以及可选的低频画面截图",
      inputSchema: {
        type: "object",
        properties: {
          room: { type: "string", description: "房间号" },
          includeScreenshot: { type: "boolean", description: "是否在结果中包含最近一张截图的 dataUrl。截图可能较大，默认 false" }
        },
        required: ["room"]
      }
    },
    {
      name: "generate_card",
      description: "生成或更新观影小卡片",
      inputSchema: {
        type: "object",
        properties: {
          room: { type: "string", description: "房间号" },
          title: { type: "string", description: "卡片标题" },
          rating: { type: "number", description: "评分" },
          quote: { type: "string", description: "摘录" },
          note: { type: "string", description: "观影感想" },
          template: { type: "string", description: "卡片模板：ticket/receipt/postcard" },
          viewerAQuote: { type: "string", description: "观影人 A 喜欢的台词" },
          viewerBQuote: { type: "string", description: "观影人 B 喜欢的台词" },
          viewerANote: { type: "string", description: "观影人 A 观后感" },
          viewerBNote: { type: "string", description: "观影人 B 观后感" },
          zhiQuote: { type: "string", description: "兼容旧字段：观影人 A 喜欢的台词" },
          linQuote: { type: "string", description: "兼容旧字段：观影人 B 喜欢的台词" },
          partner: { type: "string", description: "观影人显示名" },
          mood: { type: "string", description: "观影氛围" },
          inviteNote: { type: "string", description: "观影邀请卡开场备注" }
        },
        required: ["room"]
      }
    }
  ];
}

function stripFrameData(obj) {
  try {
    const copy = JSON.parse(JSON.stringify(obj));
    const frame = copy && copy.context && copy.context.latestFrame;
    if (frame && frame.dataUrl) frame.dataUrl = "[image attached]";
    const roomFrame = copy && copy.room && copy.room.context && copy.room.context.latestFrame;
    if (roomFrame && roomFrame.dataUrl) roomFrame.dataUrl = "[image attached]";
    return copy;
  } catch (e) { return obj; }
}

function imagePartFromResult(obj) {
  try {
    const frame = obj && obj.context && obj.context.latestFrame;
    if (!frame || !frame.dataUrl) return null;
    const m = String(frame.dataUrl).match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return null;
    return { type: "image", mimeType: m[1] || frame.mime || "image/jpeg", data: m[2] };
  } catch (e) { return null; }
}

function mcpText(obj) {
  return {
    content: [
      {
        type: "text",
        text: typeof obj === "string" ? obj : JSON.stringify(stripFrameData(obj), null, 2)
      }
    ]
  };
}

function mcpPayload(obj) {
  const out = mcpText(obj);
  const img = imagePartFromResult(obj);
  if (img) out.content.push(img);
  return out;
}

function callCinemaTool(name, args) {
  args = args || {};

  if (name === "create_room") {
    const r = ensure(code());
    r.title = args.title || r.title;
    r.theme = args.theme || r.theme;
    applyAssistantName(r, args);
    r.partner = args.partner || r.partner;
    r.mood = args.mood || r.mood;
    r.inviteNote = args.inviteNote || r.inviteNote;
    return pub(r);
  }

  if (name === "get_room_state") {
    const r = rooms.get(String(args.room || args.room_id || "").toUpperCase());
    if (!r) throw new Error("ROOM_NOT_FOUND");
    return pub(r);
  }

  if (name === "send_room_message") {
    const r = ensure(args.room || args.room_id);
    const text = args.danmaku ? "弹幕：" + String(args.text || "") : String(args.text || "");
    const m = {
      id: Date.now() + "",
      name: args.name || defaultAssistant(r),
      text,
      at: now()
    };
    r.messages.push(m);
    r.updatedAt = now();
    return { message: m, room: pub(r) };
  }

  if (name === "control_playback") {
    const r = ensure(args.room || args.room_id);
    if (typeof args.currentTime === "number") r.currentTime = Math.max(0, args.currentTime);
    if (typeof args.paused === "boolean") r.paused = args.paused;
    if (args.partner) r.partner = String(args.partner).slice(0,80);
    if (args.mood) r.mood = String(args.mood).slice(0,80);
    if (args.inviteNote) r.inviteNote = String(args.inviteNote).slice(0,240);
    applyAssistantName(r, args);
    r.lastActor = args.actor || defaultAssistant(r);
    r.updatedAt = now();
    return pub(r);
  }

  if (name === "add_note") {
    const r = ensure(args.room || args.room_id);
    const n = {
      id: Date.now() + "",
      name: args.name || defaultAssistant(r),
      text: String(args.text || ""),
      type: args.type || "note",
      time: args.time || r.currentTime,
      at: now()
    };
    r.notes.push(n);
    r.updatedAt = now();
    return { note: n, room: pub(r) };
  }

  if (name === "request_screenshot") {
    const r = rooms.get(String(args.room || args.room_id || "").toUpperCase());
    if (!r) throw new Error("ROOM_NOT_FOUND");
    const requestId = Date.now() + "";
    r.context.screenshotRequestId = requestId;
    r.context.screenshotRequestedAt = now();
    r.context.frameSource = "request-pending";
    applyAssistantName(r, args);
    r.context.actor = args.actor || defaultAssistant(r);
    r.updatedAt = now();
    return { ok:true, requestId, requestedAt:r.context.screenshotRequestedAt, room:pub(r) };
  }

  if (name === "get_viewing_context") {
    const r = rooms.get(String(args.room || args.room_id || "").toUpperCase());
    if (!r) throw new Error("ROOM_NOT_FOUND");
    return { room: pub(r), context: compactContext(r.context, Boolean(args.includeScreenshot)) };
  }

  if (name === "generate_card") {
    const r = ensure(args.room || args.room_id);
    applyAssistantName(r, args);
    r.card = {
      title: args.title || r.title,
      rating: args.rating || 4.5,
      template: args.template || "ticket",
      partner: args.partner || r.partner || "",
      mood: args.mood || r.mood || "",
      inviteNote: args.inviteNote || r.inviteNote || "",
      quote: args.quote || "",
      note: args.note || "",
      zhiQuote: args.viewerAQuote || args.zhiQuote || args.userQuote || "",
      linQuote: args.viewerBQuote || args.linQuote || args.aiQuote || args.quote || "",
      zhiNote: args.viewerANote || args.zhiNote || args.userNote || "",
      linNote: args.viewerBNote || args.linNote || args.aiNote || args.note || "",
      generatedAt: now()
    };
    r.updatedAt = now();
    return { card: r.card, room: pub(r) };
  }

  throw new Error("UNKNOWN_TOOL: " + name);
}

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function handleMcpMessage(req, msg) {
  const id = msg.id;
  const method = msg.method || msg.tool || msg.name;
  const params = msg.params || {};
  const args = params.arguments || params || msg.arguments || {};

  // notifications usually have no id; do not answer them
  if (!id && method && method.startsWith("notifications/")) return null;

  if (method === "initialize") {
    return rpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: {
        name: "映屿 CineIsle · Viewing Context",
        version: "0.4.3-sleep-guard"
      }
    });
  }

  if (method === "tools/list" || method === "list_tools") {
    return rpcResult(id, { tools: mcpTools() });
  }

  if (method === "tools/call") {
    if (!isAuthed(req)) return rpcError(id, -32001, "CINEISLE_BAD_TOKEN");
    const toolName = params.name;
    const toolArgs = params.arguments || {};
    try {
      const result = callCinemaTool(toolName, toolArgs);
      return rpcResult(id, mcpPayload(result));
    } catch (e) {
      return rpcError(id, -32000, e.message);
    }
  }

  // 兼容旧写法：直接 method=create_room / send_room_message
  if (["create_room", "get_room_state", "send_room_message", "control_playback", "add_note", "generate_card", "get_viewing_context", "request_screenshot"].includes(method)) {
    if (!isAuthed(req)) return rpcError(id || 1, -32001, "CINEISLE_BAD_TOKEN");
    try {
      const result = callCinemaTool(method, args);
      return id ? rpcResult(id, mcpPayload(result)) : { ok: true, result };
    } catch (e) {
      return id ? rpcError(id, -32000, e.message) : { ok: false, error: e.message };
    }
  }

  return rpcError(id || 1, -32601, "Method not found: " + method);
}

app.get("/mcp", (req, res) => {
  res.type("text/plain").send("CineIsle MCP endpoint is running. Use POST JSON-RPC.");
});

app.post("/mcp", (req, res) => {
  try {
    const body = req.body || {};
    if (Array.isArray(body)) {
      const out = body.map(msg => handleMcpMessage(req, msg)).filter(Boolean);
      if (out.length === 0) return res.status(204).end();
      return res.json(out);
    }
    const out = handleMcpMessage(req, body);
    if (!out) return res.status(204).end();
    return res.json(out);
  } catch (e) {
    return res.status(500).json(rpcError(1, -32000, e.message));
  }
});

app.listen(PORT, () => console.log(`CineIsle server: http://localhost:${PORT}`));
