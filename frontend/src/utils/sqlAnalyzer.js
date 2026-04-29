// ══════════════════════════════════════════════════════════════════════════════
// sqlAnalyzer.js — SQL 자동 해설 + 에러 분석
// 반환 필드: exp.kw, exp.color, exp.text  (App.jsx와 통일)
// ══════════════════════════════════════════════════════════════════════════════

// ── 내부 유틸 ─────────────────────────────────────────────────────────────────
function splitByComma(body) {
  const parts = []; let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") { depth++; cur += ch; }
    else if (ch === ")") { depth--; cur += ch; }
    else if (ch === "," && depth === 0) { parts.push(cur); cur = ""; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SQL 자동 해설
// 반환: Array<{ kw, color, text }>
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function explainSQL(sql) {
  const s  = sql.trim();
  const up = s.toUpperCase().replace(/\s+/g, " ");
  const R  = []; // 결과 배열

  if (up.startsWith("TRUNCATE TABLE")) {
    const tn = s.match(/TRUNCATE\s+TABLE\s+(\w+)/i)?.[1] || "테이블";
    R.push({ kw: "TRUNCATE", color: "#dc2626", text: `<b>${tn}</b> 테이블의 모든 행을 빠르게 삭제합니다.` });
    R.push({ kw: "SQLite 호환", color: "#64748b", text: "SQLVisual에서는 SQLite에 맞춰 DELETE FROM으로 변환해 실행합니다." });
    return R;
  }

  if (/^(DESC|DESCRIBE)\b/i.test(s)) {
    const tn = s.match(/^(?:DESC|DESCRIBE)\s+(\w+)/i)?.[1] || "테이블";
    R.push({ kw: "DESCRIBE", color: "#2563eb", text: `<b>${tn}</b> 테이블의 컬럼 구조를 조회합니다.` });
    R.push({ kw: "SQLite 호환", color: "#64748b", text: "SQLVisual에서는 PRAGMA table_info 결과로 보여줍니다." });
    return R;
  }

  if (up.startsWith("SHOW TABLES") || up.startsWith("SHOW COLUMNS")) {
    R.push({ kw: "SHOW", color: "#2563eb", text: "DB 안의 테이블 또는 컬럼 목록을 확인합니다." });
    R.push({ kw: "SQLite 호환", color: "#64748b", text: "SQLVisual에서는 sqlite_master 또는 PRAGMA 조회로 변환합니다." });
    return R;
  }

  if (up.startsWith("PURGE") || /DROP\s+TABLE\s+.+\s+PURGE$/i.test(s)) {
    R.push({ kw: "PURGE", color: "#64748b", text: "Oracle에서 삭제된 객체를 휴지통 없이 정리할 때 쓰는 명령입니다." });
    R.push({ kw: "SQLVisual", color: "#64748b", text: "브라우저 SQLite에는 휴지통이 없어 실행할 작업이 없거나 PURGE 옵션을 제외합니다." });
    return R;
  }

  // ── CREATE TABLE ────────────────────────────────────────────────────────────
  if (up.startsWith("CREATE TABLE")) {
    const nm = s.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    const tn = nm?.[1] || "테이블";
    R.push({ kw: "CREATE TABLE", color: "#16a34a", text: `<b>${tn}</b> 테이블을 새로 생성합니다.` });

    const bodyM = s.match(/\(([\s\S]+)\)/);
    if (bodyM) {
      const lines = splitByComma(bodyM[1]);
      const cols = [], fks = []; let pks = [];

      lines.forEach(line => {
        const t = line.trim(); if (!t) return;
        const u2 = t.toUpperCase();
        if (/^(CONSTRAINT\s+\w+\s+)?PRIMARY\s+KEY\b/i.test(t)) {
          const m = t.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
          if (m) pks = m[1].split(",").map(c => c.trim());
          return;
        }
        if (/^(CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\b/i.test(t)) {
          const m = t.match(/FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+(\w+)\s*\((\w+)\)/i);
          if (m) fks.push(`<b>${m[1]}</b> → <b>${m[2]}</b>(<b>${m[3]}</b>) 참조`);
          return;
        }
        if (/^(UNIQUE|CHECK|INDEX|KEY)\b/i.test(t.trim())) return;
        const cm = t.match(/^(\w+)\s+(\w+(?:\([^)]*\))?)(.*)?$/i);
        if (!cm) return;
        const [, name, type, rest = ""] = cm;
        const ru = rest.toUpperCase();
        let d = `<b>${name}</b> — ${type.toUpperCase()}`;
        if (ru.includes("PRIMARY KEY")) d += " · 🔑 기본키";
        if (ru.includes("NOT NULL") && !ru.includes("PRIMARY KEY")) d += " · NOT NULL";
        if (ru.includes("UNIQUE")) d += " · UNIQUE";
        if (ru.includes("AUTO_INCREMENT") || ru.includes("AUTOINCREMENT")) d += " · 자동증가";
        const def = rest.match(/DEFAULT\s+(\S+)/i); if (def) d += ` · 기본값 ${def[1]}`;
        const chk = rest.match(/CHECK\s*\(([^)]+)\)/i); if (chk) d += ` · CHECK(${chk[1]})`;
        cols.push(d);
      });

      if (cols.length) R.push({ kw: "컬럼 구성", color: "#2563eb", text: cols.join("<br>") });
      if (pks.length)  R.push({ kw: "복합 PK",   color: "#d97706", text: `<b>${pks.join(", ")}</b> 조합이 기본키` });
      if (fks.length)  R.push({ kw: "외래키",     color: "#7c3aed", text: fks.join("<br>") });
    }
    return R;
  }

  // ── SELECT ──────────────────────────────────────────────────────────────────
  if (up.startsWith("SELECT")) {
    const selM    = s.match(/SELECT\s+([\s\S]+?)\s+FROM\b/i);
    const fromM   = s.match(/\bFROM\s+(\w+)/i);
    const joinM   = s.match(/\b(INNER|LEFT|RIGHT|FULL)?\s*(?:OUTER\s+)?JOIN\s+(\w+)\s+ON\s+([\s\S]+?)(?:\bWHERE|\bGROUP|\bORDER|\bHAVING|\bLIMIT|$)/i);
    const whereM  = s.match(/\bWHERE\s+([\s\S]+?)(?:\bGROUP|\bORDER|\bHAVING|\bLIMIT|$)/i);
    const groupM  = s.match(/\bGROUP\s+BY\s+([\w,\s]+?)(?:\bHAVING|\bORDER|\bLIMIT|$)/i);
    const havingM = s.match(/\bHAVING\s+([\s\S]+?)(?:\bORDER|\bLIMIT|$)/i);
    const orderM  = s.match(/\bORDER\s+BY\s+([\s\S]+?)(?:\bLIMIT|$)/i);
    const limitM  = s.match(/\bLIMIT\s+(\d+)/i);

    const cols  = selM  ? selM[1].trim()  : "*";
    const table = fromM ? fromM[1]        : "테이블";

    R.push({
      kw: "SELECT", color: "#2563eb",
      text: cols === "*"
        ? `<b>${table}</b> 테이블의 <b>모든 컬럼(*)</b>을 조회`
        : `<b>${table}</b> 에서 <b>${cols}</b> 조회`,
    });

    if (joinM) {
      const jt = (joinM[1] || "INNER").toUpperCase();
      const desc = { INNER: "양쪽 일치 행만", LEFT: "왼쪽 전체 + 오른쪽 일치", RIGHT: "오른쪽 전체 + 왼쪽 일치", FULL: "양쪽 전체" };
      R.push({ kw: `${jt} JOIN`, color: "#7c3aed", text: `<b>${joinM[2]}</b> 와 조인 — ${desc[jt] || "조인"}<br><code>${joinM[3]?.trim()}</code>` });
    }
    if (whereM)  R.push({ kw: "WHERE",    color: "#d97706", text: `<b>${whereM[1].trim()}</b> 조건 필터` });
    if (groupM)  R.push({ kw: "GROUP BY", color: "#16a34a", text: `<b>${groupM[1].trim()}</b> 기준 그룹화` });
    if (havingM) R.push({ kw: "HAVING",   color: "#db2777", text: `그룹 필터: <b>${havingM[1].trim()}</b>` });
    if (orderM) {
      const dir = /DESC/i.test(orderM[1]) ? "내림차순" : "오름차순";
      R.push({ kw: "ORDER BY", color: "#0891b2", text: `<b>${orderM[1].trim()}</b> ${dir} 정렬` });
    }
    if (limitM) R.push({ kw: "LIMIT", color: "#6b7280", text: `최대 <b>${limitM[1]}개</b>만 반환` });
    return R;
  }

  // ── INSERT ──────────────────────────────────────────────────────────────────
  if (up.startsWith("INSERT INTO")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*\(([^)]+)\)/i);
    if (m) {
      R.push({ kw: "INSERT INTO", color: "#16a34a", text: `<b>${m[1]}</b> 테이블에 새 행 추가` });
      if (m[2]) R.push({ kw: "컬럼", color: "#2563eb", text: m[2] });
      R.push({ kw: "VALUES", color: "#d97706", text: m[3] });
    } else {
      R.push({ kw: "INSERT INTO", color: "#16a34a", text: "테이블에 새 데이터를 추가합니다." });
    }
    return R;
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  if (up.startsWith("UPDATE")) {
    const tm = s.match(/UPDATE\s+(\w+)\s+SET/i);
    const sm = s.match(/\bSET\s+([\s\S]+?)(?:\bWHERE|$)/i);
    const wm = s.match(/\bWHERE\s+([\s\S]+?)$/i);
    if (tm) R.push({ kw: "UPDATE", color: "#d97706", text: `<b>${tm[1]}</b> 테이블 데이터 수정` });
    if (sm) R.push({ kw: "SET",    color: "#2563eb", text: sm[1].trim() });
    if (wm) R.push({ kw: "WHERE",  color: "#16a34a", text: `<b>${wm[1].trim()}</b> 조건의 행만 수정` });
    else    R.push({ kw: "⚠️ 경고", color: "#dc2626", text: "WHERE 없음 — <b>모든 행</b>이 수정됩니다!" });
    return R;
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (up.startsWith("DELETE FROM")) {
    const tm = s.match(/DELETE\s+FROM\s+(\w+)/i);
    const wm = s.match(/\bWHERE\s+([\s\S]+?)$/i);
    if (tm) R.push({ kw: "DELETE FROM", color: "#dc2626", text: `<b>${tm[1]}</b> 테이블에서 행 삭제` });
    if (wm) R.push({ kw: "WHERE",       color: "#d97706", text: `<b>${wm[1].trim()}</b> 조건의 행만 삭제` });
    else    R.push({ kw: "⚠️ 경고",     color: "#dc2626", text: "WHERE 없음 — <b>모든 행</b>이 삭제됩니다!" });
    return R;
  }

  // ── DROP TABLE ──────────────────────────────────────────────────────────────
  if (up.startsWith("DROP TABLE")) {
    const m = s.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
    R.push({ kw: "DROP TABLE", color: "#dc2626", text: `⚠️ <b>${m?.[1]}</b> 테이블과 모든 데이터 영구 삭제` });
    return R;
  }

  // ── ALTER TABLE ─────────────────────────────────────────────────────────────
  if (up.startsWith("ALTER TABLE")) {
    const tm  = s.match(/ALTER\s+TABLE\s+(\w+)/i);
    const act = /ADD\s+COLUMN/i.test(s) ? "컬럼 추가"
              : /DROP\s+COLUMN/i.test(s) ? "컬럼 삭제"
              : /MODIFY|ALTER\s+COLUMN/i.test(s) ? "컬럼 수정"
              : "구조 변경";
    R.push({ kw: "ALTER TABLE", color: "#d97706", text: `<b>${tm?.[1]}</b> 테이블 ${act}` });
    return R;
  }

  R.push({ kw: "SQL", color: "#9ca3af", text: "SQL 구문을 분석 중입니다." });
  return R;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 실무형 SQL 해설
// 반환: { summary, steps, tips, cautions }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function explainDetailedSQL(sql) {
  const statements = splitStatements(sql).filter(Boolean);
  if (statements.length === 0) {
    return {
      summary: "실행할 SQL이 없습니다.",
      steps: ["SQL 편집기에 실행할 쿼리를 입력하세요."],
      tips: ["짧은 쿼리부터 실행해 결과와 구조를 함께 확인해보세요."],
      cautions: [],
    };
  }

  if (statements.length > 1) {
    const details = statements.map((stmt, idx) => explainOneStatement(stmt, idx + 1));
    return {
      summary: `${statements.length}개의 SQL 문을 순서대로 실행합니다.`,
      steps: details.map(d => `${d.order}. ${d.summary}`),
      tips: [...new Set(details.flatMap(d => d.tips))].slice(0, 4),
      cautions: [...new Set(details.flatMap(d => d.cautions))].slice(0, 4),
    };
  }

  const one = explainOneStatement(statements[0], 1);
  return {
    summary: one.summary,
    steps: one.steps,
    tips: one.tips,
    cautions: one.cautions,
  };
}

function explainOneStatement(stmt, order) {
  const s = stmt.trim();
  const up = s.toUpperCase().replace(/\s+/g, " ");

  if (up.startsWith("TRUNCATE TABLE")) {
    const table = s.match(/TRUNCATE\s+TABLE\s+(\w+)/i)?.[1] || "테이블";
    return {
      order,
      summary: `${table} 테이블의 모든 행을 삭제합니다.`,
      steps: [`${table} 테이블의 데이터만 비우고 테이블 구조는 유지합니다.`, "SQLVisual에서는 SQLite에 맞춰 DELETE FROM으로 변환해 실행합니다."],
      tips: ["실무에서는 TRUNCATE가 롤백/권한/트리거 동작에서 DBMS마다 다르게 동작할 수 있어 주의합니다."],
      cautions: ["WHERE 조건을 줄 수 없으므로 전체 데이터 삭제 의도가 맞는지 확인해야 합니다."],
    };
  }

  if (/^(DESC|DESCRIBE)\b/i.test(s)) {
    const table = s.match(/^(?:DESC|DESCRIBE)\s+(\w+)/i)?.[1] || "테이블";
    return {
      order,
      summary: `${table} 테이블의 컬럼 구조를 확인합니다.`,
      steps: [`${table} 테이블의 컬럼명, 타입, NULL 허용 여부, 기본키 여부를 조회합니다.`],
      tips: ["테이블 구조를 모를 때는 먼저 DESCRIBE로 컬럼을 확인한 뒤 SELECT를 작성하면 좋습니다."],
      cautions: ["DESCRIBE는 DBMS마다 출력 형식이 다릅니다."],
    };
  }

  if (up.startsWith("SHOW TABLES") || up.startsWith("SHOW COLUMNS")) {
    return {
      order,
      summary: "DB 구조 목록을 확인합니다.",
      steps: [up.startsWith("SHOW TABLES") ? "현재 DB에 있는 테이블 목록을 조회합니다." : "지정한 테이블의 컬럼 목록을 조회합니다."],
      tips: ["MySQL식 SHOW 명령은 SQLVisual에서 SQLite 조회문으로 변환됩니다."],
      cautions: ["실제 Oracle에서는 SHOW TABLES 대신 USER_TABLES 같은 데이터 딕셔너리 뷰를 사용합니다."],
    };
  }

  if (up.startsWith("PURGE") || /DROP\s+TABLE\s+.+\s+PURGE$/i.test(s)) {
    return {
      order,
      summary: "Oracle의 휴지통 정리 명령입니다.",
      steps: ["Oracle에서는 삭제된 객체를 recycle bin에서 완전히 제거할 때 사용합니다.", "SQLVisual의 브라우저 SQLite에는 recycle bin이 없어 건너뛰거나 PURGE 옵션을 제외합니다."],
      tips: ["학습용 Oracle 스크립트에 PURGE가 있어도 SQLVisual에서는 흐름이 끊기지 않게 처리합니다."],
      cautions: ["실제 Oracle에서 PURGE는 복구 여지를 없앨 수 있으니 신중히 사용해야 합니다."],
    };
  }

  if (up.startsWith("CREATE TABLE")) {
    const schema = parseCreateTable(s);
    const table = schema?.tableName || s.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i)?.[1] || "테이블";
    const steps = schema?.columns?.length
      ? schema.columns.map(col => {
          const roles = [];
          if (col.pk) roles.push("기본키");
          if (col.fk) roles.push(`${col.refTable} 테이블 참조`);
          if (col.notNull && !col.pk) roles.push("필수 입력");
          if (col.unique) roles.push("중복 불가");
          if (col.check) roles.push(`조건 검사(${col.check})`);
          return `${col.name}은 ${col.type} 컬럼${roles.length ? `이며 ${roles.join(", ")} 역할을 합니다` : "입니다"}.`;
        })
      : [`${table} 테이블의 컬럼 구조를 정의합니다.`];

    return {
      order,
      summary: `${table}라는 테이블을 생성합니다.`,
      steps,
      tips: ["기본키는 보통 숫자 ID를 사용하면 조회와 관계 설정이 단순해집니다."],
      cautions: schema?.foreignKeys?.length
        ? ["외래키는 참조 대상 테이블이 먼저 존재해야 합니다."]
        : ["CREATE TABLE은 이미 같은 이름의 테이블이 있으면 실패할 수 있습니다."],
    };
  }

  if (up.startsWith("SELECT")) {
    const table = s.match(/\bFROM\s+(\w+)/i)?.[1] || "테이블";
    const columns = s.match(/SELECT\s+([\s\S]+?)\s+FROM\b/i)?.[1]?.trim() || "*";
    const where = s.match(/\bWHERE\s+([\s\S]+?)(?:\bGROUP|\bORDER|\bHAVING|\bLIMIT|$)/i)?.[1]?.trim();
    const join = s.match(/\b(?:INNER|LEFT|RIGHT|FULL)?\s*(?:OUTER\s+)?JOIN\s+(\w+)\s+ON\s+([\s\S]+?)(?:\bWHERE|\bGROUP|\bORDER|\bHAVING|\bLIMIT|$)/i);
    const group = s.match(/\bGROUP\s+BY\s+([\w,\s]+?)(?:\bHAVING|\bORDER|\bLIMIT|$)/i)?.[1]?.trim();
    const orderBy = s.match(/\bORDER\s+BY\s+([\s\S]+?)(?:\bLIMIT|$)/i)?.[1]?.trim();
    const limit = s.match(/\bLIMIT\s+(\d+)/i)?.[1];
    const steps = [`${table} 테이블을 조회합니다.`];

    if (columns === "*") steps.push("* 은 모든 컬럼을 의미합니다.");
    else steps.push(`${columns} 컬럼만 결과에 포함합니다.`);
    if (join) steps.push(`${join[1]} 테이블을 ${join[2].trim()} 조건으로 연결합니다.`);
    if (where) steps.push(`WHERE 조건으로 ${where}에 맞는 행만 남깁니다.`);
    if (group) steps.push(`${group} 기준으로 행을 그룹화합니다.`);
    if (orderBy) steps.push(`${orderBy} 기준으로 결과를 정렬합니다.`);
    if (limit) steps.push(`결과를 최대 ${limit}개로 제한합니다.`);

    return {
      order,
      summary: where ? `${where} 조건을 만족하는 ${table} 데이터를 조회합니다.` : `${table} 데이터를 조회합니다.`,
      steps,
      tips: columns === "*" ? ["실무에서는 필요한 컬럼만 명시하면 응답 크기와 유지보수성이 좋아집니다."] : ["조건 컬럼에 인덱스가 있으면 조회 성능이 좋아집니다."],
      cautions: join ? ["JOIN 조건이 빠지거나 넓으면 결과 행 수가 예상보다 크게 늘어날 수 있습니다."] : [],
    };
  }

  if (up.startsWith("INSERT INTO")) {
    const table = s.match(/INSERT\s+INTO\s+(\w+)/i)?.[1] || "테이블";
    const cols = s.match(/INSERT\s+INTO\s+\w+\s*\(([^)]+)\)/i)?.[1];
    return {
      order,
      summary: `${table} 테이블에 새 데이터를 추가합니다.`,
      steps: cols ? [`${cols} 컬럼에 값을 넣습니다.`, "VALUES에 적은 값이 같은 순서로 저장됩니다."] : ["테이블 컬럼 순서에 맞춰 값을 저장합니다."],
      tips: ["INSERT할 컬럼명을 명시하면 테이블 구조가 바뀌어도 쿼리가 덜 깨집니다."],
      cautions: ["PRIMARY KEY나 UNIQUE 컬럼에 중복 값이 들어가면 실패합니다."],
    };
  }

  if (up.startsWith("UPDATE")) {
    const table = s.match(/UPDATE\s+(\w+)/i)?.[1] || "테이블";
    const set = s.match(/\bSET\s+([\s\S]+?)(?:\bWHERE|$)/i)?.[1]?.trim();
    const where = s.match(/\bWHERE\s+([\s\S]+?)$/i)?.[1]?.trim();
    return {
      order,
      summary: `${table} 테이블의 기존 데이터를 수정합니다.`,
      steps: [`${set || "지정한 컬럼"} 값을 변경합니다.`, where ? `${where} 조건에 맞는 행만 수정합니다.` : "WHERE 조건이 없어 모든 행이 수정됩니다."],
      tips: ["UPDATE 전에는 같은 WHERE 조건으로 SELECT를 먼저 실행해 대상 행을 확인하세요."],
      cautions: where ? [] : ["WHERE 없는 UPDATE는 전체 데이터를 바꿀 수 있습니다."],
    };
  }

  if (up.startsWith("DELETE FROM")) {
    const table = s.match(/DELETE\s+FROM\s+(\w+)/i)?.[1] || "테이블";
    const where = s.match(/\bWHERE\s+([\s\S]+?)$/i)?.[1]?.trim();
    return {
      order,
      summary: `${table} 테이블에서 데이터를 삭제합니다.`,
      steps: [where ? `${where} 조건에 맞는 행만 삭제합니다.` : "WHERE 조건이 없어 모든 행이 삭제됩니다."],
      tips: ["DELETE 전에는 같은 WHERE 조건으로 SELECT를 먼저 실행해 삭제 대상을 확인하세요."],
      cautions: where ? [] : ["WHERE 없는 DELETE는 테이블의 모든 행을 삭제합니다."],
    };
  }

  return {
    order,
    summary: "SQL 문을 실행합니다.",
    steps: explainSQL(s).map(item => item.text.replace(/<[^>]+>/g, "")),
    tips: ["결과 탭에서 실제 반환 데이터와 실행 시간을 먼저 확인하세요."],
    cautions: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 에러 분석
// 반환: { title, msg, hint }
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function analyzeError(sql, errMsg = "") {
  const s  = sql.trim();
  const up = s.toUpperCase();
  const em = errMsg.toLowerCase();

  // 키워드 오타
  const TYPOS = {
    "SELET ":"SELECT","SELCET ":"SELECT","SELCT ":"SELECT","SEELCT ":"SELECT",
    "INSRET ":"INSERT","INSESRT ":"INSERT","INSET ":"INSERT",
    "CREAT ":"CREATE","CERATE ":"CREATE","CRAETE ":"CREATE",
    "FORM ":"FROM","FOMR ":"FROM",
    "WERE ":"WHERE","WHEER ":"WHERE","WHER ":"WHERE",
    "DELTE ":"DELETE","DELEET ":"DELETE",
    "UPATE ":"UPDATE","UDPATE ":"UPDATE",
    "PRIMAY ":"PRIMARY","PRIAMRY ":"PRIMARY",
    "FORIEGN ":"FOREIGN","FOREGIN ":"FOREIGN",
    "REFERNCES ":"REFERENCES","REFFERENCES ":"REFERENCES",
    "HAVNG ":"HAVING","HAIVNG ":"HAVING",
    "GROOP ":"GROUP","GRUOP ":"GROUP",
    "ORDDER ":"ORDER","ODER ":"ORDER",
  };
  for (const [typo, correct] of Object.entries(TYPOS)) {
    if (up.includes(typo.trimEnd())) {
      return {
        title: "키워드 오타",
        msg: `<b>${typo.trim()}</b> → <b>${correct}</b> 로 수정하세요.`,
        hint: "SQL 키워드 철자를 정확하게 입력해야 합니다. 대소문자는 무관합니다.",
      };
    }
  }

  // 괄호 불일치
  const opens  = (s.match(/\(/g) || []).length;
  const closes = (s.match(/\)/g) || []).length;
  if (opens !== closes) {
    return {
      title: "괄호 불일치",
      msg: opens > closes
        ? `여는 괄호 <b>(</b>가 ${opens - closes}개 더 많습니다.`
        : `닫는 괄호 <b>)</b>가 ${closes - opens}개 더 많습니다.`,
      hint: "모든 ( 에 대응하는 ) 가 있어야 합니다.",
    };
  }

  // CREATE TABLE 쉼표 누락
  if (/CREATE\s+TABLE/i.test(s)) {
    const bodyM = s.match(/\(([\s\S]+)\)/);
    if (bodyM) {
      const lines = bodyM[1].split("\n").map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length - 1; i++) {
        const cur = lines[i], nxt = lines[i + 1].toUpperCase();
        if (!cur.endsWith(",")
          && !nxt.startsWith("PRIMARY") && !nxt.startsWith("FOREIGN")
          && !nxt.startsWith("UNIQUE")  && !nxt.startsWith("CHECK")
          && !nxt.startsWith(")")) {
          return {
            title: "쉼표(,) 누락",
            msg: `<code>${cur}</code> 뒤에 쉼표가 빠졌습니다.`,
            hint: "CREATE TABLE에서 각 컬럼 정의 사이에는 쉼표(,)를 붙여야 합니다.",
          };
        }
      }
    }
    // VARCHAR 길이 누락
    if (/VARCHAR\s*[^(]/i.test(s)) {
      return {
        title: "VARCHAR 길이 누락",
        msg: "<b>VARCHAR</b>에 최대 길이를 지정해야 합니다.",
        hint: "예: VARCHAR(50), VARCHAR(100)",
      };
    }
  }

  // FOREIGN KEY 문법 오류 (괄호 없이)
  if (/FOREIGN\s+KEY\s+\w+\s+REFERENCES/i.test(s)) {
    return {
      title: "FOREIGN KEY 문법 오류",
      msg: "FOREIGN KEY 뒤에 컬럼명을 <b>괄호</b>로 감싸야 합니다.",
      hint: "올바른 형식: FOREIGN KEY (컬럼명) REFERENCES 테이블(컬럼명)",
    };
  }

  // 에러 메시지 기반
  if (em.includes("no such table")) {
    const m = errMsg.match(/table[:\s]+["']?(\w+)["']?/i);
    return { title: "테이블 없음", msg: `<b>${m?.[1] || "참조 테이블"}</b>이 존재하지 않습니다.`, hint: "CREATE TABLE로 먼저 만들어야 합니다." };
  }
  if (em.includes("no such column")) {
    const m = errMsg.match(/column[:\s]+["']?(\w+)["']?/i);
    return { title: "컬럼 없음", msg: `<b>${m?.[1] || "컬럼"}</b>이 해당 테이블에 없습니다.`, hint: "컬럼명 철자를 확인하세요." };
  }
  if (em.includes("unique") && em.includes("failed")) {
    return { title: "중복 값 오류", msg: "UNIQUE/PK 컬럼에 이미 같은 값이 존재합니다.", hint: "다른 값을 사용하거나 기존 데이터를 먼저 확인하세요." };
  }
  if (em.includes("not null")) {
    return { title: "NOT NULL 위반", msg: "NOT NULL 컬럼에 NULL을 삽입하려 했습니다.", hint: "해당 컬럼에 반드시 값을 제공하세요." };
  }
  if (em.includes("foreign key")) {
    return { title: "참조 무결성 오류", msg: "부모 테이블에 해당 값이 없습니다.", hint: "부모 테이블에 먼저 해당 값을 INSERT한 후 다시 시도하세요." };
  }
  if (em.includes("syntax error") || em.includes("parse error")) {
    return { title: "SQL 문법 오류", msg: "SQL 문법이 올바르지 않습니다.", hint: "키워드 순서(SELECT→FROM→WHERE→ORDER BY), 괄호, 쉼표를 다시 확인하세요." };
  }

  return { title: "실행 오류", msg: errMsg || "알 수 없는 오류", hint: "개념 학습 페이지에서 관련 문법을 확인해보세요." };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CREATE TABLE 파서 (시각화용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function parseCreateTable(sql) {
  try {
    const nm = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/i);
    if (!nm) return null;
    const tableName = nm[1];
    const body = sql.slice(sql.indexOf("(") + 1, sql.lastIndexOf(")"));
    const lines = splitByComma(body);
    const columns = [], foreignKeys = [];
    let tablePKs = [];

    for (const line of lines) {
      const t = line.trim(); if (!t) continue;
      const u = t.toUpperCase().trimStart();
      if (/^(CONSTRAINT\s+\w+\s+)?PRIMARY\s+KEY\b/i.test(t)) {
        const m = t.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (m) tablePKs = m[1].split(",").map(s => s.trim().toLowerCase());
        continue;
      }
      if (/^(CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\b/i.test(t)) {
        const m = t.match(/FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s+REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/i);
        if (m) foreignKeys.push({ column: m[1], refTable: m[2], refColumn: m[3] });
        continue;
      }
      if (/^(UNIQUE|CHECK|INDEX|KEY)\b/i.test(t)) continue;
      const cm = t.match(/^(\w+)\s+(\w+(?:\s*\([^)]*\))?)([\s\S]*)$/i);
      if (!cm) continue;
      const [, name, type, rest] = cm;
      const ru = rest.toUpperCase();
      columns.push({
        name, type: type.toUpperCase().replace(/\s+/g, ""),
        pk: ru.includes("PRIMARY KEY"),
        notNull: ru.includes("NOT NULL") || ru.includes("PRIMARY KEY"),
        unique: ru.includes("UNIQUE"),
        fk: false, refTable: null, refColumn: null,
        default: rest.match(/DEFAULT\s+(\S+)/i)?.[1] || null,
        check:   rest.match(/CHECK\s*\(([^)]+)\)/i)?.[1] || null,
      });
    }

    tablePKs.forEach(pk => {
      const c = columns.find(c => c.name.toLowerCase() === pk);
      if (c) { c.pk = true; c.notNull = true; }
    });
    foreignKeys.forEach(fk => {
      const c = columns.find(c => c.name.toLowerCase() === fk.column.toLowerCase());
      if (c) { c.fk = true; c.refTable = fk.refTable; c.refColumn = fk.refColumn; }
    });

    return { tableName, columns, foreignKeys };
  } catch { return null; }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SQL 구문 분리 (세미콜론 기준, 문자열 내부 무시)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function splitStatements(sql) {
  const stmts = []; let cur = "", inStr = false, sc = "";
  for (const ch of sql) {
    if (!inStr && (ch === "'" || ch === '"')) { inStr = true; sc = ch; cur += ch; }
    else if (inStr && ch === sc) { inStr = false; cur += ch; }
    else if (!inStr && ch === ";") { const t = cur.trim(); if (t && !t.startsWith("--")) stmts.push(t); cur = ""; }
    else cur += ch;
  }
  const last = cur.trim();
  if (last && !last.startsWith("--")) stmts.push(last);
  return stmts;
}
