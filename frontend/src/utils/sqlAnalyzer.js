// ══════════════════════════════════════════════════════════════════════════════
// sqlAnalyzer.js — SQL 자동 해설 + 에러 분석 (버그 수정 + 강화 버전)
// App.jsx의 OutputCard가 exp.kw 와 exp.text 필드를 사용함 → 이에 맞춤
// ══════════════════════════════════════════════════════════════════════════════

// ── SQL 자동 해설 ─────────────────────────────────────────────────────────────
// 반환: Array<{ kw: string, color: string, text: string }>
export function explainSQL(sql) {
  const s   = sql.trim();
  const up  = s.toUpperCase().replace(/\s+/g, " ");
  const res = [];

  // ── CREATE TABLE ──
  if (up.startsWith("CREATE TABLE")) {
    const nm  = s.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
    const tn  = nm?.[1] || "테이블";
    res.push({ kw:"CREATE TABLE", color:"#16a34a", text:`<b>${tn}</b> 테이블을 새로 생성합니다.` });

    const bodyM = s.match(/\(([^)]+(?:\([^)]*\)[^)]*)*)\)/s);
    if (bodyM) {
      const lines = splitByComma(bodyM[1]);
      const cols = []; const fks = []; let pks = [];
      lines.forEach(line => {
        const t = line.trim(); if (!t) return;
        const u2 = t.toUpperCase();
        if (u2.startsWith("PRIMARY KEY")) { const m=t.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i); if(m) pks=m[1].split(",").map(c=>c.trim()); return; }
        if (u2.startsWith("FOREIGN KEY")) { const m=t.match(/FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+(\w+)\s*\((\w+)\)/i); if(m) fks.push(`<b>${m[1]}</b>은(는) <b>${m[2]}</b> 테이블의 <b>${m[3]}</b>을 참조하는 외래키입니다.`); return; }
        if (/^(UNIQUE|CHECK|INDEX|KEY)\b/i.test(t)) return;
        const cm = t.match(/^(\w+)\s+(\w+(?:\([^)]*\))?)(.*)?$/i);
        if (!cm) return;
        const [, name, type, rest=""] = cm; const ru = rest.toUpperCase();
        let d = `<b>${name}</b> — ${type} 타입`;
        if (ru.includes("PRIMARY KEY")) d += " · 🔑 기본키";
        if (ru.includes("NOT NULL") && !ru.includes("PRIMARY KEY")) d += " · 필수 입력(NOT NULL)";
        if (ru.includes("UNIQUE")) d += " · 중복 불가(UNIQUE)";
        if (ru.includes("AUTO_INCREMENT") || ru.includes("AUTOINCREMENT")) d += " · 자동 증가";
        const def = rest.match(/DEFAULT\s+(\S+)/i); if (def) d += ` · 기본값: ${def[1]}`;
        const chk = rest.match(/CHECK\s*\(([^)]+)\)/i); if (chk) d += ` · 조건 검사: ${chk[1]}`;
        cols.push(d);
      });
      if (cols.length)  res.push({ kw:"컬럼 구성",   color:"#2563eb", text:cols.join("<br>") });
      if (pks.length)   res.push({ kw:"복합 기본키", color:"#d97706", text:`<b>${pks.join(", ")}</b> 컬럼 조합이 각 행을 고유하게 식별합니다.` });
      if (fks.length)   res.push({ kw:"외래키 관계", color:"#7c3aed", text:fks.join("<br>") });
    }
    return res;
  }

  // ── SELECT ──
  if (up.startsWith("SELECT")) {
    const selM   = s.match(/SELECT\s+([\s\S]+?)\s+FROM\b/i);
    const fromM  = s.match(/\bFROM\s+(\w+)/i);
    const joinM  = s.match(/\b(INNER|LEFT|RIGHT|FULL)?\s*(?:OUTER\s+)?JOIN\s+(\w+)\s+ON\s+([\s\S]+?)(?:\bWHERE|\bGROUP|\bORDER|\bHAVING|\bLIMIT|$)/i);
    const whereM = s.match(/\bWHERE\s+([\s\S]+?)(?:\bGROUP|\bORDER|\bHAVING|\bLIMIT|$)/i);
    const groupM = s.match(/\bGROUP\s+BY\s+(\w+)/i);
    const havingM= s.match(/\bHAVING\s+([\s\S]+?)(?:\bORDER|\bLIMIT|$)/i);
    const orderM = s.match(/\bORDER\s+BY\s+([\s\S]+?)(?:\bLIMIT|$)/i);
    const limitM = s.match(/\bLIMIT\s+(\d+)/i);

    const cols  = selM  ? selM[1].trim()  : "*";
    const table = fromM ? fromM[1]        : "테이블";

    res.push({ kw:"SELECT", color:"#2563eb",
      text: cols === "*"
        ? `<b>${table}</b> 테이블의 <b>모든 컬럼(*)을</b> 조회합니다.`
        : `<b>${table}</b> 테이블에서 <b>${cols}</b> 컬럼을 조회합니다.` });

    if (joinM) {
      const jType = (joinM[1] || "INNER").toUpperCase();
      const jDesc = { INNER:"양쪽 모두 일치하는 행만", LEFT:"왼쪽 테이블 전체 + 오른쪽 일치 행", RIGHT:"오른쪽 테이블 전체 + 왼쪽 일치 행", FULL:"양쪽 테이블 전체" };
      res.push({ kw:`${jType} JOIN`, color:"#7c3aed",
        text:`<b>${joinM[2]}</b> 테이블과 조인합니다. (${jDesc[jType] || "조인"})<br>조인 조건: <code>${joinM[3]?.trim()}</code>` });
    }
    if (whereM)  res.push({ kw:"WHERE",    color:"#d97706", text:`<b>${whereM[1].trim()}</b> 조건을 만족하는 행만 필터링합니다.` });
    if (groupM)  res.push({ kw:"GROUP BY", color:"#16a34a", text:`<b>${groupM[1]}</b> 컬럼 기준으로 같은 값을 가진 행들을 그룹으로 묶습니다.` });
    if (havingM) res.push({ kw:"HAVING",   color:"#ec4899", text:`그룹화 후 <b>${havingM[1].trim()}</b> 조건을 만족하는 그룹만 반환합니다.<br><small>※ WHERE는 그룹화 전, HAVING은 그룹화 후 필터입니다.</small>` });
    if (orderM)  res.push({ kw:"ORDER BY", color:"#0891b2", text:`<b>${orderM[1].trim()}</b> 기준으로 ${/DESC/i.test(orderM[1]) ? "내림차순(DESC)" : "오름차순(ASC)"} 정렬합니다.` });
    if (limitM)  res.push({ kw:"LIMIT",    color:"#6b7280", text:`최대 <b>${limitM[1]}개</b>의 결과만 반환합니다.` });
    return res;
  }

  // ── INSERT ──
  if (up.startsWith("INSERT INTO")) {
    const m = s.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*\(([^)]+)\)/i);
    if (m) {
      res.push({ kw:"INSERT INTO", color:"#16a34a", text:`<b>${m[1]}</b> 테이블에 새 행(데이터)을 추가합니다.` });
      if (m[2]) res.push({ kw:"컬럼 지정",  color:"#2563eb", text:`저장할 컬럼: <b>${m[2]}</b>` });
      res.push(  { kw:"VALUES",    color:"#d97706", text:`저장할 값: <b>${m[3]}</b>` });
    } else {
      res.push({ kw:"INSERT INTO", color:"#16a34a", text:"테이블에 새 데이터를 추가합니다." });
    }
    return res;
  }

  // ── UPDATE ──
  if (up.startsWith("UPDATE")) {
    const tm = s.match(/UPDATE\s+(\w+)\s+SET/i);
    const sm = s.match(/\bSET\s+([\s\S]+?)(?:\bWHERE|$)/i);
    const wm = s.match(/\bWHERE\s+([\s\S]+?)$/i);
    if (tm) res.push({ kw:"UPDATE",  color:"#d97706", text:`<b>${tm[1]}</b> 테이블의 기존 데이터를 수정합니다.` });
    if (sm) res.push({ kw:"SET",     color:"#2563eb", text:`변경 내용: <b>${sm[1].trim()}</b>` });
    if (wm) res.push({ kw:"WHERE",   color:"#16a34a", text:`<b>${wm[1].trim()}</b> 조건에 맞는 행만 수정됩니다.` });
    else    res.push({ kw:"⚠️ 경고", color:"#dc2626", text:"WHERE 조건이 없습니다! 테이블의 <b>모든 행</b>이 수정됩니다." });
    return res;
  }

  // ── DELETE ──
  if (up.startsWith("DELETE FROM")) {
    const tm = s.match(/DELETE\s+FROM\s+(\w+)/i);
    const wm = s.match(/\bWHERE\s+([\s\S]+?)$/i);
    if (tm) res.push({ kw:"DELETE FROM", color:"#dc2626", text:`<b>${tm[1]}</b> 테이블에서 행을 삭제합니다.` });
    if (wm) res.push({ kw:"WHERE",       color:"#d97706", text:`<b>${wm[1].trim()}</b> 조건의 행만 삭제됩니다.` });
    else    res.push({ kw:"⚠️ 경고",     color:"#dc2626", text:"WHERE 조건이 없습니다! 테이블의 <b>모든 행</b>이 삭제됩니다." });
    return res;
  }

  // ── DROP TABLE ──
  if (up.startsWith("DROP TABLE")) {
    const m = s.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
    res.push({ kw:"DROP TABLE", color:"#dc2626", text:`⚠️ <b>${m?.[1]}</b> 테이블과 그 안의 모든 데이터를 영구 삭제합니다.` });
    return res;
  }

  // ── ALTER TABLE ──
  if (up.startsWith("ALTER TABLE")) {
    const tm = s.match(/ALTER\s+TABLE\s+(\w+)/i);
    const action = /ADD\s+COLUMN/i.test(s) ? "새 컬럼을 추가합니다"
                 : /DROP\s+COLUMN/i.test(s)   ? "컬럼을 삭제합니다"
                 : /MODIFY|ALTER\s+COLUMN/i.test(s) ? "컬럼 구조를 변경합니다"
                 : "테이블 구조를 변경합니다";
    res.push({ kw:"ALTER TABLE", color:"#d97706", text:`<b>${tm?.[1]}</b> 테이블의 ${action}.` });
    return res;
  }

  res.push({ kw:"SQL", color:"#94a3b8", text:"SQL 구문을 분석 중입니다." });
  return res;
}

// ── 에러 분석 ─────────────────────────────────────────────────────────────────
// 반환: { title: string, msg: string, hint: string }
export function analyzeError(sql, errMsg = "") {
  const s  = sql.trim();
  const up = s.toUpperCase();
  const em = errMsg.toLowerCase();

  // 키워드 오타
  const TYPOS = {
    "SELET ":"SELECT","SELCET ":"SELECT","SELCT ":"SELECT",
    "INSRET ":"INSERT","INSESRT ":"INSERT",
    "CREAT ":"CREATE","CERATE ":"CREATE",
    "FORM ":"FROM","FORM\n":"FROM",
    "WERE ":"WHERE","WHER ":"WHERE",
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
      return { title:"키워드 오타", msg:`<b>${typo.trim()}</b> → <b>${correct}</b> 로 수정하세요.`, hint:"SQL 키워드의 철자를 정확하게 입력해야 합니다. 대소문자는 무관합니다." };
    }
  }

  // 괄호 불일치
  const opens  = (s.match(/\(/g) || []).length;
  const closes = (s.match(/\)/g) || []).length;
  if (opens !== closes) {
    return {
      title:"괄호 불일치",
      msg: opens > closes
        ? `여는 괄호 <b>(</b>가 ${opens - closes}개 더 많습니다. 닫는 괄호 <b>)</b>를 추가하세요.`
        : `닫는 괄호 <b>)</b>가 ${closes - opens}개 더 많습니다. 여는 괄호 <b>(</b>를 확인하세요.`,
      hint:"모든 여는 괄호 ( 에 대응하는 닫는 괄호 ) 가 있어야 합니다.",
    };
  }

  // CREATE TABLE 쉼표 누락 감지
  if (/CREATE\s+TABLE/i.test(s)) {
    const bodyM = s.match(/\(([\s\S]+)\)/);
    if (bodyM) {
      const lines = bodyM[1].split("\n").map(l => l.trim()).filter(Boolean);
      for (let i = 0; i < lines.length - 1; i++) {
        const cur  = lines[i];
        const next = lines[i + 1].toUpperCase();
        if (!cur.endsWith(",") && !next.startsWith("PRIMARY") && !next.startsWith("FOREIGN")
            && !next.startsWith("UNIQUE") && !next.startsWith("CHECK") && !next.startsWith(")")) {
          return { title:"쉼표(,) 누락", msg:`<code>${cur}</code> 뒤에 쉼표가 빠진 것 같습니다.`, hint:"CREATE TABLE에서 각 컬럼 정의 사이에는 반드시 쉼표(,)를 붙여야 합니다." };
        }
      }
    }
    // VARCHAR 길이 누락
    if (/VARCHAR\s*[^(]/i.test(s)) {
      return { title:"VARCHAR 길이 누락", msg:"<b>VARCHAR</b>에는 최대 길이를 반드시 지정해야 합니다.", hint:"예: VARCHAR(50), VARCHAR(100)" };
    }
  }

  // FOREIGN KEY 문법 오류 (괄호 없이 쓴 경우)
  if (/FOREIGN\s+KEY\s+\w+\s+REFERENCES/i.test(s)) {
    return { title:"FOREIGN KEY 문법 오류", msg:"FOREIGN KEY 뒤에 컬럼명을 <b>괄호</b>로 감싸야 합니다.", hint:"올바른 형식: FOREIGN KEY (컬럼명) REFERENCES 테이블명(컬럼명)" };
  }

  // 에러 메시지 기반 분석
  if (em.includes("no such table")) {
    const m = errMsg.match(/table[:\s]+["']?(\w+)["']?/i);
    return { title:"테이블 없음", msg:`<b>${m?.[1] || "참조한 테이블"}</b>이(가) 존재하지 않습니다.`, hint:"CREATE TABLE로 테이블을 먼저 만들어야 합니다. 실행 순서를 확인하세요." };
  }
  if (em.includes("no such column")) {
    const m = errMsg.match(/column[:\s]+["']?(\w+)["']?/i);
    return { title:"컬럼 없음", msg:`<b>${m?.[1] || "컬럼"}</b>이(가) 해당 테이블에 존재하지 않습니다.`, hint:"컬럼명 철자를 확인하세요. SELECT로 테이블 구조를 먼저 확인해도 됩니다." };
  }
  if (em.includes("unique constraint") || em.includes("unique") && em.includes("failed")) {
    return { title:"중복 값 오류 (UNIQUE 위반)", msg:"PRIMARY KEY 또는 UNIQUE 제약조건이 있는 컬럼에 이미 같은 값이 존재합니다.", hint:"다른 값을 사용하거나, 기존 데이터를 먼저 확인하세요." };
  }
  if (em.includes("not null")) {
    return { title:"NOT NULL 위반", msg:"NOT NULL 제약조건이 있는 컬럼에 NULL을 삽입하려 했습니다.", hint:"해당 컬럼에 반드시 값을 제공하거나, DEFAULT 값을 설정하세요." };
  }
  if (em.includes("foreign key")) {
    return { title:"참조 무결성 오류 (FK 위반)", msg:"참조하는 테이블(부모 테이블)에 해당 값이 존재하지 않습니다.", hint:"먼저 부모 테이블에 해당 값을 INSERT한 후 다시 시도하세요." };
  }
  if (em.includes("syntax error") || em.includes("parse error")) {
    return { title:"SQL 문법 오류", msg:"SQL 문법이 올바르지 않습니다.", hint:"키워드 순서(SELECT → FROM → WHERE → ORDER BY), 괄호, 쉼표를 다시 확인하세요." };
  }

  return { title:"실행 오류", msg:errMsg || "알 수 없는 오류가 발생했습니다.", hint:"개념 학습 페이지에서 관련 SQL 문법을 확인해보세요." };
}

// ── CREATE TABLE 파서 ─────────────────────────────────────────────────────────
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
      if (u.startsWith("PRIMARY KEY")) { const m=t.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i); if(m) tablePKs=m[1].split(",").map(s=>s.trim().toLowerCase()); continue; }
      if (u.startsWith("FOREIGN KEY")) { const m=t.match(/FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s+REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/i); if(m) foreignKeys.push({column:m[1],refTable:m[2],refColumn:m[3]}); continue; }
      if (/^(UNIQUE|CHECK|INDEX|KEY)\b/i.test(t)) continue;
      const cm = t.match(/^(\w+)\s+(\w+(?:\s*\([^)]*\))?)([\s\S]*)$/i);
      if (!cm) continue;
      const [, name, type, rest] = cm; const ru = rest.toUpperCase();
      columns.push({ name, type:type.toUpperCase().replace(/\s+/g,""), pk:ru.includes("PRIMARY KEY"), notNull:ru.includes("NOT NULL")||ru.includes("PRIMARY KEY"), unique:ru.includes("UNIQUE"), fk:false, refTable:null, refColumn:null, default:rest.match(/DEFAULT\s+(\S+)/i)?.[1]||null, check:rest.match(/CHECK\s*\(([^)]+)\)/i)?.[1]||null });
    }

    tablePKs.forEach(pk => { const c=columns.find(c=>c.name.toLowerCase()===pk); if(c){c.pk=true;c.notNull=true;} });
    foreignKeys.forEach(fk => { const c=columns.find(c=>c.name.toLowerCase()===fk.column.toLowerCase()); if(c){c.fk=true;c.refTable=fk.refTable;c.refColumn=fk.refColumn;} });
    return { tableName, columns, foreignKeys };
  } catch { return null; }
}

// ── SQL 구문 분리 ─────────────────────────────────────────────────────────────
export function splitStatements(sql) {
  const stmts = []; let cur = "", inStr = false, sc = "";
  for (const ch of sql) {
    if (!inStr && (ch === "'" || ch === '"')) { inStr=true; sc=ch; cur+=ch; }
    else if (inStr && ch === sc) { inStr=false; cur+=ch; }
    else if (!inStr && ch === ";") { const t=cur.trim(); if(t&&!t.startsWith("--")) stmts.push(t); cur=""; }
    else cur += ch;
  }
  const last = cur.trim();
  if (last && !last.startsWith("--")) stmts.push(last);
  return stmts;
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────────────────
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
