import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import axios from "axios";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);
const DATA_FILE = join(__dirname, "sqlvisual-data.json");

const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || "sqlvisual_jwt_secret_2024",
  NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID || "YOUR_NAVER_CLIENT_ID",
  NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET || "YOUR_NAVER_CLIENT_SECRET",
  NAVER_CALLBACK_URL: process.env.NAVER_CALLBACK_URL || "http://localhost:3001/api/auth/naver/callback",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173/sql-visual/",
  CORS_ORIGINS: process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,https://jiwon0524.github.io",
};

const allowedOrigins = CONFIG.CORS_ORIGINS.split(",").map(origin => origin.trim()).filter(Boolean);

function isPlaceholder(value) {
  return !value || /^(YOUR_|your_|여기에)/.test(value);
}

function isNaverConfigured() {
  return !isPlaceholder(CONFIG.NAVER_CLIENT_ID) && !isPlaceholder(CONFIG.NAVER_CLIENT_SECRET);
}

function originOf(value) {
  try { return new URL(value).origin; }
  catch { return null; }
}

function safeReturnTo(value) {
  const fallback = CONFIG.FRONTEND_URL;
  if (!value) return fallback;
  const allowed = new Set([CONFIG.FRONTEND_URL, ...allowedOrigins].map(originOf).filter(Boolean));
  try {
    const url = new URL(value);
    return allowed.has(url.origin) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function encodeState(returnTo) {
  const raw = Buffer.from(JSON.stringify({ nonce: Math.random().toString(36).slice(2), returnTo })).toString("base64");
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeStateReturnTo(state) {
  if (!state) return CONFIG.FRONTEND_URL;
  try {
    const normalized = String(state).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    const parsed = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    return safeReturnTo(parsed.returnTo);
  } catch {
    return CONFIG.FRONTEND_URL;
  }
}

function withQuery(target, key, value) {
  const url = new URL(target);
  url.searchParams.set(key, value);
  return url.toString();
}

function emptyStore() {
  return { counters: { user: 1, doc: 1, history: 1 }, users: [], docs: [], history: [] };
}

function loadStore() {
  if (!existsSync(DATA_FILE)) return emptyStore();
  try {
    return { ...emptyStore(), ...JSON.parse(readFileSync(DATA_FILE, "utf8")) };
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

function now() {
  return new Date().toISOString();
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "로그인이 필요합니다." });
  try {
    req.user = jwt.verify(token, CONFIG.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "인증이 만료되었습니다. 다시 로그인하세요." });
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS 차단: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "SQLVisual API", naverConfigured: isNaverConfigured(), store: "json" });
});

app.get("/api/auth/naver", (req, res) => {
  if (!isNaverConfigured()) {
    return res.status(503).json({ error: "NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경변수를 설정해야 합니다." });
  }

  const returnTo = safeReturnTo(req.query.returnTo);
  const state = encodeState(returnTo);
  const params = {
    response_type: "code",
    client_id: CONFIG.NAVER_CLIENT_ID,
    redirect_uri: CONFIG.NAVER_CALLBACK_URL,
    state,
  };
  if (req.query.authType === "reauthenticate") {
    params.auth_type = "reauthenticate";
  }
  res.json({ url: `https://nid.naver.com/oauth2.0/authorize?${new URLSearchParams(params)}` });
});

app.get("/api/auth/naver/callback", async (req, res) => {
  const { code, state } = req.query;
  const returnTo = decodeStateReturnTo(state);
  if (!code) return res.redirect(withQuery(returnTo, "error", "cancelled"));

  try {
    const tokenRes = await axios.post("https://nid.naver.com/oauth2.0/token", null, {
      params: {
        grant_type: "authorization_code",
        client_id: CONFIG.NAVER_CLIENT_ID,
        client_secret: CONFIG.NAVER_CLIENT_SECRET,
        code,
        state,
      },
    });

    const profileRes = await axios.get("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });

    const { id: naverId, nickname, email, profile_image } = profileRes.data.response;
    const store = loadStore();
    const stamp = now();
    let user = store.users.find(item => item.naver_id === naverId);

    if (user) {
      Object.assign(user, { username: nickname || "사용자", email, profile_image, updated_at: stamp });
    } else {
      user = { id: store.counters.user++, naver_id: naverId, username: nickname || "사용자", email, profile_image, created_at: stamp, updated_at: stamp };
      store.users.push(user);
      store.docs.push({
        id: store.counters.doc++,
        user_id: user.id,
        title: "첫 번째 문서",
        sql_code: "-- SQL 작성을 시작해보세요.\n\nCREATE TABLE student (\n  student_id INT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL,\n  age INT\n);\n\nSELECT * FROM student;",
        memo: "",
        created_at: stamp,
        updated_at: stamp,
      });
    }

    saveStore(store);
    const appToken = jwt.sign({ id: user.id, username: user.username, email: user.email, profile_image: user.profile_image }, CONFIG.JWT_SECRET, { expiresIn: "7d" });
    res.redirect(withQuery(returnTo, "token", appToken));
  } catch (err) {
    console.error("네이버 OAuth 오류:", err.response?.data || err.message);
    res.redirect(withQuery(returnTo, "error", "oauth_failed"));
  }
});

app.get("/api/auth/me", auth, (req, res) => {
  const user = loadStore().users.find(item => item.id === req.user.id);
  if (!user) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
  res.json({ id: user.id, username: user.username, email: user.email, profile_image: user.profile_image, created_at: user.created_at });
});

app.get("/api/docs", auth, (req, res) => {
  const docs = loadStore().docs
    .filter(doc => doc.user_id === req.user.id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(({ sql_code, ...doc }) => doc);
  res.json(docs);
});

app.get("/api/docs/:id", auth, (req, res) => {
  const doc = loadStore().docs.find(item => item.id === Number(req.params.id) && item.user_id === req.user.id);
  if (!doc) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });
  res.json(doc);
});

app.post("/api/docs", auth, (req, res) => {
  const store = loadStore();
  const stamp = now();
  const doc = {
    id: store.counters.doc++,
    user_id: req.user.id,
    title: req.body.title || "새 문서",
    sql_code: req.body.sql_code || "",
    memo: req.body.memo || "",
    created_at: stamp,
    updated_at: stamp,
  };
  store.docs.push(doc);
  saveStore(store);
  res.status(201).json(doc);
});

app.put("/api/docs/:id", auth, (req, res) => {
  const store = loadStore();
  const doc = store.docs.find(item => item.id === Number(req.params.id) && item.user_id === req.user.id);
  if (!doc) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });
  if (req.body.title !== undefined) doc.title = req.body.title;
  if (req.body.sql_code !== undefined) doc.sql_code = req.body.sql_code;
  if (req.body.memo !== undefined) doc.memo = req.body.memo;
  doc.updated_at = now();
  saveStore(store);
  res.json({ ok: true });
});

app.delete("/api/docs/:id", auth, (req, res) => {
  const store = loadStore();
  const before = store.docs.length;
  store.docs = store.docs.filter(item => !(item.id === Number(req.params.id) && item.user_id === req.user.id));
  if (store.docs.length === before) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });
  saveStore(store);
  res.json({ ok: true });
});

app.post("/api/history", auth, (req, res) => {
  const store = loadStore();
  store.history.unshift({ id: store.counters.history++, user_id: req.user.id, sql_code: req.body.sql_code || "", executed_at: now() });
  store.history = store.history.filter(item => item.user_id !== req.user.id).concat(store.history.filter(item => item.user_id === req.user.id).slice(0, 20));
  saveStore(store);
  res.json({ ok: true });
});

app.get("/api/history", auth, (req, res) => {
  res.json(loadStore().history.filter(item => item.user_id === req.user.id).sort((a, b) => b.executed_at.localeCompare(a.executed_at)).slice(0, 20));
});

app.listen(PORT, () => {
  console.log(`SQLVisual API: http://localhost:${PORT}`);
  console.log(`Naver callback URL: ${CONFIG.NAVER_CALLBACK_URL}`);
});
