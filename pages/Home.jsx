import { useStore } from "../store.jsx";
import { PROBLEMS, STEPS } from "../data/problems.js";
import { CONCEPTS } from "../data/concepts.js";

export default function Home({ onNav }) {
  const { totalSolved, accuracy, solved, getStepProgress, recentProbs, darkMode } = useStore();
  const D = darkMode;

  const todayRec = PROBLEMS.filter(p => !solved[p.id]?.correct)[0];
  const categories = [...new Set(PROBLEMS.map(p => p.category))].slice(0, 8);

  const diffColor = { "입문":"#10b981","기초":"#3b82f6","중급":"#f59e0b","실전":"#ef4444" };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:28 }}>

      {/* Hero */}
      <div style={{
        background: D ? "linear-gradient(135deg,#1e3a5f,#1e293b)" : "linear-gradient(135deg,#1d4ed8,#3b82f6)",
        borderRadius:16, padding:"36px 32px", color:"#fff",
      }}>
        <div style={{ fontSize:13, opacity:.7, marginBottom:6 }}>SQL 시각화 학습 플랫폼</div>
        <h1 style={{ margin:0, fontSize:28, fontWeight:800 }}>SQL을 눈으로 배우자 👁️</h1>
        <p style={{ margin:"10px 0 24px", opacity:.85, fontSize:15, lineHeight:1.6 }}>
          CREATE TABLE부터 JOIN까지 — 입력하면 그림으로 보여드립니다.<br/>
          백준 스타일 문제풀이 + API 문서 스타일 개념 학습
        </p>
        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          {[
            {label:"▶  SQL 실습 시작",   page:"visualizer", bg:"#fff",    color:"#1d4ed8"},
            {label:"✏️  문제 풀기",       page:"problems",   bg:"#ffffff30",color:"#fff"},
            {label:"📖  개념 학습",       page:"concepts",   bg:"#ffffff30",color:"#fff"},
          ].map(b => (
            <button key={b.page} onClick={() => onNav(b.page)} style={{
              background:b.bg, color:b.color, border:"none", borderRadius:8,
              padding:"10px 22px", cursor:"pointer", fontWeight:700, fontSize:14,
            }}>{b.label}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }}>
        {[
          {label:"풀이 완료", value:`${totalSolved}문제`, icon:"✅"},
          {label:"정답률",    value:`${accuracy}%`,       icon:"🎯"},
          {label:"전체 문제", value:`${PROBLEMS.length}문제`, icon:"📝"},
        ].map(s => (
          <div key={s.label} style={{
            background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`,
            borderRadius:12, padding:"18px 20px", textAlign:"center",
          }}>
            <div style={{ fontSize:26, marginBottom:6 }}>{s.icon}</div>
            <div style={{ fontSize:22, fontWeight:800, color: D?"#f1f5f9":"#0f172a" }}>{s.value}</div>
            <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Step progress */}
      <div style={{ background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:12, padding:20 }}>
        <h3 style={{ margin:"0 0 16px", fontSize:15, color: D?"#f1f5f9":"#0f172a" }}>📈 단계별 학습 진도</h3>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {STEPS.map(s => {
            const prog = getStepProgress(s.step);
            const pct  = prog.total > 0 ? Math.round((prog.done/prog.total)*100) : 0;
            return (
              <div key={s.step} style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:80, fontSize:12, color:"#64748b", flexShrink:0 }}>
                  {s.step}단계
                </div>
                <div style={{ flex:1, background: D?"#334155":"#f1f5f9", borderRadius:99, height:8, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, background:"#3b82f6", height:"100%", borderRadius:99, transition:"width .4s" }}/>
                </div>
                <div style={{ width:70, fontSize:12, color:"#64748b", textAlign:"right" }}>
                  {prog.done}/{prog.total}
                </div>
                <div style={{ width:36, fontSize:12, color:"#3b82f6", fontWeight:700 }}>{pct}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Today recommended */}
      {todayRec && (
        <div style={{ background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:12, padding:20 }}>
          <h3 style={{ margin:"0 0 14px", fontSize:15, color: D?"#f1f5f9":"#0f172a" }}>⭐ 오늘의 추천 문제</h3>
          <div style={{
            background: D?"#0f172a":"#f8fafc", borderRadius:10, padding:16,
            border:`1px solid ${D?"#334155":"#e2e8f0"}`, cursor:"pointer",
          }} onClick={() => onNav("problems", { id: todayRec.id })}>
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
              <span style={{ background:diffColor[todayRec.difficulty]+"20", color:diffColor[todayRec.difficulty], fontSize:11, padding:"2px 8px", borderRadius:4, fontWeight:700 }}>{todayRec.difficulty}</span>
              <span style={{ background:"#3b82f620", color:"#3b82f6", fontSize:11, padding:"2px 8px", borderRadius:4 }}>{todayRec.category}</span>
            </div>
            <div style={{ fontWeight:700, color: D?"#f1f5f9":"#0f172a", marginBottom:4 }}>{todayRec.id} · {todayRec.title}</div>
            <div style={{ fontSize:13, color:"#64748b", lineHeight:1.5 }}>{todayRec.description.slice(0,80)}...</div>
            <div style={{ marginTop:10 }}>
              <button onClick={e=>{e.stopPropagation();onNav("problems",{id:todayRec.id})}} style={{
                background:"#3b82f6", color:"#fff", border:"none", borderRadius:6,
                padding:"6px 16px", cursor:"pointer", fontSize:13, fontWeight:700,
              }}>지금 풀기 →</button>
            </div>
          </div>
        </div>
      )}

      {/* Category cards */}
      <div>
        <h3 style={{ margin:"0 0 14px", fontSize:15, color: D?"#f1f5f9":"#0f172a" }}>📂 카테고리별 문제</h3>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10 }}>
          {categories.map(cat => {
            const catProbs = PROBLEMS.filter(p => p.category === cat);
            const done = catProbs.filter(p => solved[p.id]?.correct).length;
            return (
              <div key={cat} onClick={() => onNav("problems", { category: cat })} style={{
                background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`,
                borderRadius:10, padding:"14px 16px", cursor:"pointer",
                transition:"box-shadow .15s",
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow="0 4px 16px #3b82f620"}
                onMouseLeave={e => e.currentTarget.style.boxShadow="none"}
              >
                <div style={{ fontWeight:700, fontSize:13, color: D?"#f1f5f9":"#0f172a", marginBottom:6 }}>{cat}</div>
                <div style={{ fontSize:12, color:"#94a3b8" }}>{done}/{catProbs.length} 완료</div>
                <div style={{ marginTop:8, background: D?"#334155":"#f1f5f9", borderRadius:99, height:4 }}>
                  <div style={{ width:`${catProbs.length>0?Math.round(done/catProbs.length*100):0}%`, background:"#3b82f6", height:"100%", borderRadius:99 }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick concepts */}
      <div>
        <h3 style={{ margin:"0 0 14px", fontSize:15, color: D?"#f1f5f9":"#0f172a" }}>📖 자주 찾는 개념</h3>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {CONCEPTS.slice(0,8).map(c => (
            <button key={c.id} onClick={() => onNav("concepts", { id: c.id })} style={{
              background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`,
              color: D?"#94a3b8":"#475569", borderRadius:8, padding:"6px 14px",
              cursor:"pointer", fontSize:13,
            }}>{c.title}</button>
          ))}
        </div>
      </div>

    </div>
  );
}
