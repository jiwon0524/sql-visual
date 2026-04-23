import { useState, useEffect, useRef, useCallback } from "react";
import { explainSQL, analyzeError, parseCreateTable, splitStatements } from "./utils/sqlAnalyzer.js";
import { api, authStore } from "./utils/api.js";
import initSqlJs from "sql.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 디자인 시스템
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const C = {
  // 폰트 — 시스템 폰트 기반, Claude와 동일한 가독성
  sans: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', 'Apple SD Gothic Neo', Helvetica, sans-serif`,
  mono: `'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace`,
  // 색상
  bg:       "#f9fafb",
  surface:  "#ffffff",
  border:   "#e5e7eb",
  borderDk: "#d1d5db",
  text:     "#111827",
  textSub:  "#4b5563",
  muted:    "#9ca3af",
  accent:   "#2563eb",
  accentHov:"#1d4ed8",
  accentBg: "#eff6ff",
  accentBdr:"#bfdbfe",
  green:    "#16a34a",
  greenBg:  "#f0fdf4",
  greenBdr: "#bbf7d0",
  red:      "#dc2626",
  redBg:    "#fef2f2",
  redBdr:   "#fecaca",
  yellow:   "#d97706",
  yellowBg: "#fffbeb",
  yellowBdr:"#fde68a",
  purple:   "#7c3aed",
  purpleBg: "#f5f3ff",
  purpleBdr:"#ddd6fe",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 UI 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Btn({ children, onClick, variant="default", size="md", full, disabled, style:s={} }) {
  const sz = { sm:{ fontSize:12, padding:"5px 12px", borderRadius:7 }, md:{ fontSize:13.5, padding:"7px 16px", borderRadius:8 }, lg:{ fontSize:15, padding:"11px 24px", borderRadius:10 } }[size];
  const vr = {
    primary: { background:C.accent, color:"#fff", border:"none" },
    secondary:{ background:C.surface, color:C.textSub, border:`1px solid ${C.border}` },
    ghost:   { background:"transparent", color:C.textSub, border:"none" },
    danger:  { background:C.redBg, color:C.red, border:`1px solid ${C.redBdr}` },
    naver:   { background:"#03C75A", color:"#fff", border:"none" },
    default: { background:C.surface, color:C.textSub, border:`1px solid ${C.border}` },
  }[variant];
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ ...sz, ...vr, cursor:disabled?"not-allowed":"pointer", opacity: disabled ? 0.6 : 1,
        display:"inline-flex", alignItems:"center", justifyContent:"center", gap:6, fontFamily:C.sans,
        fontWeight:600, width:full?"100%":undefined, transition:"all .15s",
        filter: hov&&!disabled ? "brightness(.93)":"none", ...s }}>
      {children}
    </button>
  );
}

function Card({ children, style:s={}, onClick, hover }) {
  const [hov, setHov] = useState(false);
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:24,
        cursor:onClick?"pointer":"default", transition:"all .15s",
        boxShadow: hover&&hov ? "0 4px 20px #2563eb18" : "0 1px 4px #0000000a",
        borderColor: hover&&hov ? C.accentBdr : C.border, ...s }}>
      {children}
    </div>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div style={{ position:"fixed",inset:0,background:"#0007",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }} onClick={onClose}>
      <div style={{ background:C.surface,borderRadius:16,padding:"28px 28px 24px",width:"100%",maxWidth:wide?920:500,maxHeight:"90vh",overflow:"auto",boxShadow:"0 24px 80px #00000030" }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:22 }}>
          <h3 style={{ margin:0,fontSize:17,fontWeight:700,color:C.text,fontFamily:C.sans }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none",border:"none",cursor:"pointer",fontSize:22,color:C.muted,lineHeight:1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Tag({ label, color=C.accent }) {
  return <span style={{ background:color+"18",border:`1px solid ${color}40`,color,fontSize:11,padding:"2px 8px",borderRadius:5,fontWeight:700,fontFamily:C.sans }}>{label}</span>;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 네비게이션
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Nav({ page, setPage, user, onLogout }) {
  const navItems = [
    { id:"home",       label:"홈" },
    { id:"editor",     label:"SQL 편집기" },
    { id:"visualizer", label:"테이블 시각화" },
    { id:"concepts",   label:"개념 학습" },
    { id:"docs",       label:"내 문서", authOnly:true },
  ];

  return (
    <header style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, position:"sticky", top:0, zIndex:200, boxShadow:"0 1px 3px #00000008" }}>
      <div style={{ maxWidth:1200, margin:"0 auto", padding:"0 24px", height:56, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        {/* 로고 */}
        <button onClick={()=>setPage("home")} style={{ background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:10,padding:0 }}>
          <div style={{ width:34,height:34,background:`linear-gradient(135deg,${C.accent},#1d4ed8)`,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11,fontFamily:C.mono,letterSpacing:-.5 }}>SQL</div>
          <span style={{ fontWeight:800,fontSize:17,color:C.text,fontFamily:C.sans }}>SQL<span style={{color:C.accent}}>Visual</span></span>
        </button>

        {/* 중앙 메뉴 */}
        <nav style={{ display:"flex",alignItems:"center",gap:2 }}>
          {navItems.filter(n => !n.authOnly || user).map(n => (
            <NavItem key={n.id} label={n.label} active={page===n.id} onClick={()=>setPage(n.id)} />
          ))}
        </nav>

        {/* 우측 유저 영역 */}
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          {user ? (
            <>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <div style={{ width:30,height:30,borderRadius:"50%",background:C.accentBg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14 }}>👤</div>
                <span style={{ fontSize:13,color:C.textSub,fontFamily:C.sans }}>{user.username}</span>
              </div>
              <Btn onClick={onLogout} size="sm" variant="secondary">로그아웃</Btn>
            </>
          ) : (
            <>
              <Btn onClick={()=>setPage("login")} size="sm" variant="secondary">로그인</Btn>
              <Btn onClick={()=>setPage("login")} size="sm" variant="primary">회원가입</Btn>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavItem({ label, active, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} style={{
      padding:"6px 14px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:C.sans, fontSize:14, fontWeight:active?700:500,
      background: active ? C.accentBg : (hov ? "#f3f4f6" : "transparent"),
      color: active ? C.accent : (hov ? C.text : C.textSub),
    }}>{label}</button>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HomePage({ setPage, user }) {
  return (
    <div style={{ background:C.bg }}>
      {/* Hero 2단 구조 */}
      <div style={{ maxWidth:1160,margin:"0 auto",padding:"80px 24px 60px",display:"grid",gridTemplateColumns:"1fr 1fr",gap:60,alignItems:"center" }}>
        {/* 왼쪽: 카피 + 버튼 */}
        <div>
          <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:C.accentBg,border:`1px solid ${C.accentBdr}`,borderRadius:99,padding:"5px 14px",fontSize:13,color:C.accent,fontWeight:600,marginBottom:24,fontFamily:C.sans }}>
            ✨ SQL 실습 + 학습 플랫폼
          </div>
          <h1 style={{ fontSize:44,fontWeight:800,color:C.text,lineHeight:1.22,margin:"0 0 18px",fontFamily:C.sans }}>
            SQL을 직접 써보고<br/><span style={{color:C.accent}}>눈으로 이해하세요</span>
          </h1>
          <p style={{ fontSize:17,color:C.textSub,lineHeight:1.75,margin:"0 0 36px",fontFamily:C.sans }}>
            SQL을 작성하면 자동으로 해설해드립니다.<br/>
            테이블 구조를 그림으로 보고, 핵심 개념을 체계적으로 학습하세요.
          </p>
          <div style={{ display:"flex",gap:12,flexWrap:"wrap" }}>
            <Btn onClick={()=>setPage("editor")} variant="primary" size="lg">✏️  SQL 시작하기</Btn>
            <Btn onClick={()=>setPage("concepts")} size="lg">📖  개념 학습</Btn>
            {!user && <Btn onClick={()=>setPage("login")} size="lg" variant="secondary">🔐  로그인</Btn>}
          </div>
          {/* 통계 */}
          <div style={{ display:"flex",gap:28,marginTop:44,paddingTop:32,borderTop:`1px solid ${C.border}` }}>
            {[{n:"10+",l:"SQL 개념 문서"},{n:"브라우저",l:"SQL 실행"},{n:"무료",l:"완전 무료"}].map(s=>(
              <div key={s.l}>
                <div style={{ fontSize:20,fontWeight:800,color:C.text,fontFamily:C.sans }}>{s.n}</div>
                <div style={{ fontSize:12,color:C.muted,marginTop:2,fontFamily:C.sans }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 오른쪽: 에디터 미리보기 카드 */}
        <div>
          <div style={{ borderRadius:16,overflow:"hidden",boxShadow:"0 20px 60px #2563eb20",border:`1px solid ${C.border}` }}>
            {/* 에디터 창 */}
            <div style={{ background:"#0f172a",padding:0 }}>
              <div style={{ padding:"10px 16px",borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",gap:8 }}>
                {["#ef4444","#f59e0b","#10b981"].map((c,i)=><div key={i} style={{width:11,height:11,borderRadius:"50%",background:c}}/>)}
                <span style={{ color:"#64748b",fontSize:11,fontFamily:C.mono,marginLeft:6 }}>SQL Editor</span>
              </div>
              <pre style={{ margin:0,padding:"16px 20px",color:"#e2e8f0",fontFamily:C.mono,fontSize:13,lineHeight:1.7 }}>{`<span style="color:#93c5fd">SELECT</span> s.name, d.dept_name
<span style="color:#93c5fd">FROM</span> student s
<span style="color:#93c5fd">INNER JOIN</span> department d
  <span style="color:#93c5fd">ON</span> s.dept_id = d.dept_id
<span style="color:#93c5fd">WHERE</span> s.gpa >= <span style="color:#86efac">3.5</span>
<span style="color:#93c5fd">ORDER BY</span> s.gpa <span style="color:#93c5fd">DESC</span>;`}</pre>
            </div>
            {/* 결과 카드 */}
            <div style={{ background:C.surface,padding:16 }}>
              <div style={{ fontSize:11,fontWeight:700,color:C.muted,marginBottom:10,fontFamily:C.sans }}>📊 결과</div>
              <table style={{ borderCollapse:"collapse",width:"100%",fontFamily:C.mono,fontSize:12 }}>
                <thead><tr style={{background:C.accentBg}}>{["name","dept_name"].map(c=><th key={c} style={{padding:"5px 10px",textAlign:"left",color:C.accent,fontWeight:700}}>{c}</th>)}</tr></thead>
                <tbody>
                  {[["박지호","수학"],["김민준","컴퓨터공학"]].map((r,i)=><tr key={i} style={{background:i%2===0?"#f8fafc":C.surface}}>{r.map((v,j)=><td key={j} style={{padding:"5px 10px",color:C.text}}>{v}</td>)}</tr>)}
                </tbody>
              </table>
              <div style={{ marginTop:12,padding:"10px 14px",background:C.accentBg,borderRadius:8,fontSize:12,color:"#1e40af",fontFamily:C.sans }}>
                <b>💬 자동 해설:</b> student와 department를 JOIN하여 GPA 3.5 이상 학생을 내림차순으로 조회합니다.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 기능 소개 섹션 */}
      <div style={{ background:C.surface,borderTop:`1px solid ${C.border}`,borderBottom:`1px solid ${C.border}` }}>
        <div style={{ maxWidth:1160,margin:"0 auto",padding:"60px 24px" }}>
          <h2 style={{ fontSize:26,fontWeight:800,color:C.text,textAlign:"center",margin:"0 0 8px",fontFamily:C.sans }}>핵심 기능</h2>
          <p style={{ textAlign:"center",color:C.textSub,fontSize:15,margin:"0 0 44px",fontFamily:C.sans }}>SQL 학습에 필요한 모든 것을 하나에서</p>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20 }}>
            {[
              { icon:"⚡", title:"즉시 실행", desc:"브라우저에서 SQL을 바로 실행하고 결과를 확인하세요. 설치 없이 가능합니다.", color:C.accent },
              { icon:"💬", title:"자동 해설", desc:"SELECT/JOIN/GROUP BY 등 작성한 SQL의 의미를 자동으로 설명해드립니다.", color:C.green },
              { icon:"🗂", title:"테이블 시각화", desc:"CREATE TABLE을 작성하면 컬럼, PK, FK 관계를 다이어그램으로 보여줍니다.", color:C.purple },
              { icon:"🔍", title:"에러 분석", desc:"문법 오류 시 왜 틀렸는지 친절하게 알려줍니다. 오타·쉼표·괄호까지.", color:C.yellow },
              { icon:"📖", title:"개념 학습", desc:"PRIMARY KEY, JOIN, GROUP BY 등 SQL 핵심 개념을 API 문서 스타일로 정리했습니다.", color:"#0891b2" },
              { icon:"💾", title:"문서 저장", desc:"작성한 SQL을 저장하고 언제든지 다시 불러올 수 있습니다. (로그인 필요)", color:"#db2777" },
            ].map(f=>(
              <Card key={f.title} hover style={{ padding:24 }}>
                <div style={{ width:44,height:44,background:f.color+"15",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,marginBottom:14 }}>{f.icon}</div>
                <div style={{ fontWeight:700,fontSize:15,color:C.text,marginBottom:8,fontFamily:C.sans }}>{f.title}</div>
                <div style={{ fontSize:13,color:C.textSub,lineHeight:1.7,fontFamily:C.sans }}>{f.desc}</div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로그인 페이지 (네이버 OAuth)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function LoginPage({ setPage, onLogin }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleNaver = async () => {
    setLoading(true);
    try {
      // 백엔드가 없을 때를 대비한 데모 모드
      if (!import.meta.env.VITE_HAS_BACKEND) {
        // 데모: 가상 로그인
        const fakeToken = btoa(JSON.stringify({alg:"HS256"})) + "." +
          btoa(JSON.stringify({id:1,username:"데모 사용자",exp:Math.floor(Date.now()/1000)+86400*7})) + ".fake";
        authStore.save(fakeToken);
        onLogin({id:1, username:"데모 사용자"});
        setPage("editor");
        return;
      }
      const { url } = await api.naverLoginUrl();
      window.location.href = url;
    } catch {
      setError("로그인 서버에 연결할 수 없습니다. 데모 모드로 진행합니다.");
      // 데모 로그인 처리
      setTimeout(()=>{
        const fakeToken = btoa(JSON.stringify({alg:"HS256"})) + "." +
          btoa(JSON.stringify({id:1,username:"데모 사용자",exp:Math.floor(Date.now()/1000)+86400*7})) + ".fake";
        authStore.save(fakeToken);
        onLogin({id:1, username:"데모 사용자"});
        setPage("editor");
      }, 1500);
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"80vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg,padding:24 }}>
      <div style={{ width:"100%",maxWidth:420 }}>
        <Card style={{ padding:"44px 36px",textAlign:"center" }}>
          <div style={{ width:56,height:56,background:C.accentBg,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:26 }}>🔐</div>
          <h2 style={{ fontSize:22,fontWeight:800,color:C.text,margin:"0 0 8px",fontFamily:C.sans }}>로그인</h2>
          <p style={{ fontSize:14,color:C.textSub,margin:"0 0 32px",lineHeight:1.6,fontFamily:C.sans }}>
            로그인하면 SQL 문서를 저장하고<br/>언제든지 다시 불러올 수 있습니다.
          </p>
          {error && <div style={{ fontSize:13,color:C.red,marginBottom:16,fontFamily:C.sans }}>⚠️ {error}</div>}
          {/* 네이버 로그인 버튼 */}
          <button onClick={handleNaver} disabled={loading} style={{
            width:"100%",padding:"12px 20px",borderRadius:10,border:"none",
            background:"#03C75A",color:"#fff",cursor:loading?"wait":"pointer",
            fontWeight:700,fontSize:15,fontFamily:C.sans,display:"flex",alignItems:"center",
            justifyContent:"center",gap:10,transition:"filter .15s",
            filter:loading?"brightness(.9)":"none",
          }}>
            {/* 네이버 N 로고 */}
            <span style={{ background:"#fff",color:"#03C75A",fontWeight:900,fontSize:14,width:22,height:22,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"serif" }}>N</span>
            {loading ? "연결 중..." : "네이버로 로그인"}
          </button>
          <div style={{ textAlign:"center",marginTop:20,fontSize:12,color:C.muted,fontFamily:C.sans }}>
            로그인 없이{" "}
            <button onClick={()=>setPage("editor")} style={{ background:"none",border:"none",color:C.accent,cursor:"pointer",fontSize:12,fontFamily:C.sans,fontWeight:600 }}>체험 모드</button>로 이용 가능
          </div>
        </Card>
        <div style={{ textAlign:"center",marginTop:20,fontSize:12,color:C.muted,fontFamily:C.sans }}>
          네이버 OAuth 2.0 · 개인정보는 저장하지 않습니다
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 테이블 시각화 다이어그램 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TableDiagram({ schemas }) {
  if (!schemas?.length) return (
    <div style={{ textAlign:"center",padding:"48px 0",color:C.muted,fontFamily:C.sans }}>
      <div style={{ fontSize:40,marginBottom:12 }}>⊞</div>
      <div style={{ fontSize:14 }}>CREATE TABLE 문을 실행하면 구조가 여기에 표시됩니다.</div>
    </div>
  );

  const badgeStyle = (color) => ({ background:color+"18",border:`1px solid ${color}40`,color,fontSize:10,padding:"1px 5px",borderRadius:3,fontWeight:700,marginLeft:3,fontFamily:C.sans });

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
      {/* FK 관계 요약 */}
      {schemas.some(s=>s.foreignKeys.length>0) && (
        <div style={{ background:C.purpleBg,border:`1px solid ${C.purpleBdr}`,borderRadius:10,padding:"12px 16px" }}>
          <div style={{ fontSize:12,fontWeight:700,color:C.purple,marginBottom:8,fontFamily:C.sans }}>🔗 테이블 관계</div>
          <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
            {schemas.flatMap(s=>s.foreignKeys.map(fk=>(
              <div key={`${s.tableName}-${fk.column}`} style={{ fontSize:13,color:"#5b21b6",fontFamily:C.mono }}>
                {s.tableName}.<b>{fk.column}</b> → {fk.refTable}.<b>{fk.refColumn}</b>
              </div>
            )))}
          </div>
        </div>
      )}
      {/* 테이블 카드들 */}
      <div style={{ display:"flex",flexWrap:"wrap",gap:16 }}>
        {schemas.map((schema,i)=>(
          <div key={i} style={{ border:`2px solid ${C.border}`,borderRadius:10,overflow:"hidden",minWidth:275,background:C.surface,boxShadow:"0 2px 10px #00000008" }}>
            <div style={{ background:"#1e40af",padding:"9px 14px",display:"flex",alignItems:"center",gap:8 }}>
              <span style={{ color:"#93c5fd",fontSize:12 }}>⊞</span>
              <span style={{ color:"#fff",fontWeight:700,fontFamily:C.mono,fontSize:14 }}>{schema.tableName}</span>
              <span style={{ color:"#93c5fd",fontSize:11,marginLeft:"auto" }}>{schema.columns.length} cols</span>
            </div>
            {schema.columns.map((col,ci)=>(
              <div key={ci} style={{ display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderBottom:`1px solid ${C.border}`,background:col.pk?"#fffbeb":ci%2===0?"#f9fafb":C.surface }}>
                <span style={{ width:16,textAlign:"center",fontSize:12 }}>{col.pk?"🔑":col.fk?"🔗":"·"}</span>
                <span style={{ fontFamily:C.mono,fontSize:13,minWidth:100,color:col.pk?"#92400e":col.fk?"#5b21b6":C.text,fontWeight:col.pk?700:400 }}>{col.name}</span>
                <span style={{ fontFamily:C.mono,fontSize:11,color:C.muted,flex:1 }}>{col.type}</span>
                <div style={{ display:"flex",flexWrap:"wrap" }}>
                  {col.pk&&<span style={badgeStyle("#d97706")}>PK</span>}
                  {col.fk&&<span style={badgeStyle(C.purple)}>FK</span>}
                  {col.notNull&&!col.pk&&<span style={badgeStyle(C.accent)}>NOT NULL</span>}
                  {col.unique&&!col.pk&&<span style={badgeStyle(C.green)}>UNIQUE</span>}
                  {col.check&&<span style={badgeStyle("#0891b2")}>CHECK</span>}
                  {col.default!=null&&<span style={badgeStyle(C.muted)}>DEFAULT</span>}
                </div>
              </div>
            ))}
            {schema.foreignKeys.length>0&&(
              <div style={{ padding:"7px 14px",background:C.purpleBg,borderTop:`1px solid ${C.border}` }}>
                {schema.foreignKeys.map((fk,fi)=><div key={fi} style={{ fontSize:11,color:"#5b21b6",fontFamily:C.mono }}>🔗 {fk.column} → {fk.refTable}({fk.refColumn})</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 테이블 시각화 전용 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VisualizerPage() {
  const [sql, setSql] = useState(`-- CREATE TABLE 문을 입력하면 구조를 시각화합니다.
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
  gpa DECIMAL(3,2),
  FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);`);
  const [schemas, setSchemas] = useState([]);

  const run = () => {
    const stmts = splitStatements(sql.split("\n").filter(l=>!l.trim().startsWith("--")).join("\n"));
    const newSchemas = [];
    for (const stmt of stmts) {
      if (/CREATE\s+TABLE/i.test(stmt)) {
        const s = parseCreateTable(stmt);
        if (s) newSchemas.push(s);
      }
    }
    setSchemas(newSchemas);
  };

  return (
    <div style={{ maxWidth:1160,margin:"0 auto",padding:"36px 24px" }}>
      <div style={{ marginBottom:28 }}>
        <h2 style={{ fontSize:22,fontWeight:800,color:C.text,margin:"0 0 6px",fontFamily:C.sans }}>🗂 테이블 구조 시각화</h2>
        <p style={{ fontSize:14,color:C.textSub,fontFamily:C.sans }}>CREATE TABLE 문을 입력하면 테이블 구조와 관계를 다이어그램으로 보여줍니다.</p>
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
        {/* 입력 */}
        <div>
          <div style={{ border:`1.5px solid ${C.border}`,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px #0000000a" }}>
            <div style={{ background:"#1e293b",padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
              <div style={{ display:"flex",gap:5 }}>{["#ef4444","#f59e0b","#10b981"].map((c,i)=><div key={i} style={{width:11,height:11,borderRadius:"50%",background:c}}/>)}</div>
              <span style={{ color:"#64748b",fontSize:11,fontFamily:C.mono }}>SQL Editor</span>
              <Btn onClick={run} size="sm" variant="primary">▶ 시각화</Btn>
            </div>
            <div style={{ display:"flex",background:"#0f172a" }}>
              <div style={{ padding:"14px 10px 14px 12px",color:"#334155",fontSize:12,fontFamily:C.mono,lineHeight:"1.65",textAlign:"right",userSelect:"none",minWidth:34,borderRight:"1px solid #1e293b" }}>
                {sql.split("\n").map((_,i)=><div key={i}>{i+1}</div>)}
              </div>
              <textarea value={sql} onChange={e=>setSql(e.target.value)} spellCheck={false} style={{ flex:1,background:"transparent",border:"none",outline:"none",color:"#e2e8f0",fontFamily:C.mono,fontSize:13,lineHeight:"1.65",padding:"14px 14px",resize:"none",minHeight:340 }}/>
            </div>
          </div>
        </div>
        {/* 결과 */}
        <div>
          <Card style={{ minHeight:400 }}>
            <TableDiagram schemas={schemas} />
          </Card>
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SQL 편집기 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DEMO_SQL = `-- ✅ SQL을 작성하고 ▶ 실행을 눌러보세요.
-- 아래 예제를 그대로 실행할 수 있습니다.

CREATE TABLE department (
  dept_id INT PRIMARY KEY,
  dept_name VARCHAR(50) NOT NULL
);

CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  age INT CHECK(age >= 18),
  dept_id INT,
  gpa DECIMAL(3,2),
  FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);

INSERT INTO department VALUES (1, '컴퓨터공학');
INSERT INTO department VALUES (2, '수학');

INSERT INTO student VALUES (1, '김민준', 22, 1, 3.85);
INSERT INTO student VALUES (2, '이서연', 21, 1, 3.42);
INSERT INTO student VALUES (3, '박지호', 23, 2, 3.91);

SELECT * FROM student WHERE gpa >= 3.5;`;

function EditorPage({ user, setPage }) {
  const [sql, setSql] = useState(DEMO_SQL);
  const [outputs, setOutputs] = useState([]);
  const [sqlDb, setSqlDb] = useState(null);
  const [schemas, setSchemas] = useState([]);
  const [showDiagram, setShowDiagram] = useState(false);
  const [docTitle, setDocTitle] = useState("제목 없음");
  const [docId, setDocId] = useState(null);
  const [showDocs, setShowDocs] = useState(false);
  const [docList, setDocList] = useState([]);
  const [saveMsg, setSaveMsg] = useState("");
  const [editTitle, setEditTitle] = useState(false);
  const outputRef = useRef(null);

  // sql.js 로딩
  useEffect(() => {
    initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}` })
      .then(SQL => setSqlDb(new SQL.Database()))
      .catch(e => console.warn("sql.js 로딩 실패:", e));
  }, []);

  const loadDocs = useCallback(async () => {
    if (!user) return;
    try { setDocList(await api.getDocs()); } catch {}
  }, [user]);
  useEffect(() => { loadDocs(); }, [loadDocs]);

  // Ctrl+Enter 단축키
  useEffect(() => {
    const handler = (e) => { if ((e.ctrlKey||e.metaKey) && e.key==="Enter") run(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const run = () => {
    const stmts = splitStatements(sql.split("\n").filter(l=>!l.trim().startsWith("--")).join("\n"));
    const newOut = []; const newSchemas = [...schemas];

    for (const stmt of stmts) {
      if (!stmt.trim()) continue;
      const explanation = explainSQL(stmt);

      if (sqlDb) {
        try {
          const results = sqlDb.exec(stmt);
          if (/CREATE\s+TABLE/i.test(stmt)) {
            const schema = parseCreateTable(stmt);
            if (schema) {
              const idx = newSchemas.findIndex(s=>s.tableName.toLowerCase()===schema.tableName.toLowerCase());
              if (idx>=0) newSchemas[idx]=schema; else newSchemas.push(schema);
            }
            newOut.push({ type:"success", stmt, label:"✅ CREATE TABLE 완료", explanation });
          } else if (results.length>0) {
            newOut.push({ type:"table", stmt, label:"📊 조회 결과", data:results[0], explanation });
          } else {
            newOut.push({ type:"success", stmt, label:"✅ 실행 완료", explanation });
          }
        } catch(e) {
          newOut.push({ type:"error", stmt, label:"❌ 오류 발생", error:analyzeError(stmt, e.message), explanation });
        }
      } else {
        if (/CREATE\s+TABLE/i.test(stmt)) {
          const schema = parseCreateTable(stmt);
          if (schema) { const idx=newSchemas.findIndex(s=>s.tableName.toLowerCase()===schema.tableName.toLowerCase()); if(idx>=0)newSchemas[idx]=schema;else newSchemas.push(schema); }
        }
        newOut.push({ type:"explain", stmt, label:"💬 해설", explanation });
      }
    }
    setSchemas(newSchemas); setOutputs(newOut);
    setTimeout(()=>outputRef.current?.scrollIntoView({behavior:"smooth"}), 100);
  };

  const save = async () => {
    if (!user) { setPage("login"); return; }
    setSaveMsg("저장 중...");
    try {
      if (docId) { await api.saveDoc(docId, { title:docTitle, sql_code:sql }); }
      else { const doc=await api.createDoc({title:docTitle,sql_code:sql}); setDocId(doc.id); }
      setSaveMsg("저장됨 ✓"); loadDocs();
      setTimeout(()=>setSaveMsg(""), 2500);
    } catch { setSaveMsg("저장 실패"); }
  };

  const loadDoc = async (id) => {
    try { const d=await api.getDoc(id); setSql(d.sql_code); setDocTitle(d.title); setDocId(d.id); setOutputs([]); setShowDocs(false); }
    catch {}
  };

  const lineCount = sql.split("\n").length;

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"calc(100vh - 56px)" }}>
      {/* 툴바 */}
      <div style={{ background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"9px 20px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
        {/* 제목 */}
        {editTitle ? (
          <input value={docTitle} onChange={e=>setDocTitle(e.target.value)} onBlur={()=>setEditTitle(false)} onKeyDown={e=>e.key==="Enter"&&setEditTitle(false)} autoFocus style={{ border:`1px solid ${C.accent}`,borderRadius:7,padding:"4px 10px",fontSize:14,fontFamily:C.sans,outline:"none",color:C.text }} />
        ) : (
          <span onClick={()=>setEditTitle(true)} title="클릭해서 제목 수정" style={{ fontSize:14,fontWeight:600,color:C.text,cursor:"pointer",padding:"4px 8px",borderRadius:7,fontFamily:C.sans,border:`1px solid transparent`,transition:".15s" }} onMouseEnter={e=>e.target.style.borderColor=C.border} onMouseLeave={e=>e.target.style.borderColor="transparent"}>{docTitle}</span>
        )}
        <div style={{ flex:1 }} />
        {!user&&<Tag label="💡 체험 모드 — 저장하려면 로그인하세요" color={C.yellow}/>}
        {saveMsg&&<span style={{ fontSize:13,color:C.green,fontFamily:C.sans }}>{saveMsg}</span>}
        <Btn onClick={()=>{setSql("-- 새 SQL 문서\n");setDocTitle("제목 없음");setDocId(null);setOutputs([]);setSchemas([]);}} size="sm">+ 새 문서</Btn>
        {user&&<Btn onClick={()=>{loadDocs();setShowDocs(true);}} size="sm">📂 불러오기</Btn>}
        <Btn onClick={save} size="sm" variant="primary">💾 저장</Btn>
        <Btn onClick={()=>setShowDiagram(true)} size="sm" style={{background:C.purpleBg,border:`1px solid ${C.purpleBdr}`,color:C.purple}}>🗂 그림 보기</Btn>
        <Btn onClick={run} variant="primary">▶ 실행 <span style={{fontSize:11,opacity:.7}}>(Ctrl+↵)</span></Btn>
      </div>

      {/* 에디터 + 결과 */}
      <div style={{ flex:1,display:"flex",overflow:"hidden" }}>
        {/* 왼쪽: 에디터 */}
        <div style={{ flex:"0 0 50%",display:"flex",flexDirection:"column",borderRight:`1px solid ${C.border}` }}>
          <div style={{ background:"#1e293b",padding:"6px 16px",display:"flex",alignItems:"center",gap:8,flexShrink:0 }}>
            <div style={{ display:"flex",gap:5 }}>{["#ef4444","#f59e0b","#10b981"].map((c,i)=><div key={i} style={{width:11,height:11,borderRadius:"50%",background:c}}/>)}</div>
            <span style={{ color:"#64748b",fontSize:11,fontFamily:C.mono,marginLeft:4 }}>SQL — {lineCount}줄</span>
          </div>
          <div style={{ flex:1,display:"flex",background:"#0f172a",overflow:"auto" }}>
            <div style={{ padding:"14px 10px 14px 12px",color:"#334155",fontSize:12,fontFamily:C.mono,lineHeight:"1.65",textAlign:"right",userSelect:"none",minWidth:36,borderRight:"1px solid #1e293b",flexShrink:0 }}>
              {Array.from({length:lineCount},(_,i)=><div key={i}>{i+1}</div>)}
            </div>
            <textarea value={sql} onChange={e=>setSql(e.target.value)} spellCheck={false}
              style={{ flex:1,background:"transparent",border:"none",outline:"none",color:"#e2e8f0",fontFamily:C.mono,fontSize:13.5,lineHeight:"1.65",padding:"14px 16px",resize:"none" }}
              onKeyDown={e=>{ if(e.key==="Tab"){e.preventDefault();const p=e.target.selectionStart;setSql(s=>s.slice(0,p)+"  "+s.slice(p));setTimeout(()=>{e.target.selectionStart=e.target.selectionEnd=p+2;},0);} }} />
          </div>
        </div>

        {/* 오른쪽: 결과 + 해설 */}
        <div style={{ flex:"0 0 50%",overflow:"auto",background:C.bg,padding:18 }}>
          {outputs.length===0 ? (
            <div style={{ textAlign:"center",paddingTop:64,color:C.muted,fontFamily:C.sans }}>
              <div style={{ fontSize:36,marginBottom:12 }}>▶</div>
              <div style={{ fontSize:14,marginBottom:6 }}>SQL을 작성하고 실행 버튼을 눌러보세요.</div>
              <div style={{ fontSize:12 }}>Ctrl+Enter 단축키를 사용할 수 있습니다.</div>
            </div>
          ) : (
            <div ref={outputRef} style={{ display:"flex",flexDirection:"column",gap:14 }}>
              {outputs.map((out,i)=><OutputCard key={i} out={out}/>)}
            </div>
          )}
        </div>
      </div>

      {/* 다이어그램 모달 */}
      <Modal open={showDiagram} onClose={()=>setShowDiagram(false)} title="🗂 테이블 구조 시각화" wide>
        <TableDiagram schemas={schemas}/>
      </Modal>

      {/* 문서 목록 모달 */}
      <Modal open={showDocs} onClose={()=>setShowDocs(false)} title="📂 저장된 문서">
        {docList.length===0 ? (
          <div style={{ textAlign:"center",padding:"30px 0",color:C.muted,fontFamily:C.sans }}>저장된 문서가 없습니다.</div>
        ) : (
          <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
            {docList.map(doc=>(
              <div key={doc.id} onClick={()=>loadDoc(doc.id)} style={{ padding:"12px 16px",borderRadius:8,border:`1px solid ${C.border}`,cursor:"pointer",background:C.bg,display:"flex",justifyContent:"space-between",alignItems:"center",transition:"border-color .15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=C.accent} onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}>
                <div>
                  <div style={{ fontWeight:600,fontSize:14,color:C.text,fontFamily:C.sans }}>{doc.title}</div>
                  <div style={{ fontSize:12,color:C.muted,marginTop:2,fontFamily:C.sans }}>{new Date(doc.updated_at).toLocaleString("ko-KR")}</div>
                </div>
                <span style={{ color:C.muted,fontSize:18 }}>›</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// 출력 카드
function OutputCard({ out }) {
  const [showEx, setShowEx] = useState(true);
  const styles = {
    success: { bg:C.greenBg,  bdr:C.greenBdr },
    table:   { bg:"#f8fafc",  bdr:C.border   },
    error:   { bg:C.redBg,    bdr:C.redBdr   },
    explain: { bg:C.accentBg, bdr:C.accentBdr },
  };
  const st = styles[out.type] || styles.explain;

  return (
    <div style={{ background:st.bg,border:`1px solid ${st.bdr}`,borderRadius:12,overflow:"hidden" }}>
      <div style={{ padding:"8px 14px",borderBottom:`1px solid ${st.bdr}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
        <span style={{ fontWeight:700,fontSize:13,fontFamily:C.sans }}>{out.label}</span>
        <code style={{ color:C.muted,fontSize:11,fontFamily:C.mono }}>{out.stmt?.replace(/\s+/g," ").slice(0,60)}</code>
      </div>
      <div style={{ padding:14 }}>
        {/* 에러 */}
        {out.type==="error"&&out.error&&(
          <div style={{ marginBottom:14 }}>
            <div style={{ fontWeight:700,color:C.red,fontSize:14,marginBottom:6,fontFamily:C.sans }}>🔍 {out.error.title}</div>
            <div style={{ fontSize:13,color:"#991b1b",lineHeight:1.7,fontFamily:C.sans }} dangerouslySetInnerHTML={{__html:out.error.msg}}/>
            {out.error.hint&&<div style={{ marginTop:8,padding:"8px 12px",background:C.yellowBg,border:`1px solid ${C.yellowBdr}`,borderRadius:6,fontSize:12,color:"#92400e",fontFamily:C.sans }}>💡 {out.error.hint}</div>}
          </div>
        )}
        {/* 테이블 결과 */}
        {out.type==="table"&&out.data&&(
          <div style={{ overflowX:"auto",marginBottom:14 }}>
            <table style={{ borderCollapse:"collapse",width:"100%",fontFamily:C.mono,fontSize:13 }}>
              <thead><tr>{out.data.columns.map((c,i)=><th key={i} style={{background:"#1e40af",color:"#e0f2fe",padding:"7px 12px",textAlign:"left",fontWeight:700,whiteSpace:"nowrap"}}>{c}</th>)}</tr></thead>
              <tbody>{out.data.values.map((row,ri)=><tr key={ri} style={{background:ri%2===0?"#f8fafc":C.surface}}>{row.map((cell,ci)=><td key={ci} style={{padding:"6px 12px",borderBottom:`1px solid ${C.border}`,color:cell==null?C.muted:C.text,fontStyle:cell==null?"italic":"normal"}}>{cell==null?"NULL":String(cell)}</td>)}</tr>)}</tbody>
            </table>
            <div style={{ fontSize:11,color:C.muted,padding:"5px 2px",fontFamily:C.sans }}>{out.data.values.length}개 행</div>
          </div>
        )}
        {/* 자동 해설 */}
        {out.explanation?.length>0&&(
          <div>
            <button onClick={()=>setShowEx(v=>!v)} style={{ background:"none",border:"none",cursor:"pointer",fontSize:12,color:C.accent,fontWeight:600,padding:"2px 0",fontFamily:C.sans,display:"flex",alignItems:"center",gap:4 }}>
              💬 자동 해설 {showEx?"▲":"▼"}
            </button>
            {showEx&&(
              <div style={{ marginTop:10,display:"flex",flexDirection:"column",gap:7 }}>
                {out.explanation.map((exp,i)=>(
                  <div key={i} style={{ display:"flex",gap:10,padding:"8px 12px",background:C.surface,borderRadius:8,border:`1px solid ${C.border}`,alignItems:"flex-start" }}>
                    <span style={{ background:exp.color+"18",color:exp.color,fontSize:11,padding:"2px 8px",borderRadius:4,fontWeight:700,whiteSpace:"nowrap",fontFamily:C.mono,marginTop:1,flexShrink:0 }}>{exp.kw}</span>
                    <span style={{ fontSize:13,color:C.textSub,lineHeight:1.7,fontFamily:C.sans }} dangerouslySetInnerHTML={{__html:exp.text}}/>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 개념 학습 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CONCEPTS = [
  { id:"select", title:"SELECT", cat:"DML", catColor:"#2563eb",
    def:"테이블에서 데이터를 조회하는 가장 기본적인 SQL 명령어입니다.",
    easy:"도서관 목록에서 원하는 책만 골라보는 것처럼, SELECT는 테이블에서 원하는 데이터만 꺼내봅니다.",
    syntax:`SELECT 컬럼1, 컬럼2   -- * 는 전체
FROM 테이블명
[WHERE 조건]
[GROUP BY 컬럼]
[HAVING 그룹조건]
[ORDER BY 컬럼 ASC|DESC]
[LIMIT 개수]`,
    example:`SELECT name, gpa FROM student WHERE gpa >= 3.5 ORDER BY gpa DESC;`,
    result:"GPA 3.5 이상인 학생의 이름과 GPA를 내림차순으로 조회합니다.",
    caution:["실행 순서: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY","WHERE절에 집계함수 사용 불가 → HAVING 사용"],
    mistakes:["WHERE절에 AVG(), COUNT() 등 집계함수 사용","GROUP BY 없이 집계함수와 일반 컬럼 혼용"],
  },
  { id:"insert", title:"INSERT", cat:"DML", catColor:"#16a34a",
    def:"테이블에 새로운 행(데이터)을 추가하는 DML 명령어입니다.",
    easy:"엑셀에서 새 행을 추가하는 것과 같습니다.",
    syntax:`INSERT INTO 테이블명 (컬럼1, 컬럼2) VALUES (값1, 값2);
-- 또는 모든 컬럼에 값을 넣을 때
INSERT INTO 테이블명 VALUES (값1, 값2, ...);`,
    example:`INSERT INTO student (student_id, name, age) VALUES (1, '김민준', 22);`,
    result:"student 테이블에 새 학생 데이터가 추가됩니다.",
    caution:["NOT NULL 컬럼은 반드시 값 제공","PRIMARY KEY 중복 시 오류"],
    mistakes:["컬럼 개수와 VALUES 개수 불일치","문자열 값에 따옴표 누락"],
  },
  { id:"update", title:"UPDATE", cat:"DML", catColor:"#d97706",
    def:"테이블의 기존 데이터를 수정하는 DML 명령어입니다.",
    easy:"기존에 저장된 데이터를 고치는 명령어입니다.",
    syntax:`UPDATE 테이블명 SET 컬럼1=값1, 컬럼2=값2 WHERE 조건;`,
    example:`UPDATE student SET gpa = 3.9 WHERE student_id = 1;`,
    result:"student_id가 1인 학생의 GPA를 3.9로 수정합니다.",
    caution:["⚠️ WHERE 없이 UPDATE하면 모든 행이 수정됩니다!"],
    mistakes:["WHERE 절 빠뜨리기 → 전체 수정 발생"],
  },
  { id:"delete", title:"DELETE", cat:"DML", catColor:"#dc2626",
    def:"테이블에서 행을 삭제하는 DML 명령어입니다.",
    easy:"테이블에서 특정 데이터를 지우는 명령어입니다.",
    syntax:`DELETE FROM 테이블명 WHERE 조건;`,
    example:`DELETE FROM student WHERE student_id = 3;`,
    result:"student_id가 3인 학생 데이터를 삭제합니다.",
    caution:["⚠️ WHERE 없으면 테이블의 모든 데이터 삭제!","FK 참조 중인 데이터는 삭제 불가 (부모 먼저 삭제하거나 CASCADE 설정)"],
    mistakes:["WHERE 절 누락 → 전체 삭제"],
  },
  { id:"join", title:"JOIN", cat:"DML", catColor:"#7c3aed",
    def:"두 개 이상의 테이블을 특정 컬럼 기준으로 합쳐 조회하는 연산입니다.",
    easy:"학생 목록과 학과 목록이 따로 있을 때, 학생 이름과 학과명을 한 번에 보려면 두 표를 합쳐야 합니다.",
    syntax:`-- INNER JOIN: 교집합 (양쪽 모두 일치)
SELECT ... FROM A INNER JOIN B ON A.키 = B.키;

-- LEFT JOIN: 왼쪽 전체 + 오른쪽 일치
SELECT ... FROM A LEFT JOIN B ON A.키 = B.키;`,
    example:`SELECT s.name, d.dept_name
FROM student s
INNER JOIN department d ON s.dept_id = d.dept_id;`,
    result:"학생 이름과 학과명을 함께 조회합니다.",
    caution:["INNER JOIN: 일치하지 않는 행은 제외","LEFT JOIN: 오른쪽 일치 없으면 NULL"],
    mistakes:["ON 조건 없이 JOIN → 카테시안 곱 발생","모호한 컬럼명 (테이블.컬럼 형식 사용)"],
  },
  { id:"groupby", title:"GROUP BY", cat:"DML", catColor:"#16a34a",
    def:"특정 컬럼의 값이 같은 행들을 그룹으로 묶어 집계하는 절입니다.",
    easy:"반별 평균 성적처럼, 같은 값을 가진 행들을 묶어 통계를 내는 명령어입니다.",
    syntax:`SELECT 그룹컬럼, COUNT(*)/SUM()/AVG()/MAX()/MIN()
FROM 테이블
GROUP BY 그룹컬럼
[HAVING 집계조건];`,
    example:`SELECT dept_id, COUNT(*) AS 학생수, AVG(gpa) AS 평균GPA
FROM student GROUP BY dept_id HAVING AVG(gpa) >= 3.5;`,
    result:"학과별 학생 수와 평균 GPA를 구하고, 평균 3.5 이상만 표시합니다.",
    caution:["SELECT에는 GROUP BY 컬럼 또는 집계함수만","HAVING: 그룹 후 필터 / WHERE: 그룹 전 필터"],
    mistakes:["WHERE에 AVG() 등 집계함수 사용 → HAVING으로"],
  },
  { id:"pk", title:"PRIMARY KEY", cat:"제약조건", catColor:"#d97706",
    def:"테이블의 각 행을 고유하게 식별하는 기본키 제약조건입니다.",
    easy:"학번처럼 각 학생을 구별하는 고유 식별자입니다. 중복도, NULL도 허용하지 않습니다.",
    syntax:`-- 컬럼 수준
컬럼명 타입 PRIMARY KEY

-- 복합 기본키
PRIMARY KEY(컬럼1, 컬럼2)`,
    example:`CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50)
);`,
    result:"student_id는 NULL 불가, 중복 불가인 기본키입니다.",
    caution:["한 테이블에 PK는 하나","자동으로 NOT NULL + UNIQUE"],
    mistakes:["PK 컬럼에 NULL 삽입 시도","테이블에 PK 두 개 정의"],
  },
  { id:"fk", title:"FOREIGN KEY", cat:"제약조건", catColor:"#7c3aed",
    def:"다른 테이블의 기본키를 참조하여 테이블 간 관계를 정의하는 제약조건입니다.",
    easy:"없는 학생 번호로 수강신청을 하면 안 되듯, FK는 참조 대상이 반드시 존재해야 한다는 규칙입니다.",
    syntax:`FOREIGN KEY (컬럼명)
  REFERENCES 참조테이블(참조컬럼)
  [ON DELETE CASCADE | SET NULL | RESTRICT]`,
    example:`CREATE TABLE enrollment (
  student_id INT,
  FOREIGN KEY (student_id) REFERENCES student(student_id)
);`,
    result:"student 테이블에 없는 student_id는 enrollment에 삽입 불가합니다.",
    caution:["부모 테이블을 먼저 생성","FK 컬럼 자체는 NULL 허용"],
    mistakes:["FOREIGN KEY 컬럼명에 괄호 누락","참조 대상이 PK/UNIQUE가 아닌 컬럼"],
  },
  { id:"notnull", title:"NOT NULL", cat:"제약조건", catColor:"#2563eb",
    def:"해당 컬럼에 NULL 값이 들어올 수 없도록 강제하는 제약조건입니다.",
    easy:"회원가입에서 이름 칸은 반드시 채워야 하는 것처럼, NOT NULL은 필수 입력을 강제합니다.",
    syntax:`컬럼명 데이터타입 NOT NULL`,
    example:`name VARCHAR(50) NOT NULL`,
    result:"name 컬럼에 NULL 삽입 시 오류가 발생합니다.",
    caution:["PRIMARY KEY는 자동으로 NOT NULL","NULL ≠ '' (빈 문자열)"],
    mistakes:["NULL과 빈 문자열 혼동"],
  },
  { id:"unique", title:"UNIQUE", cat:"제약조건", catColor:"#16a34a",
    def:"해당 컬럼에 중복된 값이 들어올 수 없도록 강제하는 제약조건입니다.",
    easy:"이메일은 하나의 계정에만 등록되어야 하듯, UNIQUE는 중복을 자동으로 방지합니다.",
    syntax:`컬럼명 데이터타입 UNIQUE`,
    example:`email VARCHAR(100) UNIQUE`,
    result:"email 컬럼에 동일한 값이 두 행에 들어올 수 없습니다.",
    caution:["NULL은 UNIQUE 예외 (여러 개 허용)","PK와 달리 하나의 테이블에 여러 UNIQUE 가능"],
    mistakes:["PK와 UNIQUE를 혼용"],
  },
  { id:"check", title:"CHECK", cat:"제약조건", catColor:"#0891b2",
    def:"컬럼에 저장될 수 있는 값의 조건을 제한하는 제약조건입니다.",
    easy:"나이는 0~150 사이여야 하는 것처럼, CHECK는 '이 조건을 만족하는 값만 받겠다'는 규칙입니다.",
    syntax:`컬럼명 데이터타입 CHECK(조건식)`,
    example:`age INT CHECK(age >= 18 AND age <= 100)`,
    result:"18~100 범위를 벗어나는 age 값은 저장이 거부됩니다.",
    caution:["조건을 위반하는 INSERT/UPDATE는 오류 발생"],
    mistakes:["CHECK(age >= 18) — 괄호 안에 조건 작성 필수"],
  },
];

function ConceptsPage() {
  const [sel, setSel] = useState(CONCEPTS[0].id);
  const [search, setSearch] = useState("");
  const concept = CONCEPTS.find(c=>c.id===sel) || CONCEPTS[0];
  const filtered = search ? CONCEPTS.filter(c=>c.title.toLowerCase().includes(search.toLowerCase())||c.cat.includes(search)) : CONCEPTS;
  const cats = [...new Set(CONCEPTS.map(c=>c.cat))];

  return (
    <div style={{ display:"flex",height:"calc(100vh - 56px)" }}>
      {/* 사이드바 */}
      <div style={{ width:220,borderRight:`1px solid ${C.border}`,overflow:"auto",padding:"16px 12px",background:C.surface,flexShrink:0 }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 검색..." style={{ width:"100%",padding:"7px 10px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:13,fontFamily:C.sans,color:C.text,background:C.bg,outline:"none",boxSizing:"border-box",marginBottom:16 }}/>
        {cats.map(cat=>(
          <div key={cat} style={{ marginBottom:16 }}>
            <div style={{ fontSize:10,fontWeight:700,color:filtered.find(c=>c.cat===cat)?.catColor||C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4,padding:"0 4px",fontFamily:C.sans }}>{cat}</div>
            {filtered.filter(c=>c.cat===cat).map(c=>(
              <button key={c.id} onClick={()=>setSel(c.id)} style={{ display:"block",width:"100%",textAlign:"left",padding:"6px 10px",borderRadius:8,border:"none",background:sel===c.id?C.accentBg:"transparent",color:sel===c.id?C.accent:C.textSub,cursor:"pointer",fontSize:13,fontFamily:C.sans,fontWeight:sel===c.id?600:400,transition:"all .1s" }}>{c.title}</button>
            ))}
          </div>
        ))}
      </div>

      {/* 본문 */}
      <div style={{ flex:1,overflow:"auto",padding:"36px 40px",background:C.bg }}>
        <div style={{ maxWidth:760 }}>
          <div style={{ marginBottom:24 }}>
            <span style={{ fontSize:11,color:concept.catColor,fontWeight:700,letterSpacing:1,textTransform:"uppercase",fontFamily:C.sans }}>{concept.cat}</span>
            <h1 style={{ fontSize:30,fontWeight:800,color:C.text,margin:"6px 0 10px",fontFamily:C.sans }}>{concept.title}</h1>
            <p style={{ fontSize:15,color:C.textSub,lineHeight:1.7,fontFamily:C.sans }}>{concept.def}</p>
          </div>

          {/* 쉬운 설명 */}
          <div style={{ background:C.greenBg,border:`1px solid ${C.greenBdr}`,borderRadius:10,padding:18,marginBottom:20 }}>
            <div style={{ fontSize:12,fontWeight:700,color:C.green,marginBottom:8,fontFamily:C.sans }}>💡 쉬운 설명</div>
            <div style={{ fontSize:14,color:"#166534",lineHeight:1.8,fontFamily:C.sans }}>{concept.easy}</div>
          </div>

          {/* 문법 */}
          <div style={{ marginBottom:20 }}>
            <h3 style={{ fontSize:14,fontWeight:700,color:C.text,margin:"0 0 10px",fontFamily:C.sans }}>📌 문법 형식</h3>
            <div style={{ background:"#0f172a",borderRadius:10,padding:"14px 18px" }}>
              <pre style={{ margin:0,color:"#e2e8f0",fontFamily:C.mono,fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap" }}>{concept.syntax}</pre>
            </div>
          </div>

          {/* 예제 */}
          <div style={{ marginBottom:20 }}>
            <h3 style={{ fontSize:14,fontWeight:700,color:C.text,margin:"0 0 10px",fontFamily:C.sans }}>✏️ 예제 코드</h3>
            <div style={{ background:"#0f172a",borderRadius:10,padding:"14px 18px" }}>
              <pre style={{ margin:0,color:"#86efac",fontFamily:C.mono,fontSize:13,lineHeight:1.7,whiteSpace:"pre-wrap" }}>{concept.example}</pre>
            </div>
            {concept.result&&<div style={{ marginTop:10,padding:"10px 14px",background:C.accentBg,border:`1px solid ${C.accentBdr}`,borderRadius:8,fontSize:13,color:"#1e40af",fontFamily:C.sans }}>📊 결과: {concept.result}</div>}
          </div>

          {/* 주의사항 */}
          {concept.caution?.length>0&&(
            <div style={{ marginBottom:20 }}>
              <h3 style={{ fontSize:14,fontWeight:700,color:C.text,margin:"0 0 10px",fontFamily:C.sans }}>⚠️ 주의사항</h3>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {concept.caution.map((c,i)=><div key={i} style={{ padding:"10px 14px",background:C.yellowBg,border:`1px solid ${C.yellowBdr}`,borderRadius:8,fontSize:13,color:"#92400e",fontFamily:C.sans }}>• {c}</div>)}
              </div>
            </div>
          )}

          {/* 자주 틀리는 부분 */}
          {concept.mistakes?.length>0&&(
            <div>
              <h3 style={{ fontSize:14,fontWeight:700,color:C.text,margin:"0 0 10px",fontFamily:C.sans }}>❌ 자주 틀리는 부분</h3>
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                {concept.mistakes.map((m,i)=><div key={i} style={{ padding:"10px 14px",background:C.redBg,border:`1px solid ${C.redBdr}`,borderRadius:8,fontSize:13,color:"#991b1b",fontFamily:C.sans }}><code style={{fontFamily:C.mono}}>{m}</code></div>)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 내 문서 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function DocsPage({ user, setPage }) {
  const [docs, setDocs] = useState([]);
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(()=>{
    if (!user) return;
    api.getDocs().then(setDocs).catch(()=>{});
  },[user]);

  const del = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    await api.deleteDoc(id);
    setDocs(d=>d.filter(doc=>doc.id!==id));
  };

  const rename = async (id) => {
    await api.saveDoc(id, {title:editTitle});
    setDocs(d=>d.map(doc=>doc.id===id?{...doc,title:editTitle}:doc));
    setEditId(null);
  };

  if (!user) return (
    <div style={{ textAlign:"center",padding:"80px 24px",fontFamily:C.sans }}>
      <div style={{ fontSize:40,marginBottom:16 }}>🔐</div>
      <h2 style={{ fontSize:20,fontWeight:700,color:C.text,marginBottom:10 }}>로그인이 필요합니다</h2>
      <p style={{ color:C.textSub,marginBottom:24 }}>문서를 저장하고 관리하려면 로그인하세요.</p>
      <Btn onClick={()=>setPage("login")} variant="primary" size="lg">로그인하기</Btn>
    </div>
  );

  return (
    <div style={{ maxWidth:860,margin:"0 auto",padding:"40px 24px" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:28 }}>
        <div>
          <h2 style={{ fontSize:22,fontWeight:800,color:C.text,margin:"0 0 4px",fontFamily:C.sans }}>내 문서</h2>
          <p style={{ fontSize:14,color:C.textSub,fontFamily:C.sans }}>{user.username}님의 SQL 문서 ({docs.length}개)</p>
        </div>
        <Btn onClick={()=>setPage("editor")} variant="primary">+ 새 문서 작성</Btn>
      </div>

      {docs.length===0 ? (
        <div style={{ textAlign:"center",padding:"60px 0",color:C.muted,fontFamily:C.sans }}>
          <div style={{ fontSize:40,marginBottom:14 }}>📄</div>
          <div style={{ fontSize:14,marginBottom:20 }}>저장된 문서가 없습니다.</div>
          <Btn onClick={()=>setPage("editor")} variant="primary">SQL 작성하러 가기</Btn>
        </div>
      ) : (
        <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
          {docs.map(doc=>(
            <Card key={doc.id} style={{ padding:"14px 20px" }}>
              <div style={{ display:"flex",alignItems:"center",gap:14 }}>
                <span style={{ fontSize:22 }}>📄</span>
                <div style={{ flex:1 }}>
                  {editId===doc.id ? (
                    <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                      <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&rename(doc.id)} style={{ padding:"4px 10px",borderRadius:7,border:`1px solid ${C.accent}`,fontSize:14,fontFamily:C.sans,outline:"none" }} autoFocus/>
                      <Btn onClick={()=>rename(doc.id)} variant="primary" size="sm">저장</Btn>
                      <Btn onClick={()=>setEditId(null)} size="sm">취소</Btn>
                    </div>
                  ) : (
                    <div style={{ fontWeight:600,fontSize:15,color:C.text,fontFamily:C.sans }}>{doc.title}</div>
                  )}
                  <div style={{ fontSize:12,color:C.muted,marginTop:3,fontFamily:C.sans }}>마지막 수정: {new Date(doc.updated_at).toLocaleString("ko-KR")}</div>
                </div>
                <div style={{ display:"flex",gap:6 }}>
                  <Btn onClick={()=>{ sessionStorage.setItem("openDocId",doc.id); setPage("editor"); }} variant="primary" size="sm">열기</Btn>
                  <Btn onClick={()=>{setEditId(doc.id);setEditTitle(doc.title);}} size="sm">이름 수정</Btn>
                  <Btn onClick={()=>del(doc.id)} variant="danger" size="sm">삭제</Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 앱 루트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(() => authStore.getUser());

  // 네이버 OAuth 콜백 처리 (/auth?token=...)
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    const error = url.searchParams.get("error");
    if (token) {
      authStore.save(token);
      setUser(authStore.getUser());
      window.history.replaceState({}, "", "/");
      setPage("editor");
    } else if (error) {
      window.history.replaceState({}, "", "/");
      setPage("login");
    }
  }, []);

  const handleLogout = () => { authStore.clear(); setUser(null); setPage("home"); };

  return (
    <div style={{ minHeight:"100vh", background:C.bg, fontFamily:C.sans }}>
      <Nav page={page} setPage={setPage} user={user} onLogout={handleLogout}/>
      {page==="home"       && <HomePage       setPage={setPage} user={user}/>}
      {page==="login"      && <LoginPage      setPage={setPage} onLogin={setUser}/>}
      {page==="editor"     && <EditorPage     user={user} setPage={setPage}/>}
      {page==="visualizer" && <VisualizerPage/>}
      {page==="concepts"   && <ConceptsPage/>}
      {page==="docs"       && <DocsPage       user={user} setPage={setPage}/>}
    </div>
  );
}
