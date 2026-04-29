import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import sqlJsUrl from "sql.js/dist/sql-wasm.js?url";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { analyzeError, explainDetailedSQL, parseCreateTable, splitStatements } from "./utils/sqlAnalyzer.js";
import { api, authStore, hasApiBase } from "./utils/api.js";

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
  workspace: "sv_workspace_state",
  page: "sv_last_page",
};

const LOCAL_USER = { id: "local", display_name: "체험 사용자", username: "체험 사용자", local: true };

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
      { name: "DISTINCT", summary: "중복 행을 제거해 고유한 값만 조회합니다.", syntax: "SELECT DISTINCT column FROM table_name;", example: "SELECT DISTINCT dept_id FROM student;", notes: ["중복 제거에는 정렬/해시 비용이 들 수 있습니다.", "여러 컬럼을 함께 쓰면 컬럼 조합 전체가 중복 판단 기준입니다."] },
      { name: "Alias / AS", summary: "테이블이나 컬럼에 읽기 쉬운 별칭을 붙입니다.", syntax: "SELECT column AS alias FROM table AS t;", example: "SELECT s.name AS student_name FROM student AS s;", notes: ["JOIN에서는 테이블 별칭이 거의 필수입니다.", "계산 컬럼에는 결과 의미가 드러나는 별칭을 붙이는 편이 좋습니다."] },
      { name: "ORDER BY", summary: "조회 결과의 정렬 순서를 정합니다.", syntax: "ORDER BY column ASC|DESC;", example: "SELECT name, gpa FROM student ORDER BY gpa DESC;", notes: ["정렬은 결과를 읽기 좋게 하지만 큰 데이터에서는 비용이 큽니다.", "동점 처리가 필요하면 두 번째 정렬 기준을 함께 둡니다."] },
      { name: "LIMIT / OFFSET", summary: "결과 개수를 제한하거나 페이지 단위로 넘깁니다.", syntax: "SELECT * FROM table_name LIMIT 10 OFFSET 20;", example: "SELECT * FROM student ORDER BY student_id LIMIT 10;", notes: ["페이지네이션에는 안정적인 ORDER BY가 거의 항상 필요합니다.", "대량 OFFSET은 느릴 수 있어 커서 기반 페이지네이션을 쓰기도 합니다."] },
      { name: "LIKE", summary: "문자열 패턴에 맞는 행을 찾습니다.", syntax: "WHERE column LIKE 'Kim%'", example: "SELECT * FROM student WHERE name LIKE 'Ji%';", notes: ["%는 여러 글자, _는 한 글자를 의미합니다.", "앞쪽 와일드카드 LIKE '%text'는 인덱스를 타기 어렵습니다."] },
      { name: "IN / NOT IN", summary: "여러 후보 값 중 포함 여부를 검사합니다.", syntax: "WHERE column IN (value1, value2)", example: "SELECT * FROM student WHERE dept_id IN (1, 2, 3);", notes: ["서브쿼리 결과와 함께 자주 사용합니다.", "NOT IN은 NULL이 섞이면 기대와 다르게 동작할 수 있어 NOT EXISTS를 검토합니다."] },
      { name: "BETWEEN", summary: "값이 시작과 끝 범위 안에 있는지 확인합니다.", syntax: "WHERE column BETWEEN low AND high", example: "SELECT * FROM student WHERE gpa BETWEEN 3.0 AND 4.0;", notes: ["대부분의 DBMS에서 양 끝값을 포함합니다.", "날짜 범위는 시간까지 고려해 반열린 구간을 쓰기도 합니다."] },
      { name: "IS NULL / IS NOT NULL", summary: "값이 비어 있는지 확인합니다.", syntax: "WHERE column IS NULL", example: "SELECT * FROM student WHERE email IS NULL;", notes: ["NULL은 알 수 없음이라는 의미라 = 로 비교하지 않습니다.", "LEFT JOIN 후 매칭 누락을 찾을 때 자주 사용합니다."] },
      { name: "AND / OR / NOT", summary: "여러 조건을 조합합니다.", syntax: "WHERE a = 1 AND (b = 2 OR c = 3)", example: "SELECT * FROM student WHERE gpa >= 3.5 AND dept_id = 1;", notes: ["AND가 OR보다 먼저 계산되므로 괄호로 의도를 명확히 합니다.", "부정 조건은 인덱스 효율이 낮을 수 있습니다."] },
    ],
  },
  {
    id: "join",
    title: "관계와 JOIN",
    desc: "여러 테이블을 연결해 하나의 의미 있는 결과로 만드는 영역입니다.",
    items: [
      { name: "INNER JOIN", summary: "양쪽 테이블에 모두 매칭되는 행만 조회합니다.", syntax: "A INNER JOIN B ON A.key = B.key", example: "SELECT s.name, d.name FROM student s JOIN department d ON s.dept_id = d.dept_id;", notes: ["가장 일반적인 JOIN입니다.", "ON 조건이 틀리면 결과가 크게 늘어나거나 사라집니다."] },
      { name: "LEFT JOIN", summary: "왼쪽 테이블은 모두 유지하고 오른쪽 매칭 결과를 붙입니다.", syntax: "A LEFT JOIN B ON A.key = B.key", example: "SELECT s.name, d.name FROM student s LEFT JOIN department d ON s.dept_id = d.dept_id;", notes: ["LEFT OUTER JOIN과 같은 의미로 쓰입니다.", "매칭이 없으면 오른쪽 컬럼은 NULL이 됩니다."] },
      { name: "LEFT OUTER JOIN", summary: "왼쪽 전체 행과 오른쪽 매칭 행을 함께 보여주는 OUTER JOIN입니다.", syntax: "A LEFT OUTER JOIN B ON A.key = B.key", example: "SELECT s.name, d.name FROM student s LEFT OUTER JOIN department d ON s.dept_id = d.dept_id;", notes: ["왼쪽 기준 누락 관계를 찾을 때 좋습니다.", "LEFT JOIN과 LEFT OUTER JOIN은 같은 의미입니다."] },
      { name: "RIGHT JOIN", summary: "오른쪽 테이블은 모두 유지하고 왼쪽 매칭 결과를 붙입니다.", syntax: "A RIGHT JOIN B ON A.key = B.key", example: "SELECT s.name, d.name FROM student s RIGHT JOIN department d ON s.dept_id = d.dept_id;", notes: ["RIGHT OUTER JOIN과 같은 의미입니다.", "일부 DBMS나 SQLite 버전에 따라 지원 여부가 다릅니다."] },
      { name: "RIGHT OUTER JOIN", summary: "오른쪽 전체 행을 기준으로 매칭 누락을 확인하는 OUTER JOIN입니다.", syntax: "A RIGHT OUTER JOIN B ON A.key = B.key", example: "SELECT s.name, d.name FROM student s RIGHT OUTER JOIN department d ON s.dept_id = d.dept_id;", notes: ["대부분 LEFT JOIN으로 방향을 바꿔 표현할 수 있습니다.", "오른쪽 기준 리포트를 작성할 때 의미가 분명합니다."] },
      { name: "FULL OUTER JOIN", summary: "양쪽 테이블의 모든 행을 유지하고 매칭되는 데이터는 한 행으로 합칩니다.", syntax: "A FULL OUTER JOIN B ON A.key = B.key", example: "SELECT s.name, d.name FROM student s FULL OUTER JOIN department d ON s.dept_id = d.dept_id;", notes: ["양쪽 모두의 누락 데이터를 찾을 때 사용합니다.", "SQLite처럼 FULL OUTER JOIN을 직접 지원하지 않는 DB에서는 LEFT JOIN과 RIGHT JOIN 결과를 UNION으로 흉내냅니다."] },
      { name: "ON", summary: "JOIN에서 두 테이블을 어떤 조건으로 연결할지 지정합니다.", syntax: "JOIN B ON A.id = B.a_id", example: "JOIN department d ON s.dept_id = d.dept_id", notes: ["JOIN 조건과 WHERE 조건의 역할을 구분하면 OUTER JOIN 결과를 덜 망가뜨립니다.", "복합키는 ON에 여러 조건을 AND로 연결합니다."] },
      { name: "USING", summary: "양쪽 테이블의 같은 이름 컬럼으로 JOIN합니다.", syntax: "A JOIN B USING (column_name)", example: "SELECT * FROM student JOIN department USING (dept_id);", notes: ["컬럼명이 같을 때 ON을 짧게 쓸 수 있습니다.", "DBMS마다 결과 컬럼 표시 방식이 다를 수 있습니다."] },
      { name: "SELF JOIN", summary: "같은 테이블을 두 번 참조해 계층이나 비교 관계를 표현합니다.", syntax: "employee e JOIN employee m ON e.manager_id = m.id", example: "SELECT e.name, m.name AS manager FROM employee e LEFT JOIN employee m ON e.manager_id = m.id;", notes: ["반드시 별칭을 다르게 붙여야 읽기 쉽습니다.", "조직도, 추천 관계, 상하위 카테고리에 유용합니다."] },
      { name: "CROSS JOIN", summary: "두 테이블의 모든 조합을 만듭니다.", syntax: "A CROSS JOIN B", example: "SELECT * FROM size CROSS JOIN color;", notes: ["조합 수가 곱으로 늘어나므로 신중히 사용합니다.", "옵션 조합 생성 같은 경우에 적합합니다."] },
      { name: "NATURAL JOIN", summary: "같은 이름의 컬럼을 자동으로 찾아 JOIN합니다.", syntax: "A NATURAL JOIN B", example: "SELECT * FROM student NATURAL JOIN department;", notes: ["자동 매칭이라 편하지만 테이블 구조 변경에 취약합니다.", "실무에서는 명시적인 ON이나 USING을 더 선호합니다."] },
      { name: "SEMI JOIN 패턴", summary: "매칭 존재 여부만 보고 왼쪽 행을 남기는 패턴입니다.", syntax: "WHERE EXISTS (SELECT 1 FROM B WHERE B.key = A.key)", example: "SELECT * FROM student s WHERE EXISTS (SELECT 1 FROM enrollment e WHERE e.student_id = s.student_id);", notes: ["오른쪽 컬럼이 필요 없을 때 JOIN보다 의도가 명확합니다.", "IN 또는 EXISTS로 표현하는 경우가 많습니다."] },
      { name: "ANTI JOIN 패턴", summary: "매칭되지 않는 왼쪽 행만 찾는 패턴입니다.", syntax: "LEFT JOIN B ... WHERE B.key IS NULL", example: "SELECT s.* FROM student s LEFT JOIN enrollment e ON e.student_id = s.student_id WHERE e.student_id IS NULL;", notes: ["미등록 학생, 주문 없는 고객 같은 누락 데이터를 찾을 때 좋습니다.", "NOT EXISTS로도 자주 표현합니다."] },
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
      { name: "GROUP_CONCAT / STRING_AGG", summary: "그룹에 속한 여러 값을 하나의 문자열로 모읍니다.", syntax: "GROUP_CONCAT(column, ', ')", example: "SELECT dept_id, GROUP_CONCAT(name, ', ') FROM student GROUP BY dept_id;", notes: ["SQLite는 GROUP_CONCAT, PostgreSQL은 STRING_AGG를 사용합니다.", "표시용 집계에는 좋지만 원본 관계를 잃을 수 있습니다."] },
      { name: "ROLLUP / CUBE", summary: "그룹별 합계와 소계, 총계를 한 번에 계산합니다.", syntax: "GROUP BY ROLLUP (region, product)", example: "SELECT dept_id, COUNT(*) FROM student GROUP BY ROLLUP (dept_id);", notes: ["DBMS별 지원 여부와 문법이 다릅니다.", "리포트성 집계에서 유용합니다."] },
    ],
  },
  {
    id: "dml",
    title: "데이터 변경",
    desc: "테이블 안의 행을 추가, 수정, 삭제하는 DML 영역입니다.",
    items: [
      { name: "INSERT", summary: "테이블에 새 행을 추가합니다.", syntax: "INSERT INTO table_name (columns) VALUES (values);", example: "INSERT INTO student (student_id, name, gpa) VALUES (1, 'Jiwon', 4.1);", notes: ["컬럼명을 명시하면 테이블 구조 변경에 덜 취약합니다.", "NOT NULL, CHECK, FOREIGN KEY 제약조건을 통과해야 저장됩니다."] },
      { name: "INSERT SELECT", summary: "SELECT 결과를 다른 테이블에 그대로 삽입합니다.", syntax: "INSERT INTO target (columns) SELECT ... FROM source;", example: "INSERT INTO honor_student (student_id, name) SELECT student_id, name FROM student WHERE gpa >= 4.0;", notes: ["마이그레이션이나 집계 테이블 생성에 유용합니다.", "대량 삽입 전 컬럼 순서와 타입을 꼭 확인합니다."] },
      { name: "UPDATE", summary: "기존 행의 값을 변경합니다.", syntax: "UPDATE table_name SET column = value WHERE condition;", example: "UPDATE student SET gpa = 4.2 WHERE student_id = 101;", notes: ["WHERE 없이 실행하면 모든 행이 바뀝니다.", "운영 환경에서는 변경 전 SELECT로 대상 행을 확인하는 습관이 중요합니다."] },
      { name: "DELETE", summary: "조건에 맞는 행을 삭제합니다.", syntax: "DELETE FROM table_name WHERE condition;", example: "DELETE FROM student WHERE student_id = 101;", notes: ["WHERE 없이 실행하면 모든 행이 삭제됩니다.", "외래키 참조가 있으면 삭제가 막히거나 연쇄 삭제될 수 있습니다."] },
      { name: "UPSERT", summary: "삽입하려는 키가 이미 있으면 업데이트합니다.", syntax: "INSERT ... ON CONFLICT (...) DO UPDATE SET ...", example: "INSERT INTO student (student_id, name) VALUES (101, 'Jiwon') ON CONFLICT(student_id) DO UPDATE SET name = excluded.name;", notes: ["SQLite/PostgreSQL은 ON CONFLICT 문법을 사용합니다.", "중복 요청을 안전하게 처리할 때 자주 씁니다."] },
      { name: "MERGE", summary: "소스 데이터와 대상 테이블을 비교해 INSERT/UPDATE/DELETE를 한 번에 처리합니다.", syntax: "MERGE INTO target USING source ON condition WHEN MATCHED THEN UPDATE ...", example: "MERGE INTO student USING incoming_student ON student.student_id = incoming_student.student_id WHEN MATCHED THEN UPDATE SET name = incoming_student.name;", notes: ["데이터 웨어하우스와 동기화 작업에서 자주 사용합니다.", "DBMS별 문법 차이가 크며 SQLite는 표준 MERGE를 지원하지 않습니다."] },
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
      { name: "DROP TABLE", summary: "테이블 구조와 데이터를 모두 삭제합니다.", syntax: "DROP TABLE table_name;", example: "DROP TABLE old_student;", notes: ["되돌리기 어렵기 때문에 운영 DB에서는 백업과 확인이 필요합니다.", "참조 관계가 있으면 삭제가 제한될 수 있습니다."] },
      { name: "TRUNCATE", summary: "테이블 구조는 유지하고 모든 데이터를 빠르게 비웁니다.", syntax: "TRUNCATE TABLE table_name;", example: "TRUNCATE TABLE audit_log;", notes: ["SQLite에는 TRUNCATE TABLE 문이 없습니다.", "DELETE와 달리 트리거나 로그 처리 방식이 DBMS마다 다를 수 있습니다."] },
      { name: "CREATE SCHEMA", summary: "테이블을 논리적으로 묶는 네임스페이스를 만듭니다.", syntax: "CREATE SCHEMA schema_name;", example: "CREATE SCHEMA school;", notes: ["PostgreSQL 등에서 스키마를 사용해 도메인이나 권한을 분리합니다.", "SQLite는 별도 schema 개념이 제한적입니다."] },
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
      { name: "Composite Key", summary: "여러 컬럼 조합으로 행을 고유하게 식별합니다.", syntax: "PRIMARY KEY (student_id, course_id)", example: "CREATE TABLE enrollment (student_id INT, course_id INT, PRIMARY KEY (student_id, course_id));", notes: ["다대다 연결 테이블에서 자주 사용합니다.", "복합키를 참조하는 외래키도 컬럼 조합을 맞춰야 합니다."] },
      { name: "ON DELETE / ON UPDATE", summary: "참조 대상 행이 삭제/수정될 때 외래키가 어떻게 반응할지 정합니다.", syntax: "FOREIGN KEY (...) REFERENCES parent(...) ON DELETE CASCADE", example: "FOREIGN KEY (dept_id) REFERENCES department(dept_id) ON DELETE SET NULL", notes: ["CASCADE는 관련 자식 행까지 바꿀 수 있어 신중해야 합니다.", "RESTRICT, SET NULL, CASCADE 같은 정책을 도메인에 맞게 고릅니다."] },
    ],
  },
  {
    id: "advanced",
    title: "고급 쿼리",
    desc: "복잡한 분석과 재사용 가능한 쿼리를 다루는 영역입니다.",
    items: [
      { name: "Subquery", summary: "쿼리 안에 다른 쿼리를 넣어 중간 결과를 사용합니다.", syntax: "SELECT * FROM A WHERE id IN (SELECT id FROM B);", example: "SELECT * FROM student WHERE dept_id IN (SELECT dept_id FROM department);", notes: ["IN, EXISTS, FROM 절에서 자주 사용합니다.", "복잡해지면 CTE로 이름을 붙이는 편이 읽기 쉽습니다."] },
      { name: "EXISTS / NOT EXISTS", summary: "서브쿼리 결과가 존재하는지 여부를 검사합니다.", syntax: "WHERE EXISTS (SELECT 1 FROM B WHERE B.key = A.key)", example: "SELECT * FROM student s WHERE EXISTS (SELECT 1 FROM enrollment e WHERE e.student_id = s.student_id);", notes: ["존재 여부만 필요할 때 JOIN보다 의도가 분명합니다.", "NOT EXISTS는 누락 데이터 탐색에 안전한 패턴입니다."] },
      { name: "ANY / ALL", summary: "서브쿼리 여러 값 중 일부 또는 전체와 비교합니다.", syntax: "value > ANY (subquery), value > ALL (subquery)", example: "SELECT * FROM student WHERE gpa > ALL (SELECT gpa FROM student WHERE dept_id = 2);", notes: ["DBMS별 지원과 최적화 차이가 있습니다.", "읽기 어렵다면 집계 함수나 EXISTS로 바꿔 표현할 수 있습니다."] },
      { name: "CTE", summary: "WITH로 임시 결과에 이름을 붙여 쿼리를 단계화합니다.", syntax: "WITH ranked AS (...) SELECT * FROM ranked;", example: "WITH high_gpa AS (SELECT * FROM student WHERE gpa >= 3.5) SELECT * FROM high_gpa;", notes: ["긴 쿼리를 여러 단계로 나눌 수 있습니다.", "재귀 CTE는 트리 구조를 다룰 때 유용합니다."] },
      { name: "Recursive CTE", summary: "자기 자신을 참조하는 CTE로 계층 구조를 조회합니다.", syntax: "WITH RECURSIVE tree AS (...) SELECT * FROM tree;", example: "WITH RECURSIVE org(id, name) AS (SELECT id, name FROM employee WHERE manager_id IS NULL UNION ALL SELECT e.id, e.name FROM employee e JOIN org o ON e.manager_id = o.id) SELECT * FROM org;", notes: ["조직도, 댓글 트리, 카테고리 트리 조회에 사용합니다.", "종료 조건이 없으면 무한 반복 위험이 있습니다."] },
      { name: "Window Function", summary: "행을 유지한 채 순위, 누적합, 이동 평균을 계산합니다.", syntax: "ROW_NUMBER() OVER (PARTITION BY key ORDER BY value)", example: "SELECT name, ROW_NUMBER() OVER (ORDER BY gpa DESC) AS rank FROM student;", notes: ["GROUP BY와 달리 원본 행이 사라지지 않습니다.", "랭킹, 전월 대비, 누적 통계에 자주 쓰입니다."] },
      { name: "RANK / DENSE_RANK", summary: "정렬 기준에 따라 순위를 계산합니다.", syntax: "RANK() OVER (ORDER BY score DESC)", example: "SELECT name, RANK() OVER (ORDER BY gpa DESC) AS rank FROM student;", notes: ["RANK는 동점 뒤 순위를 건너뛰고 DENSE_RANK는 건너뛰지 않습니다.", "리더보드와 상위 N개 분석에 유용합니다."] },
      { name: "LAG / LEAD", summary: "현재 행 기준 이전 또는 다음 행의 값을 가져옵니다.", syntax: "LAG(value) OVER (ORDER BY date)", example: "SELECT month, sales, LAG(sales) OVER (ORDER BY month) AS prev_sales FROM monthly_sales;", notes: ["전월 대비, 전일 대비 분석에 자주 쓰입니다.", "정렬 기준이 명확해야 의미가 안정적입니다."] },
      { name: "CASE", summary: "조건에 따라 다른 값을 반환합니다.", syntax: "CASE WHEN condition THEN value ELSE other END", example: "SELECT name, CASE WHEN gpa >= 4.0 THEN 'A' ELSE 'B' END AS grade_band FROM student;", notes: ["SQL 안에서 간단한 분류 로직을 표현합니다.", "복잡한 비즈니스 규칙은 코드나 룰 테이블로 분리하는 편이 낫습니다."] },
      { name: "CAST", summary: "값의 타입을 명시적으로 변환합니다.", syntax: "CAST(value AS type)", example: "SELECT CAST(gpa AS TEXT) FROM student;", notes: ["문자/숫자/날짜 비교가 섞일 때 명확성을 높입니다.", "DBMS마다 타입 이름과 변환 규칙이 다를 수 있습니다."] },
      { name: "COALESCE / NULLIF", summary: "NULL 값을 대체하거나 특정 값을 NULL로 바꿉니다.", syntax: "COALESCE(value, fallback), NULLIF(a, b)", example: "SELECT COALESCE(email, 'no-email') FROM student;", notes: ["COALESCE는 표시용 기본값 처리에 자주 사용됩니다.", "NULLIF는 0으로 나누기 방지 같은 패턴에 유용합니다."] },
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
      { name: "Composite Index", summary: "여러 컬럼을 묶어 만든 인덱스입니다.", syntax: "CREATE INDEX idx_name ON table_name (a, b);", example: "CREATE INDEX idx_student_dept_gpa ON student(dept_id, gpa);", notes: ["컬럼 순서가 중요합니다.", "WHERE dept_id = ? AND gpa >= ? 같은 조건에 효과적입니다."] },
      { name: "Unique Index", summary: "검색 성능과 중복 방지를 동시에 제공하는 인덱스입니다.", syntax: "CREATE UNIQUE INDEX idx_name ON table_name(column);", example: "CREATE UNIQUE INDEX idx_users_email ON users(email);", notes: ["UNIQUE 제약조건과 비슷한 역할을 합니다.", "중복 데이터가 이미 있으면 생성에 실패합니다."] },
      { name: "EXPLAIN", summary: "쿼리가 어떤 실행 계획으로 처리되는지 확인합니다.", syntax: "EXPLAIN QUERY PLAN SELECT ...", example: "EXPLAIN QUERY PLAN SELECT * FROM student WHERE dept_id = 1;", notes: ["인덱스를 타는지, 전체 스캔인지 확인할 수 있습니다.", "DBMS마다 출력 형식이 다릅니다."] },
      { name: "View", summary: "자주 쓰는 SELECT를 가상 테이블처럼 저장합니다.", syntax: "CREATE VIEW view_name AS SELECT ...;", example: "CREATE VIEW high_gpa_students AS SELECT * FROM student WHERE gpa >= 3.5;", notes: ["복잡한 조회를 재사용하기 좋습니다.", "권한 분리나 읽기 전용 뷰에도 활용됩니다."] },
      { name: "Materialized View", summary: "조회 결과를 실제로 저장해 빠르게 읽는 뷰입니다.", syntax: "CREATE MATERIALIZED VIEW name AS SELECT ...;", example: "CREATE MATERIALIZED VIEW dept_stats AS SELECT dept_id, AVG(gpa) FROM student GROUP BY dept_id;", notes: ["PostgreSQL 등 일부 DBMS에서 지원합니다.", "원본 데이터 변경 후 refresh 전략이 필요합니다."] },
      { name: "Normalization", summary: "중복을 줄이고 관계를 명확히 하기 위한 설계 원칙입니다.", syntax: "entity -> table, relationship -> key", example: "student.dept_id -> department.dept_id", notes: ["중복 데이터를 줄이면 수정 불일치가 줄어듭니다.", "조회 성능 때문에 일부러 반정규화하는 경우도 있습니다."] },
      { name: "ACID", summary: "트랜잭션이 지켜야 하는 원자성, 일관성, 격리성, 지속성 원칙입니다.", syntax: "Atomicity, Consistency, Isolation, Durability", example: "계좌 이체는 출금과 입금이 함께 성공하거나 함께 실패해야 합니다.", notes: ["데이터 정합성을 이해하는 핵심 개념입니다.", "성능과 격리 수준 사이에는 trade-off가 있습니다."] },
      { name: "Isolation Level", summary: "동시에 실행되는 트랜잭션이 서로를 얼마나 볼 수 있는지 정합니다.", syntax: "READ COMMITTED, REPEATABLE READ, SERIALIZABLE", example: "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;", notes: ["격리가 높을수록 정합성은 강하지만 대기와 충돌이 늘 수 있습니다.", "DBMS마다 기본 격리 수준과 동작이 다릅니다."] },
      { name: "Lock", summary: "동시 수정 충돌을 막기 위해 데이터 접근을 잠급니다.", syntax: "SELECT ... FOR UPDATE", example: "SELECT * FROM account WHERE id = 1 FOR UPDATE;", notes: ["긴 트랜잭션은 락 대기와 데드락 위험을 키웁니다.", "SQLite는 락 모델이 서버형 DBMS와 다릅니다."] },
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

function currentName(user) {
  return user?.display_name || user?.username || "사용자";
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function fileNameFromTitle(title) {
  const safe = String(title || "sqlvisual-query").trim().replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_");
  return `${safe || "sqlvisual-query"}.sql`;
}

function downloadSql(title, sql) {
  const blob = new Blob([sql || ""], { type: "text/sql;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileNameFromTitle(title);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseTags(value) {
  return String(value || "").split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 8);
}

function tagText(tags) {
  return Array.isArray(tags) ? tags.join(", ") : (tags || "");
}

function getWorkspaceDraft() {
  const draft = readJSON(STORAGE.workspace, null);
  if (!draft?.sql) return null;
  return {
    id: "workspace:draft",
    docId: draft.docId || null,
    source: "workspace",
    sourceLabel: "작업 중",
    title: draft.docTitle || "작업 중 문서",
    sql_code: draft.sql,
    updated_at: draft.updated_at,
    activeTab: draft.activeTab,
  };
}

function toVisualizerDoc(doc, source) {
  const id = doc.id ?? `${doc.title || "document"}:${doc.updated_at || ""}`;
  return {
    id: `${source}:${id}`,
    docId: source === "site" ? doc.id : null,
    source,
    sourceLabel: source === "site" ? "내 문서" : source === "sample" ? "예제" : source === "workspace" ? "작업 중" : "브라우저",
    title: doc.title || "Untitled query",
    sql_code: doc.sql_code || doc.sql || "",
    description: doc.description || doc.memo || "",
    author: doc.author,
    updated_at: doc.updated_at || doc.created_at,
  };
}

function localVisualizerDocs() {
  const draft = getWorkspaceDraft();
  const saved = readJSON(STORAGE.docs, []).map(doc => toVisualizerDoc(doc, "local"));
  return [draft, ...saved].filter(Boolean);
}

function mergeVisualizerDocs(...groups) {
  const seen = new Set();
  return groups.flat().filter(doc => {
    const key = `${doc.source}:${doc.docId || doc.id}:${doc.sql_code}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(doc.sql_code?.trim());
  });
}

function schemasFromSql(sql) {
  return splitStatements(sql || "")
    .filter(stmt => /CREATE\s+TABLE/i.test(stmt))
    .map(stmt => {
      try { return parseCreateTable(stmt); }
      catch { return null; }
    })
    .filter(Boolean);
}

function stripSqlLineComment(line) {
  let out = "";
  let inString = false;
  let quote = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (!inString && (ch === "'" || ch === '"')) {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }
    if (inString && ch === quote) {
      inString = false;
      quote = "";
      out += ch;
      continue;
    }
    if (!inString && ch === "-" && next === "-") break;
    out += ch;
  }
  return out;
}

function splitStatementsWithLocations(source) {
  const clean = String(source || "").split(/\r?\n/).map(stripSqlLineComment).join("\n");
  const blocks = [];
  let cur = "";
  let startLine = null;
  let line = 1;
  let inString = false;
  let quote = "";

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (startLine == null && !/\s/.test(ch)) startLine = line;
    if (!inString && (ch === "'" || ch === '"')) {
      inString = true;
      quote = ch;
      cur += ch;
    } else if (inString && ch === quote) {
      inString = false;
      quote = "";
      cur += ch;
    } else if (!inString && ch === ";") {
      const stmt = cur.trim();
      if (stmt) blocks.push({ stmt, startLine: startLine || line, endLine: line });
      cur = "";
      startLine = null;
    } else {
      cur += ch;
    }
    if (ch === "\n") line++;
  }

  const stmt = cur.trim();
  if (stmt) blocks.push({ stmt, startLine: startLine || line, endLine: line });
  return blocks;
}

function quoteSqlIdentifier(name) {
  return `"${String(name || "").replace(/"/g, '""')}"`;
}

function getSqlCompatibilityAction(stmt) {
  const compact = String(stmt || "").trim().replace(/\s+/g, " ");
  const upper = compact.toUpperCase();

  if (/^(COMMIT|END)\s*(?:TRANSACTION)?$/i.test(compact)) {
    return { kind: "commit", label: "트랜잭션 커밋", emptyLabel: "COMMIT 건너뜀", emptyNote: "진행 중인 트랜잭션이 없어 COMMIT을 건너뛰었습니다." };
  }

  if (/^ROLLBACK\s*(?:TRANSACTION)?$/i.test(compact)) {
    return { kind: "commit", label: "트랜잭션 롤백", emptyLabel: "ROLLBACK 건너뜀", emptyNote: "진행 중인 트랜잭션이 없어 ROLLBACK을 건너뛰었습니다." };
  }

  if (/^START\s+TRANSACTION$/i.test(compact)) {
    return { kind: "rewrite", sql: "BEGIN TRANSACTION", label: "START TRANSACTION 변환", note: "SQLite에서는 START TRANSACTION을 BEGIN TRANSACTION으로 실행합니다." };
  }

  const truncate = compact.match(/^TRUNCATE\s+TABLE\s+([A-Za-z_][\w$#]*)$/i);
  if (truncate) {
    const table = truncate[1];
    return { kind: "rewrite", sql: `DELETE FROM ${quoteSqlIdentifier(table)}`, label: "TRUNCATE 변환 실행", note: `${table} 테이블의 모든 행을 삭제했습니다. SQLite에는 TRUNCATE가 없어 DELETE FROM으로 실행합니다.` };
  }

  const describe = compact.match(/^(?:DESC|DESCRIBE)\s+([A-Za-z_][\w$#]*)$/i);
  if (describe) {
    return { kind: "rewrite", sql: `PRAGMA table_info(${quoteSqlIdentifier(describe[1])})`, label: "DESCRIBE 결과" };
  }

  const showColumns = compact.match(/^SHOW\s+COLUMNS\s+FROM\s+([A-Za-z_][\w$#]*)$/i);
  if (showColumns) {
    return { kind: "rewrite", sql: `PRAGMA table_info(${quoteSqlIdentifier(showColumns[1])})`, label: "SHOW COLUMNS 결과" };
  }

  if (/^SHOW\s+TABLES$/i.test(compact)) {
    return { kind: "rewrite", sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name", label: "SHOW TABLES 결과" };
  }

  if (/^SELECT\b/i.test(compact) && (/\bFROM\s+DUAL\b/i.test(compact) || /\bSYSDATE\b/i.test(compact))) {
    const sql = compact
      .replace(/\bSYSDATE\b/gi, "datetime('now')")
      .replace(/\s+FROM\s+DUAL\b/gi, "");
    return { kind: "rewrite", sql, label: "Oracle SELECT 변환", note: "Oracle의 DUAL/SYSDATE 표현을 브라우저 SQLite에서 실행 가능한 형태로 변환했습니다." };
  }

  const createOrReplaceView = compact.match(/^CREATE\s+OR\s+REPLACE\s+VIEW\s+([A-Za-z_][\w$#]*)\s+AS\s+([\s\S]+)$/i);
  if (createOrReplaceView) {
    const [, viewName, selectSql] = createOrReplaceView;
    return { kind: "rewrite", sql: `DROP VIEW IF EXISTS ${quoteSqlIdentifier(viewName)}; CREATE VIEW ${quoteSqlIdentifier(viewName)} AS ${selectSql}`, label: "CREATE OR REPLACE VIEW 변환", note: "SQLite에는 OR REPLACE VIEW가 없어 기존 뷰를 지운 뒤 다시 생성합니다." };
  }

  const dropPurge = compact.match(/^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?([A-Za-z_][\w$#]*)\s+PURGE$/i);
  if (dropPurge) {
    return { kind: "rewrite", sql: `DROP TABLE ${dropPurge[1] || ""}${quoteSqlIdentifier(dropPurge[2])}`, label: "DROP TABLE PURGE 변환", note: "SQLite에는 휴지통 개념이 없어 PURGE 옵션을 제외하고 DROP TABLE로 실행합니다." };
  }

  if (/^PURGE\b/i.test(upper)) {
    return { kind: "skip", label: "PURGE 건너뜀", note: "PURGE는 Oracle 휴지통 정리 명령입니다. 브라우저 SQLite에는 휴지통이 없어 실행할 작업이 없습니다." };
  }

  if (/^(SET\s+SERVEROUTPUT|SET\s+DEFINE|SET\s+ECHO|SPOOL\b|PROMPT\b)/i.test(compact)) {
    return { kind: "skip", label: "SQL*Plus 명령 건너뜀", note: "이 명령은 SQL 실행문이 아니라 Oracle SQL*Plus 도구 명령이라 브라우저 실행에서는 건너뜁니다." };
  }

  if (/^(ALTER\s+SESSION|CREATE\s+SEQUENCE|DROP\s+SEQUENCE|COMMENT\s+ON)\b/i.test(compact)) {
    return { kind: "skip", label: "Oracle 서버 명령 건너뜀", note: "이 Oracle 명령은 서버 객체/세션 설정용입니다. SQLVisual의 브라우저 DB에서는 실행할 대상이 없어 안내 후 건너뜁니다." };
  }

  if (/^(GRANT|REVOKE)\b/i.test(upper)) {
    return { kind: "skip", label: "권한 명령 건너뜀", note: "GRANT/REVOKE는 DB 서버 계정 권한 명령입니다. SQLVisual의 브라우저 DB에는 사용자 권한 시스템이 없어 건너뜁니다." };
  }

  return null;
}

function findLineContaining(lines, term) {
  const needle = String(term || "").trim().replace(/^["'`]|["'`]$/g, "").toLowerCase();
  if (!needle) return -1;
  return lines.findIndex(line => line.toLowerCase().includes(needle));
}

function findLikelyMissingCommaLine(lines) {
  const columnLike = /^\s*[\w"`]+\s+[\w]+(?:\s*\([^)]*\))?/i;
  const constraintLike = /^\s*(primary|foreign|unique|check|constraint)\b/i;
  for (let i = 0; i < lines.length - 1; i++) {
    const cur = lines[i].trim();
    const next = lines[i + 1].trim();
    if (!cur || !next || cur.endsWith(",") || cur.endsWith("(")) continue;
    if (constraintLike.test(next)) continue;
    if (columnLike.test(cur) && columnLike.test(next)) return i;
  }
  return -1;
}

function locateSqlErrorLine(block, rawMessage, analyzed) {
  const lines = block.stmt.split("\n");
  const message = String(rawMessage || "");
  const near = message.match(/near\s+"([^"]+)"/i)?.[1]
    || message.match(/near\s+'([^']+)'/i)?.[1]
    || message.match(/near\s+([^\s:]+)/i)?.[1];
  const named = message.match(/(?:table|column):\s*["']?([\w.]+)["']?/i)?.[1];
  const title = analyzed?.title || "";
  let idx = findLineContaining(lines, near);
  if (idx < 0) idx = findLineContaining(lines, named);
  if (idx < 0 && (title.includes("쉼표") || title.includes(","))) idx = findLikelyMissingCommaLine(lines);
  if (idx < 0 && title.includes("괄호")) {
    let balance = 0;
    for (let i = 0; i < lines.length; i++) {
      balance += (lines[i].match(/\(/g) || []).length;
      balance -= (lines[i].match(/\)/g) || []).length;
      if (balance < 0) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      let lastOpen = -1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("(")) lastOpen = i;
      }
      idx = Math.max(0, lastOpen);
    }
  }
  if (idx < 0) idx = 0;
  return {
    line: block.startLine + idx,
    text: lines[idx]?.trim() || block.stmt.split(/\s+/).slice(0, 8).join(" "),
  };
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
    ["docs", "내 문서"],
    ["shared", "공유 게시판"],
  ];
  if (user && !user.local) items.push(["mypage", "마이페이지"]);

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
          <button onClick={() => user.local ? setPage("login") : setPage("mypage")} style={{ border: 0, background: "transparent", color: C.sub, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", fontSize: 12 }}>{currentName(user)}</button>
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

function Workspace({ initialRequest, user, setPage, onOpenShared }) {
  const restored = getWorkspaceDraft();
  const [sql, setSql] = useState(() => restored?.sql_code || DEFAULT_SQL);
  const [docTitle, setDocTitle] = useState(() => restored?.title || "Untitled query");
  const [docId, setDocId] = useState(() => restored?.docId || null);
  const [sqlDb, setSqlDb] = useState(null);
  const [dbReady, setDbReady] = useState(false);
  const [outputs, setOutputs] = useState([]);
  const [schemas, setSchemas] = useState(() => schemasFromSql(restored?.sql_code || DEFAULT_SQL));
  const [elapsed, setElapsed] = useState(null);
  const [activeTab, setActiveTab] = useState(() => restored?.activeTab || "result");
  const [showExamples, setShowExamples] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showSaveChoice, setShowSaveChoice] = useState(false);
  const [showLoadChoice, setShowLoadChoice] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [consumedRequestId, setConsumedRequestId] = useState(null);
  const runRef = useRef(null);
  const runCurrentRef = useRef(null);
  const editorRef = useRef(null);
  const fileInputRef = useRef(null);

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
      setDocId(initialRequest.docId || null);
      setOutputs([]);
      setElapsed(null);
      setActiveTab("result");
      setConsumedRequestId(initialRequest.id);
    }
  }, [initialRequest, consumedRequestId]);

  useEffect(() => {
    const parsed = schemasFromSql(sql);
    setSchemas(parsed);
  }, [sql]);

  useEffect(() => {
    writeJSON(STORAGE.workspace, {
      docId,
      docTitle,
      sql,
      activeTab,
      updated_at: new Date().toISOString(),
    });
  }, [docId, docTitle, sql, activeTab]);

  const explanation = useMemo(() => explainDetailedSQL(sql), [sql]);
  const rowCount = outputs.reduce((sum, out) => sum + (out.type === "table" ? out.data.values.length : 0), 0);
  const errorCount = outputs.filter(out => out.type === "error").length;

  const executeStatementBlocks = useCallback((statementBlocks, recentSql = sql) => {
    const nextOutputs = [];
    const nextSchemas = [...schemas];
    const start = performance.now();

    for (const block of statementBlocks) {
      const { stmt } = block;
      if (!stmt.trim()) continue;

      try {
        const compatibility = getSqlCompatibilityAction(stmt);
        if (compatibility?.kind === "skip") {
          nextOutputs.push({ type: "ok", label: compatibility.label, stmt, startLine: block.startLine, endLine: block.endLine, note: compatibility.note });
          continue;
        }

        if (compatibility?.kind === "commit") {
          try {
            sqlDb?.exec(stmt);
            nextOutputs.push({ type: "ok", label: compatibility.label, stmt, startLine: block.startLine, endLine: block.endLine });
          } catch (commitErr) {
            if (/no transaction is active/i.test(commitErr.message || "")) {
              nextOutputs.push({ type: "ok", label: compatibility.emptyLabel, stmt, startLine: block.startLine, endLine: block.endLine, note: compatibility.emptyNote });
            } else {
              throw commitErr;
            }
          }
          continue;
        }

        const schema = /CREATE\s+TABLE/i.test(stmt) ? parseCreateTable(stmt) : null;
        if (schema) upsertSchema(nextSchemas, schema);

        if (!sqlDb) {
          nextOutputs.push({ type: "ok", label: "해설 준비", stmt, startLine: block.startLine, endLine: block.endLine });
          continue;
        }

        const executionSql = compatibility?.kind === "rewrite" ? compatibility.sql : stmt;
        const results = sqlDb.exec(executionSql);
        if (results.length > 0) nextOutputs.push({ type: "table", label: compatibility?.label || "SELECT 결과", stmt, startLine: block.startLine, endLine: block.endLine, data: results[0] });
        else nextOutputs.push({ type: "ok", label: compatibility?.label || (schema ? "구조 분석 완료" : "실행 완료"), stmt, startLine: block.startLine, endLine: block.endLine, note: compatibility?.note });
      } catch (err) {
        const analyzed = analyzeError(stmt, err.message);
        const errorLocation = locateSqlErrorLine(block, err.message, analyzed);
        nextOutputs.push({
          type: "error",
          label: "오류",
          stmt,
          startLine: block.startLine,
          endLine: block.endLine,
          errorLine: errorLocation.line,
          errorLineText: errorLocation.text,
          rawError: err.message,
          err: analyzed,
        });
      }
    }

    const ms = Math.round(performance.now() - start);
    setOutputs(nextOutputs);
    setSchemas(nextSchemas);
    setElapsed(ms);
    setActiveTab(nextOutputs.some(out => out.type === "error") ? "error" : "result");
    addRecentSql(docTitle, recentSql);
  }, [docTitle, schemas, sql, sqlDb]);

  const runSql = useCallback(() => {
    executeStatementBlocks(splitStatementsWithLocations(sql), sql);
  }, [executeStatementBlocks, sql]);

  const runCurrentSql = useCallback(() => {
    const selection = editorRef.current?.getSelection?.();
    const selectedSql = selection && !selection.isEmpty()
      ? editorRef.current?.getModel?.()?.getValueInRange(selection)?.trim()
      : "";
    if (selectedSql) {
      executeStatementBlocks(splitStatementsWithLocations(selectedSql), selectedSql);
      return;
    }

    const statementBlocks = splitStatementsWithLocations(sql);
    if (!statementBlocks.length) return;
    const cursorLine = editorRef.current?.getPosition?.()?.lineNumber || 1;
    const target = statementBlocks.find(block => block.startLine <= cursorLine && cursorLine <= block.endLine)
      || statementBlocks.find(block => block.startLine >= cursorLine)
      || statementBlocks[statementBlocks.length - 1];
    executeStatementBlocks([target], target.stmt);
  }, [executeStatementBlocks, sql]);

  useEffect(() => {
    runRef.current = runSql;
    runCurrentRef.current = runCurrentSql;
  }, [runSql, runCurrentSql]);

  useEffect(() => {
    const handler = event => {
      if (event.key === "F5") {
        event.preventDefault();
        runRef.current?.();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        runCurrentRef.current?.();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setShowSaveChoice(true);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setShowLoadChoice(true);
        return;
      }
      if (event.key === "F1") {
        event.preventDefault();
        setShowShortcuts(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyCode.F5, () => runRef.current?.());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runCurrentRef.current?.());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => setShowSaveChoice(true));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO, () => setShowLoadChoice(true));
    editor.addCommand(monaco.KeyCode.F1, () => setShowShortcuts(true));
  }, []);

  const saveLocalDoc = () => {
    const docs = readJSON(STORAGE.docs, []);
    const stamp = new Date().toISOString();
    if (docId) {
      const idx = docs.findIndex(doc => doc.id === docId);
      if (idx >= 0) docs[idx] = { ...docs[idx], title: docTitle, sql_code: sql, updated_at: stamp };
      else docs.unshift({ id: docId, title: docTitle, sql_code: sql, created_at: stamp, updated_at: stamp });
    } else {
      const id = String(Date.now());
      docs.unshift({ id, title: docTitle, sql_code: sql, created_at: stamp, updated_at: stamp });
      setDocId(id);
    }
    writeJSON(STORAGE.docs, docs);
  };

  const saveSiteDoc = async () => {
    if (!user || user.local) {
      setWorkspaceMessage("사이트 저장은 네이버 로그인이 필요합니다.");
      setPage("login");
      return;
    }
    try {
      const payload = { title: docTitle, sql_code: sql, description: explanation.summary || "" };
      const saved = docId && /^\d+$/.test(String(docId))
        ? await api.saveDoc(docId, payload)
        : await api.createDoc(payload);
      setDocId(saved.id);
      setWorkspaceMessage("사이트에 저장했습니다.");
      setShowSaveChoice(false);
    } catch (err) {
      setWorkspaceMessage(err.message);
    }
  };

  const saveToComputer = () => {
    downloadSql(docTitle, sql);
    setShowSaveChoice(false);
  };

  const loadDoc = doc => {
    setDocId(doc.id);
    setDocTitle(doc.title);
    setSql(doc.sql_code);
    setShowDocs(false);
    setActiveTab("result");
  };

  const loadSqlFile = event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSql(String(reader.result || ""));
      setDocTitle(file.name.replace(/\.(sql|txt)$/i, "") || "Imported SQL");
      setDocId(null);
      setShowLoadChoice(false);
      setActiveTab("result");
      event.target.value = "";
    };
    reader.readAsText(file, "utf-8");
  };

  const shareCurrentDoc = async ({ title, description, tags, isPublic }) => {
    if (!user || user.local) {
      setWorkspaceMessage("공유 등록은 네이버 로그인이 필요합니다.");
      setPage("login");
      return;
    }
    try {
      const shared = await api.createShared({
        document_id: docId,
        title,
        sql_code: sql,
        description,
        tags,
        schema: schemas.length ? schemas : schemasFromSql(sql),
        is_public: isPublic,
      });
      setShowShareModal(false);
      setWorkspaceMessage("공유 게시판에 등록했습니다.");
      onOpenShared(shared.id);
    } catch (err) {
      setWorkspaceMessage(err.message);
    }
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
        onRunCurrent={runCurrentSql}
        onSave={() => setShowSaveChoice(true)}
        onLoad={() => setShowLoadChoice(true)}
        onReset={resetWorkspace}
        onSchema={() => setActiveTab("schema")}
        onExamples={() => setShowExamples(true)}
        onClearResults={() => setOutputs([])}
        onShare={() => setShowShareModal(true)}
        onShortcuts={() => setShowShortcuts(true)}
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
            onMount={handleEditorMount}
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

      {workspaceMessage && <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 900, background: C.dark, color: "#fff", borderRadius: 8, padding: "10px 12px", fontSize: 12 }}>{workspaceMessage}</div>}
      <input ref={fileInputRef} type="file" accept=".sql,.txt,text/plain" onChange={loadSqlFile} style={{ display: "none" }} />
      <ExampleModal open={showExamples} onClose={() => setShowExamples(false)} onPick={item => { setSql(item.sql); setDocTitle(item.title); setShowExamples(false); }} />
      <DocsModal open={showDocs} onClose={() => setShowDocs(false)} onLoad={loadDoc} />
      <ChoiceModal
        open={showSaveChoice}
        title="어디에 저장할까요?"
        onClose={() => setShowSaveChoice(false)}
        choices={[
          ["사이트에 저장", "로그인 계정의 내 문서에 저장합니다.", saveSiteDoc],
          ["내 컴퓨터에 파일로 저장", `${fileNameFromTitle(docTitle)} 파일로 다운로드합니다.`, saveToComputer],
        ]}
      />
      <ChoiceModal
        open={showLoadChoice}
        title="어디에서 불러올까요?"
        onClose={() => setShowLoadChoice(false)}
        choices={[
          ["사이트 문서 불러오기", "로그인 계정에 저장된 문서 목록을 엽니다.", () => { setShowLoadChoice(false); setShowDocs(true); }],
          ["컴퓨터 파일 불러오기", ".sql 또는 .txt 파일을 에디터에 삽입합니다.", () => fileInputRef.current?.click()],
        ]}
      />
      <ShareModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        title={docTitle}
        defaultDescription={explanation.summary}
        onSubmit={shareCurrentDoc}
      />
      <ShortcutModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </main>
  );
}

function Toolbar({ dbReady, docTitle, setDocTitle, onRun, onRunCurrent, onSave, onLoad, onReset, onSchema, onExamples, onClearResults, onShare, onShortcuts, elapsed, rowCount, errorCount }) {
  return (
    <div style={{ height: 50, borderBottom: `1px solid ${C.line}`, background: C.panel, display: "flex", alignItems: "center", gap: 8, padding: "0 14px", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "thin" }}>
      <input
        value={docTitle}
        onChange={event => setDocTitle(event.target.value)}
        style={{ flex: "0 0 190px", width: 190, height: 30, border: `1px solid ${C.line}`, borderRadius: 7, padding: "0 10px", fontSize: 12, color: C.text, background: C.panelAlt, outline: "none" }}
      />
      <Button variant="primary" onClick={onRun} title="전체 SQL 실행 (F5)">▶ 전체 실행</Button>
      <Button onClick={onRunCurrent} title="커서가 있는 SQL 한 문장만 실행 (Ctrl+Enter)">현재 실행</Button>
      <Button onClick={onSave} title="사이트 저장 또는 .sql 파일 다운로드 (Ctrl+S)">💾 저장</Button>
      <Button onClick={onLoad} title="사이트 문서 또는 .sql/.txt 파일 불러오기 (Ctrl+O)">📂 불러오기</Button>
      <Button onClick={onClearResults} title="결과 패널 비우기">결과 지우기</Button>
      <Button onClick={onReset} title="에디터와 결과 초기화">🗑 초기화</Button>
      <Button onClick={onExamples} title="Oracle 기준 예제 SQL 삽입">📋 예제 삽입</Button>
      <Button onClick={onSchema} title="하단 구조 시각화 탭 열기">🗂 구조 보기</Button>
      <Button onClick={onShare} title="공유 게시판에 현재 SQL 등록">공유하기</Button>
      <Button onClick={onShortcuts} title="단축키 보기 (F1)">단축키</Button>
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
  if (!outputs.length) return <EmptyState title="아직 실행된 SQL이 없습니다" text="F5로 전체 SQL을 실행하거나 Ctrl+Enter로 현재 SQL 한 문장만 실행하세요." />;
  return (
    <div style={{ padding: 12, display: "grid", gap: 12 }}>
      {outputs.filter(out => out.type !== "error").map((out, idx) => (
        <div key={idx} style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 10px", background: C.panelAlt, borderBottom: `1px solid ${C.lineSoft}` }}>
            <b style={{ color: out.type === "table" ? C.accent : C.success, fontSize: 12 }}>{out.label}</b>
            <code style={{ color: C.muted, fontSize: 10 }}>{out.stmt.replace(/\s+/g, " ").slice(0, 90)}</code>
          </div>
          {out.type === "table" ? <TableResult data={out.data} /> : <div style={{ padding: 12, color: C.sub, fontSize: 12 }}>{out.note || "실행이 완료되었습니다."}</div>}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 7 }}>
            <h3 style={{ margin: 0, color: C.danger, fontSize: 13 }}>{out.err.title}</h3>
            {out.errorLine && <span style={{ flex: "0 0 auto", fontFamily: C.mono, fontSize: 11, fontWeight: 800, color: C.danger, background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 999, padding: "3px 8px" }}>line {out.errorLine}</span>}
          </div>
          {out.errorLine && (
            <div style={{ margin: "0 0 9px", display: "grid", gap: 5 }}>
              <div style={{ color: C.sub, fontSize: 12 }}>
                에러 위치: <b style={{ color: C.danger }}>{out.errorLine}번째 줄</b>
                {out.startLine && out.endLine && out.startLine !== out.endLine ? ` · 실행 문장 범위 ${out.startLine}-${out.endLine}줄` : ""}
              </div>
              {out.errorLineText && <code style={{ display: "block", whiteSpace: "pre-wrap", background: C.panel, border: "1px solid #fecaca", borderRadius: 7, padding: "8px 10px", color: C.text, fontFamily: C.mono, fontSize: 11 }}>{out.errorLineText}</code>}
            </div>
          )}
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

function Badge({ text, children, tone = "default" }) {
  const tones = {
    default: ["#f3f4f6", C.sub],
    accent: [C.accentSoft, C.accent],
    success: ["#ecfdf5", C.success],
    warn: ["#fffbeb", C.warn],
  };
  return <span style={{ background: tones[tone][0], color: tones[tone][1], borderRadius: 5, padding: "2px 5px", fontSize: 10, fontWeight: 800 }}>{text ?? children}</span>;
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
  const [docs, setDocs] = useState([]);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!open) return;
    if (!authStore.get()) {
      setDocs([]);
      setMessage("사이트 문서 불러오기는 로그인이 필요합니다.");
      return;
    }
    setMessage("문서를 불러오는 중입니다.");
    api.getDocs()
      .then(items => { setDocs(items); setMessage(""); })
      .catch(err => { setDocs([]); setMessage(err.message); });
  }, [open]);
  if (!open) return null;
  return (
    <Modal title="문서 불러오기" onClose={onClose}>
      {message && <p style={{ margin: "0 0 12px", color: C.muted, fontSize: 12 }}>{message}</p>}
      <ListEmpty show={!message && !docs.length} text="저장된 문서가 없습니다." />
      {docs.map(doc => <CompactAction key={doc.id} label={doc.title} sub={`${doc.author || "나"} · ${formatDate(doc.updated_at)}`} onClick={() => onLoad(doc)} />)}
    </Modal>
  );
}

function ChoiceModal({ open, title, onClose, choices }) {
  if (!open) return null;
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        {choices.map(([label, desc, action]) => (
          <button key={label} onClick={action} style={{ border: `1px solid ${C.line}`, background: C.panelAlt, borderRadius: 8, padding: 13, textAlign: "left", cursor: "pointer" }}>
            <b style={{ display: "block", fontSize: 13, color: C.text }}>{label}</b>
            <span style={{ display: "block", marginTop: 5, color: C.muted, fontSize: 12, lineHeight: 1.5 }}>{desc}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function ShortcutModal({ open, onClose }) {
  if (!open) return null;
  const rows = [
    ["F5", "전체 SQL 실행"],
    ["Ctrl/Cmd + Enter", "커서가 있는 SQL 한 문장만 실행"],
    ["Ctrl/Cmd + S", "저장 위치 선택"],
    ["Ctrl/Cmd + O", "불러오기 위치 선택"],
    ["F1", "단축키 안내 열기"],
  ];
  return (
    <Modal title="단축키" onClose={onClose}>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map(([key, desc]) => (
          <div key={key} style={{ display: "grid", gridTemplateColumns: "150px minmax(0, 1fr)", gap: 10, alignItems: "center", border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: "9px 10px", background: C.panelAlt }}>
            <code style={{ color: C.accent, fontWeight: 800, fontSize: 12 }}>{key}</code>
            <span style={{ color: C.sub, fontSize: 12 }}>{desc}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ShareModal({ open, onClose, title, defaultDescription, onSubmit }) {
  const [shareTitle, setShareTitle] = useState(title || "");
  const [description, setDescription] = useState(defaultDescription || "");
  const [tags, setTags] = useState("table, sql");
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    if (!open) return;
    setShareTitle(title || "");
    setDescription(defaultDescription || "");
  }, [open, title, defaultDescription]);

  if (!open) return null;
  return (
    <Modal title="공유하기" onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 5, color: C.sub, fontSize: 12 }}>
          제목
          <input value={shareTitle} onChange={event => setShareTitle(event.target.value)} style={{ height: 34, border: `1px solid ${C.line}`, borderRadius: 7, padding: "0 10px" }} />
        </label>
        <label style={{ display: "grid", gap: 5, color: C.sub, fontSize: 12 }}>
          설명
          <textarea value={description} onChange={event => setDescription(event.target.value)} rows={4} style={{ border: `1px solid ${C.line}`, borderRadius: 7, padding: 10, resize: "vertical" }} />
        </label>
        <label style={{ display: "grid", gap: 5, color: C.sub, fontSize: 12 }}>
          태그
          <input value={tags} onChange={event => setTags(event.target.value)} placeholder="join, erd, constraint" style={{ height: 34, border: `1px solid ${C.line}`, borderRadius: 7, padding: "0 10px" }} />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "center", color: C.sub, fontSize: 12 }}>
          <input type="checkbox" checked={isPublic} onChange={event => setIsPublic(event.target.checked)} />
          공유 게시판에 공개
        </label>
        <Button variant="primary" onClick={() => onSubmit({ title: shareTitle, description, tags: parseTags(tags), isPublic })}>공유 등록</Button>
      </div>
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

function DocsPage({ user, setPage, loadExample, onOpenShared }) {
  const [docs, setDocs] = useState([]);
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    if (!user || user.local) {
      setDocs([]);
      setMessage("사이트 저장 문서는 네이버 로그인 후 사용할 수 있습니다.");
      return;
    }
    setMessage("문서를 불러오는 중입니다.");
    api.getDocs()
      .then(items => { setDocs(items); setMessage(""); })
      .catch(err => { setDocs([]); setMessage(err.message); });
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const renameDoc = async doc => {
    const title = window.prompt("문서 제목", doc.title);
    if (!title || title === doc.title) return;
    try {
      await api.saveDoc(doc.id, { title });
      refresh();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const removeDoc = async id => {
    if (!window.confirm("문서를 삭제할까요?")) return;
    try {
      await api.deleteDoc(id);
      refresh();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const shareDoc = async doc => {
    const description = window.prompt("공유 설명", doc.description || doc.memo || "");
    if (description === null) return;
    try {
      const shared = await api.createShared({
        document_id: doc.id,
        title: doc.title,
        sql_code: doc.sql_code,
        description,
        tags: doc.tags || [],
        schema: schemasFromSql(doc.sql_code),
        is_public: true,
      });
      onOpenShared(shared.id);
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: 24, display: "grid", gap: 14 }}>
      <Panel title="내 문서" action={<Button onClick={refresh}>새로고침</Button>}>
        {message && <p style={{ margin: "0 0 12px", color: C.muted, fontSize: 12 }}>{message}</p>}
        <ListEmpty show={!message && !docs.length} text="저장된 문서가 없습니다." />
        {docs.map(doc => (
          <div key={doc.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, alignItems: "center", border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: 12, marginBottom: 8, background: C.panelAlt }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b style={{ color: C.text, fontSize: 13 }}>{doc.title}</b>
                <Badge text={doc.is_public ? "PUBLIC" : "PRIVATE"} tone={doc.is_public ? "success" : "default"} />
              </div>
              <div style={{ color: C.muted, fontSize: 11, marginTop: 5 }}>작성자 {doc.author || currentName(user)} · 마지막 수정 {formatDate(doc.updated_at)}</div>
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button variant="primary" onClick={() => { loadExample({ title: doc.title, sql: doc.sql_code, docId: doc.id }); setPage("editor"); }}>열기</Button>
              <Button onClick={() => renameDoc(doc)}>제목 수정</Button>
              <Button onClick={() => downloadSql(doc.title, doc.sql_code)}>다운로드</Button>
              <Button onClick={() => shareDoc(doc)}>공유</Button>
              <Button variant="danger" onClick={() => removeDoc(doc.id)}>삭제</Button>
            </div>
          </div>
        ))}
      </Panel>
    </main>
  );
}

function SharedBoard({ onOpenShared }) {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState("latest");
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    setMessage("공유 문서를 불러오는 중입니다.");
    api.getShared({ q: query, tag, sort })
      .then(data => { setItems(data); setMessage(""); })
      .catch(err => { setItems([]); setMessage(err.message); });
  }, [query, tag, sort]);

  useEffect(() => { refresh(); }, [refresh]);

  const tags = useMemo(() => {
    const all = items.flatMap(item => item.tags || []);
    return [...new Set(all)].slice(0, 12);
  }, [items]);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 46px", display: "grid", gap: 16 }}>
      <section style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>공유 게시판</h1>
          <p style={{ margin: "8px 0 0", color: C.sub, fontSize: 13 }}>다른 사용자의 SQL 문서와 테이블 설계를 참고하고 토론합니다.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="제목, 설명, SQL 검색" style={{ width: 240, height: 34, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 11px", outline: "none" }} />
          <select value={sort} onChange={event => setSort(event.target.value)} style={{ height: 34, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 10px", background: C.panel }}>
            <option value="latest">최신순</option>
            <option value="popular">인기순</option>
          </select>
          <Button onClick={refresh}>검색</Button>
        </div>
      </section>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setTag("")} style={{ border: `1px solid ${C.line}`, background: !tag ? C.dark : C.panel, color: !tag ? "#fff" : C.sub, borderRadius: 999, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>전체</button>
        {tags.map(item => <button key={item} onClick={() => setTag(item)} style={{ border: `1px solid ${C.line}`, background: tag === item ? C.dark : C.panel, color: tag === item ? "#fff" : C.sub, borderRadius: 999, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>{item}</button>)}
      </div>

      <Panel title="공개 SQL 문서">
        {message && <p style={{ margin: "0 0 12px", color: C.muted, fontSize: 12 }}>{message}</p>}
        <ListEmpty show={!message && !items.length} text="공유된 문서가 없습니다." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12 }}>
          {items.map(item => (
            <button key={item.id} onClick={() => onOpenShared(item.id)} style={{ border: `1px solid ${C.lineSoft}`, background: C.panelAlt, borderRadius: 9, padding: 14, textAlign: "left", cursor: "pointer", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <b style={{ color: C.text, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</b>
                <span style={{ color: C.muted, fontSize: 11, whiteSpace: "nowrap" }}>{formatDate(item.created_at)}</span>
              </div>
              <p style={{ margin: 0, color: C.sub, fontSize: 12, lineHeight: 1.5, minHeight: 36 }}>{item.description || "설명이 없습니다."}</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(item.tags || []).map(t => <Badge key={t} text={t} tone="accent" />)}</div>
              <div style={{ display: "flex", justifyContent: "space-between", color: C.muted, fontSize: 11 }}>
                <span>{item.author}</span>
                <span>조회 {item.view_count || 0} · 좋아요 {item.like_count || 0} · 댓글 {item.comments_count || 0}</span>
              </div>
            </button>
          ))}
        </div>
      </Panel>
    </main>
  );
}

function SharedDetail({ id, user, setPage, loadExample }) {
  const [doc, setDoc] = useState(null);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(() => {
    if (!id) return;
    setMessage("공유 문서를 불러오는 중입니다.");
    Promise.all([api.getSharedDoc(id), api.getComments(id)])
      .then(([detail, nextComments]) => {
        setDoc(detail);
        setComments(nextComments);
        setMessage("");
      })
      .catch(err => setMessage(err.message));
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  const copyToWorkspace = async () => {
    if (!doc) return;
    if (user && !user.local) {
      try { await api.copyShared(doc.id); }
      catch { /* copying to the editor still works without server copy */ }
    }
    loadExample({ title: doc.title, sql: doc.sql_code });
    setPage("editor");
  };

  const addComment = async () => {
    if (!user || user.local) {
      setMessage("댓글 작성은 네이버 로그인이 필요합니다.");
      return;
    }
    if (!comment.trim()) return;
    try {
      await api.createComment(id, comment);
      setComment("");
      refresh();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const removeComment = async commentId => {
    try {
      await api.deleteComment(commentId);
      refresh();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const schemas = doc?.schema?.length ? doc.schema : schemasFromSql(doc?.sql_code || "");

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 46px", display: "grid", gap: 16 }}>
      <Button onClick={() => setPage("shared")} style={{ justifySelf: "start" }}>공유 게시판으로</Button>
      {message && <p style={{ margin: 0, color: C.warn, fontSize: 12 }}>{message}</p>}
      {doc && (
        <>
          <Panel title={doc.title} action={<Button variant="primary" onClick={copyToWorkspace}>내 작업공간으로 복사</Button>}>
            <p style={{ margin: "0 0 12px", color: C.sub, fontSize: 13, lineHeight: 1.6 }}>{doc.description || "설명이 없습니다."}</p>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 12 }}>
              {(doc.tags || []).map(t => <Badge key={t} text={t} tone="accent" />)}
              <span style={{ color: C.muted, fontSize: 11 }}>작성자 {doc.author} · 조회 {doc.view_count || 0} · 좋아요 {doc.like_count || 0}</span>
            </div>
            <pre style={{ margin: 0, padding: 14, background: C.dark, color: "#e5e7eb", borderRadius: 8, overflow: "auto", fontFamily: C.mono, fontSize: 12, lineHeight: 1.65 }}>{doc.sql_code}</pre>
          </Panel>
          <Panel title="테이블 구조 시각화">
            <SchemaView schemas={schemas} />
          </Panel>
          <Panel title={`댓글 ${comments.length}`}>
            <div style={{ display: "grid", gap: 10 }}>
              {comments.map(item => (
                <div key={item.id} style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: 11, background: C.panelAlt }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                    <b style={{ fontSize: 12 }}>{item.author}</b>
                    <span style={{ color: C.muted, fontSize: 11 }}>{formatDate(item.updated_at)}</span>
                  </div>
                  <p style={{ margin: 0, color: C.sub, fontSize: 12, lineHeight: 1.6 }}>{item.content}</p>
                  {user?.id === item.user_id && <Button variant="ghost" onClick={() => removeComment(item.id)} style={{ marginTop: 6 }}>삭제</Button>}
                </div>
              ))}
              <textarea value={comment} onChange={event => setComment(event.target.value)} rows={3} placeholder={user && !user.local ? "의견을 남겨보세요." : "댓글 작성은 로그인이 필요합니다."} style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: 10, resize: "vertical" }} />
              <Button variant="primary" onClick={addComment} disabled={!user || user.local}>댓글 작성</Button>
            </div>
          </Panel>
        </>
      )}
    </main>
  );
}

function MyPage({ user, onUserUpdate }) {
  const [displayName, setDisplayName] = useState(currentName(user));
  const [message, setMessage] = useState("");

  useEffect(() => setDisplayName(currentName(user)), [user]);

  const save = async () => {
    try {
      const result = await api.updateDisplayName(displayName);
      authStore.save(result.token);
      onUserUpdate(result.user);
      setMessage("표시 이름을 저장했습니다.");
    } catch (err) {
      setMessage(err.message);
    }
  };

  if (!user || user.local) {
    return <main style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}><Panel title="마이페이지"><ListEmpty show text="네이버 로그인 후 사용할 수 있습니다." /></Panel></main>;
  }

  return (
    <main style={{ maxWidth: 620, margin: "0 auto", padding: 24, display: "grid", gap: 14 }}>
      <Panel title="마이페이지">
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "grid", gap: 5, color: C.sub, fontSize: 12 }}>
            표시 이름
            <input value={displayName} onChange={event => setDisplayName(event.target.value)} style={{ height: 36, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 11px" }} />
          </label>
          <div style={{ color: C.muted, fontSize: 12 }}>네이버 이메일은 내부 식별용으로만 사용됩니다. {user.email || ""}</div>
          <Button variant="primary" onClick={save} style={{ justifySelf: "start" }}>저장</Button>
          {message && <p style={{ margin: 0, color: C.warn, fontSize: 12 }}>{message}</p>}
        </div>
      </Panel>
    </main>
  );
}

function DisplayNameSetup({ user, onComplete }) {
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");

  const save = async () => {
    try {
      const result = await api.updateDisplayName(displayName);
      authStore.save(result.token);
      onComplete(result.user);
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 20 }}>
      <Panel title="표시 이름 설정">
        <p style={{ margin: "0 0 14px", color: C.sub, fontSize: 13, lineHeight: 1.6 }}>SQLVisual에서 사용할 이름을 정해주세요. 게시판, 문서 작성자명, 상단바에 이 이름이 표시됩니다.</p>
        <input value={displayName} onChange={event => setDisplayName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") save(); }} placeholder="예: Jiwon" style={{ width: "100%", height: 36, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 11px", marginBottom: 10 }} />
        <Button variant="primary" onClick={save} style={{ width: "100%" }}>시작하기</Button>
        {message && <p style={{ margin: "12px 0 0", color: C.warn, fontSize: 12 }}>{message}</p>}
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

function getVisualizerSampleDoc() {
  const sample = EXAMPLES.find(item => item.id === "fk") || EXAMPLES[0];
  return toVisualizerDoc({ id: "sample-schema", title: sample.title, sql_code: sample.sql, updated_at: new Date().toISOString() }, "sample");
}

function relationListFromSchemas(schemas) {
  return schemas.flatMap(schema => (schema.foreignKeys || []).map(fk => ({
    fromTable: schema.tableName,
    fromColumn: fk.column,
    toTable: fk.refTable,
    toColumn: fk.refColumn,
  })));
}

function firstStatement(sql, pattern) {
  return splitStatements(sql || "").find(stmt => pattern.test(stmt)) || "";
}

function buildQueryFlow(sql, schemas) {
  const select = firstStatement(sql, /^SELECT\b/i);
  if (!select) {
    return [
      ["CREATE TABLE", schemas.length ? `${schemas.map(s => s.tableName).join(", ")} 테이블 구조를 읽습니다.` : "CREATE TABLE 문을 찾지 못했습니다.", Boolean(schemas.length)],
      ["COLUMN", schemas.length ? "컬럼, 타입, 기본키, 외래키를 분리합니다." : "시각화할 컬럼 정보가 없습니다.", Boolean(schemas.length)],
      ["RELATION", relationListFromSchemas(schemas).length ? "FOREIGN KEY 관계선을 구성합니다." : "외래키 관계가 없거나 아직 정의되지 않았습니다.", relationListFromSchemas(schemas).length > 0],
      ["VISUALIZE", schemas.length ? "테이블 카드와 관계 목록으로 표시합니다." : "문서에 CREATE TABLE을 추가하면 바로 표시됩니다.", Boolean(schemas.length)],
    ];
  }

  const compact = select.replace(/\s+/g, " ");
  const from = compact.match(/\bFROM\s+([A-Za-z_][\w$#]*)/i)?.[1];
  const joins = extractJoins(select);
  const where = compact.match(/\bWHERE\s+(.+?)(?:\bGROUP\s+BY|\bHAVING|\bORDER\s+BY|\bLIMIT|$)/i)?.[1]?.trim();
  const group = compact.match(/\bGROUP\s+BY\s+(.+?)(?:\bHAVING|\bORDER\s+BY|\bLIMIT|$)/i)?.[1]?.trim();
  const having = compact.match(/\bHAVING\s+(.+?)(?:\bORDER\s+BY|\bLIMIT|$)/i)?.[1]?.trim();
  const order = compact.match(/\bORDER\s+BY\s+(.+?)(?:\bLIMIT|$)/i)?.[1]?.trim();
  return [
    ["FROM", from ? `${from} 테이블에서 시작합니다.` : "조회 기준 테이블을 찾지 못했습니다.", Boolean(from)],
    ["JOIN", joins.length ? `${joins.map(join => join.table).join(", ")} 테이블을 연결합니다.` : "JOIN 없이 단일 테이블을 조회합니다.", joins.length > 0],
    ["WHERE", where ? `${where} 조건에 맞는 행만 남깁니다.` : "WHERE 조건이 없어 모든 행을 유지합니다.", Boolean(where)],
    ["GROUP BY", group ? `${group} 기준으로 그룹화합니다.` : "그룹화 없이 행 단위로 처리합니다.", Boolean(group)],
    ["HAVING", having ? `${having} 조건으로 그룹 결과를 필터링합니다.` : "그룹 조건은 사용하지 않습니다.", Boolean(having)],
    ["SELECT", "필요한 컬럼과 계산 결과를 최종 결과로 만듭니다.", true],
    ["ORDER BY", order ? `${order} 기준으로 정렬합니다.` : "정렬 조건 없이 DB 기본 순서로 반환됩니다.", Boolean(order)],
  ];
}

function extractJoins(sql) {
  const joins = [];
  const re = /\b((?:INNER|LEFT|RIGHT|FULL|CROSS)\s+(?:OUTER\s+)?|(?:LEFT|RIGHT|FULL)\s+OUTER\s+)?JOIN\s+([A-Za-z_][\w$#]*)(?:\s+[A-Za-z_][\w$#]*)?(?:\s+ON\s+([^\n;]+?)(?=\b(?:INNER|LEFT|RIGHT|FULL|CROSS)?\s*(?:OUTER\s+)?JOIN\b|\bWHERE\b|\bGROUP\b|\bHAVING\b|\bORDER\b|\bLIMIT\b|$))?/gi;
  let match;
  while ((match = re.exec(sql || ""))) {
    joins.push({
      type: `${(match[1] || "INNER ").trim()} JOIN`.replace(/\s+/g, " "),
      table: match[2],
      condition: (match[3] || "").trim(),
    });
  }
  return joins;
}

function constraintSummary(schemas) {
  return schemas.map(schema => {
    const columns = schema.columns || [];
    return {
      tableName: schema.tableName,
      pk: columns.filter(col => col.pk).map(col => col.name),
      fk: columns.filter(col => col.fk).map(col => `${col.name} → ${col.refTable}.${col.refColumn}`),
      notNull: columns.filter(col => col.notNull && !col.pk).map(col => col.name),
      unique: columns.filter(col => col.unique && !col.pk).map(col => col.name),
      check: columns.filter(col => col.check).map(col => `${col.name}: ${col.check}`),
    };
  });
}

function VisualizerPage({ loadExample, user }) {
  const [mode, setMode] = useState("erd");
  const [docs, setDocs] = useState(() => mergeVisualizerDocs(localVisualizerDocs(), [getVisualizerSampleDoc()]));
  const [selectedId, setSelectedId] = useState(() => docs[0]?.id || "");
  const [message, setMessage] = useState("");
  const modes = [
    ["erd", "ERD"],
    ["flow", "쿼리 흐름"],
    ["join", "JOIN 그림"],
    ["constraint", "제약조건"],
  ];

  const refreshDocs = useCallback(() => {
    const localDocs = localVisualizerDocs();
    const sample = getVisualizerSampleDoc();
    if (!user || user.local) {
      setDocs(mergeVisualizerDocs(localDocs, [sample]));
      setMessage("");
      return;
    }
    setMessage("사이트 문서를 불러오는 중입니다.");
    api.getDocs()
      .then(siteDocs => {
        setDocs(mergeVisualizerDocs(localDocs, siteDocs.map(doc => toVisualizerDoc(doc, "site")), [sample]));
        setMessage("");
      })
      .catch(err => {
        setDocs(mergeVisualizerDocs(localDocs, [sample]));
        setMessage(err.message);
      });
  }, [user]);

  useEffect(() => { refreshDocs(); }, [refreshDocs]);

  useEffect(() => {
    if (!selectedId || !docs.some(doc => doc.id === selectedId)) {
      setSelectedId(docs[0]?.id || "");
    }
  }, [docs, selectedId]);

  const selectedDoc = docs.find(doc => doc.id === selectedId) || docs[0] || getVisualizerSampleDoc();
  const schemas = useMemo(() => schemasFromSql(selectedDoc?.sql_code || ""), [selectedDoc]);
  const relations = useMemo(() => relationListFromSchemas(schemas), [schemas]);
  const sqlPreview = selectedDoc?.sql_code || "";

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

      <Panel
        title="시각화할 문서"
        action={<Button onClick={refreshDocs}>새로고침</Button>}
      >
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 10, alignItems: "center" }}>
          <select value={selectedDoc?.id || ""} onChange={event => setSelectedId(event.target.value)} style={{ height: 36, border: `1px solid ${C.line}`, borderRadius: 8, padding: "0 11px", background: C.panel, color: C.text, outline: "none" }}>
            {docs.map(doc => (
              <option key={doc.id} value={doc.id}>{doc.sourceLabel} · {doc.title}</option>
            ))}
          </select>
          <Button
            variant="primary"
            onClick={() => loadExample({ title: selectedDoc.title, sql: selectedDoc.sql_code, docId: selectedDoc.docId })}
          >
            SQL 작성에서 열기
          </Button>
        </div>
        <div style={{ marginTop: 10, display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", color: C.muted, fontSize: 12 }}>
          <Badge text={selectedDoc.sourceLabel} tone={selectedDoc.source === "site" ? "success" : "accent"} />
          <span>{schemas.length} tables</span>
          <span>{relations.length} relations</span>
          <span>마지막 수정 {formatDate(selectedDoc.updated_at)}</span>
          {message && <span style={{ color: C.warn }}>{message}</span>}
        </div>
      </Panel>

      {mode === "erd" && <ErdVisual loadExample={loadExample} selectedDoc={selectedDoc} schemas={schemas} relations={relations} />}
      {mode === "flow" && <QueryFlowVisual loadExample={loadExample} selectedDoc={selectedDoc} sql={sqlPreview} schemas={schemas} />}
      {mode === "join" && <JoinVisual loadExample={loadExample} selectedDoc={selectedDoc} sql={sqlPreview} />}
      {mode === "constraint" && <ConstraintVisual loadExample={loadExample} selectedDoc={selectedDoc} schemas={schemas} />}
    </main>
  );
}

function ErdVisual({ loadExample, selectedDoc, schemas, relations }) {
  if (!schemas.length) {
    return (
      <Panel title="ERD">
        <EmptyState title="테이블 구조가 없습니다" text="선택한 문서에 CREATE TABLE 문이 있으면 ERD가 바로 표시됩니다." />
        <Button onClick={() => loadExample(EXAMPLES.find(item => item.id === "fk"))}>FOREIGN KEY 예제로 열기</Button>
      </Panel>
    );
  }

  return (
    <Panel title={`ERD · ${selectedDoc.title}`}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(240px, .36fr)", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12, alignItems: "start" }}>
          {schemas.map(schema => <SchemaCard key={schema.tableName} schema={schema} />)}
        </div>
        <div style={{ border: `1px solid ${C.lineSoft}`, borderRadius: 9, background: C.panelAlt, padding: 12, minHeight: 160 }}>
          <b style={{ display: "block", marginBottom: 9, fontSize: 12, color: C.text }}>관계</b>
          <ListEmpty show={!relations.length} text="FOREIGN KEY 관계가 없습니다." />
          {relations.map(rel => (
            <div key={`${rel.fromTable}.${rel.fromColumn}`} style={{ border: `1px solid ${C.line}`, borderRadius: 8, background: C.panel, padding: "9px 10px", marginBottom: 8 }}>
              <code style={{ color: C.accent, fontSize: 12 }}>{rel.fromTable}.{rel.fromColumn}</code>
              <div style={{ color: C.muted, fontSize: 11, margin: "4px 0" }}>references</div>
              <code style={{ color: C.success, fontSize: 12 }}>{rel.toTable}.{rel.toColumn}</code>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", color: C.sub, fontSize: 12 }}>
        <span>{selectedDoc.title} 문서의 CREATE TABLE 구조를 기준으로 표시합니다.</span>
        <Button onClick={() => loadExample({ title: selectedDoc.title, sql: selectedDoc.sql_code, docId: selectedDoc.docId })}>SQL 작성에서 열기</Button>
      </div>
    </Panel>
  );
}

function SchemaCard({ schema }) {
  return (
    <section style={{ border: `1px solid ${C.darkLine}`, borderRadius: 9, overflow: "hidden", background: C.panel }}>
      <div style={{ background: C.dark, color: "#fff", padding: "10px 12px", fontFamily: C.mono, fontSize: 13, fontWeight: 800, display: "flex", justifyContent: "space-between" }}>
        <span>{schema.tableName}</span>
        <span style={{ color: "#cbd5e1", fontSize: 11 }}>{schema.columns.length} cols</span>
      </div>
      {schema.columns.map(col => (
        <div key={col.name} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, padding: "9px 12px", borderTop: `1px solid ${C.lineSoft}`, alignItems: "center" }}>
          <span style={{ fontFamily: C.mono, fontSize: 12, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
            {col.name} <em style={{ color: C.muted, fontStyle: "normal" }}>{col.type}</em>
          </span>
          <span style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {col.pk && <Badge tone="warn">PK</Badge>}
            {col.fk && <Badge tone="accent">FK</Badge>}
            {col.notNull && !col.pk && <Badge>NN</Badge>}
            {col.unique && !col.pk && <Badge tone="success">UQ</Badge>}
            {col.check && <Badge tone="success">CHECK</Badge>}
          </span>
        </div>
      ))}
    </section>
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

function QueryFlowVisual({ loadExample, selectedDoc, sql, schemas }) {
  const flow = buildQueryFlow(sql, schemas);
  return (
    <Panel title={`쿼리 흐름 · ${selectedDoc.title}`}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        {flow.map(([label, desc, active], idx) => (
          <div key={label} style={{ border: `1px solid ${active ? C.line : C.lineSoft}`, background: active ? C.panelAlt : "#f3f4f6", borderRadius: 9, padding: 13, minHeight: 98, opacity: active ? 1 : .68 }}>
            <span style={{ fontFamily: C.mono, color: C.accent, fontSize: 11, fontWeight: 900 }}>{String(idx + 1).padStart(2, "0")}</span>
            <strong style={{ display: "block", marginTop: 8, fontFamily: C.mono, fontSize: 14 }}>{label}</strong>
            <p style={{ margin: "7px 0 0", color: C.sub, fontSize: 12, lineHeight: 1.45 }}>{desc}</p>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: 14, border: `1px solid ${C.lineSoft}`, borderRadius: 9, background: "#fbfdff" }}>
        <code style={{ whiteSpace: "pre-wrap", fontFamily: C.mono, color: C.text, fontSize: 12 }}>{firstStatement(sql, /^SELECT\b/i) || firstSqlLine(sql)}</code>
      </div>
      <Button onClick={() => loadExample({ title: selectedDoc.title, sql: selectedDoc.sql_code, docId: selectedDoc.docId })} style={{ marginTop: 12 }}>SQL 작성에서 열기</Button>
    </Panel>
  );
}

function JoinVisual({ loadExample, selectedDoc, sql }) {
  const joins = extractJoins(sql);
  return (
    <Panel title={`JOIN 그림 · ${selectedDoc.title}`}>
      {joins.length > 0 && (
        <div style={{ marginBottom: 12, display: "grid", gap: 8 }}>
          {joins.map((join, idx) => (
            <div key={`${join.table}-${idx}`} style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 10, alignItems: "center", border: `1px solid ${C.lineSoft}`, borderRadius: 8, padding: 10, background: C.panelAlt }}>
              <Badge tone="accent">{join.type}</Badge>
              <span style={{ color: C.sub, fontSize: 12 }}>
                <b style={{ color: C.text }}>{join.table}</b>{join.condition ? ` · ON ${join.condition}` : ""}
              </span>
            </div>
          ))}
        </div>
      )}
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
      <Button onClick={() => loadExample({ title: selectedDoc.title, sql: selectedDoc.sql_code, docId: selectedDoc.docId })} style={{ marginTop: 12 }}>SQL 작성에서 열기</Button>
    </Panel>
  );
}

function ConstraintVisual({ loadExample, selectedDoc, schemas }) {
  const summary = constraintSummary(schemas);
  const hasSchema = summary.length > 0;
  return (
    <Panel title={`제약조건 · ${selectedDoc.title}`}>
      {hasSchema ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10 }}>
          {summary.map(item => (
            <div key={item.tableName} style={{ border: `1px solid ${C.line}`, borderRadius: 9, background: C.panelAlt, padding: 12 }}>
              <b style={{ fontFamily: C.mono, fontSize: 13 }}>{item.tableName}</b>
              {[
                ["PRIMARY KEY", item.pk, "warn"],
                ["FOREIGN KEY", item.fk, "accent"],
                ["NOT NULL", item.notNull, "default"],
                ["UNIQUE", item.unique, "success"],
                ["CHECK", item.check, "success"],
              ].map(([label, values, tone]) => (
                <div key={label} style={{ marginTop: 9, display: "grid", gap: 4 }}>
                  <Badge tone={tone}>{label}</Badge>
                  <span style={{ color: values.length ? C.sub : C.muted, fontSize: 12, lineHeight: 1.5 }}>{values.length ? values.join(", ") : "없음"}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
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
      )}
      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={() => loadExample({ title: selectedDoc.title, sql: selectedDoc.sql_code, docId: selectedDoc.docId })}>SQL 작성에서 열기</Button>
        <Button onClick={() => loadExample(EXAMPLES.find(item => item.id === "check"))}>CHECK 예제</Button>
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
      setMessage("백엔드 API 연결이 필요합니다.");
      return;
    }
    if (apiStatus === "offline" || apiStatus === "checking") {
      setMessage("백엔드 서버에 연결할 수 없습니다.");
      return;
    }
    if (apiStatus === "missing-oauth") {
      setMessage("네이버 로그인 설정이 필요합니다.");
      return;
    }
    try {
      const returnTo = new URL(import.meta.env.BASE_URL || "/", window.location.origin).toString();
      const { url } = await api.naverLoginUrl({
        returnTo,
        authType: "reauthenticate",
      });
      window.location.href = url;
    } catch (err) {
      setMessage(err.message);
    }
  };

  return (
    <main style={{ maxWidth: 420, margin: "60px auto", padding: 20 }}>
      <Panel title="로그인">
        <Button variant="primary" onClick={naverLogin} disabled={apiStatus !== "online"} style={{ width: "100%" }}>네이버 로그인</Button>
        <Button onClick={() => onLogin(LOCAL_USER)} style={{ width: "100%", marginTop: 8 }}>체험 모드로 계속</Button>
        {message && <p style={{ margin: "12px 0 0", color: C.warn, fontSize: 12, lineHeight: 1.5 }}>{message}</p>}
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

const RESTORABLE_PAGES = new Set(["home", "editor", "visualizer", "concepts", "docs", "shared", "mypage"]);

function initialPage() {
  const saved = readJSON(STORAGE.page, "");
  if (RESTORABLE_PAGES.has(saved)) return saved;
  return getWorkspaceDraft() ? "editor" : "home";
}

export default function App() {
  const [page, setPage] = useState(initialPage);
  const [incomingSql, setIncomingSql] = useState(null);
  const [user, setUser] = useState(() => authStore.getUser() || readJSON(STORAGE.user, null));
  const [authMessage, setAuthMessage] = useState("");
  const [sharedDetailId, setSharedDetailId] = useState(null);

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
    if (RESTORABLE_PAGES.has(page)) writeJSON(STORAGE.page, page);
  }, [page]);

  useEffect(() => {
    if (authStore.get()) {
      api.me()
        .then(nextUser => {
          setUser(nextUser);
          writeJSON(STORAGE.user, nextUser);
          if (nextUser.needs_display_name) setPage("display-name");
        })
        .catch(() => {});
    }
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    const error = params.get("error");
    if (token) {
      authStore.save(token);
      const nextUser = authStore.getUser();
      setUser(nextUser);
      writeJSON(STORAGE.user, nextUser);
      setPage(nextUser?.needs_display_name ? "display-name" : "editor");
      api.me()
        .then(fullUser => {
          setUser(fullUser);
          writeJSON(STORAGE.user, fullUser);
          if (fullUser.needs_display_name) setPage("display-name");
        })
        .catch(() => {});
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
    setIncomingSql({ id: Date.now(), title: item.title, sql: item.sql, docId: item.docId || null });
    setPage("editor");
  };

  const openShared = id => {
    setSharedDetailId(id);
    setPage("shared-detail");
  };

  const handleLogin = nextUser => {
    setUser(nextUser);
    writeJSON(STORAGE.user, nextUser);
    setPage(nextUser?.needs_display_name ? "display-name" : "editor");
  };

  const handleUserUpdate = nextUser => {
    setUser(nextUser);
    writeJSON(STORAGE.user, nextUser);
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
      {page === "editor" && <Workspace initialRequest={incomingSql} user={user} setPage={setPage} onOpenShared={openShared} />}
      {page === "visualizer" && <VisualizerPage loadExample={loadExample} user={user} />}
      {page === "concepts" && <ConceptsPage loadExample={loadExample} />}
      {page === "docs" && <DocsPage user={user} setPage={setPage} loadExample={loadExample} onOpenShared={openShared} />}
      {page === "shared" && <SharedBoard onOpenShared={openShared} />}
      {page === "shared-detail" && <SharedDetail id={sharedDetailId} user={user} setPage={setPage} loadExample={loadExample} />}
      {page === "mypage" && <MyPage user={user} onUserUpdate={handleUserUpdate} />}
      {page === "display-name" && <DisplayNameSetup user={user} onComplete={nextUser => { handleUserUpdate(nextUser); setPage("editor"); }} />}
      {page === "login" && <LoginPage onLogin={handleLogin} authMessage={authMessage} />}
    </div>
  );
}
