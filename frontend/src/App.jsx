import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import sqlJsUrl from "sql.js/dist/sql-wasm.js?url";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { analyzeError, explainDetailedSQL, parseCreateTable, splitStatements } from "./utils/sqlAnalyzer.js";
import { api, apiBase, authStore, hasApiBase } from "./utils/api.js";

const C = {
  bg: "#f6f7f9",
  panel: "#ffffff",
  panelAlt: "#f9fafb",
  line: "#dfe3ea",
  lineSoft: "#edf0f4",
  text: "#111827",
  sub: "#5d6675",
  muted: "#8b95a5",
  accent: "#2563eb",
  accentSoft: "#eff6ff",
  danger: "#dc2626",
  success: "#15803d",
  warn: "#b45309",
  dark: "#0f172a",
  dark2: "#111827",
  darkLine: "#263244",
  mono: "'JetBrains Mono','SFMono-Regular',Consolas,monospace",
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans KR',sans-serif",
};

const STORAGE = {
  docs: "sv_docs",
  recent: "sv_recent_sql",
  user: "sv_user",
};

let sqlJsRuntimePromise;

function loadSqlJsRuntime() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("sql.js can only run in the browser."));
  }

  if (window.initSqlJs) {
    return Promise.resolve(window.initSqlJs);
  }

  if (!sqlJsRuntimePromise) {
    sqlJsRuntimePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = sqlJsUrl;
      script.async = true;
      script.onload = () => {
        if (window.initSqlJs) resolve(window.initSqlJs);
        else reject(new Error("sql.js runtime loaded without initSqlJs."));
      };
      script.onerror = () => reject(new Error("Failed to load sql.js runtime."));
      document.head.appendChild(script);
    });
  }

  return sqlJsRuntimePromise;
}

const DEFAULT_SQL = `CREATE TABLE department (
  dept_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  gpa REAL CHECK(gpa >= 0 AND gpa <= 4.5),
  dept_id INT,
  FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);

INSERT INTO department (dept_id, name) VALUES (1, 'Computer Science');
INSERT INTO student (student_id, name, gpa, dept_id) VALUES (101, 'Jiwon', 4.1, 1);

SELECT student_id, name, gpa
FROM student
WHERE gpa >= 3.5
ORDER BY gpa DESC;`;

const EXAMPLES = [
  {
    id: "create",
    title: "CREATE TABLE",
    type: "DDL",
    desc: "테이블 구조 만들기",
    sql: `CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  gpa REAL CHECK(gpa >= 0 AND gpa <= 4.5)
);`,
  },
  {
    id: "insert",
    title: "INSERT",
    type: "DML",
    desc: "새 행 추가",
    sql: `CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  gpa REAL
);

INSERT INTO student (student_id, name, gpa)
VALUES (101, 'Jiwon', 4.1);`,
  },
  {
    id: "select",
    title: "SELECT",
    type: "Query",
    desc: "필요한 컬럼 조회",
    sql: `CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50),
  gpa REAL
);

INSERT INTO student VALUES (101, 'Jiwon', 4.1);
INSERT INTO student VALUES (102, 'Minseo', 3.2);

SELECT student_id, name, gpa
FROM student;`,
  },
  {
    id: "where",
    title: "WHERE",
    type: "Filter",
    desc: "조건으로 행 필터링",
    sql: `CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50),
  gpa REAL
);

INSERT INTO student VALUES (101, 'Jiwon', 4.1);
INSERT INTO student VALUES (102, 'Minseo', 3.2);

SELECT *
FROM student
WHERE gpa >= 3.5;`,
  },
  {
    id: "join",
    title: "JOIN",
    type: "Relation",
    desc: "테이블 연결",
    sql: `CREATE TABLE department (
  dept_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  dept_id INT,
  FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);

INSERT INTO department VALUES (1, 'Computer Science');
INSERT INTO student VALUES (101, 'Jiwon', 1);

SELECT s.name, d.name AS department
FROM student s
JOIN department d ON s.dept_id = d.dept_id;`,
  },
  {
    id: "group",
    title: "GROUP BY",
    type: "Aggregate",
    desc: "그룹별 집계",
    sql: `CREATE TABLE student (
  student_id INT PRIMARY KEY,
  dept VARCHAR(50),
  gpa REAL
);

INSERT INTO student VALUES (101, 'CS', 4.1);
INSERT INTO student VALUES (102, 'CS', 3.8);
INSERT INTO student VALUES (103, 'Design', 3.5);

SELECT dept, COUNT(*) AS count, AVG(gpa) AS avg_gpa
FROM student
GROUP BY dept;`,
  },
  {
    id: "order",
    title: "ORDER BY",
    type: "Sort",
    desc: "결과 정렬",
    sql: `CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50),
  gpa REAL
);

INSERT INTO student VALUES (101, 'Jiwon', 4.1);
INSERT INTO student VALUES (102, 'Minseo', 3.2);

SELECT *
FROM student
ORDER BY gpa DESC;`,
  },
  {
    id: "pk",
    title: "PRIMARY KEY",
    type: "Constraint",
    desc: "행을 고유하게 식별",
    sql: `CREATE TABLE student (
  student_id INT PRIMARY KEY,
  email VARCHAR(100) UNIQUE,
  name VARCHAR(50) NOT NULL
);`,
  },
  {
    id: "fk",
    title: "FOREIGN KEY",
    type: "Constraint",
    desc: "테이블 관계 만들기",
    sql: `CREATE TABLE department (
  dept_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL
);

CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  dept_id INT,
  FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);`,
  },
  {
    id: "check",
    title: "CHECK",
    type: "Constraint",
    desc: "값의 범위 제한",
    sql: `CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  gpa REAL CHECK(gpa >= 0 AND gpa <= 4.5)
);`,
  },
  {
    id: "notnull",
    title: "NOT NULL",
    type: "Constraint",
    desc: "필수 값 강제",
    sql: `CREATE TABLE student (
  student_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  email VARCHAR(100) NOT NULL
);`,
  },
];

const SQL_REFERENCE = [
  {
    id: "query",
    title: "조회",
    desc: "데이터를 읽고 원하는 형태로 좁히는 SQL의 중심 영역입니다.",
    items: [
      { name: "SELECT", summary: "테이블에서 필요한 컬럼과 계산 결과를 조회합니다.", syntax: "SELECT column1, column2 FROM table_name;", example: "SELECT name, gpa FROM student;", notes: ["실무에서는 SELECT *보다 필요한 컬럼을 명시하는 편이 안전합니다.", "별칭은 AS로 붙이면 결과 컬럼의 의미가 더 분명해집니다."] },
      { name: "FROM", summary: "조회 기준이 되는 테이블이나 서브쿼리를 지정합니다.", syntax: "SELECT * FROM table_name;", example: "SELECT * FROM student;", notes: ["FROM에 별칭을 붙이면 JOIN이나 긴 쿼리에서 읽기 쉬워집니다.", "서브쿼리를 FROM에 넣으면 임시 결과를 테이블처럼 다룰 수 있습니다."] },
      { name: "WHERE", summary: "조건을 만족하는 행만 남깁니다.", syntax: "SELECT * FROM table_name WHERE condition;", example: "SELECT * FROM student WHERE gpa >= 3.5;", notes: ["WHERE는 집계 전 행 단위 필터입니다.", "NULL 비교는 = NULL이 아니라 IS NULL을 사용합니다."] },
      { name: "ORDER BY", summary: "조회 결과의 정렬 순서를 정합니다.", syntax: "ORDER BY column ASC|DESC;", example: "SELECT name, gpa FROM student ORDER BY gpa DESC;", notes: ["정렬은 결과를 읽기 좋게 하지만 큰 데이터에서는 비용이 큽니다.", "동점 처리가 필요하면 두 번째 정렬 기준을 함께 둡니다."] },
      { name: "LIMIT / OFFSET", summary: "결과 개수를 제한하거나 페이지 단위로 넘깁니다.", syntax: "SELECT * FROM table_name LIMIT 10 OFFSET 20;", example: "SELECT * FROM student ORDER BY student_id LIMIT 10;", notes: ["페이지네이션에는 안정적인 ORDER BY가 거의 항상 필요합니다.", "대량 OFFSET은 느릴 수 있어 커서 기반 페이지네이션을 쓰기도 합니다."] },
    ],
  },
  {
    id: "join",
    title: "관계와 JOIN",
    desc: "여러 테이블을 연결해 하나의 의미 있는 결과로 만드는 영역입니다.",
    items: [
      { name: "INNER JOIN", summary: "양쪽 테이블에 모두 매칭되는 행만 조회합니다.", syntax: "A INNER JOIN B ON A.key = B.key", example: "SELECT s.name, d.name FROM student s JOIN department d ON s.dept_id = d.dept_id;", notes: ["가장 일반적인 JOIN입니다.", "ON 조건이 틀리면 결과가 크게 늘어나거나 사라집니다."] },
      { name: "LEFT JOIN", summary: "왼쪽 테이블은 모두 유지하고 오른쪽 매칭 결과를 붙입니다.", syntax: "A LEFT JOIN B ON A.key = B.key", example: "SELECT s.name, d.name FROM student s LEFT JOIN department d ON s.dept_id = d.dept_id;", notes: ["매칭이 없으면 오른쪽 컬럼은 NULL이 됩니다.", "누락 데이터를 찾을 때 자주 사용합니다."] },
      { name: "SELF JOIN", summary: "같은 테이블을 두 번 참조해 계층이나 비교 관계를 표현합니다.", syntax: "employee e JOIN employee m ON e.manager_id = m.id", example: "SELECT e.name, m.name AS manager FROM employee e LEFT JOIN employee m ON e.manager_id = m.id;", notes: ["반드시 별칭을 다르게 붙여야 읽기 쉽습니다.", "조직도, 추천 관계, 상하위 카테고리에 유용합니다."] },
      { name: "CROSS JOIN", summary: "두 테이블의 모든 조합을 만듭니다.", syntax: "A CROSS JOIN B", example: "SELECT * FROM size CROSS JOIN color;", notes: ["조합 수가 곱으로 늘어나므로 신중히 사용합니다.", "옵션 조합 생성 같은 경우에 적합합니다."] },
    ],
  },
  {
    id: "aggregate",
    title: "집계",
    desc: "여러 행을 그룹으로 묶고 통계값을 계산합니다.",
    items: [
      { name: "GROUP BY", summary: "같은 값을 가진 행을 그룹으로 묶습니다.", syntax: "SELECT key, COUNT(*) FROM table GROUP BY key;", example: "SELECT dept_id, AVG(gpa) FROM student GROUP BY dept_id;", notes: ["SELECT에는 그룹 컬럼이나 집계 함수가 와야 합니다.", "그룹 기준이 많아질수록 결과 행도 세분화됩니다."] },
      { name: "HAVING", summary: "집계가 끝난 뒤 그룹을 필터링합니다.", syntax: "GROUP BY key HAVING aggregate_condition", example: "SELECT dept_id, COUNT(*) FROM student GROUP BY dept_id HAVING COUNT(*) >= 2;", notes: ["WHERE는 집계 전, HAVING은 집계 후 조건입니다.", "집계 함수 조건은 HAVING에 두는 것이 자연스럽습니다."] },
      { name: "COUNT / SUM / AVG", summary: "행 수, 합계, 평균을 계산하는 대표 집계 함수입니다.", syntax: "COUNT(*), SUM(amount), AVG(score)", example: "SELECT COUNT(*), AVG(gpa) FROM student;", notes: ["COUNT(*)는 행 수, COUNT(column)은 NULL이 아닌 값 수입니다.", "AVG는 NULL을 제외하고 평균을 계산합니다."] },
      { name: "MIN / MAX", summary: "최솟값과 최댓값을 찾습니다.", syntax: "MIN(column), MAX(column)", example: "SELECT MIN(gpa), MAX(gpa) FROM student;", notes: ["날짜 컬럼에도 사용할 수 있습니다.", "최댓값 행 전체가 필요하면 서브쿼리나 ORDER BY LIMIT을 함께 씁니다."] },
    ],
  },
  {
    id: "schema",
    title: "테이블 설계",
    desc: "테이블, 컬럼, 타입, 키, 관계를 설계하는 DDL 영역입니다.",
    items: [
      { name: "CREATE TABLE", summary: "새 테이블과 컬럼 구조를 정의합니다.", syntax: "CREATE TABLE table_name (...);", example: "CREATE TABLE student (student_id INT PRIMARY KEY, name VARCHAR(50) NOT NULL);", notes: ["테이블명과 컬럼명은 도메인 의미가 드러나게 짓습니다.", "나중에 바꾸기 어려운 제약조건은 처음부터 신중히 둡니다."] },
      { name: "PRIMARY KEY", summary: "각 행을 고유하게 식별하는 대표 키입니다.", syntax: "column INT PRIMARY KEY", example: "student_id INT PRIMARY KEY", notes: ["중복과 NULL이 허용되지 않습니다.", "대부분 숫자 ID나 UUID를 사용합니다."] },
      { name: "FOREIGN KEY", summary: "다른 테이블의 키를 참조해 관계를 만듭니다.", syntax: "FOREIGN KEY (dept_id) REFERENCES department(dept_id)", example: "FOREIGN KEY (dept_id) REFERENCES department(dept_id)", notes: ["참조 대상 테이블이 먼저 있어야 합니다.", "삭제/수정 정책은 ON DELETE, ON UPDATE로 정합니다."] },
      { name: "Data Types", summary: "컬럼에 저장할 값의 종류와 크기를 정합니다.", syntax: "INT, VARCHAR(n), DATE, REAL, BOOLEAN", example: "email VARCHAR(100), created_at DATETIME", notes: ["숫자, 문자열, 날짜 타입을 명확히 나누면 검증과 정렬이 쉬워집니다.", "SQLite는 타입이 느슨하므로 제약조건을 함께 쓰면 좋습니다."] },
      { name: "ALTER TABLE", summary: "기존 테이블 구조를 변경합니다.", syntax: "ALTER TABLE table_name ADD COLUMN column_name type;", example: "ALTER TABLE student ADD COLUMN email VARCHAR(100);", notes: ["운영 DB에서는 마이그레이션 계획이 필요합니다.", "컬럼 삭제나 타입 변경은 DBMS마다 지원 방식이 다릅니다."] },
    ],
  },
  {
    id: "constraint",
    title: "제약조건",
    desc: "데이터가 잘못 들어오지 않도록 테이블이 스스로 지키는 규칙입니다.",
    items: [
      { name: "NOT NULL", summary: "반드시 값이 있어야 하는 컬럼을 만듭니다.", syntax: "name VARCHAR(50) NOT NULL", example: "email VARCHAR(100) NOT NULL", notes: ["필수 입력값을 DB 레벨에서도 보장합니다.", "기존 데이터가 있다면 적용 전 NULL 정리가 필요합니다."] },
      { name: "UNIQUE", summary: "중복 값을 허용하지 않습니다.", syntax: "email VARCHAR(100) UNIQUE", example: "CREATE TABLE users (email VARCHAR(100) UNIQUE);", notes: ["로그인 이메일, 코드, 슬러그에 자주 사용합니다.", "DBMS마다 NULL의 UNIQUE 처리 방식이 다를 수 있습니다."] },
      { name: "CHECK", summary: "값이 특정 조건을 만족하도록 제한합니다.", syntax: "CHECK (gpa >= 0 AND gpa <= 4.5)", example: "gpa REAL CHECK(gpa >= 0 AND gpa <= 4.5)", notes: ["점수, 상태값, 금액 범위 같은 도메인 규칙에 좋습니다.", "복잡한 비즈니스 규칙은 애플리케이션 로직과 함께 관리합니다."] },
      { name: "DEFAULT", summary: "값을 생략했을 때 들어갈 기본값을 지정합니다.", syntax: "created_at DATETIME DEFAULT CURRENT_TIMESTAMP", example: "status VARCHAR(20) DEFAULT 'active'", notes: ["생성일, 상태, 카운터 초기값에 자주 사용합니다.", "기본값이 실제 비즈니스 의미와 맞는지 확인해야 합니다."] },
    ],
  },
  {
    id: "advanced",
    title: "고급 쿼리",
    desc: "복잡한 분석과 재사용 가능한 쿼리를 다루는 영역입니다.",
    items: [
      { name: "Subquery", summary: "쿼리 안에 다른 쿼리를 넣어 중간 결과를 사용합니다.", syntax: "SELECT * FROM A WHERE id IN (SELECT id FROM B);", example: "SELECT * FROM student WHERE dept_id IN (SELECT dept_id FROM department);", notes: ["IN, EXISTS, FROM 절에서 자주 사용합니다.", "복잡해지면 CTE로 이름을 붙이는 편이 읽기 쉽습니다."] },
      { name: "CTE", summary: "WITH로 임시 결과에 이름을 붙여 쿼리를 단계화합니다.", syntax: "WITH ranked AS (...) SELECT * FROM ranked;", example: "WITH high_gpa AS (SELECT * FROM student WHERE gpa >= 3.5) SELECT * FROM high_gpa;", notes: ["긴 쿼리를 여러 단계로 나눌 수 있습니다.", "재귀 CTE는 트리 구조를 다룰 때 유용합니다."] },
      { name: "Window Function", summary: "행을 유지한 채 순위, 누적합, 이동 평균을 계산합니다.", syntax: "ROW_NUMBER() OVER (PARTITION BY key ORDER BY value)", example: "SELECT name, ROW_NUMBER() OVER (ORDER BY gpa DESC) AS rank FROM student;", notes: ["GROUP BY와 달리 원본 행이 사라지지 않습니다.", "랭킹, 전월 대비, 누적 통계에 자주 쓰입니다."] },
      { name: "Set Operators", summary: "두 쿼리 결과를 합치거나 비교합니다.", syntax: "UNION, UNION ALL, INTERSECT, EXCEPT", example: "SELECT name FROM student UNION SELECT name FROM alumni;", notes: ["UNION은 중복 제거, UNION ALL은 그대로 합칩니다.", "컬럼 개수와 타입이 맞아야 합니다."] },
    ],
  },
  {
    id: "operation",
    title: "운영과 성능",
    desc: "실제 서비스에서 SQL을 안전하고 빠르게 쓰기 위한 개념입니다.",
    items: [
      { name: "Transaction", summary: "여러 작업을 하나의 성공/실패 단위로 묶습니다.", syntax: "BEGIN; ... COMMIT; / ROLLBACK;", example: "BEGIN; UPDATE account SET balance = balance - 100; COMMIT;", notes: ["돈, 재고, 예약처럼 정합성이 중요한 작업에 필수입니다.", "실패하면 ROLLBACK으로 되돌립니다."] },
      { name: "Index", summary: "검색과 정렬을 빠르게 하기 위한 자료구조입니다.", syntax: "CREATE INDEX idx_name ON table_name(column);", example: "CREATE INDEX idx_student_dept ON student(dept_id);", notes: ["읽기는 빨라지지만 쓰기 비용과 저장 공간이 늘어납니다.", "WHERE, JOIN, ORDER BY에 자주 쓰는 컬럼부터 검토합니다."] },
      { name: "View", summary: "자주 쓰는 SELECT를 가상 테이블처럼 저장합니다.", syntax: "CREATE VIEW view_name AS SELECT ...;", example: "CREATE VIEW high_gpa_students AS SELECT * FROM student WHERE gpa >= 3.5;", notes: ["복잡한 조회를 재사용하기 좋습니다.", "권한 분리나 읽기 전용 뷰에도 활용됩니다."] },
      { name: "Normalization", summary: "중복을 줄이고 관계를 명확히 하기 위한 설계 원칙입니다.", syntax: "entity -> table, relationship -> key", example: "student.dept_id -> department.dept_id", notes: ["중복 데이터를 줄이면 수정 불일치가 줄어듭니다.", "조회 성능 때문에 일부러 반정규화하는 경우도 있습니다."] },
    ],
  },
];

const CONCEPTS = SQL_REFERENCE.flatMap(group => group.items.map(item => item.name)).slice(0, 18);

const VISUAL_TABLES = [
  {
    name: "department",
    x: 36,
    y: 52,
    columns: [
      ["dept_id", "INT", "PK"],
      ["name", "VARCHAR(50)", "NN"],
    ],
  },
  {
    name: "student",
    x: 360,
    y: 48,
    columns: [
      ["student_id", "INT", "PK"],
      ["name", "VARCHAR(50)", "NN"],
      ["gpa", "REAL", "CHECK"],
      ["dept_id", "INT", "FK"],
    ],
  },
  {
    name: "enrollment",
    x: 204,
    y: 258,
    columns: [
      ["student_id", "INT", "FK"],
      ["course_id", "INT", "FK"],
      ["grade", "VARCHAR(2)", ""],
    ],
  },
  {
    name: "course",
    x: 612,
    y: 250,
    columns: [
      ["course_id", "INT", "PK"],
      ["title", "VARCHAR(80)", "NN"],
      ["dept_id", "INT", "FK"],
    ],
  },
];

const QUERY_FLOW = [
  ["FROM", "student 테이블을 기준으로 시작"],
  ["JOIN", "department와 dept_id로 연결"],
  ["WHERE", "gpa >= 3.5 행만 남김"],
  ["GROUP BY", "학과별로 묶음"],
  ["SELECT", "필요한 컬럼과 집계값 선택"],
  ["ORDER BY", "평균 GPA 순으로 정렬"],
];

const JOIN_TYPES = [
  ["INNER JOIN", "겹치는 데이터만", "학생과 학과가 모두 있는 행"],
  ["LEFT JOIN", "왼쪽은 모두 유지", "학과가 없는 학생도 확인"],
  ["FULL JOIN", "양쪽 전체 비교", "누락 관계 점검"],
];

const CONSTRAINT_STEPS = [
  ["입력", "새 학생 행이 들어옴"],
  ["NOT NULL", "name이 비어 있지 않은지 확인"],
  ["CHECK", "gpa가 0부터 4.5 사이인지 확인"],
  ["PRIMARY KEY", "student_id 중복 여부 확인"],
  ["FOREIGN KEY", "dept_id가 department에 존재하는지 확인"],
  ["저장", "모든 규칙을 통과하면 테이블에 반영"],
];

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function Button({ children, onClick, variant = "default", disabled, title, style }) {
  const variants = {
    default: { background: C.panel, color: C.text, border: `1px solid ${C.line}` },
    primary: { background: C.accent, color: "#fff", border: `1px solid ${C.accent}` },
    dark: { background: C.dark2, color: "#e5e7eb", border: `1px solid ${C.darkLine}` },
    ghost: { background: "transparent", color: C.sub, border: "1px solid transparent" },
    danger: { background: "#fff1f2", color: C.danger, border: "1px solid #fecdd3" },
  };

  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...variants[variant],
        height: 32,
        padding: "0 11px",
        borderRadius: 7,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: C.sans,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function NavBar({ page, setPage, user, onLogout }) {
  const items = [
    ["home", "홈"],
    ["editor", "SQL 작성"],
    ["visualizer", "시각화"],
    ["concepts", "개념"],
    ["docs", "문서"],
  ];

  return (
    <header style={{ height: 50, borderBottom: `1px solid ${C.line}`, background: C.panel, display: "flex", alignItems: "center", padding: "0 clamp(10px, 3vw, 18px)", gap: 10, overflow: "hidden" }}>
      <button onClick={() => setPage("home")} style={{ border: 0, background: "transparent", padding: 0, display: "flex", alignItems: "center", gap: 9, cursor: "pointer", flex: "0 0 auto" }}>
        <span style={{ width: 28, height: 28, borderRadius: 7, background: C.dark, color: "#fff", display: "grid", placeItems: "center", fontFamily: C.mono, fontWeight: 800, fontSize: 11 }}>SV</span>
        <span style={{ fontSize: 15, fontWeight: 750, color: C.text }}>SQLVisual</span>
      </button>
      <nav style={{ display: "flex", alignItems: "center", gap: 2, flex: "1 1 auto", minWidth: 0, overflowX: "auto", scrollbarWidth: "none" }}>
        {items.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            style={{
              border: 0,
              borderBottom: page === id ? `2px solid ${C.accent}` : "2px solid transparent",
              background: page === id ? C.accentSoft : "transparent",
              color: page === id ? C.accent : C.sub,
              borderRadius: 7,
              padding: "7px 11px 6px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: page === id ? 700 : 500,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {user ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
          <span style={{ fontSize: 12, color: C.sub, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.username || "사용자"}</span>
          <Button variant="ghost" onClick={onLogout}>로그아웃</Button>
        </div>
      ) : (
        <Button variant="primary" onClick={() => setPage("login")}>로그인</Button>
      )}
    </header>
  );
}

function HomeDashboard({ setPage, loadExample }) {
  const docs = readJSON(STORAGE.docs, []);
  const recent = readJSON(STORAGE.recent, []);
  const favorites = EXAMPLES.filter(item => ["join", "group", "fk", "check"].includes(item.id));

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 22px 44px", display: "grid", gap: 22 }}>
      <section style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 8, background: C.dark, color: "#fff", display: "grid", placeItems: "center", fontFamily: C.mono, fontWeight: 800, fontSize: 12 }}>SV</span>
            <h1 style={{ margin: 0, fontSize: 22, color: C.text, letterSpacing: 0 }}>SQLVisual</h1>
          </div>
          <p style={{ margin: "8px 0 0 44px", color: C.sub, fontSize: 13 }}>SQL 실행, 구조 시각화, 자동 해설</p>
        </div>
        <Button variant="primary" onClick={() => setPage("editor")}>▶ 작업 공간 열기</Button>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 16 }}>
        <Panel title="빠른 시작 예제" action={<Button onClick={() => loadExample(EXAMPLES[0])}>첫 예제 열기</Button>}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: 10 }}>
            {EXAMPLES.map(item => <ExampleCard key={item.id} item={item} onClick={() => loadExample(item)} />)}
          </div>
        </Panel>

        <Panel title="최근 사용 SQL">
          <ListEmpty show={!recent.length} text="아직 실행 기록이 없습니다." />
          {recent.slice(0, 5).map((item, idx) => (
            <button key={`${item.updated_at}-${idx}`} onClick={() => loadExample({ title: item.title || "최근 SQL", sql: item.sql })} style={recentRowStyle}>
              <span style={{ fontFamily: C.mono, fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title || firstSqlLine(item.sql)}</span>
              <span style={{ fontSize: 11, color: C.muted }}>{new Date(item.updated_at).toLocaleString("ko-KR")}</span>
            </button>
          ))}
        </Panel>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 16 }}>
        <Panel title="자주 사용하는 SQL 예제">
          <div style={{ display: "grid", gap: 8 }}>
            {favorites.map(item => <CompactAction key={item.id} label={item.title} sub={item.desc} onClick={() => loadExample(item)} />)}
          </div>
        </Panel>
        <Panel title="최근 SQL 문서">
          <ListEmpty show={!docs.length} text="저장된 문서가 없습니다." />
          {docs.slice(0, 4).map(doc => <CompactAction key={doc.id} label={doc.title} sub={new Date(doc.updated_at).toLocaleString("ko-KR")} onClick={() => loadExample({ title: doc.title, sql: doc.sql_code })} />)}
        </Panel>
        <Panel title="SQL 개념 바로가기">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {CONCEPTS.map(concept => (
              <button key={concept} onClick={() => setPage("concepts")} style={{ border: `1px solid ${C.line}`, background: C.panelAlt, borderRadius: 999, padding: "6px 10px", color: C.sub, fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
                {concept}
              </button>
            ))}
          </div>
        </Panel>
      </section>
    </main>
  );
}

function Panel({ title, action, children }) {
  return (
    <section style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ height: 44, borderBottom: `1px solid ${C.lineSoft}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px" }}>
        <h2 style={{ margin: 0, fontSize: 13, color: C.text }}>{title}</h2>
        {action}
      </div>
      <div style={{ padding: 14 }}>{children}</div>
    </section>
  );
}

function ExampleCard({ item, onClick }) {
  return (
    <button onClick={onClick} style={{ textAlign: "left", border: `1px solid ${C.line}`, background: C.panelAlt, borderRadius: 8, padding: 12, cursor: "pointer", minHeight: 86 }}>
      <span style={{ fontSize: 10, color: C.accent, fontWeight: 800, textTransform: "uppercase" }}>{item.type}</span>
      <strong style={{ display: "block", marginTop: 7, fontSize: 13, color: C.text, fontFamily: C.mono }}>{item.title}</strong>
      <span style={{ display: "block", marginTop: 5, fontSize: 12, color: C.sub }}>{item.desc}</span>
    </button>
  );
}

function CompactAction({ label, sub, onClick }) {
  return (
    <button onClick={onClick} style={recentRowStyle}>
      <span style={{ fontSize: 13, color: C.text, fontWeight: 650 }}>{label}</span>
      <span style={{ fontSize: 11, color: C.muted }}>{sub}</span>
    </button>
  );
}

const recentRowStyle = {
  width: "100%",
  display: "grid",
  gap: 3,
  textAlign: "left",
  border: `1px solid ${C.lineSoft}`,
  background: C.panelAlt,
  borderRadius: 8,
  padding: "10px 11px",
  cursor: "pointer",
  marginBottom: 8,
};

function ListEmpty({ show, text }) {
  if (!show) return null;
  return <div style={{ padding: "18px 8px", color: C.muted, fontSize: 12, textAlign: "center" }}>{text}</div>;
}

function Workspace({ initialRequest }) {
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [docTitle, setDocTitle] = useState("Untitled query");
  const [docId, setDocId] = useState(null);
  const [sqlDb, setSqlDb] = useState(null);
  const [dbReady, setDbReady] = useState(false);
  const [outputs, setOutputs] = useState([]);
  const [schemas, setSchemas] = useState([]);
  const [elapsed, setElapsed] = useState(null);
  const [activeTab, setActiveTab] = useState("result");
  const [showExamples, setShowExamples] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [consumedRequestId, setConsumedRequestId] = useState(null);
  const runRef = useRef(null);

  useEffect(() => {
    loadSqlJsRuntime()
      .then(initSqlJs => initSqlJs({ locateFile: file => file.endsWith(".wasm") ? sqlWasmUrl : file }))
      .then(SQL => {
        setSqlDb(new SQL.Database());
        setDbReady(true);
      })
      .catch(() => setDbReady(false));
  }, []);

  useEffect(() => {
    if (initialRequest && initialRequest.id !== consumedRequestId) {
      setSql(initialRequest.sql);
      setDocTitle(initialRequest.title || "Example query");
      setDocId(null);
      setOutputs([]);
      setElapsed(null);
      setActiveTab("result");
      setConsumedRequestId(initialRequest.id);
    }
  }, [initialRequest, consumedRequestId]);

  const explanation = useMemo(() => explainDetailedSQL(sql), [sql]);
  const rowCount = outputs.reduce((sum, out) => sum + (out.type === "table" ? out.data.values.length : 0), 0);
  const errorCount = outputs.filter(out => out.type === "error").length;

  const runSql = useCallback(() => {
    const clean = sql.split("\n").filter(line => !line.trim().startsWith("--")).join("\n");
    const statements = splitStatements(clean);
    const nextOutputs = [];
    const nextSchemas = [...schemas];
    const start = performance.now();

    for (const stmt of statements) {
      if (!stmt.trim()) continue;

      try {
        const schema = /CREATE\s+TABLE/i.test(stmt) ? parseCreateTable(stmt) : null;
        if (schema) upsertSchema(nextSchemas, schema);

        if (!sqlDb) {
          nextOutputs.push({ type: "ok", label: "해설 준비", stmt });
          continue;
        }

        const results = sqlDb.exec(stmt);
        if (results.length > 0) nextOutputs.push({ type: "table", label: "SELECT 결과", stmt, data: results[0] });
        else nextOutputs.push({ type: "ok", label: schema ? "구조 분석 완료" : "실행 완료", stmt });
      } catch (err) {
        nextOutputs.push({ type: "error", label: "오류", stmt, err: analyzeError(stmt, err.message) });
      }
    }

    const ms = Math.round(performance.now() - start);
    setOutputs(nextOutputs);
    setSchemas(nextSchemas);
    setElapsed(ms);
    setActiveTab(nextOutputs.some(out => out.type === "error") ? "error" : "result");
    addRecentSql(docTitle, sql);
  }, [docTitle, schemas, sql, sqlDb]);

  useEffect(() => {
    runRef.current = runSql;
  }, [runSql]);

  useEffect(() => {
    const handler = event => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runRef.current?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const saveDoc = () => {
    const docs = readJSON(STORAGE.docs, []);
    const now = new Date().toISOString();
    if (docId) {
      const idx = docs.findIndex(doc => doc.id === docId);
      if (idx >= 0) docs[idx] = { ...docs[idx], title: docTitle, sql_code: sql, updated_at: now };
      else docs.unshift({ id: docId, title: docTitle, sql_code: sql, created_at: now, updated_at: now });
    } else {
      const id = String(Date.now());
      docs.unshift({ id, title: docTitle, sql_code: sql, created_at: now, updated_at: now });
      setDocId(id);
    }
    writeJSON(STORAGE.docs, docs);
  };

  const loadDoc = doc => {
    setDocId(doc.id);
    setDocTitle(doc.title);
    setSql(doc.sql_code);
    setShowDocs(false);
    setActiveTab("result");
  };

  const resetWorkspace = () => {
    setSql("");
    setOutputs([]);
    setSchemas([]);
    setElapsed(null);
    setDocId(null);
    setDocTitle("Untitled query");
  };

  return (
    <main style={{ height: "calc(100vh - 50px)", display: "flex", flexDirection: "column", background: C.bg }}>
      <Toolbar
        dbReady={dbReady}
        docTitle={docTitle}
        setDocTitle={setDocTitle}
        onRun={runSql}
        onSave={saveDoc}
        onLoad={() => setShowDocs(true)}
        onReset={resetWorkspace}
        onSchema={() => setActiveTab("schema")}
        onExamples={() => setShowExamples(true)}
        onClearResults={() => setOutputs([])}
        elapsed={elapsed}
        rowCount={rowCount}
        errorCount={errorCount}
      />

      <section style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: 14, gap: 12 }}>
        <div style={{ flex: "1 1 58%", minHeight: 280, border: `1px solid ${C.darkLine}`, borderRadius: 9, overflow: "hidden", background: C.dark }}>
          <Editor
            height="100%"
            language="sql"
            theme="vs-dark"
            value={sql}
            onChange={value => setSql(value || "")}
            options={{
              minimap: { enabled: false },
              fontFamily: C.mono,
              fontSize: 14,
              lineHeight: 22,
              wordWrap: "on",
              scrollBeyondLastLine: false,
              padding: { top: 14, bottom: 14 },
              automaticLayout: true,
            }}
          />
        </div>

        <BottomPanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          outputs={outputs}
          explanation={explanation}
          schemas={schemas}
          elapsed={elapsed}
          rowCount={rowCount}
        />
      </section>

      <ExampleModal open={showExamples} onClose={() => setShowExamples(false)} onPick={item => { setSql(item.sql); setDocTitle(item.title); setShowExamples(false); }} />
      <DocsModal open={showDocs} onClose={() => setShowDocs(false)} onLoad={loadDoc} />
    </main>
  );
}

function Toolbar({ dbReady, docTitle, setDocTitle, onRun, onSave, onLoad, onReset, onSchema, onExamples, onClearResults, elapsed, rowCount, errorCount }) {
  return (
    <div style={{ height: 50, borderBottom: `1px solid ${C.line}`, background: C.panel, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "thin" }}>
      <input
        value={docTitle}
        onChange={event => setDocTitle(event.target.value)}
        style={{ flex: "0 0 190px", width: 190, height: 30, border: `1px solid ${C.line}`, borderRadius: 7, padding: "0 10px", fontSize: 12, color: C.text, background: C.panelAlt, outline: "none" }}
      />
      <Button variant="primary" onClick={onRun}>▶ 실행</Button>
      <Button onClick={onSave}>💾 저장</Button>
      <Button onClick={onLoad}>📂 불러오기</Button>
      <Button onClick={onReset}>🗑 초기화</Button>
      <Button onClick={onSchema}>🗂 구조 보기</Button>
      <Button onClick={onExamples}>📋 예제 삽입</Button>
      <Button onClick={onClearResults}>결과 지우기</Button>
      <div style={{ flex: "1 0 12px" }} />
      <Metric label="DB" value={dbReady ? "ready" : "loading"} tone={dbReady ? "success" : "warn"} />
      <Metric label="time" value={elapsed == null ? "-" : `${elapsed}ms`} />
      <Metric label="rows" value={rowCount} />
      <Metric label="errors" value={errorCount} tone={errorCount ? "danger" : "default"} />
    </div>
  );
}

function Metric({ label, value, tone = "default" }) {
  const colors = {
    default: [C.panelAlt, C.sub],
    success: ["#ecfdf5", C.success],
    warn: ["#fffbeb", C.warn],
    danger: ["#fef2f2", C.danger],
  };
  return (
    <span style={{ flex: "0 0 auto", height: 28, display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.lineSoft}`, borderRadius: 999, padding: "0 9px", background: colors[tone][0], color: colors[tone][1], fontSize: 11, fontFamily: C.mono }}>
      <b style={{ color: C.muted, fontWeight: 600 }}>{label}</b>{value}
    </span>
  );
}

function BottomPanel({ activeTab, setActiveTab, outputs, explanation, schemas, elapsed, rowCount }) {
  const tabs = [
    ["result", "결과"],
    ["explain", "해설"],
    ["error", "에러"],
    ["schema", "구조 시각화"],
  ];
  return (
    <div style={{ flex: "0 0 36%", minHeight: 245, border: `1px solid ${C.line}`, borderRadius: 9, overflow: "hidden", background: C.panel, display: "flex", flexDirection: "column" }}>
      <div style={{ height: 38, display: "flex", alignItems: "center", borderBottom: `1px solid ${C.line}`, background: C.panelAlt }}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              height: "100%",
              padding: "0 14px",
              border: 0,
              borderRight: `1px solid ${C.lineSoft}`,
              borderBottom: activeTab === id ? `2px solid ${C.accent}` : "2px solid transparent",
              background: activeTab === id ? C.panel : "transparent",
              color: activeTab === id ? C.text : C.sub,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", marginRight: 12, color: C.muted, fontSize: 11, fontFamily: C.mono }}>
          {elapsed == null ? "not executed" : `${elapsed}ms · ${rowCount} rows`}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {activeTab === "result" && <ResultView outputs={outputs} />}
        {activeTab === "explain" && <ExplainView explanation={explanation} />}
        {activeTab === "error" && <ErrorView outputs={outputs} />}
        {activeTab === "schema" && <SchemaView schemas={schemas} />}
      </div>
    </div>
  );
}

function ResultView({ outputs }) {
  if (!outputs.length) return <EmptyState title="아직 실행된 SQL이 없습니다" text="상단 에디터에서 SQL을 작성한 뒤 실행하세요. Ctrl+Enter도 사용할 수 있습니다." />;
  return (
    <div style={{ padding: 12, display: "grid", gap: 12 }}>
      {outputs.filter(out => out.type !== "error").map((out, idx) => (
        <div key={idx} style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", background: C.panelAlt, borderBottom: `1px solid ${C.lineSoft}` }}>
            <b style={{ color: out.type === "table" ? C.accent : C.success, fontSize: 12 }}>{out.label}</b>
            <code style={{ color: C.muted, fontSize: 10 }}>{out.stmt.replace(/\s+/g, " ").slice(0, 90)}</code>
          </div>
          {out.type === "table" ? <TableResult data={out.data} /> : <div style={{ padding: 12, color: C.sub, fontSize: 12 }}>실행이 완료되었습니다.</div>}
        </div>
      ))}
    </div>
  );
}

function TableResult({ data }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: C.mono, fontSize: 12 }}>
        <thead>
          <tr>{data.columns.map(col => <th key={col} style={{ textAlign: "left", padding: "8px 10px", background: "#f3f6fb", color: C.text, borderBottom: `1px solid ${C.line}` }}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {data.values.map((row, idx) => (
            <tr key={idx}>
              {row.map((cell, cellIdx) => <td key={cellIdx} style={{ padding: "7px 10px", borderBottom: `1px solid ${C.lineSoft}`, color: cell == null ? C.muted : C.text }}>{cell == null ? "NULL" : String(cell)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExplainView({ explanation }) {
  const blocks = [
    ["한 줄 요약", [explanation.summary]],
    ["단계별 설명", explanation.steps],
    ["실무 팁", explanation.tips],
    ["주의사항", explanation.cautions],
  ];
  return (
    <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
      {blocks.map(([title, items]) => (
        <section key={title} style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: 13, background: C.panelAlt }}>
          <h3 style={{ margin: "0 0 9px", fontSize: 12, color: C.text }}>{title}</h3>
          {items?.length ? (
            <ul style={{ margin: 0, paddingLeft: 18, color: C.sub, fontSize: 12, lineHeight: 1.7 }}>
              {items.map((item, idx) => <li key={idx}>{item}</li>)}
            </ul>
          ) : <p style={{ margin: 0, color: C.muted, fontSize: 12 }}>특별한 항목이 없습니다.</p>}
        </section>
      ))}
    </div>
  );
}

function ErrorView({ outputs }) {
  const errors = outputs.filter(out => out.type === "error");
  if (!errors.length) return <EmptyState title="에러가 없습니다" text="SQL 실행 중 오류가 발생하면 이 탭에서 원인과 해결 힌트를 확인할 수 있습니다." />;
  return (
    <div style={{ padding: 12, display: "grid", gap: 10 }}>
      {errors.map((out, idx) => (
        <section key={idx} style={{ border: "1px solid #fecaca", background: "#fff7f7", borderRadius: 8, padding: 13 }}>
          <h3 style={{ margin: "0 0 7px", color: C.danger, fontSize: 13 }}>{out.err.title}</h3>
          <div style={{ color: C.text, fontSize: 12, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: out.err.msg }} />
          <p style={{ margin: "8px 0 0", color: C.sub, fontSize: 12 }}>{out.err.hint}</p>
        </section>
      ))}
    </div>
  );
}

function SchemaView({ schemas }) {
  if (!schemas.length) return <EmptyState title="분석된 테이블 구조가 없습니다" text="CREATE TABLE 문을 실행하면 컬럼, 타입, 키, 관계가 이곳에 표시됩니다." />;
  return (
    <div style={{ padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 14 }}>
      {schemas.map(schema => (
        <section key={schema.tableName} style={{ border: `1px solid ${C.line}`, borderRadius: 9, background: C.panel, overflow: "hidden" }}>
          <div style={{ height: 36, display: "flex", alignItems: "center", padding: "0 12px", background: C.dark, color: "#fff", fontFamily: C.mono, fontSize: 12, fontWeight: 700 }}>{schema.tableName}</div>
          <div style={{ display: "grid" }}>
            {schema.columns.map(col => (
              <div key={col.name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "9px 12px", borderBottom: `1px solid ${C.lineSoft}` }}>
                <div>
                  <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{col.name}</span>
                  <span style={{ marginLeft: 8, fontFamily: C.mono, fontSize: 11, color: C.muted }}>{col.type}</span>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {col.pk && <Badge text="PK" tone="warn" />}
                  {col.fk && <Badge text="FK" tone="accent" />}
                  {col.notNull && <Badge text="NN" />}
                  {col.unique && <Badge text="UQ" tone="success" />}
                  {col.check && <Badge text="CHK" tone="accent" />}
                </div>
                {col.fk && <div style={{ gridColumn: "1 / -1", color: C.accent, fontSize: 11 }}>→ {col.refTable}({col.refColumn})</div>}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Badge({ text, tone = "default" }) {
  const tones = {
    default: ["#f3f4f6", C.sub],
    accent: [C.accentSoft, C.accent],
    success: ["#ecfdf5", C.success],
    warn: ["#fffbeb", C.warn],
  };
  return <span style={{ background: tones[tone][0], color: tones[tone][1], borderRadius: 5, padding: "2px 5px", fontSize: 10, fontWeight: 800 }}>{text}</span>;
}

function EmptyState({ title, text }) {
  return (
    <div style={{ height: "100%", minHeight: 180, display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}>
      <div>
        <h3 style={{ margin: 0, color: C.text, fontSize: 14 }}>{title}</h3>
        <p style={{ margin: "8px auto 0", color: C.muted, fontSize: 12, maxWidth: 420, lineHeight: 1.6 }}>{text}</p>
      </div>
    </div>
  );
}

function ExampleModal({ open, onClose, onPick }) {
  if (!open) return null;
  return (
    <Modal title="예제 삽입" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
        {EXAMPLES.map(item => <ExampleCard key={item.id} item={item} onClick={() => onPick(item)} />)}
      </div>
    </Modal>
  );
}

function DocsModal({ open, onClose, onLoad }) {
  const docs = readJSON(STORAGE.docs, []);
  if (!open) return null;
  return (
    <Modal title="문서 불러오기" onClose={onClose}>
      <ListEmpty show={!docs.length} text="저장된 문서가 없습니다." />
      {docs.map(doc => <CompactAction key={doc.id} label={doc.title} sub={new Date(doc.updated_at).toLocaleString("ko-KR")} onClick={() => onLoad(doc)} />)}
    </Modal>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 1000, display: "grid", placeItems: "center", padding: 18 }}>
      <section onClick={event => event.stopPropagation()} style={{ width: "100%", maxWidth: wide ? 840 : 520, maxHeight: "86vh", overflow: "auto", background: C.panel, borderRadius: 10, border: `1px solid ${C.line}`, boxShadow: "0 18px 48px rgba(15,23,42,.18)" }}>
        <header style={{ height: 46, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", borderBottom: `1px solid ${C.line}` }}>
          <h2 style={{ margin: 0, fontSize: 14, color: C.text }}>{title}</h2>
          <button onClick={onClose} style={{ border: 0, background: "transparent", color: C.muted, cursor: "pointer", fontSize: 20 }}>×</button>
        </header>
        <div style={{ padding: 14 }}>{children}</div>
      </section>
    </div>
  );
}

function DocsPage({ setPage, loadExample }) {
  const [docs, setDocs] = useState(() => readJSON(STORAGE.docs, []));
  const removeDoc = id => {
    const next = docs.filter(doc => doc.id !== id);
    setDocs(next);
    writeJSON(STORAGE.docs, next);
  };
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <Panel title="문서">
        <ListEmpty show={!docs.length} text="저장된 문서가 없습니다." />
        {docs.map(doc => (
          <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: 12, marginBottom: 8, background: C.panelAlt }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ color: C.text, fontSize: 13 }}>{doc.title}</b>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 3 }}>{new Date(doc.updated_at).toLocaleString("ko-KR")}</div>
            </div>
            <Button variant="primary" onClick={() => { loadExample({ title: doc.title, sql: doc.sql_code }); setPage("editor"); }}>열기</Button>
            <Button variant="danger" onClick={() => removeDoc(doc.id)}>삭제</Button>
          </div>
        ))}
      </Panel>
    </main>
  );
}

function ConceptsPage({ loadExample }) {
  const [activeGroup, setActiveGroup] = useState(SQL_REFERENCE[0].id);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = SQL_REFERENCE
    .map(group => ({
      ...group,
      items: group.items.filter(item => !q || `${group.title} ${item.name} ${item.summary} ${item.example}`.toLowerCase().includes(q)),
    }))
    .filter(group => !q || group.items.length);
  const visibleGroups = q ? groups : SQL_REFERENCE.filter(group => group.id === activeGroup);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 46px", display: "grid", gap: 16 }}>
      <section style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: 0 }}>SQL Reference</h1>
          <p style={{ margin: "8px 0 0", color: C.sub, fontSize: 13 }}>Java API 문서처럼 개념, 문법, 예시, 실무 포인트를 빠르게 찾는 SQL 레퍼런스입니다.</p>
        </div>
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="SELECT, JOIN, INDEX 검색"
          style={{ width: "min(100%, 320px)", height: 34, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 12px", background: C.panel, outline: "none", fontSize: 13 }}
        />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(190px, .28fr) minmax(0, 1fr)", gap: 16 }}>
        <aside style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden", alignSelf: "start", position: "sticky", top: 64 }}>
          <div style={{ padding: "11px 12px", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 12, color: C.muted, fontFamily: C.mono }}>packages</div>
          {SQL_REFERENCE.map(group => (
            <button
              key={group.id}
              onClick={() => { setActiveGroup(group.id); setQuery(""); }}
              style={{
                width: "100%",
                border: 0,
                borderBottom: `1px solid ${C.lineSoft}`,
                background: activeGroup === group.id && !q ? C.accentSoft : C.panel,
                color: activeGroup === group.id && !q ? C.accent : C.text,
                padding: "11px 12px",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <b style={{ display: "block", fontSize: 13 }}>{group.title}</b>
              <span style={{ display: "block", marginTop: 3, fontSize: 11, color: C.muted }}>{group.items.length} concepts</span>
            </button>
          ))}
        </aside>

        <div style={{ display: "grid", gap: 14 }}>
          {visibleGroups.map(group => (
            <section key={group.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: 16, borderBottom: `1px solid ${C.lineSoft}` }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>{group.title}</h2>
                <p style={{ margin: "7px 0 0", color: C.sub, fontSize: 13, lineHeight: 1.55 }}>{group.desc}</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12, padding: 14 }}>
                {group.items.map(item => {
                  const runnable = EXAMPLES.find(example => example.title === item.name || item.name.includes(example.title));
                  return (
                    <article key={item.name} style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 9, background: C.panelAlt, overflow: "hidden" }}>
                      <div style={{ padding: 13, borderBottom: `1px solid ${C.lineSoft}` }}>
                        <strong style={{ fontFamily: C.mono, fontSize: 14, color: C.text }}>{item.name}</strong>
                        <p style={{ margin: "8px 0 0", color: C.sub, fontSize: 12, lineHeight: 1.55 }}>{item.summary}</p>
                      </div>
                      <div style={{ padding: 13, display: "grid", gap: 10 }}>
                        <code style={{ display: "block", whiteSpace: "pre-wrap", fontFamily: C.mono, color: C.text, background: C.panel, border: `1px solid ${C.lineSoft}`, borderRadius: 7, padding: 10, fontSize: 11 }}>{item.syntax}</code>
                        <code style={{ display: "block", whiteSpace: "pre-wrap", fontFamily: C.mono, color: C.accent, background: "#f8fbff", border: `1px solid ${C.lineSoft}`, borderRadius: 7, padding: 10, fontSize: 11 }}>{item.example}</code>
                        <ul style={{ margin: 0, paddingLeft: 18, color: C.sub, fontSize: 12, lineHeight: 1.6 }}>
                          {item.notes.map(note => <li key={note}>{note}</li>)}
                        </ul>
                        {runnable && <Button onClick={() => loadExample(runnable)} style={{ justifySelf: "start" }}>예제로 열기</Button>}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

function VisualizerPage({ loadExample }) {
  const [mode, setMode] = useState("erd");
  const modes = [
    ["erd", "ERD"],
    ["flow", "쿼리 흐름"],
    ["join", "JOIN 그림"],
    ["constraint", "제약조건"],
  ];

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 46px", display: "grid", gap: 16 }}>
      <section style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, letterSpacing: 0 }}>SQL 구조 시각화</h1>
          <p style={{ margin: "8px 0 0", color: C.sub, fontSize: 13 }}>SQL 작성 화면과 분리된 그림식 이해 화면입니다. 테이블 관계, 실행 흐름, 조인 범위를 눈으로 확인합니다.</p>
        </div>
        <div style={{ display: "flex", gap: 6, padding: 4, border: `1px solid ${C.line}`, borderRadius: 9, background: C.panel }}>
          {modes.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              style={{ border: 0, borderRadius: 7, background: mode === id ? C.dark : "transparent", color: mode === id ? "#fff" : C.sub, height: 30, padding: "0 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {mode === "erd" && <ErdVisual loadExample={loadExample} />}
      {mode === "flow" && <QueryFlowVisual loadExample={loadExample} />}
      {mode === "join" && <JoinVisual loadExample={loadExample} />}
      {mode === "constraint" && <ConstraintVisual loadExample={loadExample} />}
    </main>
  );
}

function ErdVisual({ loadExample }) {
  return (
    <Panel title="테이블 관계도">
      <div style={{ overflowX: "auto" }}>
        <div style={{ position: "relative", minWidth: 860, height: 470, background: "#f8fafc", border: `1px solid ${C.lineSoft}`, borderRadius: 9 }}>
          <svg width="860" height="470" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
            <line x1="260" y1="118" x2="360" y2="118" stroke={C.accent} strokeWidth="2" />
            <line x1="520" y1="208" x2="392" y2="258" stroke={C.accent} strokeWidth="2" />
            <line x1="612" y1="330" x2="392" y2="330" stroke={C.accent} strokeWidth="2" />
            <line x1="704" y1="250" x2="520" y2="148" stroke={C.warn} strokeWidth="2" strokeDasharray="6 5" />
            <text x="286" y="108" fill={C.accent} fontSize="11" fontFamily={C.mono}>1:N</text>
            <text x="436" y="247" fill={C.accent} fontSize="11" fontFamily={C.mono}>student_id</text>
            <text x="460" y="349" fill={C.accent} fontSize="11" fontFamily={C.mono}>course_id</text>
          </svg>
          {VISUAL_TABLES.map(table => <VisualTable key={table.name} table={table} />)}
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", color: C.sub, fontSize: 12 }}>
        <span>department → student → enrollment → course 관계를 테이블 카드와 선으로 표현합니다.</span>
        <Button onClick={() => loadExample(EXAMPLES.find(item => item.id === "fk"))}>FOREIGN KEY 예제로 열기</Button>
      </div>
    </Panel>
  );
}

function VisualTable({ table }) {
  return (
    <section style={{ position: "absolute", left: table.x, top: table.y, width: 224, border: `1px solid ${C.darkLine}`, borderRadius: 9, overflow: "hidden", background: C.panel, boxShadow: "0 10px 28px rgba(15,23,42,.08)" }}>
      <div style={{ background: C.dark, color: "#fff", padding: "10px 12px", fontFamily: C.mono, fontSize: 13, fontWeight: 800 }}>{table.name}</div>
      {table.columns.map(([name, type, tag]) => (
        <div key={name} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "9px 12px", borderTop: `1px solid ${C.lineSoft}`, alignItems: "center" }}>
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text }}>{name} <em style={{ color: C.muted, fontStyle: "normal" }}>{type}</em></span>
          {tag && <Badge tone={tag === "PK" ? "warn" : tag === "FK" ? "accent" : "default"}>{tag}</Badge>}
        </div>
      ))}
    </section>
  );
}

function QueryFlowVisual({ loadExample }) {
  return (
    <Panel title="SELECT 처리 흐름">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {QUERY_FLOW.map(([label, desc], idx) => (
          <div key={label} style={{ border: `1px solid ${C.line}`, background: C.panelAlt, borderRadius: 9, padding: 13, minHeight: 98 }}>
            <span style={{ fontFamily: C.mono, color: C.accent, fontSize: 11, fontWeight: 900 }}>{String(idx + 1).padStart(2, "0")}</span>
            <strong style={{ display: "block", marginTop: 8, fontFamily: C.mono, fontSize: 14 }}>{label}</strong>
            <p style={{ margin: "7px 0 0", color: C.sub, fontSize: 12, lineHeight: 1.45 }}>{desc}</p>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: 14, border: `1px solid ${C.lineSoft}`, borderRadius: 9, background: "#fbfdff" }}>
        <code style={{ whiteSpace: "pre-wrap", fontFamily: C.mono, color: C.text, fontSize: 12 }}>{`SELECT d.name, AVG(s.gpa)
FROM student s
JOIN department d ON s.dept_id = d.dept_id
WHERE s.gpa >= 3.5
GROUP BY d.name
ORDER BY AVG(s.gpa) DESC;`}</code>
      </div>
      <Button onClick={() => loadExample(EXAMPLES.find(item => item.id === "join"))} style={{ marginTop: 12 }}>JOIN 예제로 열기</Button>
    </Panel>
  );
}

function JoinVisual({ loadExample }) {
  return (
    <Panel title="JOIN 범위 그림">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {JOIN_TYPES.map(([title, subtitle, desc], idx) => (
          <section key={title} style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.panelAlt, padding: 15 }}>
            <div style={{ position: "relative", height: 150 }}>
              <div style={{ position: "absolute", left: "16%", top: 20, width: 116, height: 116, borderRadius: "50%", background: idx === 1 ? "rgba(37,99,235,.26)" : "rgba(37,99,235,.15)", border: `2px solid ${C.accent}` }} />
              <div style={{ position: "absolute", right: "16%", top: 20, width: 116, height: 116, borderRadius: "50%", background: idx === 0 ? "rgba(21,128,61,.24)" : idx === 2 ? "rgba(21,128,61,.16)" : "rgba(21,128,61,.08)", border: `2px solid ${C.success}` }} />
              <div style={{ position: "absolute", left: "50%", top: 55, transform: "translateX(-50%)", borderRadius: 999, background: idx === 0 ? C.dark : C.panel, color: idx === 0 ? "#fff" : C.text, border: `1px solid ${C.line}`, padding: "8px 12px", fontFamily: C.mono, fontSize: 12 }}>{title}</div>
            </div>
            <strong style={{ display: "block", fontSize: 14 }}>{subtitle}</strong>
            <p style={{ margin: "7px 0 0", color: C.sub, fontSize: 12, lineHeight: 1.5 }}>{desc}</p>
          </section>
        ))}
      </div>
      <Button onClick={() => loadExample(EXAMPLES.find(item => item.id === "join"))} style={{ marginTop: 12 }}>JOIN SQL 작성하기</Button>
    </Panel>
  );
}

function ConstraintVisual({ loadExample }) {
  return (
    <Panel title="INSERT 검증 파이프라인">
      <div style={{ display: "grid", gap: 10 }}>
        {CONSTRAINT_STEPS.map(([title, desc], idx) => (
          <div key={title} style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
            <span style={{ width: 34, height: 34, borderRadius: 999, display: "grid", placeItems: "center", background: idx === CONSTRAINT_STEPS.length - 1 ? "#ecfdf5" : C.accentSoft, color: idx === CONSTRAINT_STEPS.length - 1 ? C.success : C.accent, fontFamily: C.mono, fontWeight: 900, fontSize: 12 }}>{idx + 1}</span>
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 9, background: C.panelAlt, padding: "11px 13px" }}>
              <strong style={{ fontFamily: C.mono, fontSize: 13 }}>{title}</strong>
              <span style={{ marginLeft: 10, color: C.sub, fontSize: 12 }}>{desc}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={() => loadExample(EXAMPLES.find(item => item.id === "check"))}>CHECK 예제</Button>
        <Button onClick={() => loadExample(EXAMPLES.find(item => item.id === "notnull"))}>NOT NULL 예제</Button>
        <Button onClick={() => loadExample(EXAMPLES.find(item => item.id === "pk"))}>PRIMARY KEY 예제</Button>
      </div>
    </Panel>
  );
}

function LoginPage({ onLogin, authMessage }) {
  const [message, setMessage] = useState(authMessage || "");
  const [apiStatus, setApiStatus] = useState(hasApiBase() ? "checking" : "not-configured");

  useEffect(() => {
    setMessage(authMessage || "");
  }, [authMessage]);

  useEffect(() => {
    if (!hasApiBase()) return;
    let alive = true;
    api.health()
      .then(data => { if (alive) setApiStatus(data.naverConfigured ? "online" : "missing-oauth"); })
      .catch(() => { if (alive) setApiStatus("offline"); });
    return () => { alive = false; };
  }, []);

  const naverLogin = async () => {
    if (!hasApiBase()) {
      setMessage("네이버 로그인에는 백엔드 API 주소가 필요합니다. GitHub Pages 배포에서는 VITE_API_BASE_URL을 배포된 백엔드 주소로 설정해야 합니다.");
      return;
    }
    if (apiStatus === "offline" || apiStatus === "checking") {
      setMessage("백엔드 서버에 연결할 수 없습니다. 로컬에서는 backend에서 npm run dev를 실행해야 네이버 로그인이 시작됩니다.");
      return;
    }
    if (apiStatus === "missing-oauth") {
      setMessage("백엔드는 켜져 있지만 NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET이 설정되지 않았습니다.");
      return;
    }
    try {
      const returnTo = new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString();
      const { url } = await api.naverLoginUrl(returnTo);
      window.location.href = url;
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 20 }}>
      <Panel title="로그인">
        <p style={{ margin: "0 0 14px", color: C.sub, fontSize: 13, lineHeight: 1.6 }}>로그인하면 문서 저장과 최근 작업 관리 기능을 서버 계정과 연결할 수 있습니다.</p>
        <div style={{ marginBottom: 12, border: `1px solid ${C.lineSoft}`, background: C.panelAlt, borderRadius: 8, padding: 11, display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>API 연결 상태</span>
          <span style={{ fontSize: 12, color: apiStatus === "online" ? C.success : apiStatus === "checking" ? C.warn : C.danger, fontFamily: C.mono }}>
            {apiStatus === "online" && `online · ${apiBase}`}
            {apiStatus === "checking" && `checking · ${apiBase}`}
            {apiStatus === "offline" && `offline · ${apiBase}`}
            {apiStatus === "missing-oauth" && `backend online · naver env missing`}
            {apiStatus === "not-configured" && "not configured · VITE_API_BASE_URL 필요"}
          </span>
        </div>
        <Button variant="primary" onClick={naverLogin} disabled={apiStatus !== "online"} style={{ width: "100%" }}>네이버 OAuth 로그인</Button>
        <Button onClick={() => onLogin({ username: "체험 사용자" })} style={{ width: "100%", marginTop: 8 }}>체험 모드로 계속</Button>
        <p style={{ margin: "12px 0 0", color: C.muted, fontSize: 12, lineHeight: 1.55 }}>GitHub Pages는 정적 호스팅이라 자체적으로 OAuth 콜백과 문서 저장 API를 처리할 수 없습니다. 배포된 Node 백엔드 주소를 프론트 환경변수에 연결하면 네이버 로그인이 활성화됩니다.</p>
        {message && <p style={{ color: C.warn, fontSize: 12, lineHeight: 1.5 }}>{message}</p>}
      </Panel>
    </main>
  );
}

function upsertSchema(list, schema) {
  const idx = list.findIndex(item => item.tableName.toLowerCase() === schema.tableName.toLowerCase());
  if (idx >= 0) list[idx] = schema;
  else list.push(schema);
}

function addRecentSql(title, sql) {
  const recent = readJSON(STORAGE.recent, []);
  const next = [{ title, sql, updated_at: new Date().toISOString() }, ...recent.filter(item => item.sql !== sql)].slice(0, 10);
  writeJSON(STORAGE.recent, next);
}

function firstSqlLine(sql) {
  return sql.split("\n").map(line => line.trim()).find(Boolean) || "SQL";
}

export default function App() {
  const [page, setPage] = useState("home");
  const [incomingSql, setIncomingSql] = useState(null);
  const [user, setUser] = useState(() => authStore.getUser() || readJSON(STORAGE.user, null));
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    Object.assign(document.body.style, {
      margin: 0,
      background: C.bg,
      fontFamily: C.sans,
      color: C.text,
      overflowX: "hidden",
    });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const error = params.get("error");
    if (token) {
      authStore.save(token);
      const nextUser = authStore.getUser();
      setUser(nextUser);
      setPage("editor");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (error) {
      const messages = {
        cancelled: "네이버 로그인이 취소되었습니다.",
        oauth_failed: "네이버 인증 처리 중 오류가 발생했습니다. 백엔드 환경변수와 네이버 콜백 URL을 확인하세요.",
      };
      setAuthMessage(messages[error] || "로그인 처리 중 오류가 발생했습니다.");
      setPage("login");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const loadExample = item => {
    setIncomingSql({ id: Date.now(), title: item.title, sql: item.sql });
    setPage("editor");
  };

  const handleLogin = nextUser => {
    setUser(nextUser);
    writeJSON(STORAGE.user, nextUser);
    setPage("editor");
  };

  const handleLogout = () => {
    authStore.clear();
    localStorage.removeItem(STORAGE.user);
    setUser(null);
    setPage("home");
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg }}>
      <NavBar page={page} setPage={setPage} user={user} onLogout={handleLogout} />
      {page === "home" && <HomeDashboard setPage={setPage} loadExample={loadExample} />}
      {page === "editor" && <Workspace initialRequest={incomingSql} />}
      {page === "visualizer" && <VisualizerPage loadExample={loadExample} />}
      {page === "concepts" && <ConceptsPage loadExample={loadExample} />}
      {page === "docs" && <DocsPage setPage={setPage} loadExample={loadExample} />}
      {page === "login" && <LoginPage onLogin={handleLogin} authMessage={authMessage} />}
    </div>
  );
}
