const DEFAULT_BASE = import.meta.env.DEV ? "http://localhost:3001/api" : "";
const BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");

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
    throw new Error("백엔드 API 주소가 설정되어 있지 않습니다. VITE_API_BASE_URL을 설정하거나 체험 모드를 사용하세요.");
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
  naverLoginUrl: returnTo => req("GET", `/auth/naver${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`),
  me: () => req("GET", "/auth/me"),
  getDocs: () => req("GET", "/docs"),
  getDoc: id => req("GET", `/docs/${id}`),
  createDoc: data => req("POST", "/docs", data),
  saveDoc: (id, data) => req("PUT", `/docs/${id}`, data),
  deleteDoc: id => req("DELETE", `/docs/${id}`),
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
      return { id: p.id, username: p.username, email: p.email, profile_image: p.profile_image };
    } catch {
      return null;
    }
  },
};
