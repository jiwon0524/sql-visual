// ══════════════════════════════════════════════════════════════════════════════
// SQLVisual — App.jsx
// 완전 반응형 (모바일 / 태블릿 / 데스크톱)
// 탭 기반 결과 UI | 툴 스타일 편집기 | 미니멀 SaaS 디자인
// ══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";
import { explainSQL, analyzeError, parseCreateTable, splitStatements } from "./utils/sqlAnalyzer.js";
import initSqlJs from "sql.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 디자인 토큰
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const C = {
  sans:       `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif`,
  mono:       `'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace`,
  bg:         "#f9fafb",
  surface:    "#ffffff",
  surfaceAlt: "#f3f4f6",
  border:     "#e5e7eb",
  borderDk:   "#d1d5db",
  text:       "#111827",
  textSub:    "#4b5563",
  muted:      "#9ca3af",
  accent:     "#2563eb",
  accentDk:   "#1d4ed8",
  accentBg:   "#eff6ff",
  accentBdr:  "#bfdbfe",
  green:      "#16a34a",
  greenBg:    "#f0fdf4",
  greenBdr:   "#bbf7d0",
  red:        "#dc2626",
  redBg:      "#fef2f2",
  redBdr:     "#fecaca",
  yellow:     "#d97706",
  yellowBg:   "#fffbeb",
  yellowBdr:  "#fde68a",
  edBg:       "#0f172a",
  edGutter:   "#1e293b",
  edText:     "#e2e8f0",
  edMuted:    "#475569",
  edGreen:    "#86efac",
  edBlue:     "#93c5fd",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 반응형 훅
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function useBp() {
  const [w, setW] = useState(() => typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const fn = () => setW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return { isMobile: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024, w };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Btn({ children, onClick, v = "default", sz = "md", disabled, full, title, style: sx = {} }) {
  const [hov, setHov] = useState(false);
  const sizes = {
    sm:   { fontSize: 12, padding: "4px 10px",  borderRadius: 6 },
    md:   { fontSize: 13, padding: "6px 14px",  borderRadius: 7 },
    lg:   { fontSize: 15, padding: "10px 22px", borderRadius: 9 },
    icon: { fontSize: 13, padding: "6px 8px",   borderRadius: 7 },
  };
  const variants = {
    primary: { background: hov ? C.accentDk : C.accent,    color: "#fff",    border: "none",                      boxShadow: hov ? `0 4px 12px ${C.accent}55` : "none" },
    default: { background: hov ? C.surfaceAlt : C.surface,  color: C.textSub, border: `1px solid ${C.border}` },
    ghost:   { background: hov ? C.surfaceAlt : "transparent", color: C.textSub, border: "none" },
    danger:  { background: hov ? "#fee2e2" : C.redBg,       color: C.red,     border: `1px solid ${C.redBdr}` },
    success: { background: hov ? "#dcfce7" : C.greenBg,     color: C.green,   border: `1px solid ${C.greenBdr}` },
  };
  const s = sizes[sz] || sizes.md;
  const vv = variants[v] || variants.default;
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
        fontFamily: C.sans, fontWeight: 500, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1, transition: "all .15s", width: full ? "100%" : "auto",
        whiteSpace: "nowrap", ...s, ...vv, ...sx,
      }}
    >{children}</button>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.surface, borderRadius: 12, padding: "24px 24px 20px",
          width: "100%", maxWidth: wide ? 860 : 480, maxHeight: "90vh", overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: C.text, fontFamily: C.sans }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: C.muted, lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상단 네비게이션
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const NAV_ITEMS = [
  { id: "home",       label: "홈",       icon: "⌂"  },
  { id: "editor",     label: "SQL 작성", icon: "✏"  },
  { id: "visualizer", label: "시각화",   icon: "⊞"  },
  { id: "concepts",   label: "개념",     icon: "📖" },
  { id: "docs",       label: "문서",     icon: "📁" },
];

function NavBar({ page, setPage, user, onLogout, bp }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header style={{
        position: "sticky", top: 0, zIndex: 100,
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        height: 52,
      }}>
        <div style={{
          maxWidth: 1280, margin: "0 auto", padding: "0 16px",
          height: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          {/* 로고 */}
          <button
            onClick={() => { setPage("home"); setMenuOpen(false); }}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0 }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: C.accent, display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontSize: 11, fontWeight: 800, fontFamily: C.mono,
            }}>SV</div>
            {!bp.isMobile && (
              <span style={{ fontWeight: 700, fontSize: 16, color: C.text, fontFamily: C.sans }}>
                SQL<span style={{ color: C.accent }}>Visual</span>
              </span>
            )}
          </button>

          {/* 데스크톱 / 태블릿 네비 */}
          {!bp.isMobile && (
            <nav style={{ display: "flex", gap: 2 }}>
              {NAV_ITEMS.map(n => {
                const active = page === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => setPage(n.id)}
                    style={{
                      padding: bp.isTablet ? "6px 10px" : "6px 14px",
                      borderRadius: 7, border: "none", cursor: "pointer",
                      background: active ? C.accentBg : "transparent",
                      color: active ? C.accent : C.textSub,
                      fontWeight: active ? 600 : 400,
                      fontSize: bp.isTablet ? 13 : 14,
                      fontFamily: C.sans, transition: "all .15s",
                      display: "flex", alignItems: "center", gap: 5,
                      borderBottom: active ? `2px solid ${C.accent}` : "2px solid transparent",
                    }}
                  >
                    {bp.isTablet && <span style={{ fontSize: 14 }}>{n.icon}</span>}
                    {!bp.isTablet && n.label}
                    {bp.isTablet && <span style={{ fontSize: 12 }}>{n.label}</span>}
                  </button>
                );
              })}
            </nav>
          )}

          {/* 우측 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {user ? (
              <>
                {!bp.isMobile && (
                  <span style={{ fontSize: 13, color: C.textSub, fontFamily: C.sans }}>{user.username}</span>
                )}
                <Btn onClick={onLogout} sz="sm" v="ghost">로그아웃</Btn>
              </>
            ) : (
              <Btn onClick={() => setPage("login")} sz="sm" v="primary">로그인</Btn>
            )}

            {/* 모바일 햄버거 */}
            {bp.isMobile && (
              <button
                onClick={() => setMenuOpen(o => !o)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 6, fontSize: 20 }}
              >☰</button>
            )}
          </div>
        </div>
      </header>

      {/* 모바일 드롭다운 메뉴 */}
      {bp.isMobile && menuOpen && (
        <div style={{
          position: "fixed", top: 52, left: 0, right: 0, zIndex: 99,
          background: C.surface, borderBottom: `1px solid ${C.border}`,
          boxShadow: "0 8px 24px rgba(0,0,0,.1)",
        }}>
          {NAV_ITEMS.map(n => {
            const active = page === n.id;
            return (
              <button
                key={n.id}
                onClick={() => { setPage(n.id); setMenuOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  padding: "14px 20px", border: "none", background: active ? C.accentBg : "transparent",
                  color: active ? C.accent : C.text, fontSize: 15, fontFamily: C.sans,
                  fontWeight: active ? 600 : 400, cursor: "pointer",
                  borderLeft: active ? `3px solid ${C.accent}` : "3px solid transparent",
                }}
              >
                <span>{n.icon}</span>{n.label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HomePage({ setPage, bp }) {
  const features = [
    { icon: "⚡", title: "즉시 실행",    desc: "브라우저에서 SQL을 바로 실행합니다. 설치 불필요." },
    { icon: "💬", title: "자동 해설",    desc: "SELECT, JOIN, GROUP BY 등 구문별로 해설을 제공합니다." },
    { icon: "⊞",  title: "테이블 시각화", desc: "CREATE TABLE을 분석해 구조 다이어그램을 보여줍니다." },
    { icon: "🔍", title: "에러 분석",   desc: "문법 오류 원인을 친절하게 알려줍니다." },
    { icon: "📖", title: "개념 학습",   desc: "11개 SQL 개념을 체계적으로 정리했습니다." },
    { icon: "💾", title: "문서 저장",   desc: "작성한 SQL을 저장하고 언제든지 불러옵니다." },
  ];

  return (
    <div style={{ fontFamily: C.sans }}>
      {/* 히어로 — 간결한 2단 구조 */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: bp.isMobile ? "40px 20px" : bp.isTablet ? "52px 32px" : "64px 48px",
      }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: bp.isMobile || bp.isTablet ? "column" : "row", gap: bp.isMobile ? 32 : 56, alignItems: "center" }}>

          {/* 왼쪽 텍스트 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "inline-block", background: C.accentBg, border: `1px solid ${C.accentBdr}`, borderRadius: 99, padding: "3px 12px", fontSize: 12, color: C.accent, fontWeight: 600, marginBottom: 16 }}>
              SQL 실습 + 학습 도구
            </div>
            <h1 style={{ fontSize: bp.isMobile ? 24 : bp.isTablet ? 28 : 34, fontWeight: 800, color: C.text, lineHeight: 1.25, margin: "0 0 14px" }}>
              SQL을 실행하고<br />
              <span style={{ color: C.accent }}>구조를 시각적으로 확인하세요</span>
            </h1>
            <p style={{ fontSize: bp.isMobile ? 14 : 15, color: C.textSub, lineHeight: 1.7, margin: "0 0 28px" }}>
              코드를 작성하면 자동 해설과 에러 분석을 제공합니다.<br />
              테이블 구조는 다이어그램으로 한눈에 확인하세요.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn onClick={() => setPage("editor")} v="primary" sz="lg">✏ SQL 시작하기</Btn>
              <Btn onClick={() => setPage("concepts")} sz="lg">📖 개념 학습</Btn>
            </div>
          </div>

          {/* 오른쪽 — 에디터 미리보기 */}
          {!bp.isMobile && (
            <div style={{ flex: 1, minWidth: 0, maxWidth: 480 }}>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>
                {/* 에디터 헤더 */}
                <div style={{ background: C.edBg, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ display: "flex", gap: 5 }}>
                    {["#ef4444","#f59e0b","#10b981"].map((c,i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }}/>)}
                  </div>
                  <span style={{ fontSize: 11, color: C.edMuted, fontFamily: C.mono, marginLeft: 4 }}>query.sql</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, background: C.green, color: "#fff", padding: "1px 7px", borderRadius: 3, fontWeight: 600 }}>실행됨</span>
                </div>
                {/* SQL 코드 */}
                <div style={{ background: "#0f172a", padding: "14px 16px" }}>
                  <pre style={{ margin: 0, fontFamily: C.mono, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap", color: C.edText }}>
                    <span style={{color:C.edBlue}}>SELECT</span>{" s.name, s.gpa\n"}
                    <span style={{color:C.edBlue}}>FROM</span>{" student s\n"}
                    <span style={{color:C.edBlue}}>INNER JOIN</span>{" department d\n"}
                    {"  "}<span style={{color:C.edBlue}}>ON</span>{" s.dept_id = d.dept_id\n"}
                    <span style={{color:C.edBlue}}>WHERE</span>{" s.gpa >= "}<span style={{color:"#86efac"}}>3.5</span>{"\n"}
                    <span style={{color:C.edBlue}}>ORDER BY</span>{" s.gpa "}<span style={{color:C.edBlue}}>DESC</span>;
                  </pre>
                </div>
                {/* 결과 미리보기 */}
                <div style={{ background: C.surface }}>
                  <div style={{ padding: "6px 14px", borderTop: `1px solid ${C.border}`, fontSize: 11, color: C.muted, fontFamily: C.sans, fontWeight: 600 }}>
                    📊 결과 — 2개 행
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
                      <thead>
                        <tr>
                          {["name","gpa"].map(c => <th key={c} style={{ background: C.surfaceAlt, padding: "6px 14px", textAlign: "left", fontWeight: 600, color: C.textSub, borderBottom: `1px solid ${C.border}`, fontSize: 11 }}>{c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {[["박지호","3.91"],["김민준","3.85"]].map((r,i) => (
                          <tr key={i}>
                            <td style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}`, color: C.text }}>{r[0]}</td>
                            <td style={{ padding: "6px 14px", borderBottom: `1px solid ${C.border}`, color: C.green, fontWeight: 600 }}>{r[1]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 기능 카드 */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: bp.isMobile ? "40px 16px" : "56px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: bp.isMobile ? "1fr" : bp.isTablet ? "1fr 1fr" : "repeat(3, 1fr)", gap: 14 }}>
          {features.map(f => (
            <div key={f.title} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: "18px 20px" }}>
              <div style={{ fontSize: 22, marginBottom: 10 }}>{f.icon}</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: C.text, marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: C.textSub, lineHeight: 1.65 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로그인 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function LoginPage({ setPage, onLogin }) {
  const [tab, setTab]   = useState("login");
  const [id, setId]     = useState("");
  const [pw, setPw]     = useState("");
  const [err, setErr]   = useState("");
  const [loading, setL] = useState(false);

  const submit = async () => {
    if (!id.trim() || !pw.trim()) { setErr("아이디와 비밀번호를 입력하세요."); return; }
    setErr(""); setL(true);
    // 데모 모드 — 백엔드 없이 로그인
    setTimeout(() => {
      const u = { username: id, email: "" };
      localStorage.setItem("sv_user", JSON.stringify(u));
      onLogin(u);
      setL(false);
    }, 500);
  };

  const inp = {
    width: "100%", padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.border}`,
    fontSize: 14, fontFamily: C.sans, color: C.text, background: C.bg,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 400, margin: "64px auto", padding: "0 20px", fontFamily: C.sans }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "32px 28px" }}>
        <h2 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 700, color: C.text, textAlign: "center" }}>
          {tab === "login" ? "로그인" : "회원가입"}
        </h2>
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: C.surfaceAlt, borderRadius: 8, padding: 3 }}>
          {["login","register"].map(t => (
            <button key={t} onClick={() => { setTab(t); setErr(""); }} style={{ flex: 1, padding: "6px", borderRadius: 6, border: "none", background: tab === t ? C.surface : "transparent", color: tab === t ? C.text : C.muted, fontWeight: tab === t ? 600 : 400, fontSize: 13, cursor: "pointer", fontFamily: C.sans, boxShadow: tab === t ? "0 1px 3px rgba(0,0,0,.1)" : "none", transition: "all .15s" }}>
              {t === "login" ? "로그인" : "회원가입"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input value={id} onChange={e => setId(e.target.value)} placeholder="아이디" style={inp} onKeyDown={e => e.key === "Enter" && submit()} />
          <input value={pw} onChange={e => setPw(e.target.value)} placeholder="비밀번호" type="password" style={inp} onKeyDown={e => e.key === "Enter" && submit()} />
          {err && <div style={{ fontSize: 12, color: C.red }}>{err}</div>}
          <Btn onClick={submit} v="primary" sz="lg" full disabled={loading} sx={{ marginTop: 4 }}>
            {loading ? "처리 중..." : tab === "login" ? "로그인" : "가입하기"}
          </Btn>
        </div>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: C.muted }}>
          로그인 없이{" "}
          <button onClick={() => setPage("editor")} style={{ background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>체험 모드</button>
          {" "}로 이용 가능합니다
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 테이블 시각화 다이어그램
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const BADGE_STYLE = {
  PK:        { bg: "#fef3c7", b: "#f59e0b", t: "#92400e" },
  FK:        { bg: "#ede9fe", b: "#7c3aed", t: "#5b21b6" },
  "NOT NULL":{ bg: "#dbeafe", b: "#2563eb", t: "#1e40af" },
  UNIQUE:    { bg: "#d1fae5", b: "#16a34a", t: "#065f46" },
  CHECK:     { bg: "#cffafe", b: "#0891b2", t: "#164e63" },
  DEFAULT:   { bg: "#f3f4f6", b: "#9ca3af", t: "#374151" },
};
function ColBadge({ label }) {
  const s = BADGE_STYLE[label] || BADGE_STYLE.DEFAULT;
  return <span style={{ background: s.bg, border: `1px solid ${s.b}`, color: s.t, fontSize: 10, padding: "1px 5px", borderRadius: 3, fontWeight: 600 }}>{label}</span>;
}

function TableDiagram({ schemas }) {
  if (!schemas || schemas.length === 0)
    return <div style={{ textAlign: "center", padding: 48, color: C.muted, fontSize: 13, fontFamily: C.sans }}>CREATE TABLE을 실행하면 여기에 구조가 나타납니다.</div>;

  const allFKs = schemas.flatMap(s => s.foreignKeys.map(fk => ({ from: s.tableName, ...fk })));

  return (
    <div style={{ fontFamily: C.sans }}>
      {allFKs.length > 0 && (
        <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 8, padding: "10px 14px", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", marginBottom: 6 }}>🔗 외래키 관계</div>
          {allFKs.map((fk, i) => (
            <div key={i} style={{ fontSize: 12, color: "#5b21b6", fontFamily: C.mono }}>
              {fk.from}.{fk.column} → {fk.refTable}.{fk.refColumn}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {schemas.map((schema, si) => (
          <div key={si} style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", minWidth: 240, background: C.surface }}>
            <div style={{ background: "#1e40af", padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#93c5fd", fontSize: 12 }}>⊞</span>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: C.mono, fontSize: 13 }}>{schema.tableName}</span>
              <span style={{ color: "#93c5fd", fontSize: 11, marginLeft: "auto" }}>{schema.columns.length} cols</span>
            </div>
            {schema.columns.map((col, ci) => (
              <div key={ci} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderBottom: `1px solid ${C.border}`, background: col.pk ? "#fffbeb" : ci % 2 ? "#fafafa" : C.surface }}>
                <span style={{ width: 14, textAlign: "center", fontSize: 11, flexShrink: 0 }}>{col.pk ? "🔑" : col.fk ? "🔗" : "·"}</span>
                <span style={{ fontFamily: C.mono, fontSize: 12, minWidth: 90, color: col.pk ? "#92400e" : col.fk ? "#5b21b6" : C.text, fontWeight: col.pk ? 700 : 400 }}>{col.name}</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.muted, flex: 1 }}>{col.type}</span>
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {col.pk        && <ColBadge label="PK"       />}
                  {col.fk        && <ColBadge label="FK"       />}
                  {col.notNull   && !col.pk && <ColBadge label="NOT NULL"/>}
                  {col.unique    && !col.pk && <ColBadge label="UNIQUE"  />}
                  {col.check     && <ColBadge label="CHECK"   />}
                  {col.default   && <ColBadge label="DEFAULT" />}
                </div>
              </div>
            ))}
            {schema.foreignKeys.length > 0 && (
              <div style={{ padding: "6px 12px", background: "#f5f3ff", borderTop: `1px solid ${C.border}` }}>
                {schema.foreignKeys.map((fk, fi) => (
                  <div key={fi} style={{ fontSize: 11, color: "#5b21b6", fontFamily: C.mono }}>🔗 {fk.column} → {fk.refTable}({fk.refColumn})</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SQL 편집기 메인 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DEMO_SQL = `-- SQL을 작성하고 ▶ 실행을 눌러보세요 (Ctrl+Enter)

CREATE TABLE department (
  dept_id INT PRIMARY KEY,
  dept_name VARCHAR(50) NOT NULL,
  location VARCHAR(100)
);

CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  age INT CHECK(age >= 18),
  dept_id INT,
  gpa DECIMAL(3,2) DEFAULT 0.0,
  FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);

INSERT INTO department VALUES (1, '컴퓨터공학', '공학관 3층');
INSERT INTO department VALUES (2, '수학', '이학관 2층');
INSERT INTO department VALUES (3, '경영학', '경영관 1층');

INSERT INTO student VALUES (1, '김민준', 22, 1, 3.85);
INSERT INTO student VALUES (2, '이서연', 21, 1, 3.42);
INSERT INTO student VALUES (3, '박지호', 23, 2, 3.91);
INSERT INTO student VALUES (4, '최수아', 20, 3, 3.15);

SELECT * FROM student WHERE age >= 22;`;

function EditorPage({ user, setPage, schemas, setSchemas, bp }) {
  const [sql,         setSql]         = useState(DEMO_SQL);
  const [outputs,     setOutputs]     = useState([]);
  const [sqlDb,       setSqlDb]       = useState(null);
  const [dbLoading,   setDbLoading]   = useState(true);
  const [activeTab,   setActiveTab]   = useState("result");  // result | explain | error
  const [showDiagram, setShowDiagram] = useState(false);
  const [showDocs,    setShowDocs]    = useState(false);
  const [docList,     setDocList]     = useState([]);
  const [docTitle,    setDocTitle]    = useState("제목 없음");
  const [docId,       setDocId]       = useState(null);
  const [saveMsg,     setSaveMsg]     = useState("");
  const [elapsed,     setElapsed]     = useState(null);
  const [mobileView,  setMobileView]  = useState("editor"); // editor | result (모바일 전용)
  const textareaRef = useRef(null);

  // sql.js 초기화
  useEffect(() => {
    initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}` })
      .then(SQL => { setSqlDb(new SQL.Database()); setDbLoading(false); })
      .catch(() => setDbLoading(false));
  }, []);

  // 문서 목록 로드
  const loadDocs = useCallback(() => {
    const saved = JSON.parse(localStorage.getItem("sv_docs") || "[]");
    setDocList(saved);
  }, []);
  useEffect(() => { loadDocs(); }, [loadDocs]);

  // SQL 실행
  const run = useCallback(() => {
    const t0 = performance.now();
    const stmts = splitStatements(
      sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n")
    );
    const newOutputs = [];
    const newSchemas = [...schemas];

    for (const stmt of stmts) {
      if (!stmt.trim()) continue;
      const expl = explainSQL(stmt);

      if (sqlDb) {
        try {
          const results = sqlDb.exec(stmt);
          if (/CREATE\s+TABLE/i.test(stmt)) {
            const sc = parseCreateTable(stmt);
            if (sc) {
              const idx = newSchemas.findIndex(s => s.tableName.toLowerCase() === sc.tableName.toLowerCase());
              idx >= 0 ? (newSchemas[idx] = sc) : newSchemas.push(sc);
            }
            newOutputs.push({ type: "ok",    stmt, label: "CREATE TABLE", expl });
          } else if (results.length > 0) {
            newOutputs.push({ type: "table", stmt, label: "SELECT 결과",  expl, data: results[0] });
          } else {
            newOutputs.push({ type: "ok",    stmt, label: "실행 완료",    expl });
          }
        } catch (e) {
          newOutputs.push({ type: "error", stmt, label: "오류", expl, err: analyzeError(stmt, e.message) });
        }
      } else {
        if (/CREATE\s+TABLE/i.test(stmt)) {
          const sc = parseCreateTable(stmt);
          if (sc) {
            const idx = newSchemas.findIndex(s => s.tableName.toLowerCase() === sc.tableName.toLowerCase());
            idx >= 0 ? (newSchemas[idx] = sc) : newSchemas.push(sc);
          }
        }
        newOutputs.push({ type: "explain", stmt, label: "해설", expl });
      }
    }

    const elapsed = Math.round(performance.now() - t0);
    setOutputs(newOutputs);
    setSchemas(newSchemas);
    setElapsed(elapsed);

    // 탭 자동 전환
    const hasError = newOutputs.some(o => o.type === "error");
    const hasResult = newOutputs.some(o => o.type === "table");
    setActiveTab(hasError ? "error" : hasResult ? "result" : "result");

    // 모바일: 결과 화면으로 자동 전환
    if (bp.isMobile) setMobileView("result");
  }, [sql, sqlDb, schemas, setSchemas, bp.isMobile]);

  // Ctrl+Enter 단축키 (stale closure 방지)
  const runRef = useRef(null);
  runRef.current = run;
  useEffect(() => {
    const fn = e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runRef.current(); } };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  // 저장
  const save = () => {
    const docs = JSON.parse(localStorage.getItem("sv_docs") || "[]");
    const now = new Date().toISOString();
    if (docId) {
      const idx = docs.findIndex(d => d.id === docId);
      if (idx >= 0) docs[idx] = { ...docs[idx], title: docTitle, sql_code: sql, updated_at: now };
    } else {
      const newId = Date.now().toString();
      docs.unshift({ id: newId, title: docTitle, sql_code: sql, created_at: now, updated_at: now });
      setDocId(newId);
    }
    localStorage.setItem("sv_docs", JSON.stringify(docs));
    setSaveMsg("저장됨 ✓");
    loadDocs();
    setTimeout(() => setSaveMsg(""), 2000);
  };

  // 문서 불러오기
  const loadDoc = (doc) => {
    setSql(doc.sql_code); setDocTitle(doc.title); setDocId(doc.id);
    setOutputs([]); setElapsed(null); setShowDocs(false);
  };

  // 통계
  const resultCount = outputs.filter(o => o.type === "table").reduce((a, o) => a + (o.data?.values?.length || 0), 0);
  const errorCount  = outputs.filter(o => o.type === "error").length;
  const hasErrors   = errorCount > 0;

  const lineCount   = sql.split("\n").length;

  // ── 결과 패널 탭 콘텐츠 ────────────────────────────────────────────────────
  const ResultContent = () => {
    const tableOuts = outputs.filter(o => o.type === "table" || o.type === "ok");
    if (outputs.length === 0)
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: C.muted, textAlign: "center", padding: 24, fontFamily: C.sans }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>▶</div>
          <div style={{ fontSize: 14, color: C.textSub, marginBottom: 6 }}>아직 실행된 SQL이 없습니다</div>
          <div style={{ fontSize: 12 }}>위에 SQL을 입력하고 실행 버튼을 누르세요</div>
          <div style={{ fontSize: 11, marginTop: 8, color: C.muted }}>단축키: Ctrl+Enter</div>
        </div>
      );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, overflow: "auto" }}>
        {outputs.map((out, i) => {
          if (out.type === "error") return null;
          return (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "6px 12px", background: C.surfaceAlt, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: C.textSub, fontFamily: C.sans }}>
                <span style={{ fontWeight: 600, color: out.type === "ok" ? C.green : C.text }}>
                  {out.type === "ok" ? "✅" : "📊"} {out.label}
                </span>
                <code style={{ fontSize: 10, fontFamily: C.mono, color: C.muted }}>{out.stmt?.replace(/\s+/g, " ").slice(0, 50)}</code>
              </div>
              {out.type === "table" && out.data && (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
                      <thead>
                        <tr>
                          {out.data.columns.map((c, ci) => (
                            <th key={ci} style={{ background: "#1e40af", color: "#e0f2fe", padding: "6px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap", fontSize: 11 }}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {out.data.values.map((row, ri) => (
                          <tr key={ri} style={{ background: ri % 2 ? C.surfaceAlt : C.surface }}>
                            {row.map((cell, ci) => (
                              <td key={ci} style={{ padding: "5px 12px", borderBottom: `1px solid ${C.border}`, color: cell == null ? C.muted : C.text, fontStyle: cell == null ? "italic" : "normal", whiteSpace: "nowrap" }}>
                                {cell == null ? "NULL" : String(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ padding: "4px 12px", fontSize: 10, color: C.muted, fontFamily: C.sans }}>{out.data.values.length}개 행</div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const ExplainContent = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 16, overflow: "auto" }}>
      {outputs.length === 0
        ? <div style={{ textAlign: "center", padding: 32, color: C.muted, fontSize: 13, fontFamily: C.sans }}>실행 후 해설이 여기에 표시됩니다.</div>
        : outputs.map((out, i) => out.expl?.length > 0 && (
            <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "6px 12px", background: C.surfaceAlt, fontSize: 11, fontFamily: C.sans }}>
                <code style={{ fontFamily: C.mono, color: C.textSub }}>{out.stmt?.replace(/\s+/g, " ").slice(0, 60)}</code>
              </div>
              <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                {out.expl.map((exp, ei) => (
                  <div key={ei} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ background: exp.color + "18", color: exp.color, fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 700, fontFamily: C.mono, whiteSpace: "nowrap", flexShrink: 0, marginTop: 1 }}>
                      {exp.kw}
                    </span>
                    <span style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6, fontFamily: C.sans }}
                      dangerouslySetInnerHTML={{ __html: exp.text }}/>
                  </div>
                ))}
              </div>
            </div>
          ))
      }
    </div>
  );

  const ErrorContent = () => {
    const errs = outputs.filter(o => o.type === "error");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, overflow: "auto" }}>
        {errs.length === 0
          ? <div style={{ textAlign: "center", padding: 32, color: C.green, fontSize: 13, fontFamily: C.sans }}>✅ 오류 없음</div>
          : errs.map((out, i) => (
              <div key={i} style={{ background: C.redBg, border: `1px solid ${C.redBdr}`, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, color: C.red, fontSize: 13, marginBottom: 6, fontFamily: C.sans }}>🔍 {out.err?.title || "오류"}</div>
                <div style={{ fontSize: 13, color: "#991b1b", lineHeight: 1.65, fontFamily: C.sans }} dangerouslySetInnerHTML={{ __html: out.err?.msg || "알 수 없는 오류" }}/>
                {out.err?.hint && (
                  <div style={{ marginTop: 8, padding: "7px 10px", background: C.yellowBg, border: `1px solid ${C.yellowBdr}`, borderRadius: 6, fontSize: 12, color: "#92400e", fontFamily: C.sans }}>
                    💡 {out.err.hint}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 10, color: C.muted, fontFamily: C.mono }}>
                  {out.stmt?.replace(/\s+/g, " ").slice(0, 80)}
                </div>
              </div>
            ))
        }
      </div>
    );
  };

  // ── 탭 헤더 ────────────────────────────────────────────────────────────────
  const tabItems = [
    { id: "result",  label: bp.isMobile ? "결과" : "결과",  badge: resultCount > 0 ? String(resultCount) : null },
    { id: "explain", label: bp.isMobile ? "해설" : "자동 해설", badge: null },
    { id: "error",   label: bp.isMobile ? "에러" : "에러",   badge: errorCount > 0 ? String(errorCount) : null, badgeRed: true },
  ];

  // ── 레이아웃 분기 ──────────────────────────────────────────────────────────
  const editorAreaHeight = bp.isMobile ? "auto" : `calc(100vh - 52px)`;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: bp.isMobile ? "auto" : "calc(100vh - 52px)", fontFamily: C.sans, overflow: "hidden" }}>

      {/* ── 툴바 ── */}
      <div style={{
        background: C.surface, borderBottom: `1px solid ${C.border}`,
        padding: "7px 12px", display: "flex", alignItems: "center", gap: 6,
        flexShrink: 0, flexWrap: "wrap", minHeight: 46,
      }}>
        {/* 제목 */}
        <input
          value={docTitle}
          onChange={e => setDocTitle(e.target.value)}
          style={{ border: "none", outline: "none", fontSize: 13, fontFamily: C.sans, color: C.text, fontWeight: 500, background: "transparent", minWidth: 80, maxWidth: 140 }}
        />

        <div style={{ flex: 1 }}/>

        {/* 상태 표시 */}
        {!bp.isMobile && elapsed !== null && (
          <span style={{ fontSize: 11, color: C.muted }}>⏱ {elapsed}ms</span>
        )}
        {!bp.isMobile && resultCount > 0 && (
          <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>📊 {resultCount}행</span>
        )}
        {!bp.isMobile && hasErrors && (
          <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>❌ {errorCount}오류</span>
        )}

        {saveMsg && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>{saveMsg}</span>}

        {/* 툴바 버튼들 */}
        <Btn sz="sm" onClick={() => { setSql(""); setOutputs([]); setDocTitle("제목 없음"); setDocId(null); setElapsed(null); }} title="초기화" v="ghost">🗑</Btn>
        {user && <Btn sz="sm" onClick={() => { setShowDocs(true); loadDocs(); }}>📂</Btn>}
        <Btn sz="sm" onClick={save}>💾</Btn>
        <Btn sz="sm" onClick={() => setShowDiagram(true)} style={{ color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe" }}>⊞ 시각화</Btn>
        {bp.isMobile && mobileView === "result" && (
          <Btn sz="sm" onClick={() => setMobileView("editor")} v="ghost">← 편집기</Btn>
        )}
        <Btn v="primary" onClick={run} disabled={dbLoading}>
          {dbLoading ? "로딩..." : "▶ 실행"}
        </Btn>
      </div>

      {/* ── 모바일: 에디터 / 결과 토글 ── */}
      {bp.isMobile && (
        <div style={{ background: C.surfaceAlt, display: "flex", borderBottom: `1px solid ${C.border}` }}>
          {["editor","result"].map(v => (
            <button key={v} onClick={() => setMobileView(v)} style={{
              flex: 1, padding: "9px", border: "none", background: mobileView === v ? C.surface : "transparent",
              color: mobileView === v ? C.accent : C.muted, fontWeight: mobileView === v ? 600 : 400,
              fontSize: 13, cursor: "pointer", fontFamily: C.sans,
              borderBottom: mobileView === v ? `2px solid ${C.accent}` : "2px solid transparent",
            }}>
              {v === "editor" ? "✏ SQL 편집기" : "📊 결과 / 해설"}
            </button>
          ))}
        </div>
      )}

      {/* ── 메인 2분할 영역 ── */}
      <div style={{
        flex: 1, display: "flex",
        flexDirection: bp.isMobile ? "column" : "row",
        overflow: bp.isMobile ? "visible" : "hidden",
        minHeight: 0,
      }}>

        {/* 좌측: SQL 에디터 */}
        {(!bp.isMobile || mobileView === "editor") && (
          <div style={{
            flex: bp.isTablet ? "0 0 45%" : "0 0 50%",
            display: "flex", flexDirection: "column",
            borderRight: bp.isMobile ? "none" : `1px solid ${C.border}`,
            minHeight: bp.isMobile ? 300 : 0,
          }}>
            {/* 에디터 헤더 */}
            <div style={{ background: C.edBg, padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 4 }}>
                {["#ef4444","#f59e0b","#10b981"].map((c, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: c }}/>)}
              </div>
              <span style={{ color: C.edMuted, fontSize: 10, fontFamily: C.mono }}>{lineCount}줄 · SQL</span>
              {dbLoading && <span style={{ marginLeft: "auto", fontSize: 10, color: C.edMuted }}>DB 로딩 중...</span>}
            </div>
            {/* 에디터 본체 */}
            <div style={{ flex: 1, display: "flex", background: C.edBg, overflow: "auto", minHeight: bp.isMobile ? 280 : 0 }}>
              {/* 줄번호 */}
              <div style={{
                padding: "12px 8px 12px 10px", color: C.edMuted, fontSize: 12,
                fontFamily: C.mono, lineHeight: "1.6", textAlign: "right",
                userSelect: "none", minWidth: 32, borderRight: `1px solid ${C.edGutter}`,
                flexShrink: 0, letterSpacing: 0,
              }}>
                {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
              </div>
              {/* 텍스트 입력 */}
              <textarea
                ref={textareaRef}
                value={sql}
                onChange={e => setSql(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Tab") {
                    e.preventDefault();
                    const pos = e.target.selectionStart;
                    setSql(s => s.slice(0, pos) + "  " + s.slice(pos));
                    setTimeout(() => { if (textareaRef.current) { textareaRef.current.selectionStart = textareaRef.current.selectionEnd = pos + 2; } }, 0);
                  }
                }}
                spellCheck={false}
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: C.edText, fontFamily: C.mono, fontSize: 13, lineHeight: "1.6",
                  padding: "12px 14px", resize: "none", minHeight: bp.isMobile ? 260 : 0,
                }}
              />
            </div>
          </div>
        )}

        {/* 우측: 결과 / 해설 / 에러 탭 */}
        {(!bp.isMobile || mobileView === "result") && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, background: C.bg }}>
            {/* 탭 헤더 */}
            <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: C.surface, flexShrink: 0 }}>
              {tabItems.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    padding: "9px 16px", border: "none", background: "transparent",
                    color: activeTab === t.id ? C.accent : C.textSub,
                    fontWeight: activeTab === t.id ? 600 : 400,
                    fontSize: bp.isMobile ? 13 : 13,
                    cursor: "pointer", fontFamily: C.sans,
                    borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
                    display: "flex", alignItems: "center", gap: 5, marginBottom: -1,
                    transition: "all .15s",
                  }}
                >
                  {t.label}
                  {t.badge && (
                    <span style={{
                      background: t.badgeRed ? C.red : C.accent,
                      color: "#fff", fontSize: 10, padding: "1px 5px", borderRadius: 99, fontWeight: 700,
                    }}>{t.badge}</span>
                  )}
                </button>
              ))}
            </div>

            {/* 탭 콘텐츠 */}
            <div style={{ flex: 1, overflow: "auto", minHeight: bp.isMobile ? 300 : 0 }}>
              {activeTab === "result"  && <ResultContent />}
              {activeTab === "explain" && <ExplainContent />}
              {activeTab === "error"   && <ErrorContent />}
            </div>
          </div>
        )}
      </div>

      {/* 테이블 다이어그램 모달 */}
      <Modal open={showDiagram} onClose={() => setShowDiagram(false)} title="⊞ 테이블 구조 시각화" wide>
        <TableDiagram schemas={schemas} />
      </Modal>

      {/* 문서 목록 모달 */}
      <Modal open={showDocs} onClose={() => setShowDocs(false)} title="📂 저장된 문서">
        {docList.length === 0
          ? <div style={{ textAlign: "center", padding: 24, color: C.muted, fontSize: 13, fontFamily: C.sans }}>저장된 문서가 없습니다.</div>
          : docList.map(doc => (
              <div
                key={doc.id}
                onClick={() => loadDoc(doc)}
                style={{ padding: "11px 14px", borderRadius: 7, border: `1px solid ${C.border}`, cursor: "pointer", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: C.sans }}
                onMouseEnter={e => e.currentTarget.style.borderColor = C.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{doc.title}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{new Date(doc.updated_at).toLocaleString("ko-KR")}</div>
                </div>
                <span style={{ color: C.muted }}>›</span>
              </div>
            ))
        }
      </Modal>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 시각화 단독 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VisualizerPage({ schemas, setSchemas, bp }) {
  const [sql, setSql] = useState(`CREATE TABLE department (\n  dept_id INT PRIMARY KEY,\n  dept_name VARCHAR(50) NOT NULL\n);\n\nCREATE TABLE student (\n  student_id INT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL,\n  dept_id INT,\n  FOREIGN KEY (dept_id) REFERENCES department(dept_id)\n);`);

  const analyze = () => {
    const newSchemas = [];
    splitStatements(sql).forEach(stmt => {
      if (/CREATE\s+TABLE/i.test(stmt)) {
        const s = parseCreateTable(stmt);
        if (s) newSchemas.push(s);
      }
    });
    setSchemas(newSchemas);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bp.isMobile ? "24px 16px" : "36px 24px", fontFamily: C.sans }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>⊞ 테이블 구조 시각화</h2>
        <p style={{ margin: 0, fontSize: 13, color: C.textSub }}>CREATE TABLE SQL을 입력하면 구조를 다이어그램으로 보여줍니다.</p>
      </div>
      <div style={{ display: "flex", flexDirection: bp.isMobile ? "column" : "row", gap: 20 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ background: C.edBg, padding: "7px 12px", fontSize: 11, color: C.edMuted, fontFamily: C.mono }}>CREATE TABLE SQL</div>
            <textarea
              value={sql}
              onChange={e => setSql(e.target.value)}
              style={{ width: "100%", minHeight: 240, background: C.edBg, border: "none", outline: "none", color: C.edText, fontFamily: C.mono, fontSize: 12, lineHeight: 1.65, padding: "12px 14px", resize: "vertical", boxSizing: "border-box" }}
              spellCheck={false}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <Btn v="primary" onClick={analyze}>⊞ 구조 분석</Btn>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, minHeight: 200 }}>
            <TableDiagram schemas={schemas} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 개념 학습 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CONCEPTS_DATA = [
  {
    id: "select", title: "SELECT", cat: "DML",
    def: "테이블에서 데이터를 조회하는 가장 기본적인 명령어입니다.",
    easy: "도서관 목록에서 원하는 책을 골라보는 것처럼, SELECT는 테이블에서 원하는 데이터만 꺼내봅니다.",
    syntax: "SELECT 컬럼1, 컬럼2\nFROM 테이블명\n[WHERE 조건]\n[GROUP BY 컬럼]\n[HAVING 그룹조건]\n[ORDER BY 컬럼 ASC|DESC]\n[LIMIT 개수]",
    example: "-- 전체 조회\nSELECT * FROM student;\n\n-- 특정 컬럼\nSELECT name, gpa FROM student;\n\n-- 조건 + 정렬\nSELECT name, gpa\nFROM student\nWHERE gpa >= 3.5\nORDER BY gpa DESC;",
    result: "조건에 맞는 행이 테이블 형태로 반환됩니다.",
    caution: ["실행 순서: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY", "WHERE절에는 집계함수 사용 불가 — HAVING 사용"],
    mistakes: ["WHERE절에 COUNT() 등 집계함수 사용", "GROUP BY 없이 집계함수와 일반 컬럼 혼용"],
  },
  {
    id: "insert", title: "INSERT", cat: "DML",
    def: "테이블에 새 행(데이터)을 추가하는 명령어입니다.",
    easy: "엑셀에서 새 줄에 데이터를 입력하는 것과 같습니다.",
    syntax: "INSERT INTO 테이블명 (컬럼1, 컬럼2)\nVALUES (값1, 값2);",
    example: "INSERT INTO student (student_id, name, age)\nVALUES (1, '김민준', 22);\n\n-- 전체 컬럼 순서대로\nINSERT INTO student VALUES (2, '이서연', 21, 1, 3.42);",
    result: "지정한 값이 테이블에 새 행으로 추가됩니다.",
    caution: ["NOT NULL 컬럼은 반드시 값 제공", "PRIMARY KEY 중복 삽입 시 오류"],
    mistakes: ["컬럼 수와 VALUES 수 불일치", "문자열에 따옴표 누락"],
  },
  {
    id: "update", title: "UPDATE", cat: "DML",
    def: "테이블의 기존 데이터를 수정하는 명령어입니다.",
    easy: "엑셀 셀을 클릭해서 값을 바꾸는 것과 같습니다.",
    syntax: "UPDATE 테이블명\nSET 컬럼1=값1, 컬럼2=값2\n[WHERE 조건];",
    example: "UPDATE student\nSET gpa = 4.0\nWHERE student_id = 1;",
    result: "조건에 맞는 행의 지정 컬럼이 변경됩니다.",
    caution: ["⚠️ WHERE 없이 UPDATE하면 모든 행이 수정됩니다!"],
    mistakes: ["WHERE 조건 누락으로 전체 행 수정"],
  },
  {
    id: "delete", title: "DELETE", cat: "DML",
    def: "테이블에서 행을 삭제하는 명령어입니다.",
    easy: "엑셀에서 행 전체를 삭제하는 것과 같습니다.",
    syntax: "DELETE FROM 테이블명\n[WHERE 조건];",
    example: "DELETE FROM student WHERE student_id = 3;\n\n-- ⚠️ 전체 삭제\nDELETE FROM student;",
    result: "조건에 맞는 행이 테이블에서 삭제됩니다.",
    caution: ["⚠️ WHERE 없이 DELETE하면 모든 행이 삭제됩니다!", "삭제된 데이터는 복구 불가"],
    mistakes: ["WHERE 조건 누락으로 전체 삭제"],
  },
  {
    id: "join", title: "JOIN", cat: "DML",
    def: "두 테이블을 특정 컬럼 기준으로 합쳐 조회하는 연산입니다.",
    easy: "학생 목록과 학과 목록이 따로 있을 때, 한 번에 보려면 두 표를 합쳐야 합니다. JOIN이 이 역할을 합니다.",
    syntax: "-- INNER JOIN (교집합)\nSELECT ...\nFROM A INNER JOIN B ON A.키 = B.키\n\n-- LEFT JOIN\nFROM A LEFT JOIN B ON A.키 = B.키",
    example: "SELECT s.name, d.dept_name\nFROM student s\nINNER JOIN department d\n  ON s.dept_id = d.dept_id;",
    result: "INNER JOIN은 양쪽 모두 일치하는 행, LEFT JOIN은 왼쪽 테이블 전체를 반환합니다.",
    caution: ["INNER JOIN은 일치하지 않는 행 제외", "LEFT JOIN은 오른쪽 불일치 시 NULL"],
    mistakes: ["ON 조건 누락 시 카테시안 곱 발생", "모호한 컬럼명 사용"],
  },
  {
    id: "groupby", title: "GROUP BY", cat: "DML",
    def: "같은 값을 가진 행들을 그룹으로 묶어 집계하는 절입니다.",
    easy: "반별 평균 성적을 구하려면 반 기준으로 묶은 뒤 평균을 내야 합니다.",
    syntax: "SELECT 그룹컬럼, 집계함수(컬럼)\nFROM 테이블\nGROUP BY 그룹컬럼\n[HAVING 그룹조건]",
    example: "SELECT dept_id, COUNT(*) AS 학생수\nFROM student GROUP BY dept_id;\n\n-- HAVING 필터\nSELECT dept_id, AVG(gpa)\nFROM student GROUP BY dept_id\nHAVING AVG(gpa) >= 3.5;",
    result: "그룹별로 집계된 결과가 반환됩니다.",
    caution: ["SELECT에는 GROUP BY 컬럼이나 집계함수만", "HAVING: 그룹화 후 필터 / WHERE: 그룹화 전 필터"],
    mistakes: ["WHERE절에 집계함수 조건 작성 (HAVING 사용)"],
  },
  {
    id: "primary-key", title: "PRIMARY KEY", cat: "제약조건",
    def: "테이블의 각 행을 고유하게 식별하는 기본키 제약조건입니다.",
    easy: "학번이 학생마다 다른 것처럼, PK는 각 행이 구별되도록 고유한 값을 강제합니다.",
    syntax: "-- 컬럼 수준\n컬럼명 타입 PRIMARY KEY\n\n-- 복합 기본키\nPRIMARY KEY(컬럼1, 컬럼2)",
    example: "CREATE TABLE student (\n  student_id INT PRIMARY KEY,\n  name VARCHAR(50)\n);\n\n-- 복합\nCREATE TABLE enrollment (\n  student_id INT,\n  course_id VARCHAR(10),\n  PRIMARY KEY(student_id, course_id)\n);",
    result: "PK 컬럼에는 NULL과 중복 값이 들어올 수 없습니다.",
    caution: ["테이블당 PK는 하나", "자동으로 NOT NULL + UNIQUE 적용"],
    mistakes: ["PK 컬럼에 NULL 삽입 시도", "하나의 테이블에 PK 두 개 정의"],
  },
  {
    id: "foreign-key", title: "FOREIGN KEY", cat: "제약조건",
    def: "다른 테이블의 기본키를 참조하여 관계를 정의하는 제약조건입니다.",
    easy: "수강신청 테이블에서 없는 학생번호로 신청 불가 — FK가 이 규칙을 자동으로 지킵니다.",
    syntax: "FOREIGN KEY (컬럼명)\n  REFERENCES 참조테이블(참조컬럼)\n  [ON DELETE CASCADE | SET NULL]",
    example: "CREATE TABLE enrollment (\n  id INT PRIMARY KEY,\n  student_id INT,\n  FOREIGN KEY (student_id)\n    REFERENCES student(student_id)\n    ON DELETE CASCADE\n);",
    result: "참조 대상에 없는 값은 삽입이 거부됩니다.",
    caution: ["부모 테이블 먼저 생성", "FK 컬럼 자체는 NULL 허용"],
    mistakes: ["FOREIGN KEY 뒤 괄호 누락", "부모보다 자식 테이블 먼저 생성"],
  },
  {
    id: "not-null", title: "NOT NULL", cat: "제약조건",
    def: "컬럼에 NULL 값을 허용하지 않는 제약조건입니다.",
    easy: "회원가입 폼에서 이름 칸이 필수인 것처럼, NOT NULL은 반드시 값이 있어야 합니다.",
    syntax: "컬럼명 타입 NOT NULL",
    example: "CREATE TABLE member (\n  id INT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL,\n  email VARCHAR(100) NOT NULL,\n  phone VARCHAR(20)\n);",
    result: "name, email INSERT 시 반드시 값이 있어야 합니다.",
    caution: ["PRIMARY KEY는 자동으로 NOT NULL", "NULL과 빈 문자열('')은 다릅니다"],
    mistakes: ["PK 컬럼에 별도 NOT NULL 명시 (불필요)"],
  },
  {
    id: "unique", title: "UNIQUE", cat: "제약조건",
    def: "컬럼에 중복 값을 허용하지 않는 제약조건입니다.",
    easy: "이메일은 하나의 계정에만 등록 가능 — UNIQUE가 이 규칙을 자동으로 강제합니다.",
    syntax: "컬럼명 타입 UNIQUE\n-- 또는\nUNIQUE(컬럼명)",
    example: "CREATE TABLE member (\n  id INT PRIMARY KEY,\n  email VARCHAR(100) UNIQUE,\n  username VARCHAR(50) UNIQUE\n);",
    result: "email, username 컬럼에 같은 값을 두 번 넣으면 오류 발생.",
    caution: ["NULL은 UNIQUE 검사 예외", "PK와 달리 하나의 테이블에 여러 개 가능"],
    mistakes: ["UNIQUE와 PRIMARY KEY 역할 혼동"],
  },
  {
    id: "check", title: "CHECK", cat: "제약조건",
    def: "컬럼에 저장될 수 있는 값의 조건을 제한하는 제약조건입니다.",
    easy: "나이에 -5나 200이 들어오면 안 되는 것처럼, CHECK는 유효 범위를 설정합니다.",
    syntax: "컬럼명 타입 CHECK(조건식)",
    example: "CREATE TABLE student (\n  id INT PRIMARY KEY,\n  age INT CHECK(age >= 18 AND age <= 100),\n  grade CHAR(1) CHECK(grade IN ('A','B','C','D','F'))\n);",
    result: "조건 위반 시 INSERT/UPDATE가 거부됩니다.",
    caution: ["CHECK 위반 INSERT/UPDATE는 전체 거부"],
    mistakes: ["CHECK 괄호 누락: CHECK age >= 18 → CHECK(age >= 18)"],
  },
];

function ConceptsPage({ bp }) {
  const [selected, setSelected] = useState("select");
  const [search,   setSearch]   = useState("");
  const [sideOpen, setSideOpen] = useState(false); // 모바일용

  const c = CONCEPTS_DATA.find(x => x.id === selected) || CONCEPTS_DATA[0];
  const filtered = search
    ? CONCEPTS_DATA.filter(x => x.title.toLowerCase().includes(search.toLowerCase()) || x.cat.includes(search))
    : CONCEPTS_DATA;
  const cats = ["DML","제약조건"];
  const catColor = { DML: C.accent, "제약조건": C.yellow };

  const SidebarContent = () => (
    <>
      <div style={{ padding: "12px 12px 0" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 검색..."
          style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: C.sans, color: C.text, background: C.bg, outline: "none", boxSizing: "border-box" }}
        />
      </div>
      {cats.map(cat => (
        <div key={cat} style={{ padding: "12px 12px 4px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: catColor[cat] || C.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>{cat}</div>
          {filtered.filter(x => x.cat === cat).map(x => (
            <button
              key={x.id}
              onClick={() => { setSelected(x.id); setSideOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "7px 10px", borderRadius: 7, border: "none",
                background: selected === x.id ? C.accentBg : "transparent",
                color: selected === x.id ? C.accent : C.textSub,
                cursor: "pointer", fontSize: 13.5, fontFamily: C.sans,
                fontWeight: selected === x.id ? 600 : 400, marginBottom: 1,
              }}
            >{x.title}</button>
          ))}
        </div>
      ))}
    </>
  );

  return (
    <div style={{ display: "flex", height: bp.isMobile ? "auto" : "calc(100vh - 52px)", fontFamily: C.sans }}>
      {/* 데스크톱/태블릿 사이드바 */}
      {!bp.isMobile && (
        <div style={{ width: 200, borderRight: `1px solid ${C.border}`, overflow: "auto", background: C.surface, flexShrink: 0 }}>
          <SidebarContent />
        </div>
      )}

      {/* 모바일: 개념 선택 드롭다운 */}
      {bp.isMobile && (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setSideOpen(o => !o)}
            style={{ width: "100%", padding: "10px 16px", border: "none", borderBottom: `1px solid ${C.border}`, background: C.surface, textAlign: "left", fontSize: 14, fontFamily: C.sans, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span style={{ color: C.accent, fontWeight: 600 }}>{c.title}</span>
            <span style={{ color: C.muted }}>{sideOpen ? "▲" : "▼"}</span>
          </button>
          {sideOpen && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: C.surface, border: `1px solid ${C.border}`, zIndex: 50, maxHeight: 300, overflow: "auto", boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
              <SidebarContent />
            </div>
          )}
        </div>
      )}

      {/* 본문 */}
      <div style={{ flex: 1, overflow: "auto", padding: bp.isMobile ? "20px 16px" : "32px 36px", background: C.bg }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: catColor[c.cat] || C.muted, textTransform: "uppercase", letterSpacing: 1 }}>{c.cat}</span>
            <h1 style={{ margin: "6px 0 8px", fontSize: bp.isMobile ? 22 : 26, fontWeight: 800, color: C.text }}>{c.title}</h1>
            <p style={{ margin: 0, fontSize: 14, color: C.textSub, lineHeight: 1.65 }}>{c.def}</p>
          </div>

          {/* 쉬운 설명 */}
          <div style={{ background: C.greenBg, border: `1px solid ${C.greenBdr}`, borderRadius: 8, padding: "12px 16px", marginBottom: 18 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 6 }}>💡 쉬운 설명</div>
            <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.7 }}>{c.easy}</div>
          </div>

          {/* 문법 */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 8 }}>📌 문법</div>
            <div style={{ background: C.edBg, borderRadius: 8, padding: "12px 16px" }}>
              <pre style={{ margin: 0, color: C.edText, fontFamily: C.mono, fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{c.syntax}</pre>
            </div>
          </div>

          {/* 예제 */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 8 }}>✏️ 예제</div>
            <div style={{ background: C.edBg, borderRadius: 8, padding: "12px 16px" }}>
              <pre style={{ margin: 0, color: C.edGreen, fontFamily: C.mono, fontSize: 12, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{c.example}</pre>
            </div>
            {c.result && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: C.accentBg, border: `1px solid ${C.accentBdr}`, borderRadius: 6, fontSize: 12, color: "#1e40af" }}>
                📊 {c.result}
              </div>
            )}
          </div>

          {/* 주의사항 */}
          {c.caution?.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 8 }}>⚠️ 주의사항</div>
              {c.caution.map((t, i) => (
                <div key={i} style={{ padding: "8px 12px", background: C.yellowBg, border: `1px solid ${C.yellowBdr}`, borderRadius: 6, fontSize: 13, color: "#92400e", marginBottom: 6 }}>• {t}</div>
              ))}
            </div>
          )}

          {/* 자주 하는 실수 */}
          {c.mistakes?.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 8 }}>❌ 자주 하는 실수</div>
              {c.mistakes.map((m, i) => (
                <div key={i} style={{ padding: "8px 12px", background: C.redBg, border: `1px solid ${C.redBdr}`, borderRadius: 6, fontSize: 13, color: "#991b1b", marginBottom: 6 }}>• {m}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 내 문서 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DocsPage({ user, setPage, bp }) {
  const [docs,     setDocs]     = useState([]);
  const [editId,   setEditId]   = useState(null);
  const [editTitle,setEditTitle]= useState("");

  const reload = () => setDocs(JSON.parse(localStorage.getItem("sv_docs") || "[]"));
  useEffect(() => reload(), []);

  const del = id => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    const d = JSON.parse(localStorage.getItem("sv_docs") || "[]").filter(x => x.id !== id);
    localStorage.setItem("sv_docs", JSON.stringify(d));
    reload();
  };

  const rename = id => {
    const d = JSON.parse(localStorage.getItem("sv_docs") || "[]").map(x => x.id === id ? { ...x, title: editTitle } : x);
    localStorage.setItem("sv_docs", JSON.stringify(d));
    setEditId(null); reload();
  };

  const open = doc => {
    sessionStorage.setItem("sv_open_doc", JSON.stringify(doc));
    setPage("editor");
  };

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: bp.isMobile ? "24px 16px" : "40px 24px", fontFamily: C.sans }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>📁 내 문서</h2>
          <p style={{ margin: 0, fontSize: 13, color: C.textSub }}>저장된 SQL 문서 목록입니다.</p>
        </div>
        <Btn v="primary" sz="sm" onClick={() => setPage("editor")}>+ 새 문서</Btn>
      </div>

      {!user && (
        <div style={{ background: C.yellowBg, border: `1px solid ${C.yellowBdr}`, borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#92400e" }}>
          💡 현재 체험 모드입니다. 문서는 이 기기에만 저장됩니다.
          <button onClick={() => setPage("login")} style={{ marginLeft: 8, background: "none", border: "none", color: C.accent, cursor: "pointer", fontSize: 13 }}>로그인하기</button>
        </div>
      )}

      {docs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 14, color: C.textSub, marginBottom: 16 }}>저장된 문서가 없습니다.</div>
          <Btn v="primary" onClick={() => setPage("editor")}>SQL 편집기로 이동</Btn>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editId === doc.id ? (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <input
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && rename(doc.id)}
                        style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid ${C.accent}`, fontSize: 14, fontFamily: C.sans, outline: "none" }}
                        autoFocus
                      />
                      <Btn v="primary" sz="sm" onClick={() => rename(doc.id)}>저장</Btn>
                      <Btn sz="sm" onClick={() => setEditId(null)}>취소</Btn>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{doc.title}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{new Date(doc.updated_at).toLocaleString("ko-KR")}</div>
                    </>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                  <Btn v="primary" sz="sm" onClick={() => open(doc)}>열기</Btn>
                  <Btn sz="sm" onClick={() => { setEditId(doc.id); setEditTitle(doc.title); }}>수정</Btn>
                  <Btn v="danger" sz="sm" onClick={() => del(doc.id)}>삭제</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 앱 루트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function App() {
  const bp      = useBp();
  const [page,    setPage]    = useState("home");
  const [user,    setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem("sv_user") || "null"); } catch { return null; }
  });
  const [schemas, setSchemas] = useState([]);

  const handleLogin  = u => { setUser(u); setPage("editor"); };
  const handleLogout = () => { setUser(null); localStorage.removeItem("sv_user"); setPage("home"); };

  // global font + reset
  useEffect(() => {
    document.body.style.margin  = "0";
    document.body.style.padding = "0";
    document.body.style.background = C.bg;
    document.body.style.fontFamily = C.sans;
    document.body.style.overflowX = "hidden";
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <NavBar page={page} setPage={setPage} user={user} onLogout={handleLogout} bp={bp} />

      {page === "home"        && <HomePage     setPage={setPage} bp={bp} />}
      {page === "login"       && <LoginPage    setPage={setPage} onLogin={handleLogin} />}
      {page === "editor"      && <EditorPage   user={user} setPage={setPage} schemas={schemas} setSchemas={setSchemas} bp={bp} />}
      {page === "visualizer"  && <VisualizerPage schemas={schemas} setSchemas={setSchemas} bp={bp} />}
      {page === "concepts"    && <ConceptsPage bp={bp} />}
      {page === "docs"        && <DocsPage     user={user} setPage={setPage} bp={bp} />}
    </div>
  );
}
