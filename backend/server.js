// ══════════════════════════════════════════════════════════════════════════════
// SQLVisual Backend — server.js
// Node.js + Express + SQLite + 네이버 OAuth 2.0
// ══════════════════════════════════════════════════════════════════════════════
import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import axios from "axios";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = Number(process.env.PORT || 3001);

// ── 환경변수 ──────────────────────────────────────────────────────────────────
// 실제 배포 시 .env 파일에 넣고 dotenv로 불러오세요
const CONFIG = {
  JWT_SECRET:          process.env.JWT_SECRET          || "sqlvisual_jwt_secret_2024",
  NAVER_CLIENT_ID:     process.env.NAVER_CLIENT_ID     || "YOUR_NAVER_CLIENT_ID",
  NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET || "YOUR_NAVER_CLIENT_SECRET",
  NAVER_CALLBACK_URL:  process.env.NAVER_CALLBACK_URL  || "http://localhost:3001/api/auth/naver/callback",
  FRONTEND_URL:        process.env.FRONTEND_URL        || "http://localhost:5173",
  CORS_ORIGINS:        process.env.CORS_ORIGINS        || process.env.FRONTEND_URL || "http://localhost:5173",
};

const allowedOrigins = CONFIG.CORS_ORIGINS
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

function requireConfig(name, value) {
  if (!value || value.startsWith("YOUR_")) {
    console.warn(`⚠️  ${name} 환경변수를 설정해야 해당 기능이 정상 동작합니다.`);
  }
}

requireConfig("NAVER_CLIENT_ID", CONFIG.NAVER_CLIENT_ID);
requireConfig("NAVER_CLIENT_SECRET", CONFIG.NAVER_CLIENT_SECRET);

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS 차단: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

// ── SQLite DB ─────────────────────────────────────────────────────────────────
const db = new Database(join(__dirname, "sqlvisual.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    naver_id      TEXT UNIQUE,
    username      TEXT NOT NULL,
    email         TEXT,
    profile_image TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sql_documents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    title      TEXT NOT NULL DEFAULT '제목 없음',
    sql_code   TEXT DEFAULT '',
    memo       TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS sql_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    sql_code    TEXT,
    executed_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// ── JWT 미들웨어 ──────────────────────────────────────────────────────────────
function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "로그인이 필요합니다." });
  try { req.user = jwt.verify(token, CONFIG.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "인증이 만료되었습니다. 다시 로그인하세요." }); }
}

// ══════════════════════════════════════════════════════════════════════════════
// 네이버 OAuth
// ══════════════════════════════════════════════════════════════════════════════

// Step 1: 로그인 URL 생성
app.get("/api/auth/naver", (req, res) => {
  const state = Math.random().toString(36).substring(2);
  const params = new URLSearchParams({
    response_type: "code",
    client_id:     CONFIG.NAVER_CLIENT_ID,
    redirect_uri:  CONFIG.NAVER_CALLBACK_URL,
    state,
  });
  res.json({ url: `https://nid.naver.com/oauth2.0/authorize?${params}` });
});

// Step 2: 콜백 처리
app.get("/api/auth/naver/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect(`${CONFIG.FRONTEND_URL}/login?error=cancelled`);
  try {
    // 네이버에서 액세스 토큰 받기
    const tokenRes = await axios.post("https://nid.naver.com/oauth2.0/token", null, {
      params: { grant_type: "authorization_code", client_id: CONFIG.NAVER_CLIENT_ID, client_secret: CONFIG.NAVER_CLIENT_SECRET, code, state },
    });
    const { access_token } = tokenRes.data;

    // 사용자 프로필 받기
    const profileRes = await axios.get("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const { id: naverId, nickname, email, profile_image } = profileRes.data.response;

    // DB upsert
    const existing = db.prepare("SELECT * FROM users WHERE naver_id = ?").get(naverId);
    let userId;
    if (existing) {
      db.prepare("UPDATE users SET username=?, email=?, profile_image=?, updated_at=datetime('now') WHERE naver_id=?")
        .run(nickname || "사용자", email, profile_image, naverId);
      userId = existing.id;
    } else {
      const r = db.prepare("INSERT INTO users (naver_id, username, email, profile_image) VALUES (?,?,?,?)").run(naverId, nickname || "사용자", email, profile_image);
      userId = r.lastInsertRowid;
      db.prepare("INSERT INTO sql_documents (user_id, title, sql_code) VALUES (?,?,?)").run(userId, "첫 번째 문서",
        "-- SQL 작성을 시작해보세요!\n\nCREATE TABLE student (\n  student_id INT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL,\n  age INT\n);\n\nSELECT * FROM student;");
    }

    const token = jwt.sign({ id: userId, username: nickname || "사용자", email, profile_image }, CONFIG.JWT_SECRET, { expiresIn: "7d" });
    res.redirect(`${CONFIG.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) {
    console.error("네이버 OAuth 오류:", err.message);
    res.redirect(`${CONFIG.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "SQLVisual API" });
});

app.get("/api/auth/me", auth, (req, res) => {
  const user = db.prepare("SELECT id, username, email, profile_image, created_at FROM users WHERE id=?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
  res.json(user);
});

// ══════════════════════════════════════════════════════════════════════════════
// 문서 API
// ══════════════════════════════════════════════════════════════════════════════
app.get("/api/docs",      auth, (req, res) => res.json(db.prepare("SELECT id,title,memo,created_at,updated_at FROM sql_documents WHERE user_id=? ORDER BY updated_at DESC").all(req.user.id)));
app.get("/api/docs/:id",  auth, (req, res) => { const d = db.prepare("SELECT * FROM sql_documents WHERE id=? AND user_id=?").get(req.params.id, req.user.id); d ? res.json(d) : res.status(404).json({ error: "문서를 찾을 수 없습니다." }); });
app.post("/api/docs",     auth, (req, res) => { const { title="새 문서", sql_code="", memo="" } = req.body; const r = db.prepare("INSERT INTO sql_documents (user_id,title,sql_code,memo) VALUES (?,?,?,?)").run(req.user.id,title,sql_code,memo); res.status(201).json(db.prepare("SELECT * FROM sql_documents WHERE id=?").get(r.lastInsertRowid)); });
app.put("/api/docs/:id",  auth, (req, res) => { const { title, sql_code, memo } = req.body; if (!db.prepare("SELECT id FROM sql_documents WHERE id=? AND user_id=?").get(req.params.id,req.user.id)) return res.status(404).json({error:"문서를 찾을 수 없습니다."}); db.prepare("UPDATE sql_documents SET title=COALESCE(?,title), sql_code=COALESCE(?,sql_code), memo=COALESCE(?,memo), updated_at=datetime('now') WHERE id=?").run(title,sql_code,memo,req.params.id); res.json({ok:true}); });
app.delete("/api/docs/:id",auth,(req,res)=>{ if(!db.prepare("SELECT id FROM sql_documents WHERE id=? AND user_id=?").get(req.params.id,req.user.id)) return res.status(404).json({error:"문서를 찾을 수 없습니다."}); db.prepare("DELETE FROM sql_documents WHERE id=?").run(req.params.id); res.json({ok:true}); });

// SQL 실행 기록
app.post("/api/history", auth, (req, res) => {
  db.prepare("INSERT INTO sql_history (user_id, sql_code) VALUES (?,?)").run(req.user.id, req.body.sql_code);
  db.prepare("DELETE FROM sql_history WHERE user_id=? AND id NOT IN (SELECT id FROM sql_history WHERE user_id=? ORDER BY executed_at DESC LIMIT 20)").run(req.user.id, req.user.id);
  res.json({ ok: true });
});
app.get("/api/history", auth, (req, res) => res.json(db.prepare("SELECT * FROM sql_history WHERE user_id=? ORDER BY executed_at DESC LIMIT 20").all(req.user.id)));

app.listen(PORT, () => {
  console.log(`✅ SQLVisual API: http://localhost:${PORT}`);
  console.log(`📌 네이버 콜백 URL 등록 필요: ${CONFIG.NAVER_CALLBACK_URL}`);
});
