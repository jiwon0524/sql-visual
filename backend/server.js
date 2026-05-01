import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import axios from "axios";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3001);
const PUBLIC_FRONTEND_URL = "https://jiwon0524.github.io/sql-visual/";
const PUBLIC_BACKEND_URL = "https://sql-visual.onrender.com";
const RENDER_CALLBACK_URL = process.env.RENDER_EXTERNAL_URL ? `${process.env.RENDER_EXTERNAL_URL}/api/auth/naver/callback` : `${PUBLIC_BACKEND_URL}/api/auth/naver/callback`;
const RENDER_DISK_DIR = "/var/data";
const DEFAULT_DATA_FILE = existsSync(RENDER_DISK_DIR) ? join(RENDER_DISK_DIR, "sqlvisual-data.json") : join(__dirname, "sqlvisual-data.json");
const DATA_FILE = process.env.DATA_FILE || DEFAULT_DATA_FILE;

const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || "sqlvisual_jwt_secret_2024",
  NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID || "YOUR_NAVER_CLIENT_ID",
  NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET || "YOUR_NAVER_CLIENT_SECRET",
  NAVER_CALLBACK_URL: RENDER_CALLBACK_URL || process.env.NAVER_CALLBACK_URL,
  FRONTEND_URL: process.env.FRONTEND_URL || PUBLIC_FRONTEND_URL,
  CORS_ORIGINS: process.env.CORS_ORIGINS || "https://jiwon0524.github.io",
};

const LOCAL_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const allowedOrigins = Array.from(new Set([
  ...CONFIG.CORS_ORIGINS.split(",").map(origin => origin.trim()).filter(Boolean),
  ...LOCAL_DEV_ORIGINS,
]));

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

function now() {
  return new Date().toISOString();
}

function emptyStore() {
  return {
    counters: { user: 1, doc: 1, history: 1, shared: 1, comment: 1 },
    users: [],
    docs: [],
    history: [],
    shared_documents: [],
    comments: [],
    likes: [],
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
  };

  next.users = next.users.map(user => ({
    ...user,
    display_name: user.display_name ?? null,
    username: user.username ?? user.display_name ?? null,
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
    ...doc,
  }));
  return next;
}

function loadStore() {
  if (!existsSync(DATA_FILE)) return emptyStore();
  try {
    return migrateStore(JSON.parse(readFileSync(DATA_FILE, "utf8")));
  } catch {
    return emptyStore();
  }
}

function saveStore(store) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  const payload = JSON.stringify(migrateStore(store), null, 2);
  const tempFile = `${DATA_FILE}.${process.pid}.tmp`;
  writeFileSync(tempFile, payload);
  renameSync(tempFile, DATA_FILE);
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
  return jwt.sign(publicUser(user), CONFIG.JWT_SECRET, { expiresIn: "24h" });
}

function findUser(store, id) {
  return store.users.find(item => item.id === Number(id));
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Login required." });
  try {
    req.user = jwt.verify(token, CONFIG.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return next();
  try {
    req.user = jwt.verify(token, CONFIG.JWT_SECRET);
  } catch {
    req.user = null;
  }
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

function sharedSummary(doc, store) {
  const owner = findUser(store, doc.owner_id);
  const comments_count = store.comments.filter(item => item.shared_document_id === doc.id).length;
  const like_count = store.likes.filter(item => item.shared_document_id === doc.id).length || doc.like_count || 0;
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

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "SQLVisual API",
    naverConfigured: isNaverConfigured(),
    store: "json",
    dataFile: DATA_FILE,
    persistentStore: DATA_FILE.startsWith(`${RENDER_DISK_DIR}/`),
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
        redirect_uri: CONFIG.NAVER_CALLBACK_URL,
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
    res.redirect(withQuery(returnTo, "token", signUser(user)));
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
  res.json({ user: publicUser(user), token: signUser(user) });
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
app.post("/api/documents", auth, createDocument);
app.get("/api/documents/:id", auth, getDocument);
app.patch("/api/documents/:id", auth, patchDocument);
app.delete("/api/documents/:id", auth, deleteDocument);
app.get("/api/docs", auth, listDocuments);
app.post("/api/docs", auth, createDocument);
app.get("/api/docs/:id", auth, getDocument);
app.put("/api/docs/:id", auth, patchDocument);
app.delete("/api/docs/:id", auth, deleteDocument);

app.post("/api/shared", auth, (req, res) => {
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
  let docs = store.shared_documents.filter(doc => doc.is_public || ownsShared(doc, req.user?.id));
  if (q) docs = docs.filter(doc => `${doc.title} ${doc.description} ${doc.sql_code} ${doc.tags.join(" ")}`.toLowerCase().includes(q));
  if (tag) docs = docs.filter(doc => doc.tags.map(item => item.toLowerCase()).includes(tag));
  docs = docs.map(doc => sharedSummary(doc, store));
  docs.sort((a, b) => {
    if (sort === "popular") return (b.like_count + b.view_count + b.comments_count) - (a.like_count + a.view_count + a.comments_count);
    return b.updated_at.localeCompare(a.updated_at);
  });
  res.json(docs);
});

app.get("/api/shared/:id", optionalAuth, (req, res) => {
  const store = loadStore();
  const doc = store.shared_documents.find(item => item.id === Number(req.params.id));
  if (!doc || (!doc.is_public && !ownsShared(doc, req.user?.id))) return res.status(404).json({ error: "Shared document not found." });
  doc.view_count = Number(doc.view_count || 0) + 1;
  doc.updated_at = doc.updated_at || doc.created_at;
  saveStore(store);
  res.json(sharedSummary(doc, store));
});

app.patch("/api/shared/:id", auth, (req, res) => {
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

app.post("/api/shared/:id/copy", auth, (req, res) => {
  const store = loadStore();
  const shared = store.shared_documents.find(item => item.id === Number(req.params.id) && item.is_public);
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

app.post("/api/shared/:id/like", auth, (req, res) => {
  const store = loadStore();
  const shared = store.shared_documents.find(item => item.id === Number(req.params.id) && item.is_public);
  if (!shared) return res.status(404).json({ error: "Shared document not found." });
  const existing = store.likes.find(item => item.shared_document_id === shared.id && item.user_id === req.user.id);
  if (existing) store.likes = store.likes.filter(item => item !== existing);
  else store.likes.push({ shared_document_id: shared.id, user_id: req.user.id, created_at: now() });
  saveStore(store);
  res.json(sharedSummary(shared, store));
});

app.get("/api/shared/:id/comments", optionalAuth, (req, res) => {
  const store = loadStore();
  const shared = store.shared_documents.find(item => item.id === Number(req.params.id) && (item.is_public || ownsShared(item, req.user?.id)));
  if (!shared) return res.status(404).json({ error: "Shared document not found." });
  const comments = store.comments
    .filter(comment => comment.shared_document_id === shared.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map(comment => ({ ...comment, author: findUser(store, comment.user_id)?.display_name || "SQLVisual user" }));
  res.json(comments);
});

app.post("/api/shared/:id/comments", auth, (req, res) => {
  const content = String(req.body.content || "").trim();
  if (!content) return res.status(400).json({ error: "Comment content is required." });
  const store = loadStore();
  const shared = store.shared_documents.find(item => item.id === Number(req.params.id) && item.is_public);
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

app.patch("/api/comments/:id", auth, (req, res) => {
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
  console.log(`SQLVisual API: ${process.env.RENDER_EXTERNAL_URL || PUBLIC_BACKEND_URL}`);
  console.log(`Naver callback URL: ${CONFIG.NAVER_CALLBACK_URL}`);
});
