import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import axios from "axios";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

let DatabaseSync = null;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
} catch {
  DatabaseSync = null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);
const PUBLIC_FRONTEND_URL = "https://jiwon0524.github.io/sql-visual/";
const PUBLIC_BACKEND_URL = "https://sql-visual.onrender.com";
const DEPLOY_CALLBACK_URL = `${PUBLIC_BACKEND_URL}/api/auth/naver/callback`;
const DEFAULT_CORS_ORIGINS = "https://jiwon0524.github.io,http://localhost:5173,http://127.0.0.1:5173";
const RENDER_DISK_DIR = "/var/data";
const DEFAULT_DATA_FILE = existsSync(RENDER_DISK_DIR) ? join(RENDER_DISK_DIR, "sqlvisual-data.json") : join(__dirname, "sqlvisual-data.json");
const DATA_FILE = process.env.DATA_FILE || DEFAULT_DATA_FILE;
const DEFAULT_SQLITE_FILE = /\.json$/i.test(DATA_FILE) ? DATA_FILE.replace(/\.json$/i, ".sqlite") : `${DATA_FILE}.sqlite`;
const SQLITE_FILE = process.env.SQLITE_FILE || DEFAULT_SQLITE_FILE;
const REQUESTED_STORE_ENGINE = String(process.env.STORE_ENGINE || (DatabaseSync ? "sqlite" : "json")).toLowerCase();
const USE_SQLITE_STORE = REQUESTED_STORE_ENGINE === "sqlite" && Boolean(DatabaseSync);
let sqliteStore = null;
const AUTH_COOKIE_NAME = "sv_session";
const IS_PRODUCTION = process.env.NODE_ENV === "production" || Boolean(process.env.RENDER_EXTERNAL_URL);
const LOGIN_HANDOFF_PURPOSE = "login_handoff";

const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || "sqlvisual_jwt_secret_2024",
  NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID || "YOUR_NAVER_CLIENT_ID",
  NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET || "YOUR_NAVER_CLIENT_SECRET",
  NAVER_CALLBACK_URL: process.env.NAVER_CALLBACK_URL || DEPLOY_CALLBACK_URL,
  FRONTEND_URL: process.env.FRONTEND_URL || PUBLIC_FRONTEND_URL,
  CORS_ORIGINS: process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS,
};

const allowedOrigins = [...new Set(
  `${DEFAULT_CORS_ORIGINS},${CONFIG.CORS_ORIGINS}`.split(",").map(origin => origin.trim()).filter(Boolean)
)];

function isAdminUser() {
  return false;
}

function isPlaceholder(value) {
  return !value || /^(YOUR_|your_)/.test(value);
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

function createLoginCode(user) {
  return jwt.sign({ purpose: LOGIN_HANDOFF_PURPOSE, id: user.id }, CONFIG.JWT_SECRET, { expiresIn: "2m" });
}

function consumeLoginCode(code) {
  try {
    const payload = jwt.verify(String(code || ""), CONFIG.JWT_SECRET);
    if (payload.purpose !== LOGIN_HANDOFF_PURPOSE) return null;
    const user = findUser(loadStore(), payload.id);
    return user ? signUser(user) : null;
  } catch {
    return null;
  }
}

function now() {
  return new Date().toISOString();
}

function emptyStore() {
  return {
    counters: { user: 1, doc: 1, history: 1, shared: 1, comment: 1, report: 1 },
    users: [],
    docs: [],
    history: [],
    shared_documents: [],
    comments: [],
    likes: [],
    reports: [],
  };
}

function migrateStore(store) {
  const base = emptyStore();
  const next = {
    ...base,
    ...store,
    counters: { ...base.counters, ...(store.counters || {}) },
    users: Array.isArray(store.users) ? store.users : [],
    docs: Array.isArray(store.docs) ? store.docs : [],
    history: Array.isArray(store.history) ? store.history : [],
    shared_documents: Array.isArray(store.shared_documents) ? store.shared_documents : [],
    comments: Array.isArray(store.comments) ? store.comments : [],
    likes: Array.isArray(store.likes) ? store.likes : [],
    reports: Array.isArray(store.reports) ? store.reports : [],
  };

  next.users = next.users.map(user => ({
    ...user,
    display_name: user.display_name ?? null,
    username: user.username ?? user.display_name ?? null,
    is_blocked: Boolean(user.is_blocked),
    blocked_reason: user.blocked_reason ?? null,
    blocked_at: user.blocked_at ?? null,
    blocked_by: user.blocked_by ?? null,
  }));
  next.docs = next.docs.map(doc => ({
    description: "",
    tags: [],
    is_public: false,
    shared_id: null,
    ...doc,
  }));
  next.shared_documents = next.shared_documents.map(doc => ({
    description: "",
    tags: [],
    schema: [],
    is_public: true,
    view_count: 0,
    like_count: 0,
    is_hidden: false,
    moderation_reason: "",
    moderated_by: null,
    moderated_at: null,
    ...doc,
  }));
  next.comments = next.comments.map(comment => ({
    is_hidden: false,
    moderation_reason: "",
    moderated_by: null,
    moderated_at: null,
    ...comment,
  }));
  next.reports = next.reports.map(report => ({
    target_type: "shared",
    reason: "other",
    details: "",
    status: "open",
    created_at: now(),
    updated_at: now(),
    reviewed_by: null,
    reviewed_at: null,
    ...report,
  }));
  return next;
}

function loadJsonStore() {
  if (!existsSync(DATA_FILE)) return emptyStore();
  try {
    return migrateStore(JSON.parse(readFileSync(DATA_FILE, "utf8")));
  } catch (err) {
    try {
      copyFileSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
    } catch (copyErr) {
      console.error("Failed to back up corrupt data file:", copyErr.message);
    }
    const storeErr = new Error("Data store is corrupted. A backup was created and writes are blocked until it is repaired.");
    storeErr.status = 500;
    storeErr.code = "DATA_STORE_CORRUPT";
    storeErr.cause = err;
    throw storeErr;
  }
}

function saveJsonStore(store) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const payload = JSON.stringify(migrateStore(store), null, 2);
  const tempFile = `${DATA_FILE}.${process.pid}.tmp`;
  if (existsSync(DATA_FILE)) {
    try {
      copyFileSync(DATA_FILE, `${DATA_FILE}.bak`);
    } catch (err) {
      console.error("Failed to create data file backup:", err.message);
    }
  }
  writeFileSync(tempFile, payload);
  renameSync(tempFile, DATA_FILE);
}

function jsonField(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || "");
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function boolField(value) {
  return Boolean(Number(value || 0));
}

function hasStoreData(store) {
  return ["users", "docs", "history", "shared_documents", "comments", "likes", "reports"]
    .some(key => Array.isArray(store[key]) && store[key].length > 0);
}

function sqliteColumns(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map(row => row.name));
}

function addSqliteColumnIfMissing(db, tableName, columnName, definition) {
  if (!sqliteColumns(db, tableName).has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function markSqliteMigration(db, version, name) {
  const exists = db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(version);
  if (!exists) {
    db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(version, name, now());
  }
}

function runSqliteMigrations(db) {
  addSqliteColumnIfMissing(db, "users", "is_blocked", "INTEGER NOT NULL DEFAULT 0");
  addSqliteColumnIfMissing(db, "users", "blocked_reason", "TEXT");
  addSqliteColumnIfMissing(db, "users", "blocked_at", "TEXT");
  addSqliteColumnIfMissing(db, "users", "blocked_by", "INTEGER");
  addSqliteColumnIfMissing(db, "shared_documents", "is_hidden", "INTEGER NOT NULL DEFAULT 0");
  addSqliteColumnIfMissing(db, "shared_documents", "moderation_reason", "TEXT NOT NULL DEFAULT ''");
  addSqliteColumnIfMissing(db, "shared_documents", "moderated_by", "INTEGER");
  addSqliteColumnIfMissing(db, "shared_documents", "moderated_at", "TEXT");
  addSqliteColumnIfMissing(db, "comments", "is_hidden", "INTEGER NOT NULL DEFAULT 0");
  addSqliteColumnIfMissing(db, "comments", "moderation_reason", "TEXT NOT NULL DEFAULT ''");
  addSqliteColumnIfMissing(db, "comments", "moderated_by", "INTEGER");
  addSqliteColumnIfMissing(db, "comments", "moderated_at", "TEXT");
  markSqliteMigration(db, 1, "moderation columns");
  markSqliteMigration(db, 2, "reports table");
}

function ensureSqliteStore() {
  if (!USE_SQLITE_STORE) return null;
  if (sqliteStore) return sqliteStore;

  mkdirSync(dirname(SQLITE_FILE), { recursive: true });
  sqliteStore = new DatabaseSync(SQLITE_FILE);
  sqliteStore.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      naver_id TEXT UNIQUE,
      email TEXT,
      display_name TEXT,
      username TEXT,
      profile_image TEXT,
      is_blocked INTEGER NOT NULL DEFAULT 0,
      blocked_reason TEXT,
      blocked_at TEXT,
      blocked_by INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS docs (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      sql_code TEXT NOT NULL,
      memo TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      is_public INTEGER NOT NULL DEFAULT 0,
      shared_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shared_documents (
      id INTEGER PRIMARY KEY,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      sql_code TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      tags_json TEXT NOT NULL DEFAULT '[]',
      schema_json TEXT NOT NULL DEFAULT '[]',
      is_public INTEGER NOT NULL DEFAULT 1,
      view_count INTEGER NOT NULL DEFAULT 0,
      like_count INTEGER NOT NULL DEFAULT 0,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      moderation_reason TEXT NOT NULL DEFAULT '',
      moderated_by INTEGER,
      moderated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sql_code TEXT NOT NULL,
      executed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY,
      shared_document_id INTEGER NOT NULL REFERENCES shared_documents(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      is_hidden INTEGER NOT NULL DEFAULT 0,
      moderation_reason TEXT NOT NULL DEFAULT '',
      moderated_by INTEGER,
      moderated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS likes (
      shared_document_id INTEGER NOT NULL REFERENCES shared_documents(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (shared_document_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      reason TEXT NOT NULL DEFAULT 'other',
      details TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      reviewed_by INTEGER,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_docs_user_updated ON docs(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_public_updated ON shared_documents(is_public, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_shared_owner ON shared_documents(owner_id);
    CREATE INDEX IF NOT EXISTS idx_comments_shared ON comments(shared_document_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, executed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at DESC);
  `);
  runSqliteMigrations(sqliteStore);
  sqliteStore.exec(`
    CREATE INDEX IF NOT EXISTS idx_shared_hidden_updated ON shared_documents(is_hidden, updated_at DESC);
  `);

  const totalRows = Number(sqliteStore.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) +
      (SELECT COUNT(*) FROM docs) +
      (SELECT COUNT(*) FROM shared_documents) +
      (SELECT COUNT(*) FROM history) +
      (SELECT COUNT(*) FROM comments) +
      (SELECT COUNT(*) FROM likes) +
      (SELECT COUNT(*) FROM reports) AS count
  `).get().count || 0);

  if (totalRows === 0 && existsSync(DATA_FILE)) {
    const migrated = loadJsonStore();
    if (hasStoreData(migrated)) writeStoreToSqlite(migrated, sqliteStore);
  }

  return sqliteStore;
}

function loadStoreFromSqlite(db = ensureSqliteStore()) {
  const store = emptyStore();
  store.users = db.prepare("SELECT * FROM users ORDER BY id").all().map(row => ({
    ...row,
    is_blocked: boolField(row.is_blocked),
  }));
  store.docs = db.prepare("SELECT * FROM docs ORDER BY id").all().map(row => {
    const { tags_json, is_public, ...doc } = row;
    return { ...doc, tags: jsonField(tags_json), is_public: boolField(is_public) };
  });
  store.shared_documents = db.prepare("SELECT * FROM shared_documents ORDER BY id").all().map(row => {
    const { tags_json, schema_json, is_public, is_hidden, ...doc } = row;
    return { ...doc, tags: jsonField(tags_json), schema: jsonField(schema_json), is_public: boolField(is_public), is_hidden: boolField(is_hidden) };
  });
  store.history = db.prepare("SELECT * FROM history ORDER BY id").all();
  store.comments = db.prepare("SELECT * FROM comments ORDER BY id").all().map(row => ({
    ...row,
    is_hidden: boolField(row.is_hidden),
  }));
  store.likes = db.prepare("SELECT * FROM likes ORDER BY created_at").all();
  store.reports = db.prepare("SELECT * FROM reports ORDER BY id").all();

  store.counters = {
    user: Math.max(0, ...store.users.map(item => Number(item.id))) + 1,
    doc: Math.max(0, ...store.docs.map(item => Number(item.id))) + 1,
    history: Math.max(0, ...store.history.map(item => Number(item.id))) + 1,
    shared: Math.max(0, ...store.shared_documents.map(item => Number(item.id))) + 1,
    comment: Math.max(0, ...store.comments.map(item => Number(item.id))) + 1,
    report: Math.max(0, ...store.reports.map(item => Number(item.id))) + 1,
  };

  return migrateStore(store);
}

function writeStoreToSqlite(store, db = ensureSqliteStore()) {
  const next = migrateStore(store);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`
      DELETE FROM likes;
      DELETE FROM reports;
      DELETE FROM comments;
      DELETE FROM history;
      DELETE FROM docs;
      DELETE FROM shared_documents;
      DELETE FROM users;
    `);

    const insertUser = db.prepare(`
      INSERT INTO users (id, naver_id, email, display_name, username, profile_image, is_blocked, blocked_reason, blocked_at, blocked_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertDoc = db.prepare(`
      INSERT INTO docs (id, user_id, title, sql_code, memo, description, tags_json, is_public, shared_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertShared = db.prepare(`
      INSERT INTO shared_documents (id, owner_id, title, sql_code, description, tags_json, schema_json, is_public, view_count, like_count, is_hidden, moderation_reason, moderated_by, moderated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertHistory = db.prepare(`
      INSERT INTO history (id, user_id, sql_code, executed_at)
      VALUES (?, ?, ?, ?)
    `);
    const insertComment = db.prepare(`
      INSERT INTO comments (id, shared_document_id, user_id, content, is_hidden, moderation_reason, moderated_by, moderated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertLike = db.prepare(`
      INSERT OR IGNORE INTO likes (shared_document_id, user_id, created_at)
      VALUES (?, ?, ?)
    `);
    const insertReport = db.prepare(`
      INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, reviewed_by, reviewed_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const user of next.users) {
      insertUser.run(user.id, user.naver_id || null, user.email || null, user.display_name || null, user.username || null, user.profile_image || null, user.is_blocked ? 1 : 0, user.blocked_reason || null, user.blocked_at || null, user.blocked_by || null, user.created_at || now(), user.updated_at || now());
    }
    for (const doc of next.docs) {
      insertDoc.run(doc.id, doc.user_id, doc.title || "Untitled query", doc.sql_code || "", doc.memo || "", doc.description || "", JSON.stringify(doc.tags || []), doc.is_public ? 1 : 0, doc.shared_id || null, doc.created_at || now(), doc.updated_at || now());
    }
    for (const shared of next.shared_documents) {
      insertShared.run(shared.id, shared.owner_id, shared.title || "Untitled shared SQL", shared.sql_code || "", shared.description || "", JSON.stringify(shared.tags || []), JSON.stringify(shared.schema || []), shared.is_public ? 1 : 0, Number(shared.view_count || 0), Number(shared.like_count || 0), shared.is_hidden ? 1 : 0, shared.moderation_reason || "", shared.moderated_by || null, shared.moderated_at || null, shared.created_at || now(), shared.updated_at || now());
    }
    for (const item of next.history) {
      insertHistory.run(item.id, item.user_id, item.sql_code || "", item.executed_at || now());
    }
    for (const comment of next.comments) {
      insertComment.run(comment.id, comment.shared_document_id, comment.user_id, comment.content || "", comment.is_hidden ? 1 : 0, comment.moderation_reason || "", comment.moderated_by || null, comment.moderated_at || null, comment.created_at || now(), comment.updated_at || now());
    }
    for (const like of next.likes) {
      insertLike.run(like.shared_document_id, like.user_id, like.created_at || now());
    }
    for (const report of next.reports) {
      insertReport.run(report.id, report.reporter_id, report.target_type || "shared", report.target_id, report.reason || "other", report.details || "", report.status || "open", report.reviewed_by || null, report.reviewed_at || null, report.created_at || now(), report.updated_at || now());
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function loadStore() {
  return USE_SQLITE_STORE ? loadStoreFromSqlite() : loadJsonStore();
}

function saveStore(store) {
  if (USE_SQLITE_STORE) writeStoreToSqlite(store);
  else saveJsonStore(store);
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email || null,
    display_name: user.display_name || null,
    username: user.display_name || user.username || null,
    profile_image: user.profile_image || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
    needs_display_name: !user.display_name,
  };
}

function signUser(user) {
  return jwt.sign(publicUser(user), CONFIG.JWT_SECRET, { expiresIn: "7d" });
}

function findUser(store, id) {
  return store.users.find(item => item.id === Number(id));
}

function parseCookies(header) {
  return String(header || "").split(";").reduce((cookies, part) => {
    const index = part.indexOf("=");
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function requestToken(req) {
  const bearer = req.headers.authorization?.split(" ")[1];
  if (bearer) return bearer;
  return parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME] || "";
}

function cookieOptions(req) {
  const secure = IS_PRODUCTION || req.secure || req.headers["x-forwarded-proto"] === "https";
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

function setSessionCookie(req, res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions(req));
}

function clearSessionCookie(req, res) {
  res.clearCookie(AUTH_COOKIE_NAME, { ...cookieOptions(req), maxAge: undefined });
}

function auth(req, res, next) {
  const token = requestToken(req);
  if (!token) return res.status(401).json({ error: "Login required." });
  try {
    req.user = jwt.verify(token, CONFIG.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

function optionalAuth(req, res, next) {
  const token = requestToken(req);
  if (!token) return next();
  try {
    req.user = jwt.verify(token, CONFIG.JWT_SECRET);
  } catch {
    req.user = null;
  }
  next();
}

function isAdminRequest(req, store) {
  return false;
}

function requireActiveUser(req, res, next) {
  const user = findUser(loadStore(), req.user?.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  next();
}

function requireAdmin(req, res, next) {
  const user = findUser(loadStore(), req.user?.id);
  if (!isAdminUser(user)) return res.status(403).json({ error: "Admin permission required." });
  req.admin = publicUser(user);
  next();
}

function tagList(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean).slice(0, 8);
  return String(value || "").split(",").map(item => item.trim()).filter(Boolean).slice(0, 8);
}

function docSummary(doc, store) {
  const owner = findUser(store, doc.user_id);
  return {
    ...doc,
    author: owner?.display_name || owner?.username || "SQLVisual user",
  };
}

function buildSharedStats(store) {
  const comments = new Map();
  const likes = new Map();
  for (const item of store.comments) {
    if (item.is_hidden) continue;
    comments.set(item.shared_document_id, (comments.get(item.shared_document_id) || 0) + 1);
  }
  for (const item of store.likes) {
    likes.set(item.shared_document_id, (likes.get(item.shared_document_id) || 0) + 1);
  }
  return { comments, likes };
}

function sharedSummary(doc, store, stats = buildSharedStats(store)) {
  const owner = findUser(store, doc.owner_id);
  const comments_count = stats.comments.get(doc.id) || 0;
  const like_count = stats.likes.get(doc.id) || doc.like_count || 0;
  return {
    ...doc,
    author: owner?.display_name || owner?.username || "SQLVisual user",
    comments_count,
    like_count,
  };
}

function ownsShared(doc, userId) {
  return doc && doc.owner_id === Number(userId);
}

function canReadShared(doc, req, store) {
  if (!doc) return false;
  if (isAdminRequest(req, store)) return true;
  if (ownsShared(doc, req.user?.id)) return true;
  return Boolean(doc.is_public && !doc.is_hidden);
}

function intParam(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function securityHeaders(req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  next();
}

function simpleRateLimit({ windowMs, max }) {
  const buckets = new Map();
  return (req, res, next) => {
    const nowMs = Date.now();
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= nowMs) {
      buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - nowMs) / 1000)));
      return res.status(429).json({ error: "Too many requests. Please try again soon." });
    }
    next();
  };
}

app.set("trust proxy", 1);
app.use(securityHeaders);
app.use("/api", simpleRateLimit({ windowMs: 60_000, max: 240 }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use("/api/admin", (req, res) => {
  res.status(404).json({ error: "Admin features are disabled." });
});
app.use("/api/reports", (req, res) => {
  res.status(404).json({ error: "Report features are disabled." });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "SQLVisual API",
    naverConfigured: isNaverConfigured(),
    store: USE_SQLITE_STORE ? "sqlite" : "json",
    sqliteAvailable: Boolean(DatabaseSync),
    persistentStore: (USE_SQLITE_STORE ? SQLITE_FILE : DATA_FILE).startsWith(`${RENDER_DISK_DIR}/`),
  });
});

app.get("/api/auth/naver", (req, res) => {
  if (!isNaverConfigured()) {
    return res.status(503).json({ error: "NAVER_CLIENT_ID and NAVER_CLIENT_SECRET are required." });
  }

  const returnTo = safeReturnTo(req.query.returnTo);
  const state = encodeState(returnTo);
  const params = {
    response_type: "code",
    client_id: CONFIG.NAVER_CLIENT_ID,
    redirect_uri: CONFIG.NAVER_CALLBACK_URL,
    state,
  };
  if (req.query.authType === "reauthenticate") params.auth_type = "reauthenticate";
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

    const { id: naverId, email, profile_image } = profileRes.data.response;
    const store = loadStore();
    const stamp = now();
    let user = store.users.find(item => item.naver_id === naverId);

    if (user) {
      Object.assign(user, { email, profile_image, updated_at: stamp });
    } else {
      user = {
        id: store.counters.user++,
        naver_id: naverId,
        email,
        display_name: null,
        username: null,
        profile_image,
        created_at: stamp,
        updated_at: stamp,
      };
      store.users.push(user);
    }

    saveStore(store);
    const token = signUser(user);
    const loginCode = createLoginCode(user);
    setSessionCookie(req, res, token);
    res.redirect(withQuery(withQuery(returnTo, "login", "ok"), "code", loginCode));
  } catch (err) {
    console.error("Naver OAuth error:", err.response?.data || err.message);
    res.redirect(withQuery(returnTo, "error", "oauth_failed"));
  }
});

app.get("/api/me", auth, (req, res) => {
  const user = findUser(loadStore(), req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json(publicUser(user));
});

app.get("/api/auth/me", auth, (req, res) => {
  const user = findUser(loadStore(), req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json(publicUser(user));
});

app.post("/api/auth/logout", (req, res) => {
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.post("/api/auth/session", (req, res) => {
  const token = consumeLoginCode(String(req.body.code || ""));
  if (!token) return res.status(401).json({ error: "Login code expired. Please log in again." });
  try {
    const payload = jwt.verify(token, CONFIG.JWT_SECRET);
    const user = findUser(loadStore(), payload.id);
    if (!user) return res.status(404).json({ error: "User not found." });
    setSessionCookie(req, res, token);
    res.json({ user: publicUser(user), token });
  } catch {
    res.status(401).json({ error: "Login code expired. Please log in again." });
  }
});

app.patch("/api/me/display-name", auth, (req, res) => {
  const displayName = String(req.body.display_name || "").trim().slice(0, 40);
  if (displayName.length < 2) return res.status(400).json({ error: "Display name must be at least 2 characters." });

  const store = loadStore();
  const user = findUser(store, req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  user.display_name = displayName;
  user.username = displayName;
  user.updated_at = now();
  saveStore(store);
  const token = signUser(user);
  setSessionCookie(req, res, token);
  res.json({ user: publicUser(user), token });
});

function listDocuments(req, res) {
  const store = loadStore();
  const docs = store.docs
    .filter(doc => doc.user_id === req.user.id)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .map(doc => docSummary(doc, store));
  res.json(docs);
}

function getDocument(req, res) {
  const store = loadStore();
  const doc = store.docs.find(item => item.id === Number(req.params.id) && item.user_id === req.user.id);
  if (!doc) return res.status(404).json({ error: "Document not found." });
  res.json(docSummary(doc, store));
}

function createDocument(req, res) {
  const store = loadStore();
  const stamp = now();
  const doc = {
    id: store.counters.doc++,
    user_id: req.user.id,
    title: String(req.body.title || "Untitled query").trim().slice(0, 120),
    sql_code: req.body.sql_code || "",
    memo: req.body.memo || req.body.description || "",
    description: req.body.description || req.body.memo || "",
    tags: tagList(req.body.tags),
    is_public: false,
    shared_id: null,
    created_at: stamp,
    updated_at: stamp,
  };
  store.docs.push(doc);
  saveStore(store);
  res.status(201).json(docSummary(doc, store));
}

function patchDocument(req, res) {
  const store = loadStore();
  const doc = store.docs.find(item => item.id === Number(req.params.id) && item.user_id === req.user.id);
  if (!doc) return res.status(404).json({ error: "Document not found." });
  if (req.body.title !== undefined) doc.title = String(req.body.title || "Untitled query").trim().slice(0, 120);
  if (req.body.sql_code !== undefined) doc.sql_code = String(req.body.sql_code || "");
  if (req.body.memo !== undefined) doc.memo = String(req.body.memo || "");
  if (req.body.description !== undefined) doc.description = String(req.body.description || "");
  if (req.body.tags !== undefined) doc.tags = tagList(req.body.tags);
  doc.updated_at = now();
  saveStore(store);
  res.json(docSummary(doc, store));
}

function deleteDocument(req, res) {
  const store = loadStore();
  const before = store.docs.length;
  store.docs = store.docs.filter(item => !(item.id === Number(req.params.id) && item.user_id === req.user.id));
  if (store.docs.length === before) return res.status(404).json({ error: "Document not found." });
  saveStore(store);
  res.json({ ok: true });
}

app.get("/api/documents", auth, listDocuments);
app.post("/api/documents", auth, requireActiveUser, createDocument);
app.get("/api/documents/:id", auth, getDocument);
app.patch("/api/documents/:id", auth, requireActiveUser, patchDocument);
app.delete("/api/documents/:id", auth, deleteDocument);
app.get("/api/docs", auth, listDocuments);
app.post("/api/docs", auth, requireActiveUser, createDocument);
app.get("/api/docs/:id", auth, getDocument);
app.put("/api/docs/:id", auth, requireActiveUser, patchDocument);
app.delete("/api/docs/:id", auth, deleteDocument);

app.post("/api/shared", auth, requireActiveUser, (req, res) => {
  const store = loadStore();
  const stamp = now();
  const shared = {
    id: store.counters.shared++,
    owner_id: req.user.id,
    title: String(req.body.title || "Untitled shared SQL").trim().slice(0, 120),
    sql_code: req.body.sql_code || "",
    description: req.body.description || "",
    tags: tagList(req.body.tags),
    schema: Array.isArray(req.body.schema) ? req.body.schema : [],
    is_public: req.body.is_public !== false,
    view_count: 0,
    like_count: 0,
    created_at: stamp,
    updated_at: stamp,
  };
  store.shared_documents.push(shared);
  if (req.body.document_id) {
    const doc = store.docs.find(item => item.id === Number(req.body.document_id) && item.user_id === req.user.id);
    if (doc) {
      doc.is_public = shared.is_public;
      doc.shared_id = shared.id;
      doc.updated_at = stamp;
    }
  }
  saveStore(store);
  res.status(201).json(sharedSummary(shared, store));
});

app.get("/api/shared", optionalAuth, (req, res) => {
  const store = loadStore();
  const q = String(req.query.q || "").trim().toLowerCase();
  const tag = String(req.query.tag || "").trim().toLowerCase();
  const sort = String(req.query.sort || "latest");
  const limit = intParam(req.query.limit, 50, 1, 100);
  const offset = intParam(req.query.offset, 0, 0, 100000);
  let docs = store.shared_documents.filter(doc => canReadShared(doc, req, store));
  if (q) docs = docs.filter(doc => `${doc.title} ${doc.description} ${doc.sql_code} ${doc.tags.join(" ")}`.toLowerCase().includes(q));
  if (tag) docs = docs.filter(doc => doc.tags.map(item => item.toLowerCase()).includes(tag));
  const stats = buildSharedStats(store);
  docs = docs.map(doc => sharedSummary(doc, store, stats));
  docs.sort((a, b) => {
    if (sort === "popular") return (b.like_count + b.view_count + b.comments_count) - (a.like_count + a.view_count + a.comments_count);
    return b.updated_at.localeCompare(a.updated_at);
  });
  res.setHeader("X-Total-Count", String(docs.length));
  res.setHeader("X-Limit", String(limit));
  res.setHeader("X-Offset", String(offset));
  res.json(docs.slice(offset, offset + limit));
});

app.get("/api/shared/:id", optionalAuth, (req, res) => {
  const store = loadStore();
  const doc = store.shared_documents.find(item => item.id === Number(req.params.id));
  if (!canReadShared(doc, req, store)) return res.status(404).json({ error: "Shared document not found." });
  doc.view_count = Number(doc.view_count || 0) + 1;
  doc.updated_at = doc.updated_at || doc.created_at;
  saveStore(store);
  res.json(sharedSummary(doc, store));
});

app.patch("/api/shared/:id", auth, requireActiveUser, (req, res) => {
  const store = loadStore();
  const doc = store.shared_documents.find(item => item.id === Number(req.params.id));
  if (!ownsShared(doc, req.user.id)) return res.status(404).json({ error: "Shared document not found." });
  if (req.body.title !== undefined) doc.title = String(req.body.title || "Untitled shared SQL").trim().slice(0, 120);
  if (req.body.sql_code !== undefined) doc.sql_code = String(req.body.sql_code || "");
  if (req.body.description !== undefined) doc.description = String(req.body.description || "");
  if (req.body.tags !== undefined) doc.tags = tagList(req.body.tags);
  if (req.body.schema !== undefined) doc.schema = Array.isArray(req.body.schema) ? req.body.schema : [];
  if (req.body.is_public !== undefined) doc.is_public = Boolean(req.body.is_public);
  doc.updated_at = now();
  saveStore(store);
  res.json(sharedSummary(doc, store));
});

app.delete("/api/shared/:id", auth, (req, res) => {
  const store = loadStore();
  const doc = store.shared_documents.find(item => item.id === Number(req.params.id));
  if (!ownsShared(doc, req.user.id)) return res.status(404).json({ error: "Shared document not found." });
  store.shared_documents = store.shared_documents.filter(item => item.id !== doc.id);
  store.comments = store.comments.filter(item => item.shared_document_id !== doc.id);
  store.likes = store.likes.filter(item => item.shared_document_id !== doc.id);
  saveStore(store);
  res.json({ ok: true });
});

app.post("/api/shared/:id/copy", auth, requireActiveUser, (req, res) => {
  const store = loadStore();
  const shared = store.shared_documents.find(item => item.id === Number(req.params.id) && item.is_public && !item.is_hidden);
  if (!shared) return res.status(404).json({ error: "Shared document not found." });
  const stamp = now();
  const doc = {
    id: store.counters.doc++,
    user_id: req.user.id,
    title: `${shared.title} copy`,
    sql_code: shared.sql_code,
    memo: shared.description || "",
    description: shared.description || "",
    tags: [...(shared.tags || [])],
    is_public: false,
    shared_id: null,
    created_at: stamp,
    updated_at: stamp,
  };
  store.docs.push(doc);
  saveStore(store);
  res.status(201).json(docSummary(doc, store));
});

app.post("/api/shared/:id/like", auth, requireActiveUser, (req, res) => {
  const store = loadStore();
  const shared = store.shared_documents.find(item => item.id === Number(req.params.id) && item.is_public && !item.is_hidden);
  if (!shared) return res.status(404).json({ error: "Shared document not found." });
  const existing = store.likes.find(item => item.shared_document_id === shared.id && item.user_id === req.user.id);
  if (existing) store.likes = store.likes.filter(item => item !== existing);
  else store.likes.push({ shared_document_id: shared.id, user_id: req.user.id, created_at: now() });
  saveStore(store);
  res.json(sharedSummary(shared, store));
});

app.get("/api/shared/:id/comments", optionalAuth, (req, res) => {
  const store = loadStore();
  const shared = store.shared_documents.find(item => item.id === Number(req.params.id));
  if (!canReadShared(shared, req, store)) return res.status(404).json({ error: "Shared document not found." });
  const isAdmin = isAdminRequest(req, store);
  const comments = store.comments
    .filter(comment => comment.shared_document_id === shared.id && (isAdmin || !comment.is_hidden))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(comment => ({ ...comment, author: findUser(store, comment.user_id)?.display_name || "SQLVisual user" }));
  res.json(comments);
});

app.post("/api/shared/:id/comments", auth, requireActiveUser, (req, res) => {
  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Comment content is required." });
  const store = loadStore();
  const shared = store.shared_documents.find(item => item.id === Number(req.params.id) && item.is_public && !item.is_hidden);
  if (!shared) return res.status(404).json({ error: "Shared document not found." });
  const stamp = now();
  const comment = {
    id: store.counters.comment++,
    shared_document_id: shared.id,
    user_id: req.user.id,
    content: content.slice(0, 1000),
    created_at: stamp,
    updated_at: stamp,
  };
  store.comments.push(comment);
  saveStore(store);
  res.status(201).json({ ...comment, author: findUser(store, req.user.id)?.display_name || "SQLVisual user" });
});

app.patch("/api/comments/:id", auth, requireActiveUser, (req, res) => {
  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Comment content is required." });
  const store = loadStore();
  const comment = store.comments.find(item => item.id === Number(req.params.id) && item.user_id === req.user.id);
  if (!comment) return res.status(404).json({ error: "Comment not found." });
  comment.content = content.slice(0, 1000);
  comment.updated_at = now();
  saveStore(store);
  res.json({ ...comment, author: findUser(store, req.user.id)?.display_name || "SQLVisual user" });
});

app.delete("/api/comments/:id", auth, (req, res) => {
  const store = loadStore();
  const before = store.comments.length;
  store.comments = store.comments.filter(item => !(item.id === Number(req.params.id) && item.user_id === req.user.id));
  if (store.comments.length === before) return res.status(404).json({ error: "Comment not found." });
  saveStore(store);
  res.json({ ok: true });
});

function userSummary(user) {
  return user ? {
    id: user.id,
    email: user.email || null,
    display_name: user.display_name || null,
    username: user.display_name || user.username || null,
    is_admin: isAdminUser(user),
    is_blocked: Boolean(user.is_blocked),
    blocked_reason: user.blocked_reason || null,
    created_at: user.created_at,
    updated_at: user.updated_at,
  } : null;
}

function findReportTarget(store, req, targetType, targetId) {
  if (targetType === "shared") {
    const shared = store.shared_documents.find(item => item.id === targetId);
    return canReadShared(shared, req, store) ? shared : null;
  }
  if (targetType === "comment") {
    const comment = store.comments.find(item => item.id === targetId && !item.is_hidden);
    if (!comment) return null;
    const shared = store.shared_documents.find(item => item.id === comment.shared_document_id);
    return canReadShared(shared, req, store) ? comment : null;
  }
  return null;
}

function adminSharedItem(doc, store) {
  const summary = sharedSummary(doc, store);
  return {
    ...summary,
    owner: userSummary(findUser(store, doc.owner_id)),
    report_count: store.reports.filter(report => report.target_type === "shared" && report.target_id === doc.id).length,
  };
}

function adminCommentItem(comment, store) {
  const shared = store.shared_documents.find(item => item.id === comment.shared_document_id);
  return {
    ...comment,
    author: userSummary(findUser(store, comment.user_id)),
    shared: shared ? { id: shared.id, title: shared.title, is_hidden: Boolean(shared.is_hidden) } : null,
    report_count: store.reports.filter(report => report.target_type === "comment" && report.target_id === comment.id).length,
  };
}

function adminReportItem(report, store) {
  const reporter = findUser(store, report.reporter_id);
  let target = null;
  if (report.target_type === "shared") {
    const shared = store.shared_documents.find(item => item.id === report.target_id);
    target = shared ? { id: shared.id, title: shared.title, is_hidden: Boolean(shared.is_hidden), owner_id: shared.owner_id } : null;
  } else if (report.target_type === "comment") {
    const comment = store.comments.find(item => item.id === report.target_id);
    const shared = comment ? store.shared_documents.find(item => item.id === comment.shared_document_id) : null;
    target = comment ? { id: comment.id, content: comment.content, is_hidden: Boolean(comment.is_hidden), shared_id: comment.shared_document_id, shared_title: shared?.title || null } : null;
  }
  return {
    ...report,
    reporter: userSummary(reporter),
    target,
  };
}

app.post("/api/reports", auth, requireActiveUser, (req, res) => {
  const targetType = String(req.body.target_type || "shared").trim();
  const targetId = Number(req.body.target_id);
  const reason = String(req.body.reason || "other").trim().slice(0, 40) || "other";
  const details = String(req.body.details || "").trim().slice(0, 1000);
  if (!["shared", "comment"].includes(targetType) || !Number.isFinite(targetId)) {
    return res.status(400).json({ error: "Report target is invalid." });
  }

  const store = loadStore();
  const target = findReportTarget(store, req, targetType, targetId);
  if (!target) return res.status(404).json({ error: "Report target not found." });

  const existing = store.reports.find(item =>
    item.reporter_id === req.user.id &&
    item.target_type === targetType &&
    item.target_id === targetId &&
    item.status === "open"
  );
  const stamp = now();
  if (existing) {
    existing.reason = reason;
    existing.details = details;
    existing.updated_at = stamp;
  } else {
    store.reports.push({
      id: store.counters.report++,
      reporter_id: req.user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      details,
      status: "open",
      reviewed_by: null,
      reviewed_at: null,
      created_at: stamp,
      updated_at: stamp,
    });
  }
  saveStore(store);
  res.status(201).json({ ok: true });
});

app.get("/api/admin/summary", auth, requireAdmin, (req, res) => {
  const store = loadStore();
  res.json({
    users: store.users.length,
    blocked_users: store.users.filter(user => user.is_blocked).length,
    shared_documents: store.shared_documents.length,
    hidden_shared_documents: store.shared_documents.filter(doc => doc.is_hidden).length,
    comments: store.comments.length,
    hidden_comments: store.comments.filter(comment => comment.is_hidden).length,
    open_reports: store.reports.filter(report => report.status === "open").length,
    store: USE_SQLITE_STORE ? "sqlite" : "json",
    persistentStore: (USE_SQLITE_STORE ? SQLITE_FILE : DATA_FILE).startsWith(`${RENDER_DISK_DIR}/`),
  });
});

app.get("/api/admin/reports", auth, requireAdmin, (req, res) => {
  const store = loadStore();
  const status = String(req.query.status || "open");
  let reports = store.reports;
  if (status !== "all") reports = reports.filter(report => report.status === status);
  reports = reports
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, intParam(req.query.limit, 100, 1, 200))
    .map(report => adminReportItem(report, store));
  res.json(reports);
});

app.patch("/api/admin/reports/:id", auth, requireAdmin, (req, res) => {
  const status = String(req.body.status || "").trim();
  if (!["open", "reviewed", "dismissed"].includes(status)) return res.status(400).json({ error: "Report status is invalid." });
  const store = loadStore();
  const report = store.reports.find(item => item.id === Number(req.params.id));
  if (!report) return res.status(404).json({ error: "Report not found." });
  report.status = status;
  report.reviewed_by = req.user.id;
  report.reviewed_at = now();
  report.updated_at = report.reviewed_at;
  saveStore(store);
  res.json(adminReportItem(report, store));
});

app.get("/api/admin/shared", auth, requireAdmin, (req, res) => {
  const store = loadStore();
  const q = String(req.query.q || "").trim().toLowerCase();
  let docs = store.shared_documents;
  if (q) docs = docs.filter(doc => `${doc.title} ${doc.description} ${doc.sql_code} ${(doc.tags || []).join(" ")}`.toLowerCase().includes(q));
  docs = docs
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, intParam(req.query.limit, 100, 1, 200))
    .map(doc => adminSharedItem(doc, store));
  res.json(docs);
});

app.patch("/api/admin/shared/:id", auth, requireAdmin, (req, res) => {
  const store = loadStore();
  const doc = store.shared_documents.find(item => item.id === Number(req.params.id));
  if (!doc) return res.status(404).json({ error: "Shared document not found." });
  if (req.body.is_hidden !== undefined) doc.is_hidden = Boolean(req.body.is_hidden);
  if (req.body.is_public !== undefined) doc.is_public = Boolean(req.body.is_public);
  doc.moderation_reason = String(req.body.moderation_reason || "").trim().slice(0, 240);
  doc.moderated_by = req.user.id;
  doc.moderated_at = now();
  doc.updated_at = doc.moderated_at;
  saveStore(store);
  res.json(adminSharedItem(doc, store));
});

app.get("/api/admin/comments", auth, requireAdmin, (req, res) => {
  const store = loadStore();
  const q = String(req.query.q || "").trim().toLowerCase();
  let comments = store.comments;
  if (q) comments = comments.filter(comment => comment.content.toLowerCase().includes(q));
  comments = comments
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, intParam(req.query.limit, 100, 1, 200))
    .map(comment => adminCommentItem(comment, store));
  res.json(comments);
});

app.patch("/api/admin/comments/:id", auth, requireAdmin, (req, res) => {
  const store = loadStore();
  const comment = store.comments.find(item => item.id === Number(req.params.id));
  if (!comment) return res.status(404).json({ error: "Comment not found." });
  if (req.body.is_hidden !== undefined) comment.is_hidden = Boolean(req.body.is_hidden);
  comment.moderation_reason = String(req.body.moderation_reason || "").trim().slice(0, 240);
  comment.moderated_by = req.user.id;
  comment.moderated_at = now();
  comment.updated_at = comment.moderated_at;
  saveStore(store);
  res.json(adminCommentItem(comment, store));
});

app.get("/api/admin/users", auth, requireAdmin, (req, res) => {
  const store = loadStore();
  const q = String(req.query.q || "").trim().toLowerCase();
  let users = store.users;
  if (q) users = users.filter(user => `${user.email || ""} ${user.display_name || ""} ${user.naver_id || ""}`.toLowerCase().includes(q));
  users = users
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, intParam(req.query.limit, 100, 1, 200))
    .map(user => ({
      ...userSummary(user),
      docs_count: store.docs.filter(doc => doc.user_id === user.id).length,
      shared_count: store.shared_documents.filter(doc => doc.owner_id === user.id).length,
      comments_count: store.comments.filter(comment => comment.user_id === user.id).length,
      reports_count: store.reports.filter(report => report.reporter_id === user.id).length,
    }));
  res.json(users);
});

app.patch("/api/admin/users/:id", auth, requireAdmin, (req, res) => {
  const store = loadStore();
  const user = findUser(store, req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  if (isAdminUser(user) && user.id !== req.user.id) return res.status(400).json({ error: "Admin accounts cannot be blocked here." });
  user.is_blocked = Boolean(req.body.is_blocked);
  user.blocked_reason = user.is_blocked ? String(req.body.blocked_reason || "").trim().slice(0, 240) : null;
  user.blocked_by = user.is_blocked ? req.user.id : null;
  user.blocked_at = user.is_blocked ? now() : null;
  user.updated_at = now();
  saveStore(store);
  res.json(userSummary(user));
});

app.get("/api/admin/export", auth, requireAdmin, (req, res) => {
  const backup = {
    exported_at: now(),
    store: migrateStore(loadStore()),
  };
  const stamp = backup.exported_at.replace(/[:.]/g, "-");
  res.setHeader("Content-Disposition", `attachment; filename="sqlvisual-backup-${stamp}.json"`);
  res.json(backup);
});

app.post("/api/history", auth, requireActiveUser, (req, res) => {
  const store = loadStore();
  store.history.unshift({ id: store.counters.history++, user_id: req.user.id, sql_code: req.body.sql_code || "", executed_at: now() });
  store.history = store.history.filter(item => item.user_id !== req.user.id).concat(store.history.filter(item => item.user_id === req.user.id).slice(0, 20));
  saveStore(store);
  res.json({ ok: true });
});

app.get("/api/history", auth, (req, res) => {
  res.json(loadStore().history.filter(item => item.user_id === req.user.id).sort((a, b) => b.executed_at.localeCompare(a.executed_at)).slice(0, 20));
});

app.use((err, req, res, next) => {
  console.error(err.code || err.name || "UnhandledError", err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: err.code === "DATA_STORE_CORRUPT"
      ? "Saved data could not be loaded safely. Please restore the latest backup before writing more data."
      : "Server error.",
  });
});

app.listen(PORT, () => {
  console.log(`SQLVisual API: ${process.env.RENDER_EXTERNAL_URL || PUBLIC_BACKEND_URL}`);
  console.log(`Naver callback URL: ${CONFIG.NAVER_CALLBACK_URL}`);
});
