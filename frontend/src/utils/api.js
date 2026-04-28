const DEFAULT_BASE = import.meta.env.DEV ? "http://localhost:3001/api" : "";
const BASE = (import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");

export function hasApiBase() {
  return Boolean(BASE);
}

function token() {
  return localStorage.getItem("sv_token");
}

async function req(method, path, body = null) {
  if (!BASE) {
    throw new Error("백엔드 API 주소가 설정되지 않았습니다. VITE_API_BASE_URL을 설정하거나 체험 모드를 사용하세요.");
  }

  const headers = { "Content-Type": "application/json" };
  if (token()) headers.Authorization = `Bearer ${token()}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "서버 오류");
  return data;
}

export const api = {
  health: () => req("GET", "/health"),
  naverLoginUrl: () => req("GET", "/auth/naver"),
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
      const p = JSON.parse(atob(t.split(".")[1]));
      if (p.exp * 1000 < Date.now()) {
        localStorage.removeItem("sv_token");
        return null;
      }
      return { id: p.id, username: p.username, email: p.email, profile_image: p.profile_image };
    } catch {
      return null;
    }
  },
};
