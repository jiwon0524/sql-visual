import { useState } from "react";
import { PROBLEMS, STEPS } from "../data/problems.js";
import { useStore } from "../store.jsx";

const DIFF_COLOR = { "입문":"#10b981","기초":"#3b82f6","중급":"#f59e0b","실전":"#ef4444" };

// ── Problem List ──────────────────────────────────────────────────────────────
export function ProblemList({ onSelect, initFilter, darkMode }) {
  const { solved, bookmarks } = useStore();
  const D = darkMode;
  const [search,   setSearch]   = useState("");
  const [diff,     setDiff]     = useState("전체");
  const [cat,      setCat]      = useState(initFilter?.category || "전체");
  const [step,     setStep]     = useState("전체");
  const [status,   setStatus]   = useState("전체"); // 전체/완료/미완/오답

  const diffs = ["전체","입문","기초","중급","실전"];
  const cats  = ["전체", ...new Set(PROBLEMS.map(p => p.category))];
  const steps = ["전체", ...STEPS.map(s => `${s.step}단계: ${s.title}`)];

  const filtered = PROBLEMS.filter(p => {
    if (search && !p.title.includes(search) && !p.id.includes(search) && !p.category.includes(search)) return false;
    if (diff !== "전체" && p.difficulty !== diff) return false;
    if (cat  !== "전체" && p.category  !== cat)  return false;
    if (step !== "전체") {
      const stepNum = parseInt(step);
      if (p.step !== stepNum) return false;
    }
    if (status === "완료" && !solved[p.id]?.correct) return false;
    if (status === "미완" && solved[p.id]?.correct)  return false;
    if (status === "오답" && !(solved[p.id] && !solved[p.id].correct)) return false;
    return true;
  });

  const sel = (label, val, set, opts) => (
    <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center" }}>
      <span style={{ fontSize:12, color:"#94a3b8", minWidth:30 }}>{label}</span>
      {opts.map(o => (
        <button key={o} onClick={() => set(o)} style={{
          padding:"3px 10px", borderRadius:6, border:`1px solid ${val===o?"#3b82f6":"#334155"}`,
          background: val===o?"#3b82f620":"transparent",
          color: val===o?"#3b82f6": D?"#94a3b8":"#475569",
          cursor:"pointer", fontSize:12,
        }}>{o}</button>
      ))}
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Filters */}
      <div style={{ background: D?"#1e293b":"#fff", borderRadius:12, padding:16, border:`1px solid ${D?"#334155":"#e2e8f0"}`, display:"flex", flexDirection:"column", gap:10 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 문제 검색..."
          style={{ padding:"8px 12px", borderRadius:8, border:`1px solid ${D?"#334155":"#e2e8f0"}`, background: D?"#0f172a":"#f8fafc", color: D?"#f1f5f9":"#0f172a", fontSize:13, outline:"none" }}/>
        {sel("난이도", diff, setDiff, diffs)}
        {sel("상태",   status, setStatus, ["전체","완료","미완","오답"])}
      </div>

      {/* Count */}
      <div style={{ fontSize:13, color:"#64748b" }}>{filtered.length}개 문제</div>

      {/* List */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {filtered.map(p => {
          const s = solved[p.id];
          const isBookmarked = bookmarks.includes(p.id);
          return (
            <div key={p.id} onClick={() => onSelect(p.id)} style={{
              background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`,
              borderRadius:10, padding:"14px 16px", cursor:"pointer",
              display:"flex", alignItems:"center", gap:12,
              borderLeft:`3px solid ${s?.correct?"#10b981":s?"#ef4444":D?"#334155":"#e2e8f0"}`,
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor="#3b82f6"}
              onMouseLeave={e => e.currentTarget.style.borderColor= s?.correct?"#10b981":s?"#ef4444":D?"#334155":"#e2e8f0"}
            >
              <div style={{ width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, background: s?.correct?"#10b98120":s?"#ef444420":"#f1f5f9", flexShrink:0 }}>
                {s?.correct ? "✅" : s ? "❌" : "○"}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:3 }}>
                  <span style={{ fontSize:11, color:"#94a3b8", fontFamily:"monospace" }}>{p.id}</span>
                  <span style={{ background:DIFF_COLOR[p.difficulty]+"20", color:DIFF_COLOR[p.difficulty], fontSize:10, padding:"1px 6px", borderRadius:4, fontWeight:700 }}>{p.difficulty}</span>
                  <span style={{ background:"#3b82f620", color:"#3b82f6", fontSize:10, padding:"1px 6px", borderRadius:4 }}>{p.category}</span>
                  <span style={{ background:"#f1f5f9", color:"#64748b", fontSize:10, padding:"1px 6px", borderRadius:4 }}>{p.step}단계</span>
                </div>
                <div style={{ fontWeight:600, color: D?"#f1f5f9":"#0f172a", fontSize:14 }}>{p.title}</div>
              </div>
              {s && <div style={{ fontSize:11, color:"#94a3b8" }}>{s.attempts}회 시도</div>}
              {isBookmarked && <span style={{ fontSize:14 }}>🔖</span>}
              <span style={{ color:"#94a3b8", fontSize:16 }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Problem Solver ────────────────────────────────────────────────────────────
export function ProblemSolver({ problemId, onBack, onNext, darkMode }) {
  const prob = PROBLEMS.find(p => p.id === problemId);
  const { solved, markSolved, bookmarks, toggleBookmark, addRecentProb } = useStore();
  const D = darkMode;

  const [answer,   setAnswer]   = useState(prob?.starterCode || "");
  const [result,   setResult]   = useState(null); // null | {correct, feedback}
  const [showHint, setShowHint] = useState(false);
  const [hintIdx,  setHintIdx]  = useState(0);
  const [showExpl, setShowExpl] = useState(false);
  const [mode,     setMode]     = useState("연습"); // 연습|시험

  if (!prob) return <div style={{color:"#94a3b8",padding:40,textAlign:"center"}}>문제를 찾을 수 없습니다.</div>;

  const submit = () => {
    addRecentProb(prob.id);
    const correct = prob.checkFn(answer);
    const feedback = correct ? [] : prob.feedbackFn(answer);
    setResult({ correct, feedback });
    markSolved(prob.id, correct);
    if (correct) setShowExpl(true);
  };

  const reset = () => { setAnswer(prob.starterCode || ""); setResult(null); setShowHint(false); setHintIdx(0); setShowExpl(false); };

  const isBookmarked = bookmarks.includes(prob.id);
  const prevSolved   = solved[prob.id];
  const nextProb     = PROBLEMS.find((p,i) => PROBLEMS[i-1]?.id === prob.id);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        <button onClick={onBack} style={{ background:"transparent", border:`1px solid ${D?"#334155":"#e2e8f0"}`, color:"#94a3b8", borderRadius:6, padding:"4px 12px", cursor:"pointer", fontSize:13 }}>← 목록</button>
        <span style={{ fontFamily:"monospace", fontSize:12, color:"#94a3b8" }}>{prob.id}</span>
        <span style={{ background:DIFF_COLOR[prob.difficulty]+"20", color:DIFF_COLOR[prob.difficulty], fontSize:11, padding:"2px 8px", borderRadius:4, fontWeight:700 }}>{prob.difficulty}</span>
        <span style={{ background:"#3b82f620", color:"#3b82f6", fontSize:11, padding:"2px 8px", borderRadius:4 }}>{prob.category}</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
          {["연습","시험"].map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding:"4px 12px", borderRadius:6, border:`1px solid ${mode===m?"#3b82f6":"#334155"}`,
              background: mode===m?"#3b82f620":"transparent",
              color: mode===m?"#3b82f6": D?"#94a3b8":"#475569",
              cursor:"pointer", fontSize:12,
            }}>{m} 모드</button>
          ))}
          <button onClick={() => toggleBookmark(prob.id)} style={{ background:"transparent", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:6, padding:"4px 10px", cursor:"pointer", fontSize:14 }}>
            {isBookmarked ? "🔖" : "📄"}
          </button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {/* Left: Problem */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:12, padding:20 }}>
            <h2 style={{ margin:"0 0 12px", fontSize:18, color: D?"#f1f5f9":"#0f172a" }}>{prob.title}</h2>
            <pre style={{ margin:0, whiteSpace:"pre-wrap", fontSize:13, color: D?"#94a3b8":"#475569", lineHeight:1.7, fontFamily:"sans-serif" }}>{prob.description}</pre>

            {/* Previous result badge */}
            {prevSolved && (
              <div style={{ marginTop:12, padding:"6px 12px", borderRadius:6, background: prevSolved.correct?"#10b98120":"#ef444420", color: prevSolved.correct?"#10b981":"#ef4444", fontSize:12 }}>
                {prevSolved.correct ? `✅ ${prevSolved.attempts}번째에 정답!` : `❌ ${prevSolved.attempts}회 시도 중`}
              </div>
            )}
          </div>

          {/* Hints - only in practice mode */}
          {mode === "연습" && (
            <div style={{ background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:12, padding:16 }}>
              <button onClick={() => { setShowHint(true); setHintIdx(i => Math.min(i+1, prob.hints.length-1)); }} style={{
                background:"#f59e0b20", border:"1px solid #f59e0b40", color:"#f59e0b",
                borderRadius:6, padding:"6px 14px", cursor:"pointer", fontSize:13, fontWeight:600,
              }}>💡 힌트 보기 ({hintIdx+1}/{prob.hints.length})</button>
              {showHint && prob.hints.slice(0, hintIdx+1).map((h,i) => (
                <div key={i} style={{ marginTop:8, padding:10, background:"#f59e0b10", borderRadius:8, fontSize:13, color: D?"#fde68a":"#92400e" }}>• {h}</div>
              ))}
            </div>
          )}

          {/* Related concepts */}
          <div style={{ background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:12, padding:16 }}>
            <div style={{ fontSize:12, color:"#94a3b8", marginBottom:8 }}>관련 개념</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {prob.relatedConcepts.map(c => (
                <span key={c} style={{ background:"#3b82f620", color:"#3b82f6", fontSize:12, padding:"3px 10px", borderRadius:6 }}>{c}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Editor + Result */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {/* Editor */}
          <div style={{ background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:12, overflow:"hidden" }}>
            <div style={{ background:"#1e40af", padding:"8px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ color:"#93c5fd", fontSize:12 }}>SQL 작성</span>
              <button onClick={reset} style={{ background:"transparent", border:"none", color:"#93c5fd", cursor:"pointer", fontSize:12 }}>초기화</button>
            </div>

            {/* OX / Choice */}
            {prob.type === "ox" && (
              <div style={{ padding:20, display:"flex", gap:12, justifyContent:"center" }}>
                {["O","X"].map(v => (
                  <button key={v} onClick={() => setAnswer(v)} style={{
                    width:80, height:80, borderRadius:12, fontSize:32, fontWeight:800,
                    border:`2px solid ${answer===v?"#3b82f6":"#334155"}`,
                    background: answer===v?"#3b82f620":"transparent",
                    color: v==="O"?"#10b981":"#ef4444", cursor:"pointer",
                  }}>{v}</button>
                ))}
              </div>
            )}
            {prob.type === "choice" && (
              <div style={{ padding:16, display:"flex", flexDirection:"column", gap:8 }}>
                {prob.options.map((opt,i) => (
                  <button key={i} onClick={() => setAnswer(opt)} style={{
                    padding:"10px 14px", borderRadius:8, textAlign:"left",
                    border:`1.5px solid ${answer===opt?"#3b82f6":"#334155"}`,
                    background: answer===opt?"#3b82f620":"transparent",
                    color: D?"#f1f5f9":"#0f172a", cursor:"pointer", fontSize:13,
                  }}>{String.fromCharCode(65+i)}. {opt}</button>
                ))}
              </div>
            )}
            {(prob.type === "write" || prob.type === "fix") && (
              <textarea value={answer} onChange={e => setAnswer(e.target.value)}
                style={{
                  width:"100%", minHeight:200, background: D?"#0f172a":"#f8fafc",
                  border:"none", outline:"none", color: D?"#e2e8f0":"#0f172a",
                  fontFamily:"'JetBrains Mono','Fira Code',monospace", fontSize:13,
                  lineHeight:1.7, padding:14, resize:"vertical", boxSizing:"border-box",
                }} spellCheck={false}/>
            )}
          </div>

          {/* Actions */}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={submit} style={{
              flex:1, background:"#2563eb", color:"#fff", border:"none",
              borderRadius:8, padding:"10px", cursor:"pointer", fontWeight:700, fontSize:14,
            }}>제출하기</button>
            {mode === "연습" && !showExpl && result && (
              <button onClick={() => setShowExpl(true)} style={{
                background:"transparent", border:"1px solid #334155", color:"#94a3b8",
                borderRadius:8, padding:"10px 14px", cursor:"pointer", fontSize:13,
              }}>해설 보기</button>
            )}
          </div>

          {/* Result */}
          {result && (
            <div style={{
              background: result.correct ? "#10b98115" : "#ef444415",
              border:`1px solid ${result.correct?"#10b981":"#ef4444"}40`,
              borderRadius:12, padding:16,
            }}>
              <div style={{ fontWeight:700, fontSize:15, color: result.correct?"#10b981":"#ef4444", marginBottom:8 }}>
                {result.correct ? "🎉 정답입니다!" : "❌ 틀렸습니다"}
              </div>
              {!result.correct && result.feedback.length > 0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <div style={{ fontSize:12, color:"#94a3b8", marginBottom:4 }}>틀린 이유:</div>
                  {result.feedback.map((f,i) => (
                    <div key={i} style={{ fontSize:13, color: D?"#fca5a5":"#dc2626", padding:"4px 0" }}>• {f}</div>
                  ))}
                </div>
              )}
              {result.correct && nextProb && (
                <button onClick={() => onNext(nextProb.id)} style={{
                  marginTop:10, background:"#10b981", color:"#fff", border:"none",
                  borderRadius:6, padding:"6px 16px", cursor:"pointer", fontSize:13, fontWeight:700,
                }}>다음 문제 → {nextProb.id}</button>
              )}
            </div>
          )}

          {/* Explanation */}
          {showExpl && (
            <div style={{ background: D?"#1e293b":"#fff", border:`1px solid ${D?"#334155":"#e2e8f0"}`, borderRadius:12, padding:16 }}>
              <div style={{ fontWeight:700, fontSize:13, color: D?"#f1f5f9":"#0f172a", marginBottom:8 }}>📚 해설</div>
              <div style={{ fontSize:13, color: D?"#94a3b8":"#475569", lineHeight:1.7 }}>{prob.explanation}</div>
              {prob.expectedKeywords.length > 0 && (
                <div style={{ marginTop:12 }}>
                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6 }}>핵심 키워드</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {prob.expectedKeywords.map(k => (
                      <code key={k} style={{ background:"#3b82f620", color:"#3b82f6", fontSize:11, padding:"2px 8px", borderRadius:4 }}>{k}</code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
