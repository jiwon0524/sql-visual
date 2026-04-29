export function normalizeApiBase(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/$/, "");
    if (!url.pathname.endsWith("/api")) {
      url.pathname = `${url.pathname}/api`.replace(/\/+/g, "/");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/$/, "");
  }
}

function localApiBase() {
  if (typeof window === "undefined") return "";
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" ? "http://localhost:3001/api" : "";
}

function runtimeApiBase() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("api");
  if (fromUrl) localStorage.setItem("sv_api_base", normalizeApiBase(fromUrl));
  return normalizeApiBase(localStorage.getItem("sv_api_base"));
}

const DEFAULT_BASE = import.meta.env.DEV ? "http://localhost:3001/api" : localApiBase();
const BASE = normalizeApiBase(import.meta.env.VITE_API_BASE_URL || runtimeApiBase() || DEFAULT_BASE);

export const apiBase = BASE;

export function hasApiBase() {
  return Boolean(BASE);
}

function token() {
  return localStorage.getItem("sv_token");
}

function decodeJwtPayload(jwt) {
  const raw = jwt.split(".")[1];
  if (!raw) return null;
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  return JSON.parse(atob(padded));
}

async function req(method, path, body = null) {
  if (!BASE) {
    throw new Error("백엔드 API 주소가 설정되어 있지 않습니다.");
  }

  const headers = { "Content-Type": "application/json" };
  if (token()) headers.Authorization = `Bearer ${token()}`;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 404) {
      throw new Error("백엔드 API가 최신 버전이 아닙니다. 백엔드를 재시작하거나 다시 배포하세요.");
    }
    if (!res.ok) throw new Error(data.error || "서버 오류가 발생했습니다.");
    return data;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("백엔드 API 연결 시간이 초과되었습니다.");
    throw err;
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  health: () => req("GET", "/health"),
  naverLoginUrl: ({ returnTo, authType } = {}) => {
    const params = new URLSearchParams();
    if (returnTo) params.set("returnTo", returnTo);
    if (authType) params.set("authType", authType);
    return req("GET", `/auth/naver${params.toString() ? `?${params}` : ""}`);
  },
  me: () => req("GET", "/me"),
  updateDisplayName: display_name => req("PATCH", "/me/display-name", { display_name }),
  getDocs: () => req("GET", "/documents"),
  getDoc: id => req("GET", `/documents/${id}`),
  createDoc: data => req("POST", "/documents", data),
  saveDoc: (id, data) => req("PATCH", `/documents/${id}`, data),
  deleteDoc: id => req("DELETE", `/documents/${id}`),
  createShared: data => req("POST", "/shared", data),
  getShared: params => req("GET", `/shared${params ? `?${new URLSearchParams(params)}` : ""}`),
  getSharedDoc: id => req("GET", `/shared/${id}`),
  updateShared: (id, data) => req("PATCH", `/shared/${id}`, data),
  deleteShared: id => req("DELETE", `/shared/${id}`),
  copyShared: id => req("POST", `/shared/${id}/copy`),
  likeShared: id => req("POST", `/shared/${id}/like`),
  getComments: id => req("GET", `/shared/${id}/comments`),
  createComment: (id, content) => req("POST", `/shared/${id}/comments`, { content }),
  updateComment: (id, content) => req("PATCH", `/comments/${id}`, { content }),
  deleteComment: id => req("DELETE", `/comments/${id}`),
};

export const authStore = {
  save: t => localStorage.setItem("sv_token", t),
  clear: () => localStorage.removeItem("sv_token"),
  get: () => localStorage.getItem("sv_token"),
  getUser: () => {
    const t = localStorage.getItem("sv_token");
    if (!t) return null;
    try {
      const p = decodeJwtPayload(t);
      if (!p || p.exp * 1000 < Date.now()) {
        localStorage.removeItem("sv_token");
        return null;
      }
      return {
        id: p.id,
        username: p.username || p.display_name,
        display_name: p.display_name || p.username || "",
        email: p.email,
        profile_image: p.profile_image,
        needs_display_name: Boolean(p.needs_display_name),
      };
    } catch {
      return null;
    }
  },
};
