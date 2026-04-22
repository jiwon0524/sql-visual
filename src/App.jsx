import { useState } from "react";
import { StoreProvider, useStore } from "./store.jsx";
import Home from "./pages/Home.jsx";
import { ProblemList, ProblemSolver } from "./pages/Problems.jsx";
import ConceptsPage from "./pages/Concepts.jsx";
import Visualizer from "./pages/Visualizer.jsx";

// ── Layout shell ──────────────────────────────────────────────────────────────
function Shell() {
  const { darkMode, setDarkMode, totalSolved } = useStore();
  const D = darkMode;

  const [page,    setPage]    = useState("home");      // home|visualizer|problems|concepts
  const [pageCtx, setPageCtx] = useState({});          // extra context (e.g. problem id)
  // Problems sub-state
  const [probView, setProbView] = useState("list");    // list|solver
  const [selProbId, setSelProbId] = useState(null);

  const onNav = (target, ctx = {}) => {
    setPage(target);
    setPageCtx(ctx);
    if (target === "problems") {
      if (ctx.id) { setSelProbId(ctx.id); setProbView("solver"); }
      else         { setProbView("list"); }
    }
  };

  const navItems = [
    { id:"home",       label:"홈",         icon:"🏠" },
    { id:"visualizer", label:"SQL 시각화", icon:"⊞"  },
    { id:"problems",   label:"문제 풀기",  icon:"✏️"  },
    { id:"concepts",   label:"개념 학습",  icon:"📖" },
  ];

  const bg      = D ? "#0f172a" : "#f8f9fb";
  const surface = D ? "#1e293b" : "#ffffff";
  const border  = D ? "#334155" : "#e2e8f0";
  const text    = D ? "#f1f5f9" : "#0f172a";

  return (
    <div style={{ minHeight:"100vh", background:bg, color:text, fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif" }}>

      {/* Header */}
      <header style={{ background:surface, borderBottom:`1px solid ${border}`, padding:"0 24px", display:"flex", alignItems:"center", justifyContent:"space-between", height:54, position:"sticky", top:0, zIndex:100, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:30, height:30, background:"#2563eb", borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:11, fontFamily:"monospace" }}>SQL</div>
          <span style={{ fontWeight:800, fontSize:17, color:text }}>SQL<span style={{color:"#2563eb"}}>Visual</span></span>
        </div>
        <nav style={{ display:"flex", gap:4 }}>
          {navItems.map(n => (
            <button key={n.id} onClick={() => onNav(n.id)} style={{
              padding:"6px 14px", borderRadius:8,
              border:`1.5px solid ${page===n.id ? "#2563eb" : border}`,
              background: page===n.id ? "#2563eb20":"transparent",
              color: page===n.id ? "#2563eb" : D?"#94a3b8":"#475569",
              cursor:"pointer", fontSize:13, fontWeight: page===n.id ? 700:400,
              transition:"all .15s",
            }}>{n.icon} {n.label}</button>
          ))}
        </nav>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:12, color:"#94a3b8" }}>✅ {totalSolved}문제</span>
          <button onClick={() => setDarkMode(d => !d)} style={{
            background:"transparent", border:`1px solid ${border}`, borderRadius:6,
            padding:"4px 10px", cursor:"pointer", fontSize:14, color:D?"#94a3b8":"#475569",
          }}>{D ? "☀️" : "🌙"}</button>
        </div>
      </header>

      {/* Body */}
      <main style={{ maxWidth:1100, margin:"0 auto", padding:"28px 20px" }}>
        {page === "home" && <Home onNav={onNav} />}

        {page === "visualizer" && <Visualizer darkMode={D} />}

        {page === "problems" && probView === "list" && (
          <ProblemList
            darkMode={D}
            initFilter={pageCtx}
            onSelect={(id) => { setSelProbId(id); setProbView("solver"); }}
          />
        )}

        {page === "problems" && probView === "solver" && selProbId && (
          <ProblemSolver
            darkMode={D}
            problemId={selProbId}
            onBack={() => setProbView("list")}
            onNext={(id) => setSelProbId(id)}
          />
        )}

        {page === "concepts" && (
          <ConceptsPage
            darkMode={D}
            initId={pageCtx.id || null}
            onNav={onNav}
          />
        )}
      </main>

      <footer style={{ textAlign:"center", padding:20, color:"#94a3b8", fontSize:11, borderTop:`1px solid ${border}`, marginTop:40 }}>
        SQLVisual — SQL 시각화 학습 플랫폼 | 브라우저 내 실행
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
