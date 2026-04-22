import { useState, useEffect, useRef, useCallback } from "react";
import { explainSQL, analyzeError, parseCreateTable, splitStatements } from "./utils/sqlAnalyzer.js";
import { api } from "./utils/api.js";
import initSqlJs from "sql.js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 디자인 토큰
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const T = {
  // 폰트 - Claude와 동일한 가독성 좋은 시스템 폰트 스택
  font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif`,
  mono: `'JetBrains Mono', 'Fira Code', 'SF Mono', 'Consolas', monospace`,

  // Light mode
  bg:      "#f7f7f5",
  surface: "#ffffff",
  border:  "#e8e8e4",
  text:    "#1a1a1a",
  textSub: "#5a5a5a",
  muted:   "#999999",
  accent:  "#2563eb",
  accentBg:"#eff6ff",
  green:   "#16a34a",
  red:     "#dc2626",
  yellow:  "#d97706",
  purple:  "#7c3aed",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 공통 UI 컴포넌트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function Btn({ children, onClick, variant = "default", size = "md", style: s = {}, disabled }) {
  const base = {
    border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: T.font, fontWeight: 600, transition: "all .15s", display: "inline-flex",
    alignItems: "center", gap: 6, opacity: disabled ? 0.5 : 1,
    fontSize: size === "sm" ? 13 : size === "lg" ? 16 : 14,
    padding: size === "sm" ? "5px 12px" : size === "lg" ? "12px 24px" : "7px 16px",
  };
  const variants = {
    default: { background: T.surface, border: `1px solid ${T.border}`, color: T.textSub },
    primary: { background: T.accent, color: "#fff" },
    danger:  { background: "#fef2f2", border: `1px solid #fecaca`, color: T.red },
    ghost:   { background: "transparent", color: T.textSub },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...s }} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

function Badge({ label, color = T.accent }) {
  return (
    <span style={{
      background: color + "18", border: `1px solid ${color}40`, color,
      fontSize: 10, padding: "1px 7px", borderRadius: 4, fontWeight: 700,
      letterSpacing: 0.3, fontFamily: T.font,
    }}>{label}</span>
  );
}

function Card({ children, style: s = {}, onClick }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: 20, ...s, cursor: onClick ? "pointer" : "default",
    }} onClick={onClick}>{children}</div>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#00000060", zIndex: 999,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div style={{
        background: T.surface, borderRadius: 14, padding: "28px 28px 24px",
        width: "100%", maxWidth: wide ? 900 : 480, maxHeight: "90vh",
        overflow: "auto", boxShadow: "0 20px 60px #00000030",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, color: T.text, fontFamily: T.font }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: T.muted }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 헤더
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Header({ page, setPage, user, onLogout }) {
  return (
    <header style={{
      background: T.surface, borderBottom: `1px solid ${T.border}`,
      padding: "0 28px", height: 54, display: "flex", alignItems: "center",
      justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100,
      boxShadow: "0 1px 3px #00000008",
    }}>
      {/* 로고 - 클릭하면 홈 */}
      <button onClick={() => setPage("home")} style={{
        background: "none", border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, background: T.accent, borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 12, fontFamily: T.mono,
        }}>SQL</div>
        <span style={{ fontWeight: 800, fontSize: 17, color: T.text, fontFamily: T.font }}>
          SQL<span style={{ color: T.accent }}>Visual</span>
        </span>
      </button>

      {/* 네비 */}
      <nav style={{ display: "flex", gap: 4 }}>
        {[
          { id: "editor",   label: "편집기" },
          { id: "concepts", label: "개념 학습" },
          ...(user ? [{ id: "mypage", label: "마이페이지" }] : []),
        ].map(n => (
          <button key={n.id} onClick={() => setPage(n.id)} style={{
            padding: "6px 14px", borderRadius: 8, border: "none",
            background: page === n.id ? T.accentBg : "transparent",
            color: page === n.id ? T.accent : T.textSub,
            fontWeight: page === n.id ? 700 : 400, cursor: "pointer",
            fontSize: 14, fontFamily: T.font,
          }}>{n.label}</button>
        ))}
      </nav>

      {/* 유저 영역 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {user ? (
          <>
            <span style={{ fontSize: 13, color: T.textSub, fontFamily: T.font }}>{user.username}</span>
            <Btn onClick={onLogout} size="sm">로그아웃</Btn>
          </>
        ) : (
          <Btn onClick={() => setPage("login")} variant="primary" size="sm">로그인</Btn>
        )}
      </div>
    </header>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 홈 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function HomePage({ setPage, user }) {
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "64px 24px" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", marginBottom: 64 }}>
        <div style={{ display: "inline-block", background: T.accentBg, borderRadius: 99, padding: "4px 16px", fontSize: 13, color: T.accent, fontWeight: 600, marginBottom: 20, fontFamily: T.font }}>
          SQL 실습 + 학습 도구
        </div>
        <h1 style={{ fontSize: 42, fontWeight: 800, color: T.text, lineHeight: 1.25, margin: "0 0 16px", fontFamily: T.font }}>
          SQL을 직접 써보고<br />
          <span style={{ color: T.accent }}>눈으로 이해하세요</span>
        </h1>
        <p style={{ fontSize: 17, color: T.textSub, lineHeight: 1.7, margin: "0 0 36px", fontFamily: T.font }}>
          SQL을 작성하면 자동으로 해설해드립니다.<br />
          테이블 구조를 그림으로 보고, 개념을 쉽게 학습하세요.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Btn onClick={() => setPage("editor")} variant="primary" size="lg">✏️  SQL 작성하러 가기</Btn>
          <Btn onClick={() => setPage("concepts")} size="lg">📖  개념 학습</Btn>
          {!user && <Btn onClick={() => setPage("login")} size="lg">🔐  로그인 / 회원가입</Btn>}
        </div>
      </div>

      {/* 기능 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {[
          { icon: "⚡", title: "즉시 실행", desc: "SQL을 입력하고 실행 버튼을 누르면 결과가 바로 나타납니다. 브라우저에서 바로 동작합니다." },
          { icon: "💬", title: "자동 해설", desc: "작성한 SQL이 무엇을 하는지 자동으로 설명해드립니다. 초보자도 쉽게 이해할 수 있어요." },
          { icon: "🗂️", title: "테이블 시각화", desc: "CREATE TABLE을 작성하면 테이블 구조를 그림으로 보여줍니다. FK 관계도 한눈에 확인하세요." },
          { icon: "❌", title: "에러 설명", desc: "문법이 틀리면 왜 틀렸는지 친절하게 알려줍니다. 단순 Error 메시지는 그만!" },
          { icon: "📖", title: "개념 학습", desc: "PRIMARY KEY, JOIN, GROUP BY 등 SQL 핵심 개념을 체계적으로 정리해 제공합니다." },
          { icon: "💾", title: "문서 저장", desc: "작성한 SQL을 문서로 저장하고 나중에 다시 불러올 수 있습니다. 로그인 후 이용 가능." },
        ].map(f => (
          <Card key={f.title} style={{ padding: 24 }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: T.text, marginBottom: 8, fontFamily: T.font }}>{f.title}</div>
            <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.7, fontFamily: T.font }}>{f.desc}</div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 로그인 / 회원가입 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AuthPage({ onLogin, setPage }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      const res = isLogin
        ? await api.login(username, password)
        : await api.register(username, password);
      localStorage.setItem("sqlvisual_token", res.token);
      onLogin({ username: res.username });
    } catch (e) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const inputStyle = {
    width: "100%", padding: "10px 14px", borderRadius: 8,
    border: `1px solid ${T.border}`, fontSize: 14, fontFamily: T.font,
    color: T.text, background: T.bg, outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: 400, margin: "80px auto", padding: "0 24px" }}>
      <Card style={{ padding: 36 }}>
        <h2 style={{ margin: "0 0 28px", fontSize: 22, fontWeight: 800, color: T.text, textAlign: "center", fontFamily: T.font }}>
          {isLogin ? "로그인" : "회원가입"}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="아이디" style={inputStyle}
            onKeyDown={e => e.key === "Enter" && submit()} />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호" type="password" style={inputStyle}
            onKeyDown={e => e.key === "Enter" && submit()} />
          {error && <div style={{ fontSize: 13, color: T.red, fontFamily: T.font }}>⚠️ {error}</div>}
          <Btn onClick={submit} variant="primary" size="lg" disabled={loading} style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
            {loading ? "처리 중..." : isLogin ? "로그인" : "가입하기"}
          </Btn>
        </div>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: T.textSub, fontFamily: T.font }}>
          {isLogin ? "계정이 없으신가요?" : "이미 계정이 있으신가요?"}
          {" "}
          <button onClick={() => { setIsLogin(l => !l); setError(""); }} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontWeight: 600, fontFamily: T.font, fontSize: 13 }}>
            {isLogin ? "회원가입" : "로그인"}
          </button>
        </div>
        <div style={{ textAlign: "center", marginTop: 12, fontSize: 12, color: T.muted, fontFamily: T.font }}>
          로그인 없이 <button onClick={() => setPage("editor")} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontFamily: T.font, fontSize: 12 }}>체험 모드</button>로 이용할 수 있습니다.
        </div>
      </Card>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 테이블 시각화 다이어그램
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function TableDiagram({ schemas }) {
  if (!schemas || schemas.length === 0) return (
    <div style={{ textAlign: "center", padding: 60, color: T.muted, fontFamily: T.font }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⊞</div>
      <div style={{ fontSize: 14 }}>CREATE TABLE 문을 실행하면 구조가 여기에 표시됩니다.</div>
    </div>
  );

  const badgeColors = { PK: "#d97706", FK: "#7c3aed", "NOT NULL": "#2563eb", UNIQUE: "#16a34a", CHECK: "#0891b2", DEFAULT: "#6b7280" };
  const BadgeInline = ({ label }) => {
    const c = badgeColors[label] || "#6b7280";
    return <span style={{ background: c + "15", border: `1px solid ${c}40`, color: c, fontSize: 10, padding: "1px 5px", borderRadius: 3, fontWeight: 700, marginLeft: 4 }}>{label}</span>;
  };

  return (
    <div>
      {/* FK 관계 요약 */}
      {schemas.some(s => s.foreignKeys.length > 0) && (
        <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.purple, marginBottom: 8, fontFamily: T.font }}>🔗 테이블 관계</div>
          {schemas.flatMap(s => s.foreignKeys.map(fk => (
            <div key={`${s.tableName}-${fk.column}`} style={{ fontSize: 13, color: "#5b21b6", fontFamily: T.mono, marginBottom: 2 }}>
              {s.tableName}.{fk.column} → {fk.refTable}.{fk.refColumn}
            </div>
          )))}
        </div>
      )}

      {/* 테이블 카드들 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {schemas.map((schema, i) => (
          <div key={i} style={{
            border: "2px solid #e2e8f0", borderRadius: 10, overflow: "hidden",
            minWidth: 270, background: T.surface, boxShadow: "0 2px 8px #00000008",
          }}>
            {/* 테이블 헤더 */}
            <div style={{ background: "#1e40af", padding: "9px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: "#93c5fd", fontSize: 12 }}>⊞</span>
              <span style={{ color: "#fff", fontWeight: 700, fontFamily: T.mono, fontSize: 14 }}>{schema.tableName}</span>
              <span style={{ color: "#93c5fd", fontSize: 11, marginLeft: "auto" }}>{schema.columns.length} cols</span>
            </div>
            {/* 컬럼 목록 */}
            {schema.columns.map((col, ci) => (
              <div key={ci} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 14px",
                borderBottom: `1px solid ${T.border}`,
                background: col.pk ? "#fffbeb" : ci % 2 === 0 ? "#fafaf9" : "#fff",
              }}>
                <span style={{ width: 16, textAlign: "center", fontSize: 12 }}>{col.pk ? "🔑" : col.fk ? "🔗" : "·"}</span>
                <span style={{
                  fontFamily: T.mono, fontSize: 13, minWidth: 100,
                  color: col.pk ? "#92400e" : col.fk ? "#5b21b6" : T.text,
                  fontWeight: col.pk ? 700 : 400,
                }}>{col.name}</span>
                <span style={{ fontFamily: T.mono, fontSize: 11, color: T.muted, flex: 1 }}>{col.type}</span>
                <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  {col.pk && <BadgeInline label="PK" />}
                  {col.fk && <BadgeInline label="FK" />}
                  {col.notNull && !col.pk && <BadgeInline label="NOT NULL" />}
                  {col.unique && !col.pk && <BadgeInline label="UNIQUE" />}
                  {col.check && <BadgeInline label="CHECK" />}
                  {col.default != null && <BadgeInline label="DEFAULT" />}
                </div>
              </div>
            ))}
            {/* FK 참조 요약 */}
            {schema.foreignKeys.length > 0 && (
              <div style={{ padding: "7px 14px", background: "#f5f3ff", borderTop: `1px solid ${T.border}` }}>
                {schema.foreignKeys.map((fk, fi) => (
                  <div key={fi} style={{ fontSize: 11, color: "#5b21b6", fontFamily: T.mono }}>
                    🔗 {fk.column} → {fk.refTable}({fk.refColumn})
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SQL 에디터 페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function EditorPage({ user, setPage }) {
  const [sql, setSql] = useState(
`-- 안녕하세요! SQL을 작성하고 실행해보세요.
-- 아래 예시를 그대로 실행해볼 수 있습니다.

CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  age INT CHECK(age >= 18),
  dept_id INT,
  gpa DECIMAL(3,2)
);

INSERT INTO student VALUES (1, '김민준', 22, 1, 3.85);
INSERT INTO student VALUES (2, '이서연', 21, 1, 3.42);
INSERT INTO student VALUES (3, '박지호', 23, 2, 3.91);

SELECT * FROM student WHERE age >= 22;`
  );
  const [outputs, setOutputs]   = useState([]);
  const [sqlDb, setSqlDb]       = useState(null);
  const [schemas, setSchemas]   = useState([]);
  const [showDiagram, setShowDiagram] = useState(false);
  const [docTitle, setDocTitle] = useState("제목 없음");
  const [docId, setDocId]       = useState(null);
  const [docList, setDocList]   = useState([]);
  const [showDocs, setShowDocs] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const outputRef = useRef(null);

  // sql.js 초기화
  useEffect(() => {
    initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}` })
      .then(SQL => setSqlDb(new SQL.Database()))
      .catch(() => console.warn("sql.js 로딩 실패 - 브라우저 실행 전용 모드"));
  }, []);

  // 문서 목록 불러오기
  const loadDocs = useCallback(async () => {
    if (!user) return;
    try { setDocList(await api.getDocs()); } catch {}
  }, [user]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  // SQL 실행
  const run = () => {
    const stmts = splitStatements(sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n"));
    const newOutputs = [];
    const newSchemas = [...schemas];

    for (const stmt of stmts) {
      if (!stmt.trim()) continue;
      const explanation = explainSQL(stmt);

      if (sqlDb) {
        try {
          const results = sqlDb.exec(stmt);
          if (/CREATE\s+TABLE/i.test(stmt)) {
            const schema = parseCreateTable(stmt);
            if (schema) {
              const existing = newSchemas.findIndex(s => s.tableName.toLowerCase() === schema.tableName.toLowerCase());
              if (existing >= 0) newSchemas[existing] = schema;
              else newSchemas.push(schema);
            }
            newOutputs.push({ type: "success", stmt, label: "✅ CREATE TABLE", explanation });
          } else if (results.length > 0) {
            newOutputs.push({ type: "table", stmt, label: "📊 결과", data: results[0], explanation });
          } else {
            newOutputs.push({ type: "success", stmt, label: "✅ 실행 완료", explanation });
          }
        } catch (e) {
          const errInfo = analyzeError(stmt, e.message);
          newOutputs.push({ type: "error", stmt, label: "❌ 오류", error: errInfo, explanation });
        }
      } else {
        // sql.js 없을 때 — 해설만 표시
        if (/CREATE\s+TABLE/i.test(stmt)) {
          const schema = parseCreateTable(stmt);
          if (schema) {
            const existing = newSchemas.findIndex(s => s.tableName.toLowerCase() === schema.tableName.toLowerCase());
            if (existing >= 0) newSchemas[existing] = schema;
            else newSchemas.push(schema);
          }
        }
        newOutputs.push({ type: "explain_only", stmt, label: "💬 해설", explanation });
      }
    }

    setSchemas(newSchemas);
    setOutputs(newOutputs);
    setTimeout(() => outputRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  // 저장
  const save = async () => {
    if (!user) { setPage("login"); return; }
    setSaveStatus("저장 중...");
    try {
      if (docId) {
        await api.saveDoc(docId, { title: docTitle, sql_code: sql });
      } else {
        const doc = await api.createDoc({ title: docTitle, sql_code: sql });
        setDocId(doc.id);
      }
      setSaveStatus("저장됨 ✓");
      loadDocs();
      setTimeout(() => setSaveStatus(""), 2000);
    } catch (e) {
      setSaveStatus("저장 실패");
    }
  };

  // 문서 불러오기
  const loadDoc = async (id) => {
    try {
      const doc = await api.getDoc(id);
      setSql(doc.sql_code);
      setDocTitle(doc.title);
      setDocId(doc.id);
      setOutputs([]);
      setShowDocs(false);
    } catch {}
  };

  // 새 문서
  const newDoc = () => {
    setSql("-- 새 SQL 문서\n");
    setDocTitle("제목 없음");
    setDocId(null);
    setOutputs([]);
    setSchemas([]);
  };

  const lineCount = sql.split("\n").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 54px)" }}>
      {/* 상단 툴바 */}
      <div style={{
        background: T.surface, borderBottom: `1px solid ${T.border}`,
        padding: "10px 24px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        {/* 제목 */}
        {editingTitle ? (
          <input value={docTitle} onChange={e => setDocTitle(e.target.value)}
            onBlur={() => setEditingTitle(false)} onKeyDown={e => e.key === "Enter" && setEditingTitle(false)}
            autoFocus style={{
              border: `1px solid ${T.accent}`, borderRadius: 6, padding: "4px 10px",
              fontSize: 14, fontFamily: T.font, color: T.text, background: T.bg, outline: "none",
            }} />
        ) : (
          <span onClick={() => setEditingTitle(true)} style={{
            fontSize: 14, fontWeight: 600, color: T.text, cursor: "pointer",
            padding: "4px 8px", borderRadius: 6, fontFamily: T.font,
          }} title="클릭해서 제목 수정">{docTitle}</span>
        )}

        <div style={{ flex: 1 }} />

        {!user && <Badge label="체험 모드 — 저장하려면 로그인하세요" color={T.yellow} />}
        {saveStatus && <span style={{ fontSize: 13, color: T.green, fontFamily: T.font }}>{saveStatus}</span>}

        <Btn onClick={newDoc} size="sm">+ 새 문서</Btn>
        {user && <Btn onClick={() => { setShowDocs(true); loadDocs(); }} size="sm">📂 불러오기</Btn>}
        <Btn onClick={save} variant="primary" size="sm">💾 저장</Btn>
        <Btn onClick={() => setShowDiagram(true)} size="sm" style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", color: T.purple }}>🗂 그림 보기</Btn>
        <Btn onClick={run} variant="primary">▶ 실행</Btn>
      </div>

      {/* 에디터 + 결과 2분할 */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* 왼쪽: SQL 에디터 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: `1px solid ${T.border}` }}>
          <div style={{ background: "#1e293b", padding: "6px 14px 5px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", gap: 5 }}>
              {["#ef4444", "#f59e0b", "#10b981"].map((c, i) => <div key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />)}
            </div>
            <span style={{ color: "#64748b", fontSize: 11, fontFamily: T.mono, marginLeft: 4 }}>SQL — {lineCount}줄</span>
          </div>
          <div style={{ flex: 1, display: "flex", background: "#0f172a", overflow: "auto" }}>
            {/* 줄번호 */}
            <div style={{
              padding: "14px 10px 14px 12px", color: "#334155", fontSize: 12,
              fontFamily: T.mono, lineHeight: "1.65", textAlign: "right",
              userSelect: "none", minWidth: 36, borderRight: "1px solid #1e293b", flexShrink: 0,
            }}>
              {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
            </div>
            <textarea value={sql} onChange={e => setSql(e.target.value)}
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: "#e2e8f0", fontFamily: T.mono, fontSize: 13.5, lineHeight: "1.65",
                padding: "14px 16px", resize: "none", minHeight: "100%",
                overflowY: "hidden",
              }} spellCheck={false}
              onKeyDown={e => {
                if (e.key === "Tab") { e.preventDefault(); const pos = e.target.selectionStart; const newSql = sql.slice(0, pos) + "  " + sql.slice(pos); setSql(newSql); setTimeout(() => { e.target.selectionStart = e.target.selectionEnd = pos + 2; }, 0); }
              }} />
          </div>
        </div>

        {/* 오른쪽: 결과 + 해설 */}
        <div style={{ flex: 1, overflow: "auto", padding: 20, background: T.bg }}>
          {outputs.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: 60, color: T.muted, fontFamily: T.font }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>▶</div>
              <div style={{ fontSize: 14 }}>SQL을 입력하고 실행 버튼을 눌러보세요.</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Ctrl+Enter로도 실행할 수 있습니다.</div>
            </div>
          ) : (
            <div ref={outputRef} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {outputs.map((out, i) => <OutputCard key={i} output={out} />)}
            </div>
          )}
        </div>
      </div>

      {/* 다이어그램 모달 */}
      <Modal open={showDiagram} onClose={() => setShowDiagram(false)} title="🗂 테이블 구조 시각화" wide>
        <TableDiagram schemas={schemas} />
      </Modal>

      {/* 문서 목록 모달 */}
      <Modal open={showDocs} onClose={() => setShowDocs(false)} title="📂 저장된 문서">
        {docList.length === 0 ? (
          <div style={{ textAlign: "center", padding: 30, color: T.muted, fontFamily: T.font }}>저장된 문서가 없습니다.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {docList.map(doc => (
              <div key={doc.id} onClick={() => loadDoc(doc.id)} style={{
                padding: "12px 16px", borderRadius: 8, border: `1px solid ${T.border}`,
                cursor: "pointer", background: T.bg, display: "flex", justifyContent: "space-between", alignItems: "center",
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
                onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: T.text, fontFamily: T.font }}>{doc.title}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2, fontFamily: T.font }}>
                    {new Date(doc.updated_at).toLocaleString("ko-KR")}
                  </div>
                </div>
                <span style={{ color: T.muted, fontSize: 18 }}>›</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── 출력 카드 컴포넌트 ─────────────────────────────────────────────────────────
function OutputCard({ output: out }) {
  const [showExpl, setShowExpl] = useState(true);
  const bgMap = { success: "#f0fdf4", table: "#f8fafc", error: "#fef2f2", explain_only: "#eff6ff" };
  const borderMap = { success: "#bbf7d0", table: T.border, error: "#fecaca", explain_only: "#bfdbfe" };

  return (
    <div style={{ background: bgMap[out.type] || T.surface, border: `1px solid ${borderMap[out.type] || T.border}`, borderRadius: 10, overflow: "hidden" }}>
      {/* 헤더 */}
      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${borderMap[out.type] || T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 13, fontFamily: T.font }}>{out.label}</span>
        <code style={{ color: T.muted, fontSize: 11, fontFamily: T.mono }}>{out.stmt?.replace(/\s+/g, " ").slice(0, 60)}</code>
      </div>
      <div style={{ padding: 14 }}>
        {/* 에러 */}
        {out.type === "error" && out.error && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700, color: T.red, fontSize: 14, marginBottom: 6, fontFamily: T.font }}>
              🔍 {out.error.title}
            </div>
            <div style={{ fontSize: 13, color: "#991b1b", lineHeight: 1.7, fontFamily: T.font }}
              dangerouslySetInnerHTML={{ __html: out.error.message }} />
            {out.error.hint && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: "#fff7ed", borderRadius: 6, fontSize: 12, color: "#92400e", fontFamily: T.font }}>
                💡 {out.error.hint}
              </div>
            )}
          </div>
        )}
        {/* 테이블 결과 */}
        {out.type === "table" && out.data && (
          <div style={{ overflowX: "auto", marginBottom: 14 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: T.mono, fontSize: 13 }}>
              <thead>
                <tr>{out.data.columns.map((c, i) => <th key={i} style={{ background: "#1e40af", color: "#e0f2fe", padding: "7px 12px", textAlign: "left", fontWeight: 700 }}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {out.data.values.map((row, ri) => (
                  <tr key={ri} style={{ background: ri % 2 === 0 ? "#f8fafc" : "#fff" }}>
                    {row.map((cell, ci) => <td key={ci} style={{ padding: "6px 12px", borderBottom: `1px solid ${T.border}`, color: cell == null ? T.muted : T.text, fontStyle: cell == null ? "italic" : "normal" }}>{cell == null ? "NULL" : String(cell)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: T.muted, padding: "5px 2px", fontFamily: T.font }}>{out.data.values.length}개 행</div>
          </div>
        )}

        {/* 자동 해설 */}
        {out.explanation && out.explanation.length > 0 && (
          <div>
            <button onClick={() => setShowExpl(v => !v)} style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 12, color: T.accent, fontWeight: 600, padding: "2px 0", fontFamily: T.font,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              💬 자동 해설 {showExpl ? "▲" : "▼"}
            </button>
            {showExpl && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {out.explanation.map((exp, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 10, padding: "8px 12px",
                    background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`,
                    alignItems: "flex-start",
                  }}>
                    <span style={{
                      background: exp.color + "18", color: exp.color,
                      fontSize: 11, padding: "2px 7px", borderRadius: 4, fontWeight: 700,
                      whiteSpace: "nowrap", fontFamily: T.mono, marginTop: 1,
                    }}>{exp.keyword}</span>
                    <span style={{ fontSize: 13, color: T.textSub, lineHeight: 1.65, fontFamily: T.font }}
                      dangerouslySetInnerHTML={{ __html: exp.text }} />
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
const CONCEPTS_DATA = [
  { id:"create-table", title:"CREATE TABLE", category:"DDL",
    definition:"새로운 테이블을 데이터베이스에 생성하는 DDL 명령어입니다.",
    easy:"엑셀에서 새 시트를 만들고 각 열의 이름과 형식을 정해주는 것과 같습니다. 열 이름(컬럼명)과 어떤 종류의 데이터가 들어올지(데이터 타입)를 정해야 합니다.",
    syntax:`CREATE TABLE 테이블명 (
  컬럼명 데이터타입 [제약조건],
  컬럼명 데이터타입 [제약조건],
  [테이블 제약조건]
);`,
    example:`CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  age INT CHECK(age >= 18),
  gpa DECIMAL(3,2) DEFAULT 0.0
);`,
    result:"student라는 이름의 테이블이 생성됩니다. student_id, name, age, gpa 4개의 컬럼을 가집니다.",
    caution:["VARCHAR에는 반드시 길이를 지정해야 합니다 (예: VARCHAR(50))","부모 테이블을 자식 테이블보다 먼저 생성해야 합니다 (FK 사용 시)"],
    mistakes:["CREATE TABLE student id INT, name VARCHAR -- 괄호 누락","CREATE TABLE student (id INT name VARCHAR(50)) -- 쉼표 누락"],
  },
  { id:"primary-key", title:"PRIMARY KEY", category:"제약조건",
    definition:"테이블의 각 행(레코드)을 고유하게 식별하는 기본키 제약조건입니다.",
    easy:"학교에서 학생마다 학번이 다르듯이, PRIMARY KEY는 각 행이 서로 구별될 수 있도록 고유한 값을 강제합니다. 두 학생이 같은 학번을 가질 수 없는 것처럼, 기본키 컬럼에는 중복된 값이 들어올 수 없습니다.",
    syntax:`-- 컬럼 수준
컬럼명 데이터타입 PRIMARY KEY

-- 테이블 수준 (복합 기본키)
PRIMARY KEY(컬럼1, 컬럼2)`,
    example:`-- 단일 기본키
CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50)
);

-- 복합 기본키
CREATE TABLE enrollment (
  student_id INT,
  course_id VARCHAR(10),
  PRIMARY KEY(student_id, course_id)
);`,
    result:"기본키 컬럼에는 NULL 값과 중복 값이 들어올 수 없습니다.",
    caution:["한 테이블에 PRIMARY KEY는 오직 하나","자동으로 NOT NULL + UNIQUE 특성을 가짐"],
    mistakes:["PRIMARY KEY 컬럼에 NULL 삽입 시도","하나의 테이블에 PRIMARY KEY를 두 개 정의"],
  },
  { id:"foreign-key", title:"FOREIGN KEY", category:"제약조건",
    definition:"다른 테이블의 기본키를 참조하여 테이블 간 관계를 정의하는 제약조건입니다.",
    easy:"수강신청 테이블에서 '학생번호'가 학생 테이블에 없는 번호면 신청이 되면 안 되겠죠? FOREIGN KEY가 바로 이 규칙을 자동으로 지켜줍니다.",
    syntax:`FOREIGN KEY (컬럼명)
  REFERENCES 참조테이블(참조컬럼)
  [ON DELETE CASCADE | SET NULL | RESTRICT]`,
    example:`CREATE TABLE enrollment (
  enroll_id INT PRIMARY KEY,
  student_id INT NOT NULL,
  course_id VARCHAR(10),
  FOREIGN KEY (student_id)
    REFERENCES student(student_id)
    ON DELETE CASCADE
);`,
    result:"student 테이블에 없는 student_id는 enrollment에 INSERT할 수 없습니다.",
    caution:["참조 대상(부모 테이블)이 먼저 생성되어야 함","FK 컬럼 자체는 NULL 허용 가능 (NOT NULL 미지정 시)"],
    mistakes:["FOREIGN KEY 컬럼명을 괄호 없이 작성: FOREIGN KEY student_id REFERENCES ...","참조 컬럼이 PK/UNIQUE가 아닌 일반 컬럼"],
  },
  { id:"not-null", title:"NOT NULL", category:"제약조건",
    definition:"해당 컬럼에 NULL 값이 들어올 수 없도록 강제하는 제약조건입니다.",
    easy:"회원가입 폼에서 이름 칸은 반드시 채워야 하는 필수 항목이죠? NOT NULL이 바로 그런 역할입니다.",
    syntax:`컬럼명 데이터타입 NOT NULL`,
    example:`CREATE TABLE member (
  id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,     -- 필수 입력
  email VARCHAR(100) NOT NULL,   -- 필수 입력
  phone VARCHAR(20)              -- 선택 입력 (NULL 가능)
);`,
    result:"name, email은 INSERT 시 반드시 값을 제공해야 합니다.",
    caution:["PRIMARY KEY는 이미 자동으로 NOT NULL","NULL과 빈 문자열('')은 다릅니다"],
    mistakes:["NOT NULL과 DEFAULT를 혼동 (DEFAULT는 값 생략 시 기본값, NOT NULL은 NULL 자체 금지)"],
  },
  { id:"unique", title:"UNIQUE", category:"제약조건",
    definition:"해당 컬럼에 중복된 값이 들어올 수 없도록 강제하는 제약조건입니다.",
    easy:"이메일 주소는 하나의 계정에만 등록할 수 있어야 합니다. UNIQUE가 이런 중복 방지 규칙을 자동으로 적용합니다.",
    syntax:`컬럼명 데이터타입 UNIQUE
-- 또는
UNIQUE(컬럼명)`,
    example:`CREATE TABLE member (
  id INT PRIMARY KEY,
  email VARCHAR(100) UNIQUE,
  username VARCHAR(50) UNIQUE
);`,
    result:"email과 username 컬럼에는 동일한 값이 두 행에 들어올 수 없습니다.",
    caution:["NULL 값은 UNIQUE 검사에서 예외 (NULL은 여러 개 가능)","PRIMARY KEY와 차이: UNIQUE는 NULL 허용, 하나의 테이블에 여러 개 가능"],
    mistakes:["PRIMARY KEY와 UNIQUE를 혼용 (의미는 비슷하지만 역할이 다름)"],
  },
  { id:"check", title:"CHECK", category:"제약조건",
    definition:"컬럼에 저장될 수 있는 값의 조건을 정의하는 제약조건입니다.",
    easy:"나이 컬럼에 -5나 200이 들어오면 안 되겠죠? CHECK는 '이 조건을 만족하는 값만 받겠다'는 규칙입니다.",
    syntax:`컬럼명 데이터타입 CHECK(조건식)`,
    example:`CREATE TABLE student (
  id INT PRIMARY KEY,
  age INT CHECK(age >= 18 AND age <= 100),
  grade CHAR(1) CHECK(grade IN ('A','B','C','D','F')),
  gpa DECIMAL(3,2) CHECK(gpa >= 0.0 AND gpa <= 4.5)
);`,
    result:"조건을 위반하는 값을 INSERT/UPDATE하면 오류가 발생합니다.",
    caution:["CHECK 위반 시 INSERT/UPDATE 자체가 거부됨","복잡한 비즈니스 로직은 CHECK보다 애플리케이션에서 처리 권장"],
    mistakes:["CHECK 문법 오류: CHECK age >= 18 (괄호 누락)"],
  },
  { id:"default", title:"DEFAULT", category:"제약조건",
    definition:"INSERT 시 해당 컬럼 값을 생략했을 때 자동으로 사용될 기본값을 지정합니다.",
    easy:"회원가입 시 포인트를 별도로 입력하지 않아도 자동으로 0점이 적립되는 것처럼, DEFAULT는 값을 지정하지 않았을 때의 자동값입니다.",
    syntax:`컬럼명 데이터타입 DEFAULT 기본값`,
    example:`CREATE TABLE post (
  id INT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  view_count INT DEFAULT 0,
  is_public BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`,
    result:"INSERT 시 view_count, is_public, created_at을 생략하면 자동으로 0, TRUE, 현재시간이 저장됩니다.",
    caution:["명시적으로 NULL을 INSERT하면 DEFAULT가 아닌 NULL이 저장됨"],
    mistakes:["DEFAULT와 NOT NULL 혼동: DEFAULT는 NULL을 허용하지만 기본값 제공, NOT NULL은 NULL 자체 금지"],
  },
  { id:"select", title:"SELECT", category:"DML",
    definition:"테이블에서 데이터를 조회하는 DML 명령어입니다.",
    easy:"도서관 목록에서 원하는 책만 골라보는 것처럼, SELECT는 테이블에서 원하는 데이터만 꺼내보는 명령어입니다.",
    syntax:`SELECT 컬럼1, 컬럼2   -- * 는 전체 컬럼
FROM 테이블명
[WHERE 조건]
[GROUP BY 컬럼]
[HAVING 그룹조건]
[ORDER BY 컬럼 ASC|DESC]
[LIMIT 개수]`,
    example:`-- 전체 조회
SELECT * FROM student;

-- 특정 컬럼
SELECT name, gpa FROM student WHERE gpa >= 3.5;

-- 정렬 + 제한
SELECT name, gpa FROM student
ORDER BY gpa DESC LIMIT 5;`,
    result:"조건에 맞는 데이터가 테이블 형태로 반환됩니다.",
    caution:["실행 순서: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY","SELECT절에 집계함수 없는 컬럼을 GROUP BY 없이 사용 불가"],
    mistakes:["WHERE절에 집계함수 사용 (HAVING을 사용해야 함)","GROUP BY 없이 SELECT에 일반 컬럼과 집계함수 혼용"],
  },
  { id:"join", title:"JOIN", category:"DML",
    definition:"두 개 이상의 테이블을 특정 컬럼을 기준으로 연결하여 조회하는 연산입니다.",
    easy:"학생 목록과 학과 목록이 별도로 있을 때, 학생 이름과 학과명을 한 번에 보려면 두 표를 합쳐야 합니다. JOIN이 이 역할을 합니다.",
    syntax:`-- INNER JOIN (교집합)
SELECT ... FROM A
INNER JOIN B ON A.키 = B.키

-- LEFT JOIN (왼쪽 전체)
SELECT ... FROM A
LEFT JOIN B ON A.키 = B.키

-- RIGHT JOIN (오른쪽 전체)
SELECT ... FROM A
RIGHT JOIN B ON A.키 = B.키`,
    example:`SELECT s.name, d.dept_name
FROM student s
INNER JOIN department d
  ON s.dept_id = d.dept_id
WHERE s.gpa >= 3.0;`,
    result:"INNER JOIN: 양쪽 모두 일치하는 행만, LEFT JOIN: 왼쪽 테이블 전체 포함",
    caution:["INNER JOIN은 일치하지 않는 행 제외","LEFT JOIN은 오른쪽에 일치하는 값이 없으면 NULL"],
    mistakes:["ON 조건 없이 JOIN (카테시안 곱 발생)","테이블 별칭 없이 모호한 컬럼명 사용"],
  },
  { id:"group-by", title:"GROUP BY", category:"DML",
    definition:"특정 컬럼의 값이 같은 행들을 하나의 그룹으로 묶어 집계하는 절입니다.",
    easy:"반별 평균 성적을 구하려면 먼저 반 기준으로 학생들을 묶은 뒤 평균을 계산해야 합니다. GROUP BY가 이 '묶는' 역할을 합니다.",
    syntax:`SELECT 그룹컬럼, 집계함수(컬럼)
FROM 테이블
[WHERE 조건]
GROUP BY 그룹컬럼
[HAVING 그룹조건]`,
    example:`-- 학과별 학생 수
SELECT dept_id, COUNT(*) AS 학생수
FROM student GROUP BY dept_id;

-- 평균 GPA가 3.5 이상인 학과
SELECT dept_id, AVG(gpa) AS 평균GPA
FROM student GROUP BY dept_id
HAVING AVG(gpa) >= 3.5;`,
    result:"그룹별로 집계된 결과가 반환됩니다.",
    caution:["SELECT에는 GROUP BY 컬럼이나 집계함수만 포함 가능","HAVING은 그룹화 후 필터, WHERE는 그룹화 전 필터"],
    mistakes:["WHERE절에 집계함수 조건 작성 (HAVING 사용)","GROUP BY 없이 집계함수와 일반 컬럼 혼용"],
  },
];

function ConceptsPage() {
  const [selected, setSelected] = useState(CONCEPTS_DATA[0].id);
  const [search, setSearch] = useState("");

  const filtered = search
    ? CONCEPTS_DATA.filter(c => c.title.toLowerCase().includes(search.toLowerCase()) || c.category.includes(search))
    : CONCEPTS_DATA;

  const concept = CONCEPTS_DATA.find(c => c.id === selected) || CONCEPTS_DATA[0];
  const categories = [...new Set(CONCEPTS_DATA.map(c => c.category))];

  const catColor = { "DDL": T.green, "제약조건": T.yellow, "DML": T.accent };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 54px)" }}>
      {/* 사이드바 */}
      <div style={{ width: 220, borderRight: `1px solid ${T.border}`, overflow: "auto", padding: "16px 12px", background: T.surface, flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 검색..."
          style={{
            width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`,
            fontSize: 13, fontFamily: T.font, color: T.text, background: T.bg,
            outline: "none", boxSizing: "border-box", marginBottom: 14,
          }} />
        {categories.map(cat => (
          <div key={cat} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: catColor[cat] || T.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, padding: "0 4px" }}>{cat}</div>
            {filtered.filter(c => c.category === cat).map(c => (
              <button key={c.id} onClick={() => setSelected(c.id)} style={{
                display: "block", width: "100%", textAlign: "left", padding: "6px 10px",
                borderRadius: 8, border: "none",
                background: selected === c.id ? T.accentBg : "transparent",
                color: selected === c.id ? T.accent : T.textSub,
                cursor: "pointer", fontSize: 13, fontFamily: T.font,
                fontWeight: selected === c.id ? 600 : 400,
              }}>{c.title}</button>
            ))}
          </div>
        ))}
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflow: "auto", padding: 36, background: T.bg }}>
        <div style={{ maxWidth: 780 }}>
          {/* 제목 */}
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 11, color: catColor[concept.category] || T.muted, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", fontFamily: T.font }}>{concept.category}</span>
            <h1 style={{ margin: "6px 0 8px", fontSize: 28, fontWeight: 800, color: T.text, fontFamily: T.font }}>{concept.title}</h1>
            <p style={{ margin: 0, fontSize: 15, color: T.textSub, lineHeight: 1.65, fontFamily: T.font }}>{concept.definition}</p>
          </div>

          {/* 쉬운 설명 */}
          <Card style={{ background: "#f0fdf4", borderColor: "#bbf7d0", marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.green, marginBottom: 8, fontFamily: T.font }}>💡 쉬운 설명</div>
            <div style={{ fontSize: 14, color: "#166534", lineHeight: 1.75, fontFamily: T.font }}>{concept.easy}</div>
          </Card>

          {/* 문법 */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10, fontFamily: T.font }}>📌 문법 형식</h3>
            <div style={{ background: "#0f172a", borderRadius: 10, padding: "14px 16px" }}>
              <pre style={{ margin: 0, color: "#e2e8f0", fontFamily: T.mono, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{concept.syntax}</pre>
            </div>
          </div>

          {/* 예제 */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10, fontFamily: T.font }}>✏️ 예제 코드</h3>
            <div style={{ background: "#0f172a", borderRadius: 10, padding: "14px 16px" }}>
              <pre style={{ margin: 0, color: "#86efac", fontFamily: T.mono, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{concept.example}</pre>
            </div>
            {concept.result && (
              <div style={{ marginTop: 10, padding: "10px 14px", background: T.accentBg, borderRadius: 8, fontSize: 13, color: "#1e40af", fontFamily: T.font }}>
                📊 결과: {concept.result}
              </div>
            )}
          </div>

          {/* 주의사항 */}
          {concept.caution?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10, fontFamily: T.font }}>⚠️ 주의사항</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {concept.caution.map((c, i) => (
                  <div key={i} style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e", fontFamily: T.font }}>• {c}</div>
                ))}
              </div>
            </div>
          )}

          {/* 자주 하는 실수 */}
          {concept.mistakes?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10, fontFamily: T.font }}>❌ 자주 하는 실수</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {concept.mistakes.map((m, i) => (
                  <div key={i} style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, fontSize: 13, color: "#991b1b", fontFamily: T.font }}>
                    <code style={{ fontFamily: T.mono }}>{m}</code>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 마이페이지
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function MyPage({ user, setPage }) {
  const [docs, setDocs] = useState([]);
  const [activity, setActivity] = useState([]);
  const [tab, setTab] = useState("docs");
  const [editId, setEditId] = useState(null);
  const [editTitle, setEditTitle] = useState("");

  useEffect(() => {
    api.getDocs().then(setDocs).catch(() => {});
    api.getActivity().then(setActivity).catch(() => {});
  }, []);

  const deleteDoc = async (id) => {
    if (!window.confirm("삭제하시겠습니까?")) return;
    await api.deleteDoc(id);
    setDocs(d => d.filter(doc => doc.id !== id));
  };

  const renameDoc = async (id) => {
    await api.saveDoc(id, { title: editTitle });
    setDocs(d => d.map(doc => doc.id === id ? { ...doc, title: editTitle } : doc));
    setEditId(null);
  };

  const openDoc = (doc) => {
    // 에디터로 이동 (실제로는 상태를 올려서 처리)
    sessionStorage.setItem("openDocId", doc.id);
    setPage("editor");
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.font }}>마이페이지</h2>
        <div style={{ fontSize: 14, color: T.textSub, marginTop: 4, fontFamily: T.font }}>안녕하세요, <b>{user?.username}</b>님!</div>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${T.border}`, paddingBottom: 0 }}>
        {[{ id: "docs", label: "저장된 문서" }, { id: "activity", label: "최근 활동" }, { id: "account", label: "계정 정보" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 16px", border: "none", background: "transparent",
            color: tab === t.id ? T.accent : T.textSub,
            borderBottom: tab === t.id ? `2px solid ${T.accent}` : "2px solid transparent",
            cursor: "pointer", fontSize: 14, fontFamily: T.font, fontWeight: tab === t.id ? 700 : 400,
            marginBottom: -1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* 저장된 문서 탭 */}
      {tab === "docs" && (
        <div>
          {docs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: T.muted, fontFamily: T.font }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
              <div>저장된 문서가 없습니다.</div>
              <Btn onClick={() => setPage("editor")} variant="primary" style={{ marginTop: 16 }}>SQL 작성하러 가기</Btn>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {docs.map(doc => (
                <Card key={doc.id} style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 20 }}>📄</span>
                    <div style={{ flex: 1 }}>
                      {editId === doc.id ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && renameDoc(doc.id)}
                            style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.accent}`, fontSize: 14, fontFamily: T.font, outline: "none" }} autoFocus />
                          <Btn onClick={() => renameDoc(doc.id)} variant="primary" size="sm">저장</Btn>
                          <Btn onClick={() => setEditId(null)} size="sm">취소</Btn>
                        </div>
                      ) : (
                        <div style={{ fontWeight: 600, fontSize: 15, color: T.text, fontFamily: T.font }}>{doc.title}</div>
                      )}
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2, fontFamily: T.font }}>
                        마지막 수정: {new Date(doc.updated_at).toLocaleString("ko-KR")}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn onClick={() => openDoc(doc)} variant="primary" size="sm">열기</Btn>
                      <Btn onClick={() => { setEditId(doc.id); setEditTitle(doc.title); }} size="sm">수정</Btn>
                      <Btn onClick={() => deleteDoc(doc.id)} variant="danger" size="sm">삭제</Btn>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 최근 활동 탭 */}
      {tab === "activity" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activity.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: T.muted, fontFamily: T.font }}>최근 활동 기록이 없습니다.</div>
          ) : activity.map(act => (
            <div key={act.id} style={{ padding: "10px 14px", background: T.surface, borderRadius: 8, border: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, color: T.text, fontFamily: T.font }}>💾 <b>{act.title || "문서"}</b> 저장됨</div>
              <div style={{ fontSize: 12, color: T.muted, fontFamily: T.font }}>{new Date(act.created_at).toLocaleString("ko-KR")}</div>
            </div>
          ))}
        </div>
      )}

      {/* 계정 정보 탭 */}
      {tab === "account" && (
        <Card style={{ maxWidth: 400 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 4, fontFamily: T.font }}>아이디</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.text, fontFamily: T.font }}>{user?.username}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 4, fontFamily: T.font }}>저장된 문서</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.text, fontFamily: T.font }}>{docs.length}개</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 앱 루트
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(() => {
    const token = localStorage.getItem("sqlvisual_token");
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.exp * 1000 < Date.now()) { localStorage.removeItem("sqlvisual_token"); return null; }
      return { username: payload.username };
    } catch { return null; }
  });

  const handleLogin = (userData) => { setUser(userData); setPage("editor"); };
  const handleLogout = () => { setUser(null); localStorage.removeItem("sqlvisual_token"); setPage("home"); };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.font }}>
      <Header page={page} setPage={setPage} user={user} onLogout={handleLogout} />
      {page === "home"     && <HomePage    setPage={setPage} user={user} />}
      {page === "login"    && <AuthPage    onLogin={handleLogin} setPage={setPage} />}
      {page === "editor"   && <EditorPage  user={user} setPage={setPage} />}
      {page === "concepts" && <ConceptsPage />}
      {page === "mypage"   && <MyPage      user={user} setPage={setPage} />}
    </div>
  );
}
