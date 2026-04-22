// ── sqlAnalyzer.js ────────────────────────────────────────────────────────────
// SQL 자동 해설 + 에러 분석 엔진
// 브라우저에서 순수 JS로 동작 (백엔드 불필요)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SQL 자동 해설 생성
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function explainSQL(sql) {
  const s = sql.trim();
  const up = s.toUpperCase().replace(/\s+/g, " ");
  const parts = [];

  // ── CREATE TABLE ──────────────────────────────────────────────────────────
  if (up.startsWith("CREATE TABLE")) {
    const nameM = s.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    const tableName = nameM?.[1] || "테이블";

    parts.push({
      keyword: "CREATE TABLE",
      color: "#10b981",
      text: `<b>${tableName}</b>이라는 새 테이블을 만드는 명령어입니다.`,
    });

    // 컬럼 분석
    const bodyM = s.match(/\(([^)]+(?:\([^)]*\)[^)]*)*)\)/s);
    if (bodyM) {
      const cols = bodyM[1].split(",").map(c => c.trim()).filter(Boolean);
      const colDescs = [];
      let pkCols = [], fkDescs = [];

      cols.forEach(col => {
        const up2 = col.toUpperCase();
        if (up2.startsWith("PRIMARY KEY")) {
          const m = col.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
          if (m) pkCols = m[1].split(",").map(c => c.trim());
          return;
        }
        if (up2.startsWith("FOREIGN KEY")) {
          const m = col.match(/FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+(\w+)\s*\((\w+)\)/i);
          if (m) fkDescs.push(`<b>${m[1]}</b> 컬럼은 <b>${m[2]}</b> 테이블의 <b>${m[3]}</b>를 참조하는 외래키입니다.`);
          return;
        }
        const cm = col.match(/^(\w+)\s+(\w+(?:\([^)]*\))?)(.*)?$/i);
        if (!cm) return;
        const [, name, type, rest = ""] = cm;
        const ru = rest.toUpperCase();
        let desc = `<b>${name}</b>: ${type} 타입`;
        if (ru.includes("PRIMARY KEY")) desc += " · 기본키 (각 행을 고유하게 식별)";
        if (ru.includes("NOT NULL") && !ru.includes("PRIMARY KEY")) desc += " · 반드시 값이 있어야 함";
        if (ru.includes("UNIQUE")) desc += " · 중복 불가";
        if (ru.includes("AUTO_INCREMENT") || ru.includes("AUTOINCREMENT")) desc += " · 자동 증가";
        const defM = rest.match(/DEFAULT\s+(\S+)/i);
        if (defM) desc += ` · 기본값: ${defM[1]}`;
        const chkM = rest.match(/CHECK\s*\(([^)]+)\)/i);
        if (chkM) desc += ` · 조건 검사: ${chkM[1]}`;
        colDescs.push(desc);
      });

      if (colDescs.length > 0)
        parts.push({ keyword: "컬럼 구성", color: "#3b82f6", text: colDescs.join("<br>") });
      if (pkCols.length > 0)
        parts.push({ keyword: "복합 기본키", color: "#f59e0b", text: `<b>${pkCols.join(", ")}</b> 컬럼의 조합이 각 행을 고유하게 식별합니다.` });
      if (fkDescs.length > 0)
        parts.push({ keyword: "외래키 관계", color: "#8b5cf6", text: fkDescs.join("<br>") });
    }
    return parts;
  }

  // ── SELECT ────────────────────────────────────────────────────────────────
  if (up.startsWith("SELECT")) {
    const selM = s.match(/SELECT\s+(.*?)\s+FROM/is);
    const fromM = s.match(/\bFROM\s+(\w+)/i);
    const whereM = s.match(/\bWHERE\s+(.*?)(?:\bORDER|\bGROUP|\bHAVING|\bLIMIT|$)/is);
    const orderM = s.match(/\bORDER\s+BY\s+(.*?)(?:\bLIMIT|$)/is);
    const groupM = s.match(/\bGROUP\s+BY\s+(\w+)/i);
    const havingM = s.match(/\bHAVING\s+(.*?)(?:\bORDER|$)/is);
    const joinM = s.match(/\b(INNER|LEFT|RIGHT|FULL)?\s*JOIN\s+(\w+)\s+ON\s+(.*?)(?:\bWHERE|\bORDER|$)/is);
    const limitM = s.match(/\bLIMIT\s+(\d+)/i);

    const cols = selM ? selM[1].trim() : "*";
    const table = fromM ? fromM[1] : "테이블";

    parts.push({
      keyword: "SELECT",
      color: "#3b82f6",
      text: cols === "*"
        ? `<b>${table}</b> 테이블의 <b>모든 컬럼</b>을 조회합니다.`
        : `<b>${table}</b> 테이블에서 <b>${cols}</b> 컬럼을 조회합니다.`,
    });

    if (joinM) {
      const jType = joinM[1]?.toUpperCase() || "INNER";
      const jTable = joinM[2];
      const jCond = joinM[3]?.trim();
      const jDesc = { "INNER":"두 테이블 모두 일치하는 행만", "LEFT":"왼쪽 테이블 전체 + 오른쪽 일치하는 행", "RIGHT":"오른쪽 테이블 전체 + 왼쪽 일치하는 행", "FULL":"양쪽 테이블 모두" };
      parts.push({ keyword: `${jType || "INNER"} JOIN`, color: "#8b5cf6", text: `<b>${jTable}</b> 테이블과 조인합니다. (${jDesc[jType] || "일치하는 행만"})<br>조인 조건: <code>${jCond}</code>` });
    }

    if (whereM) {
      parts.push({ keyword: "WHERE", color: "#f59e0b", text: `<b>${whereM[1].trim()}</b> 조건을 만족하는 행만 필터링합니다.` });
    }

    if (groupM) {
      parts.push({ keyword: "GROUP BY", color: "#10b981", text: `<b>${groupM[1]}</b> 컬럼을 기준으로 같은 값을 가진 행들을 그룹으로 묶습니다.` });
    }

    if (havingM) {
      parts.push({ keyword: "HAVING", color: "#ec4899", text: `그룹화된 결과에서 <b>${havingM[1].trim()}</b> 조건을 만족하는 그룹만 반환합니다.` });
    }

    if (orderM) {
      const dir = /DESC/i.test(orderM[1]) ? "내림차순" : "오름차순";
      parts.push({ keyword: "ORDER BY", color: "#06b6d4", text: `결과를 <b>${orderM[1].trim()}</b> 기준으로 ${dir} 정렬합니다.` });
    }

    if (limitM) {
      parts.push({ keyword: "LIMIT", color: "#94a3b8", text: `결과를 최대 <b>${limitM[1]}개</b>만 반환합니다.` });
    }

    return parts;
  }

  // ── INSERT ────────────────────────────────────────────────────────────────
  if (up.startsWith("INSERT INTO")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*\(([^)]+)\)/i);
    if (m) {
      const [, table, cols, vals] = m;
      parts.push({ keyword: "INSERT INTO", color: "#10b981", text: `<b>${table}</b> 테이블에 새로운 행(데이터)을 추가합니다.` });
      if (cols) parts.push({ keyword: "컬럼", color: "#3b82f6", text: `저장할 컬럼: <b>${cols}</b>` });
      parts.push({ keyword: "VALUES", color: "#f59e0b", text: `저장할 값: <b>${vals}</b>` });
    }
    return parts;
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  if (up.startsWith("UPDATE")) {
    const tableM = s.match(/UPDATE\s+(\w+)\s+SET/i);
    const setM = s.match(/SET\s+(.*?)(?:\bWHERE|$)/is);
    const whereM2 = s.match(/WHERE\s+(.*?)$/is);
    if (tableM) parts.push({ keyword: "UPDATE", color: "#f59e0b", text: `<b>${tableM[1]}</b> 테이블의 기존 데이터를 수정합니다.` });
    if (setM) parts.push({ keyword: "SET", color: "#3b82f6", text: `변경할 내용: <b>${setM[1].trim()}</b>` });
    if (whereM2) parts.push({ keyword: "WHERE", color: "#ef4444", text: `⚠️ <b>${whereM2[1].trim()}</b> 조건에 맞는 행만 수정됩니다.<br>WHERE 없이 UPDATE하면 <b>모든 행</b>이 수정됩니다!` });
    else parts.push({ keyword: "⚠️ 경고", color: "#ef4444", text: "WHERE 조건이 없습니다! 테이블의 <b>모든 행</b>이 수정됩니다." });
    return parts;
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (up.startsWith("DELETE FROM")) {
    const tableM = s.match(/DELETE\s+FROM\s+(\w+)/i);
    const whereM3 = s.match(/WHERE\s+(.*?)$/is);
    if (tableM) parts.push({ keyword: "DELETE FROM", color: "#ef4444", text: `<b>${tableM[1]}</b> 테이블에서 행(데이터)을 삭제합니다.` });
    if (whereM3) parts.push({ keyword: "WHERE", color: "#f59e0b", text: `<b>${whereM3[1].trim()}</b> 조건에 맞는 행만 삭제됩니다.` });
    else parts.push({ keyword: "⚠️ 경고", color: "#ef4444", text: "WHERE 조건이 없습니다! 테이블의 <b>모든 행</b>이 삭제됩니다." });
    return parts;
  }

  // ── DROP TABLE ────────────────────────────────────────────────────────────
  if (up.startsWith("DROP TABLE")) {
    const m = s.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
    parts.push({ keyword: "DROP TABLE", color: "#ef4444", text: `⚠️ <b>${m?.[1] || "테이블"}</b>을 완전히 삭제합니다. 테이블 구조와 모든 데이터가 사라집니다.` });
    return parts;
  }

  // ── ALTER TABLE ───────────────────────────────────────────────────────────
  if (up.startsWith("ALTER TABLE")) {
    const tableM = s.match(/ALTER\s+TABLE\s+(\w+)/i);
    const table = tableM?.[1] || "테이블";
    if (/ADD\s+COLUMN/i.test(s)) parts.push({ keyword: "ALTER TABLE ... ADD", color: "#10b981", text: `<b>${table}</b> 테이블에 새 컬럼을 추가합니다.` });
    else if (/DROP\s+COLUMN/i.test(s)) parts.push({ keyword: "ALTER TABLE ... DROP", color: "#ef4444", text: `<b>${table}</b> 테이블에서 컬럼을 삭제합니다.` });
    else if (/MODIFY|ALTER\s+COLUMN/i.test(s)) parts.push({ keyword: "ALTER TABLE ... MODIFY", color: "#f59e0b", text: `<b>${table}</b> 테이블의 컬럼 구조를 변경합니다.` });
    else parts.push({ keyword: "ALTER TABLE", color: "#f59e0b", text: `<b>${table}</b> 테이블 구조를 변경합니다.` });
    return parts;
  }

  // ── UNKNOWN ───────────────────────────────────────────────────────────────
  parts.push({ keyword: "SQL", color: "#94a3b8", text: "이 SQL의 역할을 분석 중입니다." });
  return parts;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SQL 에러 분석 (친절한 메시지 생성)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function analyzeError(sql, errorMessage = "") {
  const s = sql.trim();
  const up = s.toUpperCase();
  const em = errorMessage.toLowerCase();

  // 키워드 오타 검사
  const typos = [
    [/\bSELECT\s/i, /\bSELECT\b/i, "SELET", "SELECT"],
    [/\bINSERT\s/i, /\bINSERT\b/i, "INSRET", "INSERT"],
    [/\bCREATE\s/i, /\bCREATE\b/i, "CREAT", "CREATE"],
    [/\bFROM\s/i,   /\bFROM\b/i,   "FORM",  "FROM"],
    [/\bWHERE\s/i,  /\bWHERE\b/i,  "WERE",  "WHERE"],
    [/\bSELECT\b/i, /\bSELCET\b/i, "SELCET","SELECT"],
  ];

  // 공통 오타 패턴 검사
  const commonTypos = {
    "SELET ": "SELECT", "SELCET ": "SELECT", "INSRET ": "INSERT",
    "CREAT ": "CREATE", "FORM ": "FROM", "WERE ": "WHERE",
    "DELTE ": "DELETE", "UPATE ": "UPDATE", "DRPO ": "DROP",
    "PRIMAY ": "PRIMARY", "FORIEGN ": "FOREIGN", "REFERNCES ": "REFERENCES",
    "INSETR ": "INSERT", "SELEECT ": "SELECT",
  };
  for (const [typo, correct] of Object.entries(commonTypos)) {
    if (up.includes(typo)) {
      return {
        type: "typo",
        title: "키워드 오타",
        message: `<b>${typo.trim()}</b> 가 아니라 <b>${correct}</b> 입니다.`,
        hint: `SQL 키워드는 대소문자를 구분하지 않지만 철자는 정확해야 합니다.`,
        position: up.indexOf(typo),
      };
    }
  }

  // 괄호 검사
  const open = (s.match(/\(/g) || []).length;
  const close = (s.match(/\)/g) || []).length;
  if (open !== close) {
    return {
      type: "bracket",
      title: "괄호 불일치",
      message: open > close
        ? `여는 괄호 <b>(</b> 가 ${open - close}개 더 많습니다. 닫는 괄호 <b>)</b> 를 추가하세요.`
        : `닫는 괄호 <b>)</b> 가 ${close - open}개 더 많습니다. 여는 괄호 <b>(</b> 를 확인하세요.`,
      hint: "CREATE TABLE, INSERT INTO VALUES 등에서 괄호 개수를 맞춰야 합니다.",
    };
  }

  // CREATE TABLE에서 컬럼 사이 쉼표 검사
  if (up.startsWith("CREATE TABLE")) {
    const bodyM = s.match(/\(([^)]+(?:\([^)]*\)[^)]*)*)\)/s);
    if (bodyM) {
      const lines = bodyM[1].split("\n").map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        const nextLine = lines[i + 1].toUpperCase();
        // 다음 줄이 제약조건 키워드로 시작하지 않고, 현재 줄이 쉼표로 안 끝나면
        if (!line.endsWith(",") && !nextLine.startsWith("PRIMARY") && !nextLine.startsWith("FOREIGN") && !nextLine.startsWith("UNIQUE") && !nextLine.startsWith("CHECK") && !nextLine.startsWith(")")) {
          return {
            type: "comma",
            title: "쉼표 누락",
            message: `<b>${line}</b> 뒤에 쉼표(,)가 빠진 것 같습니다.`,
            hint: "CREATE TABLE에서 각 컬럼 정의 사이에는 쉼표(,)로 구분해야 합니다.",
          };
        }
      }
    }
  }

  // VARCHAR 길이 누락
  if (/VARCHAR\s*[^(]/i.test(s) && /CREATE TABLE/i.test(s)) {
    return {
      type: "type",
      title: "VARCHAR 길이 누락",
      message: "<b>VARCHAR</b>는 최대 길이를 반드시 지정해야 합니다.",
      hint: "예: VARCHAR(50), VARCHAR(100) 처럼 괄호 안에 숫자를 적어주세요.",
    };
  }

  // FOREIGN KEY 문법 오류
  if (/FOREIGN\s+KEY\s+\w+\s+REFERENCES/i.test(s)) {
    return {
      type: "fk",
      title: "FOREIGN KEY 문법 오류",
      message: "FOREIGN KEY 뒤에 컬럼명을 <b>괄호</b>로 감싸야 합니다.",
      hint: "올바른 형식: FOREIGN KEY (컬럼명) REFERENCES 테이블(컬럼명)",
    };
  }

  // 에러 메시지 기반 분석
  if (em.includes("no such table") || em.includes("doesn't exist")) {
    const tableM = errorMessage.match(/table[:\s]+["']?(\w+)["']?/i);
    return {
      type: "noTable",
      title: "테이블이 존재하지 않음",
      message: `<b>${tableM?.[1] || "참조한 테이블"}</b>이 아직 만들어지지 않았습니다.`,
      hint: "CREATE TABLE로 테이블을 먼저 만든 후 사용하세요.",
    };
  }

  if (em.includes("no such column") || em.includes("unknown column")) {
    const colM = errorMessage.match(/column[:\s]+["']?(\w+)["']?/i);
    return {
      type: "noColumn",
      title: "컬럼이 존재하지 않음",
      message: `<b>${colM?.[1] || "참조한 컬럼"}</b> 컬럼이 해당 테이블에 없습니다.`,
      hint: "컬럼명 철자를 확인하거나 SELECT로 테이블 구조를 먼저 확인하세요.",
    };
  }

  if (em.includes("syntax error") || em.includes("parse error")) {
    return {
      type: "syntax",
      title: "SQL 문법 오류",
      message: "SQL 문법이 올바르지 않습니다.",
      hint: "키워드 순서, 괄호, 쉼표를 다시 확인하세요. SELECT → FROM → WHERE → ORDER BY 순서가 맞는지 확인하세요.",
    };
  }

  if (em.includes("unique") || em.includes("duplicate")) {
    return {
      type: "unique",
      title: "중복 값 오류",
      message: "이미 같은 값이 존재하는 컬럼에 중복된 값을 저장하려 했습니다.",
      hint: "PRIMARY KEY 또는 UNIQUE 제약조건이 있는 컬럼에는 동일한 값을 두 번 넣을 수 없습니다.",
    };
  }

  // 기본 에러
  return {
    type: "unknown",
    title: "실행 오류",
    message: errorMessage || "알 수 없는 오류가 발생했습니다.",
    hint: "SQL 문법 가이드를 참고하거나 개념 학습 페이지에서 관련 문법을 확인해보세요.",
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CREATE TABLE 파서 (시각화용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export function parseCreateTable(sql) {
  try {
    const nm = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/i);
    if (!nm) return null;
    const tableName = nm[1];
    const body = sql.slice(sql.indexOf("(") + 1, sql.lastIndexOf(")"));

    const splitCols = (b) => {
      const parts = []; let depth = 0, cur = "";
      for (const ch of b) {
        if (ch === "(") { depth++; cur += ch; }
        else if (ch === ")") { depth--; cur += ch; }
        else if (ch === "," && depth === 0) { parts.push(cur); cur = ""; }
        else cur += ch;
      }
      if (cur.trim()) parts.push(cur);
      return parts;
    };

    const lines = splitCols(body);
    const columns = []; const foreignKeys = []; let tablePKs = [];

    for (const line of lines) {
      const t = line.trim(); if (!t) continue;
      const up2 = t.toUpperCase().trimStart();
      if (up2.startsWith("PRIMARY KEY")) {
        const m = t.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (m) tablePKs = m[1].split(",").map(s => s.trim().toLowerCase());
        continue;
      }
      if (up2.startsWith("FOREIGN KEY")) {
        const m = t.match(/FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s+REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/i);
        if (m) foreignKeys.push({ column: m[1], refTable: m[2], refColumn: m[3] });
        continue;
      }
      if (up2.startsWith("UNIQUE(") || up2.startsWith("UNIQUE ") || up2.startsWith("CHECK") || up2.startsWith("INDEX") || up2.startsWith("KEY ")) continue;

      const cm = t.match(/^(\w+)\s+(\w+(?:\s*\([^)]*\))?)([\s\S]*)$/i);
      if (!cm) continue;
      const [, name, type, rest] = cm;
      const ru = rest.toUpperCase();
      columns.push({
        name, type: type.toUpperCase().replace(/\s+/g, ""),
        pk: ru.includes("PRIMARY KEY"),
        notNull: ru.includes("NOT NULL") || ru.includes("PRIMARY KEY"),
        unique: ru.includes("UNIQUE"), fk: false,
        refTable: null, refColumn: null,
        default: rest.match(/DEFAULT\s+(\S+)/i)?.[1] || null,
        check: rest.match(/CHECK\s*\(([^)]+)\)/i)?.[1] || null,
      });
    }

    tablePKs.forEach(pk => {
      const col = columns.find(c => c.name.toLowerCase() === pk);
      if (col) { col.pk = true; col.notNull = true; }
    });
    foreignKeys.forEach(fk => {
      const col = columns.find(c => c.name.toLowerCase() === fk.column.toLowerCase());
      if (col) { col.fk = true; col.refTable = fk.refTable; col.refColumn = fk.refColumn; }
    });

    return { tableName, columns, foreignKeys };
  } catch { return null; }
}

// SQL 구문 분리 (세미콜론 기준, 문자열 내부 무시)
export function splitStatements(sql) {
  const stmts = []; let cur = "", inStr = false, sc = "";
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (!inStr && (ch === "'" || ch === '"')) { inStr = true; sc = ch; cur += ch; }
    else if (inStr && ch === sc) { inStr = false; cur += ch; }
    else if (!inStr && ch === ";") { const t = cur.trim(); if (t && !t.startsWith("--")) stmts.push(t); cur = ""; }
    else cur += ch;
  }
  const last = cur.trim();
  if (last && !last.startsWith("--")) stmts.push(last);
  return stmts;
}
