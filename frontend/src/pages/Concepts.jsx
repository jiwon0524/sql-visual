import { useState } from "react";
import { CONCEPTS, CONCEPT_CATEGORIES } from "../data/concepts.js";
import { useStore } from "../store.jsx";

export default function ConceptsPage({ initId, darkMode, onNav }) {
  const { addRecentConcept } = useStore();
  const D = darkMode;
  const [selected, setSelected] = useState(initId || null);
  const [search, setSearch] = useState("");

  const select = (id) => { setSelected(id); addRecentConcept(id); };
  const concept = CONCEPTS.find(c => c.id === selected);

  const filtered = search
    ? CONCEPTS.filter(c => c.title.includes(search) || c.summary.includes(search) || c.category.includes(search))
    : null;

  const catColor = {"SQL 기초":"#6366f1","CREATE TABLE":"#3b82f6","키 개념":"#f59e0b","제약조건":"#10b981","무결성":"#ec4899","조회":"#06b6d4","관계형 설계":"#8b5cf6","고급 주제":"#ef4444"};

  return (
    <div style={{ display:"flex", gap:0, minHeight:"70vh" }}>
      {/* Sidebar */}
      <div style={{ width:220, flexShrink:0, borderRight:`1px solid ${D?"#334155":"#e2e8f0"}`, paddingRight:16, marginRight:24 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="개념 검색..."
          style={{ width:"100%", padding:"7px 10px", borderRadius:8, border:`1px solid ${D?"#334155":"#e2e8f0"}`, background: D?"#0f172a":"#f8fafc", color: D?"#f1f5f9":"#0f172a", fontSize:12, outline:"none", boxSizing:"border-box", marginBottom:14 }}/>

        {/* Search results */}
        {search && filtered && (
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>{filtered.length}개 결과</div>
            {filtered.map(c => (
              <button key={c.id} onClick={() => { select(c.id); setSearch(""); }} style={{
                textAlign:"left", padding:"6px 10px", borderRadius:6, border:"none",
                background: selected===c.id ? "#3b82f620":"transparent",
                color: selected===c.id ? "#3b82f6": D?"#94a3b8":"#475569",
                cursor:"pointer", fontSize:13, width:"100%",
              }}>{c.title}</button>
            ))}
          </div>
        )}

        {/* Category tree */}
        {!search && CONCEPT_CATEGORIES.map(cat => (
          <div key={cat.name} style={{ marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:700, color: catColor[cat.name]||"#94a3b8", textTransform:"uppercase", letterSpacing:1, marginBottom:6, padding:"2px 0" }}>
              {cat.name}
            </div>
            {cat.ids.map(id => {
              const c = CONCEPTS.find(x => x.id === id);
              if (!c) return null;
              return (
                <button key={id} onClick={() => select(id)} style={{
                  display:"block", width:"100%", textAlign:"left",
                  padding:"5px 8px", borderRadius:6, border:"none",
                  background: selected===id ? "#3b82f620":"transparent",
                  color: selected===id ? "#3b82f6": D?"#94a3b8":"#475569",
                  cursor:"pointer", fontSize:13,
                }}>{c.title}</button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex:1, minWidth:0 }}>
        {!concept ? (
          <div style={{ textAlign:"center", padding:"60px 20px", color:"#94a3b8" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📖</div>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:6, color: D?"#f1f5f9":"#0f172a" }}>개념 문서</div>
            <div style={{ fontSize:13 }}>왼쪽에서 개념을 선택하거나 검색하세요</div>
            {/* Quick access grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10, marginTop:28, textAlign:"left" }}>
              {CONCEPTS.map(c => (
                <div key={c.id} onClick={() => select(c.id)} style={{
                  background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`,
                  borderRadius:10, padding:"12px 14px", cursor:"pointer",
                }}>
                  <div style={{ fontWeight:700, fontSize:13, color: D?"#f1f5f9":"#0f172a", marginBottom:4 }}>{c.title}</div>
                  <div style={{ fontSize:11, color:"#94a3b8", lineHeight:1.5 }}>{c.summary}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <ConceptDoc concept={concept} D={D} onNav={onNav} onSelectConcept={id => select(CONCEPTS.find(c=>c.title===id)?.id)}/>
        )}
      </div>
    </div>
  );
}

function ConceptDoc({ concept: c, D, onNav, onSelectConcept }) {
  const [tab, setTab] = useState("쉬운 설명");
  const tabs = ["쉬운 설명","문법","예제","자주 하는 실수","시험 포인트"];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {/* Title */}
      <div>
        <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>{c.category}</div>
        <h1 style={{ margin:0, fontSize:26, fontWeight:800, color: D?"#f1f5f9":"#0f172a" }}>{c.title}</h1>
        <p style={{ margin:"8px 0 0", fontSize:15, color:"#64748b", lineHeight:1.6 }}>{c.summary}</p>
      </div>

      {/* Definition box */}
      <div style={{ background: D?"#1e3a5f":"#eff6ff", border:`1px solid ${D?"#1d4ed8":"#bfdbfe"}`, borderRadius:10, padding:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#3b82f6", marginBottom:6 }}>정의</div>
        <div style={{ fontSize:14, color: D?"#bfdbfe":"#1e40af", lineHeight:1.7 }}>{c.definition}</div>
      </div>

      {/* Tab nav */}
      <div style={{ display:"flex", gap:4, borderBottom:`1px solid ${D?"#334155":"#e2e8f0"}`, paddingBottom:0 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:"7px 14px", border:"none", background:"transparent",
            color: tab===t ? "#3b82f6": D?"#94a3b8":"#64748b",
            borderBottom: tab===t ? "2px solid #3b82f6":"2px solid transparent",
            cursor:"pointer", fontSize:13, fontWeight: tab===t?700:400,
            marginBottom:-1,
          }}>{t}</button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === "쉬운 설명" && (
          <div style={{ background: D?"#1e293b":"#f0fdf4", borderRadius:10, padding:16, border:`1px solid ${D?"#334155":"#bbf7d0"}` }}>
            <div style={{ fontSize:13, color: D?"#86efac":"#166534", lineHeight:1.8 }}>{c.easyExplanation}</div>
          </div>
        )}
        {tab === "문법" && (
          <div style={{ background:"#0f172a", borderRadius:10, padding:16 }}>
            <pre style={{ margin:0, color:"#e2e8f0", fontFamily:"'JetBrains Mono',monospace", fontSize:13, lineHeight:1.7, whiteSpace:"pre-wrap" }}>{c.syntax}</pre>
          </div>
        )}
        {tab === "예제" && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            {c.examples.map((ex, i) => (
              <div key={i}>
                <div style={{ fontSize:13, fontWeight:600, color: D?"#f1f5f9":"#0f172a", marginBottom:8 }}>{ex.title}</div>
                <div style={{ background:"#0f172a", borderRadius:10, padding:14 }}>
                  <pre style={{ margin:0, color:"#86efac", fontFamily:"'JetBrains Mono',monospace", fontSize:13, lineHeight:1.7, whiteSpace:"pre-wrap" }}>{ex.code}</pre>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "자주 하는 실수" && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {c.commonMistakes.map((m, i) => (
              <div key={i} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", display:"flex", gap:8 }}>
                <span style={{ color:"#ef4444" }}>⚠️</span>
                <span style={{ fontSize:13, color:"#dc2626" }}>{m}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "시험 포인트" && (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {c.examTips.map((t, i) => (
              <div key={i} style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"10px 14px", display:"flex", gap:8 }}>
                <span>📝</span>
                <span style={{ fontSize:13, color:"#92400e" }}>{t}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Related problems */}
      {c.relatedProblems.length > 0 && (
        <div style={{ background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:10, padding:16 }}>
          <div style={{ fontWeight:700, fontSize:13, color: D?"#f1f5f9":"#0f172a", marginBottom:10 }}>🎯 관련 문제 풀기</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {c.relatedProblems.map(id => (
              <button key={id} onClick={() => onNav("problems", { id })} style={{
                background:"#2563eb", color:"#fff", border:"none",
                borderRadius:6, padding:"6px 14px", cursor:"pointer", fontSize:13, fontWeight:600,
              }}>{id} →</button>
            ))}
          </div>
        </div>
      )}

      {/* Related concepts */}
      {c.relatedConcepts.length > 0 && (
        <div style={{ background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:10, padding:16 }}>
          <div style={{ fontWeight:700, fontSize:13, color: D?"#f1f5f9":"#0f172a", marginBottom:8 }}>함께 보면 좋은 개념</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {c.relatedConcepts.map(r => (
              <button key={r} onClick={() => onSelectConcept(r)} style={{
                background: D?"#334155":"#f1f5f9", color: D?"#94a3b8":"#475569",
                border:"none", borderRadius:6, padding:"5px 12px", cursor:"pointer", fontSize:13,
              }}>{r}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
