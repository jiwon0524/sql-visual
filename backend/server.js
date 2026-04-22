// ── server.js ─────────────────────────────────────────────────────────────────
// 백엔드 진입점: Express 서버 설정
// 실행: node server.js (또는 nodemon server.js)

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3001;
const JWT_SECRET = process.env.JWT_SECRET || "sqlvisual_secret_2024";

// ── 미들웨어 ──────────────────────────────────────────────────────────────────
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

// ── DB 초기화 ─────────────────────────────────────────────────────────────────
const db = new Database(join(__dirname, "sqlvisual.db"));

// 테이블 생성 (없으면 자동 생성)
db.exec(`
  -- 사용자 테이블
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- SQL 문서 테이블
  CREATE TABLE IF NOT EXISTS sql_documents (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    title       TEXT NOT NULL DEFAULT '제목 없음',
    sql_code    TEXT DEFAULT '',
    memo        TEXT DEFAULT '',
    updated_at  TEXT DEFAULT (datetime('now')),
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- 최근 작업 기록 테이블
  CREATE TABLE IF NOT EXISTS recent_activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    doc_id      INTEGER,
    action      TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (doc_id) REFERENCES sql_documents(id)
  );
`);

// ── JWT 인증 미들웨어 ─────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "로그인이 필요합니다." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "인증이 만료되었습니다. 다시 로그인하세요." });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH API
// ══════════════════════════════════════════════════════════════════════════════

// 회원가입
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "아이디와 비밀번호를 입력하세요." });
  if (username.length < 3)
    return res.status(400).json({ error: "아이디는 3자 이상이어야 합니다." });
  if (password.length < 4)
    return res.status(400).json({ error: "비밀번호는 4자 이상이어야 합니다." });

  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return res.status(400).json({ error: "이미 사용 중인 아이디입니다." });

  const hashed = bcrypt.hashSync(password, 10);
  const result = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hashed);

  // 기본 문서 생성
  db.prepare("INSERT INTO sql_documents (user_id, title, sql_code) VALUES (?, ?, ?)").run(
    result.lastInsertRowid, "첫 번째 SQL 문서",
    "-- 안녕하세요! SQL을 작성해보세요.\n-- 예시:\nCREATE TABLE student (\n  student_id INT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL,\n  age INT\n);"
  );

  const token = jwt.sign({ id: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, username });
});

// 로그인
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "아이디와 비밀번호를 입력하세요." });

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, username: user.username });
});

// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENTS API
// ══════════════════════════════════════════════════════════════════════════════

// 문서 목록 조회
app.get("/api/docs", authMiddleware, (req, res) => {
  const docs = db.prepare(
    "SELECT id, title, memo, updated_at, created_at FROM sql_documents WHERE user_id = ? ORDER BY updated_at DESC"
  ).all(req.user.id);
  res.json(docs);
});

// 문서 단건 조회
app.get("/api/docs/:id", authMiddleware, (req, res) => {
  const doc = db.prepare("SELECT * FROM sql_documents WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });
  res.json(doc);
});

// 새 문서 생성
app.post("/api/docs", authMiddleware, (req, res) => {
  const { title = "제목 없음", sql_code = "", memo = "" } = req.body;
  const result = db.prepare(
    "INSERT INTO sql_documents (user_id, title, sql_code, memo) VALUES (?, ?, ?, ?)"
  ).run(req.user.id, title, sql_code, memo);
  const doc = db.prepare("SELECT * FROM sql_documents WHERE id = ?").get(result.lastInsertRowid);
  res.json(doc);
});

// 문서 저장 (수정)
app.put("/api/docs/:id", authMiddleware, (req, res) => {
  const { title, sql_code, memo } = req.body;
  const doc = db.prepare("SELECT * FROM sql_documents WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });

  db.prepare(
    "UPDATE sql_documents SET title = ?, sql_code = ?, memo = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title ?? doc.title, sql_code ?? doc.sql_code, memo ?? doc.memo, req.params.id);

  // 최근 활동 기록
  db.prepare("INSERT INTO recent_activity (user_id, doc_id, action) VALUES (?, ?, ?)").run(req.user.id, req.params.id, "save");

  res.json({ ok: true });
});

// 문서 삭제
app.delete("/api/docs/:id", authMiddleware, (req, res) => {
  const doc = db.prepare("SELECT * FROM sql_documents WHERE id = ? AND user_id = ?").get(req.params.id, req.user.id);
  if (!doc) return res.status(404).json({ error: "문서를 찾을 수 없습니다." });
  db.prepare("DELETE FROM sql_documents WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// 최근 활동 조회
app.get("/api/activity", authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT ra.*, sd.title FROM recent_activity ra
    LEFT JOIN sql_documents sd ON ra.doc_id = sd.id
    WHERE ra.user_id = ? ORDER BY ra.created_at DESC LIMIT 10
  `).all(req.user.id);
  res.json(rows);
});

// ── 서버 시작 ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`✅ SQLVisual API: http://localhost:${PORT}`));
