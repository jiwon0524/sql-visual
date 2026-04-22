// ── api.js ────────────────────────────────────────────────────────────────────
// 백엔드 API 호출 유틸리티

const BASE = "http://localhost:3001/api";

function getToken() {
  return localStorage.getItem("sqlvisual_token");
}

async function request(method, path, body = null) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "서버 오류가 발생했습니다.");
  return data;
}

export const api = {
  // Auth
  register: (username, password) => request("POST", "/auth/register", { username, password }),
  login:    (username, password) => request("POST", "/auth/login",    { username, password }),

  // Documents
  getDocs:    ()         => request("GET",    "/docs"),
  getDoc:     (id)       => request("GET",    `/docs/${id}`),
  createDoc:  (data)     => request("POST",   "/docs", data),
  saveDoc:    (id, data) => request("PUT",    `/docs/${id}`, data),
  deleteDoc:  (id)       => request("DELETE", `/docs/${id}`),

  // Activity
  getActivity: () => request("GET", "/activity"),
};
