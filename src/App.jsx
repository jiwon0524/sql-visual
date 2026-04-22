import { useState, useRef } from "react";

const C = {
  bg:"#f8f9fb", surface:"#ffffff", border:"#e2e8f0", accent:"#2563eb", accentBg:"#eff6ff",
  gold:"#b45309", goldBg:"#fffbeb", green:"#15803d", greenBg:"#f0fdf4",
  red:"#dc2626", redBg:"#fef2f2",
  text:"#0f172a", textSub:"#475569", muted:"#94a3b8",
  mono:"'JetBrains Mono','Fira Code','Courier New',monospace",
  sans:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",
};

function tokenizeValues(raw){const vals=[];let cur="",inStr=false,sc="";for(let i=0;i<raw.length;i++){const ch=raw[i];if(!inStr&&(ch==="'"||ch==='"')){inStr=true;sc=ch;cur+=ch;}else if(inStr&&ch===sc){inStr=false;cur+=ch;}else if(!inStr&&ch===","){vals.push(cur.trim());cur="";}else{cur+=ch;}}if(cur.trim()!=="")vals.push(cur.trim());return vals.map(s=>{if(s.toUpperCase()==="NULL")return null;if((s.startsWith("'")&&s.endsWith("'"))||(s.startsWith('"')&&s.endsWith('"')))return s.slice(1,-1);const n=Number(s);return isNaN(n)?s:n;});}

function splitStatements(sql){const stmts=[];let cur="",inStr=false,sc="";for(let i=0;i<sql.length;i++){const ch=sql[i];if(!inStr&&(ch==="'"||ch==='"')){inStr=true;sc=ch;cur+=ch;}else if(inStr&&ch===sc){inStr=false;cur+=ch;}else if(!inStr&&ch===";"){const s=cur.trim();if(s)stmts.push(s);cur="";}else{cur+=ch;}}const last=cur.trim();if(last&&!last.startsWith("--"))stmts.push(last);return stmts;}

function splitCols(body){const parts=[];let depth=0,cur="",inStr=false,sc="";for(const ch of body){if(!inStr&&(ch==="'"||ch==='"')){inStr=true;sc=ch;cur+=ch;}else if(inStr&&ch===sc){inStr=false;cur+=ch;}else if(!inStr&&ch==="("){depth++;cur+=ch;}else if(!inStr&&ch===")"){depth--;cur+=ch;}else if(!inStr&&ch===","&&depth===0){parts.push(cur);cur="";}else{cur+=ch;}}if(cur.trim())parts.push(cur);return parts;}

function parseCreate(sql){try{const nm=sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/i);if(!nm)return null;const tableName=nm[1];const body=sql.slice(sql.indexOf("(")+1,sql.lastIndexOf(")"));const lines=splitCols(body);const columns=[];const foreignKeys=[];let tablePKs=[];for(const line of lines){const t=line.trim();if(!t)continue;const up=t.toUpperCase().trimStart();if(up.startsWith("PRIMARY KEY")){const m=t.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);if(m)tablePKs=m[1].split(",").map(s=>s.trim().toLowerCase());continue;}if(up.startsWith("FOREIGN KEY")){const m=t.match(/FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s+REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/i);if(m)foreignKeys.push({column:m[1],refTable:m[2],refColumn:m[3]});continue;}if(up.startsWith("UNIQUE ")||up.startsWith("UNIQUE(")||up.startsWith("CHECK")||up.startsWith("INDEX")||up.startsWith("KEY "))continue;const cm=t.match(/^(\w+)\s+(\w+(?:\s*\([^)]*\))?)([\s\S]*)$/i);if(!cm)continue;const[,colName,colType,rest]=cm;const ru=rest.toUpperCase();columns.push({name:colName,type:colType.toUpperCase().replace(/\s+/g,""),pk:ru.includes("PRIMARY KEY"),notNull:ru.includes("NOT NULL")||ru.includes("PRIMARY KEY"),unique:ru.includes("UNIQUE"),fk:false,refTable:null,refColumn:null,default:(()=>{const m=rest.match(/DEFAULT\s+(\S+)/i);return m?m[1]:null;})(),check:(()=>{const m=rest.match(/CHECK\s*\(([^)]+)\)/i);return m?m[1]:null;})(),});}tablePKs.forEach(pk=>{const col=columns.find(c=>c.name.toLowerCase()===pk);if(col){col.pk=true;col.notNull=true;}});foreignKeys.forEach(fk=>{const col=columns.find(c=>c.name.toLowerCase()===fk.column.toLowerCase());if(col){col.fk=true;col.refTable=fk.refTable;col.refColumn=fk.refColumn;}});return{tableName,columns,foreignKeys};}catch{return null;}}

function parseInsert(sql,tables){try{const m=sql.match(/INSERT\s+INTO\s+(\w+)\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]+)$/i);if(!m)return{error:"INSERT 문법 오류"};const[,tableName,colsPart,vp]=m;const key=tableName.toLowerCase();const table=tables[key];if(!table)return{error:"테이블 '"+tableName+"'이 없습니다. 먼저 CREATE TABLE을 실행하세요."};const colNames=colsPart?colsPart.split(",").map(s=>s.trim()):table.colDefs.map(c=>c.name);const valueRows=[];let i=0;while(i<vp.length){if(vp[i]==="("){let depth=1,inS=false,sch="",j=i+1;while(j<vp.length&&depth>0){const c=vp[j];if(!inS&&(c==="'"||c==='"')){inS=true;sch=c;}else if(inS&&c===sch){inS=false;}else if(!inS&&c==="(")depth++;else if(!inS&&c===")")depth--;j++;}const inner=vp.slice(i+1,j-1);const vals=tokenizeValues(inner);const row={};colNames.forEach((col,idx)=>{row[col]=vals[idx]!==undefined?vals[idx]:null;});valueRows.push(row);i=j;}else{i++;}}return{tableName,colNames,rows:valueRows};}catch(e){return{error:"INSERT 오류: "+e.message};}}

function evalWhere(row,clause){try{const c=clause.trim();if(/\bAND\b/i.test(c))return c.split(/\bAND\b/i).every(p=>evalWhere(row,p.trim()));if(/\bOR\b/i.test(c))return c.split(/\bOR\b/i).some(p=>evalWhere(row,p.trim()));const innM=c.match(/^(\w+)\s+IS\s+NOT\s+NULL$/i);if(innM)return row[innM[1]]!==null&&row[innM[1]]!==undefined;const inM=c.match(/^(\w+)\s+IS\s+NULL$/i);if(inM)return row[inM[1]]===null||row[inM[1]]===undefined;const lkM=c.match(/^(\w+)\s+LIKE\s+['"]([^'"]*)['"]/i);if(lkM){const pat=lkM[2].replace(/[.+^${}()|[\]\\]/g,"\\$&").replace(/%/g,".*").replace(/_/g,".");return new RegExp("^"+pat+"$","i").test(String(row[lkM[1]]!=null?row[lkM[1]]:"")); }const btM=c.match(/^(\w+)\s+BETWEEN\s+(['"]?)(\S+)\2\s+AND\s+(['"]?)(\S+)\4$/i);if(btM){const v=row[btM[1]],lo=isNaN(btM[3])?btM[3]:Number(btM[3]),hi=isNaN(btM[5])?btM[5]:Number(btM[5]);return v>=lo&&v<=hi;}const ops=[{re:/^(\w+(?:\.\w+)?)\s*>=\s*(['"]?)([^'">=<]+)\2$/,op:">="},{ re:/^(\w+(?:\.\w+)?)\s*<=\s*(['"]?)([^'">=<]+)\2$/,op:"<="},{ re:/^(\w+(?:\.\w+)?)\s*!=\s*(['"]?)([^'">=<]+)\2$/,op:"!="},{ re:/^(\w+(?:\.\w+)?)\s*<>\s*(['"]?)([^'">=<]+)\2$/,op:"!="},{ re:/^(\w+(?:\.\w+)?)\s*>\s*(['"]?)([^'">=<]+)\2$/,op:">"},{ re:/^(\w+(?:\.\w+)?)\s*<\s*(['"]?)([^'">=<]+)\2$/,op:"<"},{ re:/^(\w+(?:\.\w+)?)\s*=\s*(['"]?)([^'">=<]+)\2$/,op:"="}];for(const{re,op}of ops){const m=c.match(re);if(m){const ck=m[1].includes(".")?m[1].split(".")[1]:m[1];const rv=m[3].trim();const val=isNaN(rv)?rv:Number(rv);const rowVal=row[ck]!=null?row[ck]:row[m[1]];if(op===">=")return rowVal>=val;if(op==="<=")return rowVal<=val;if(op==="!=")return String(rowVal)!==String(val);if(op===">")return rowVal>val;if(op==="<")return rowVal<val;if(op==="=")return rowVal==val;}}return true;}catch{return true;}}

function execSelect(sql,tables){try{const fm=sql.match(/\bFROM\s+(\w+)/i);if(!fm)return{error:"FROM 절을 찾을 수 없습니다."};const tableName=fm[1];const td=tables[tableName.toLowerCase()];if(!td)return{error:"테이블 '"+tableName+"'이 없습니다."};let rows=td.rows.map(r=>Object.assign({},r));const colDefs=td.colDefs;const wm=sql.match(/\bWHERE\s+([\s\S]+?)(?:\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|$)/i);let whereClause=null;if(wm){whereClause=wm[1].trim();rows=rows.filter(r=>evalWhere(r,whereClause));}const gm=sql.match(/\bGROUP\s+BY\s+(\w+)/i);let groupInfo=null;if(gm){const gc=gm[1];const groups={};rows.forEach(r=>{const gk=String(r[gc]!=null?r[gc]:"NULL");if(!groups[gk])groups[gk]=[];groups[gk].push(r);});groupInfo={groupCol:gc,groups};const hc=/COUNT\s*\(\s*\*\s*\)/i.test(sql);const sm=sql.match(/SUM\s*\(\s*(\w+)\s*\)/i);const am=sql.match(/AVG\s*\(\s*(\w+)\s*\)/i);const xm=sql.match(/MAX\s*\(\s*(\w+)\s*\)/i);const nm=sql.match(/MIN\s*\(\s*(\w+)\s*\)/i);rows=Object.entries(groups).map(([gk,grs])=>{const r={};r[gc]=isNaN(gk)?gk:Number(gk);if(hc)r["COUNT(*)"]=grs.length;if(sm)r["SUM("+sm[1]+")"]=grs.reduce((a,x)=>a+(Number(x[sm[1]])||0),0);if(am)r["AVG("+am[1]+")"]=Number((grs.reduce((a,x)=>a+(Number(x[am[1]])||0),0)/grs.length).toFixed(2));if(xm)r["MAX("+xm[1]+")"]=Math.max.apply(null,grs.map(x=>Number(x[xm[1]])||0));if(nm)r["MIN("+nm[1]+")"]=Math.min.apply(null,grs.map(x=>Number(x[nm[1]])||0));return r;});}const hvm=sql.match(/\bHAVING\s+([\s\S]+?)(?:\bORDER\s+BY\b|\bLIMIT\b|$)/i);let havingClause=null;if(hvm&&groupInfo){havingClause=hvm[1].trim();rows=rows.filter(r=>evalWhere(r,havingClause));}const om=sql.match(/\bORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);let orderInfo=null;if(om){const col=om[1];const dir=(om[2]||"ASC").toUpperCase();orderInfo={col,dir};rows.sort((a,b)=>{const av=a[col],bv=b[col];if(av==null)return 1;if(bv==null)return -1;if(av<bv)return dir==="ASC"?-1:1;if(av>bv)return dir==="ASC"?1:-1;return 0;});}const sm2=sql.match(/^SELECT\s+([\s\S]+?)\s+FROM\b/i);let selCols;if(!sm2||sm2[1].trim()==="*"){selCols=rows.length>0?Object.keys(rows[0]):colDefs.map(c=>c.name);}else{selCols=sm2[1].split(",").map(s=>{const t=s.trim();return t.includes(".")?t.split(".")[1]:t;});}const lm=sql.match(/\bLIMIT\s+(\d+)/i);if(lm)rows=rows.slice(0,Number(lm[1]));return{rows,columns:selCols,tableName,whereClause,groupInfo,orderInfo,havingClause};}catch(e){return{error:"쿼리 오류: "+e.message};}}

const SAMPLE = {
"학생 DB":`-- 학생 데이터베이스 예제
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
);

CREATE TABLE course (
  course_id VARCHAR(10) PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  credits INT DEFAULT 3,
  dept_id INT,
  FOREIGN KEY (dept_id) REFERENCES department(dept_id)
);

INSERT INTO department VALUES (1, '컴퓨터공학', '공학관 3층');
INSERT INTO department VALUES (2, '수학', '이학관 2층');
INSERT INTO department VALUES (3, '경영학', '경영관 1층');

INSERT INTO student VALUES (1, '김민준', 22, 1, 3.85);
INSERT INTO student VALUES (2, '이서연', 21, 1, 3.42);
INSERT INTO student VALUES (3, '박지호', 23, 2, 3.91);
INSERT INTO student VALUES (4, '최수아', 20, 3, 3.15);
INSERT INTO student VALUES (5, '정현우', 22, 1, 2.87);

INSERT INTO course VALUES ('CS101', '데이터베이스', 3, 1);
INSERT INTO course VALUES ('CS102', '알고리즘', 3, 1);
INSERT INTO course VALUES ('MA101', '선형대수', 3, 2);

SELECT * FROM student WHERE age >= 22`,
"WHERE 조건":"SELECT * FROM student WHERE age >= 22",
"GROUP BY":"SELECT dept_id, COUNT(*) FROM student GROUP BY dept_id",
"ORDER BY":"SELECT * FROM student ORDER BY gpa DESC",
"HAVING":"SELECT dept_id, AVG(gpa) FROM student GROUP BY dept_id HAVING AVG(gpa) >= 3.5",
};

const CONCEPTS=[
{id:"select",title:"SELECT",cat:"기본 조회",desc:"테이블에서 원하는 열(column)을 골라 데이터를 조회하는 가장 기본 명령어입니다.",syntax:"SELECT 컬럼1, 컬럼2\nFROM 테이블명;",example:"SELECT name, age FROM student;",tips:["* 는 모든 컬럼 선택","SELECT DISTINCT로 중복 제거","컬럼 별칭: SELECT name AS 이름"],exam:"실행 순서: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY"},
{id:"where",title:"WHERE",cat:"기본 조회",desc:"특정 조건을 만족하는 행(row)만 필터링합니다.",syntax:"SELECT ...\nFROM 테이블\nWHERE 조건;",example:"SELECT * FROM student\nWHERE age >= 20 AND dept_id = 1;",tips:["AND, OR, NOT 조합 가능","LIKE '%패턴%' 문자열 검색","BETWEEN a AND b 범위 검색","IS NULL / IS NOT NULL"],exam:"WHERE절에 집계함수 불가 → 그룹 조건은 HAVING 사용"},
{id:"orderby",title:"ORDER BY",cat:"기본 조회",desc:"결과를 특정 컬럼 기준으로 정렬합니다.",syntax:"SELECT ...\nFROM ...\nORDER BY 컬럼 ASC|DESC;",example:"SELECT * FROM student\nORDER BY gpa DESC;",tips:["ASC: 오름차순(기본값)","DESC: 내림차순","ORDER BY col1, col2 다단계 정렬"],exam:"ORDER BY는 SQL 실행 순서 중 가장 마지막 단계"},
{id:"groupby",title:"GROUP BY",cat:"집계",desc:"같은 값을 가진 행들을 하나의 그룹으로 묶고 집계 함수를 적용합니다.",syntax:"SELECT 그룹컬럼, COUNT(*)\nFROM 테이블\nGROUP BY 그룹컬럼;",example:"SELECT dept_id, COUNT(*), AVG(gpa)\nFROM student\nGROUP BY dept_id;",tips:["COUNT(*), SUM(col), AVG(col), MAX(col), MIN(col) 사용","SELECT에는 GROUP BY 컬럼이나 집계함수만","HAVING으로 그룹 필터링"],exam:"HAVING vs WHERE: WHERE는 그룹화 이전, HAVING은 그룹화 이후 필터"},
{id:"join",title:"JOIN",cat:"조인",desc:"두 개 이상의 테이블을 특정 컬럼 기준으로 합칩니다.",syntax:"SELECT ...\nFROM A INNER JOIN B\nON A.키 = B.키;",example:"SELECT s.name, d.dept_name\nFROM student s\nINNER JOIN department d\n  ON s.dept_id = d.dept_id;",tips:["INNER JOIN: 양쪽 모두 일치하는 행만","LEFT JOIN: 왼쪽 전체 + 오른쪽 일치","RIGHT JOIN: 오른쪽 전체 + 왼쪽 일치"],exam:"NULL 포함 결과 = OUTER JOIN / 카테시안 곱 = CROSS JOIN"},
{id:"pk",title:"PRIMARY KEY",cat:"제약조건",desc:"각 행을 유일하게 식별하는 키. NOT NULL + UNIQUE 특성을 동시에 가집니다.",syntax:"컬럼명 타입 PRIMARY KEY\n-- 또는 테이블 끝에\nPRIMARY KEY(col1, col2)",example:"student_id INT PRIMARY KEY",tips:["테이블당 PK는 하나","복합 PK: PRIMARY KEY(col1, col2)","NULL 불가 + 중복 불가"],exam:"후보키(Candidate Key) 중 DBA가 선택한 키 = 기본키(Primary Key)"},
{id:"fk",title:"FOREIGN KEY",cat:"제약조건",desc:"다른 테이블의 PK를 참조하여 두 테이블 간 관계를 정의합니다.",syntax:"FOREIGN KEY (컬럼)\nREFERENCES 참조테이블(PK컬럼)",example:"FOREIGN KEY (dept_id)\nREFERENCES department(dept_id)",tips:["참조 무결성 자동 보장","ON DELETE CASCADE: 부모 삭제 시 자식도 삭제","FK 컬럼 자체는 NULL 가능"],exam:"FK 가진 테이블 = 자식(참조하는) / PK 가진 테이블 = 부모(참조당하는)"},
{id:"constraints",title:"NOT NULL / UNIQUE / CHECK",cat:"제약조건",desc:"컬럼에 값이 반드시 있어야(NOT NULL), 중복 불가(UNIQUE), 특정 조건 만족(CHECK)해야 합니다.",syntax:"컬럼명 타입 NOT NULL\n컬럼명 타입 UNIQUE\n컬럼명 타입 CHECK(조건)",example:"age INT NOT NULL CHECK(age >= 18)\nemail VARCHAR(100) UNIQUE",tips:["NOT NULL: INSERT 시 생략 불가","UNIQUE: NULL은 여러 개 허용","CHECK 위반 시 INSERT/UPDATE 거부"],exam:"PK = NOT NULL + UNIQUE 동시 적용"},
];

const EXERCISES=[
{id:1,level:"초급",title:"전체 학생 조회",desc:"student 테이블의 모든 데이터를 조회하세요.",hint:"SELECT * FROM 테이블명",answer:"SELECT * FROM student",check:s=>/SELECT\s+\*\s+FROM\s+student/i.test(s)},
{id:2,level:"초급",title:"22세 이상 학생",desc:"나이(age)가 22 이상인 학생의 이름과 나이를 조회하세요.",hint:"WHERE age >= 22 조건 사용",answer:"SELECT name, age FROM student WHERE age >= 22",check:s=>/WHERE.*age\s*>=\s*22/i.test(s)&&/SELECT.*FROM\s+student/i.test(s)},
{id:3,level:"중급",title:"학과별 학생 수",desc:"dept_id 별로 학생 수를 COUNT(*)로 집계하세요.",hint:"GROUP BY dept_id + COUNT(*)",answer:"SELECT dept_id, COUNT(*) FROM student GROUP BY dept_id",check:s=>/GROUP\s+BY.*dept_id/i.test(s)&&/COUNT\s*\(\s*\*\s*\)/i.test(s)},
{id:4,level:"중급",title:"GPA 내림차순 정렬",desc:"학생을 GPA 기준 내림차순으로 조회하세요.",hint:"ORDER BY gpa DESC",answer:"SELECT * FROM student ORDER BY gpa DESC",check:s=>/ORDER\s+BY.*gpa.*DESC/i.test(s)},
{id:5,level:"시험대비",title:"평균 GPA ≥ 3.5 학과",desc:"학과별 평균 GPA를 구하고, 평균이 3.5 이상인 학과만 표시하세요.",hint:"GROUP BY + AVG(gpa) + HAVING AVG(gpa) >= 3.5",answer:"SELECT dept_id, AVG(gpa) FROM student GROUP BY dept_id HAVING AVG(gpa) >= 3.5",check:s=>/GROUP\s+BY/i.test(s)&&/AVG\s*\(\s*gpa\s*\)/i.test(s)&&/HAVING/i.test(s)},
];

function Badge({label}){
  const st={PK:{bg:"#fef3c7",b:"#f59e0b",t:"#92400e"},FK:{bg:"#ede9fe",b:"#8b5cf6",t:"#5b21b6"},"NOT NULL":{bg:"#dbeafe",b:"#3b82f6",t:"#1e40af"},UNIQUE:{bg:"#d1fae5",b:"#10b981",t:"#065f46"},CHECK:{bg:"#cffafe",b:"#06b6d4",t:"#164e63"},DEFAULT:{bg:"#f1f5f9",b:"#94a3b8",t:"#475569"}};
  const s=st[label]||{bg:"#f1f5f9",b:"#94a3b8",t:"#475569"};
  return <span style={{background:s.bg,border:"1px solid "+s.b,color:s.t,fontSize:10,padding:"1px 6px",borderRadius:4,fontWeight:700}}>{label}</span>;
}

function TableCard({schema}){
  return(
    <div style={{border:"2px solid "+C.border,borderRadius:10,overflow:"hidden",minWidth:280,background:C.surface,boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
      <div style={{background:"#1e40af",padding:"9px 14px",display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:"#93c5fd",fontSize:12}}>⊞</span>
        <span style={{color:"#fff",fontWeight:700,fontFamily:C.mono,fontSize:14}}>{schema.tableName}</span>
        <span style={{color:"#93c5fd",fontSize:11,marginLeft:"auto"}}>{schema.columns.length} cols</span>
      </div>
      {schema.columns.map((col,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderBottom:"1px solid "+C.border,background:col.pk?"#fffbeb":i%2===0?"#f8f9fb":"#fff"}}>
          <span style={{width:18,textAlign:"center",fontSize:12}}>{col.pk?"🔑":col.fk?"🔗":"·"}</span>
          <span style={{fontFamily:C.mono,fontSize:13,minWidth:110,color:col.pk?"#92400e":col.fk?"#5b21b6":C.text,fontWeight:col.pk?700:400}}>{col.name}</span>
          <span style={{fontFamily:C.mono,fontSize:11,color:C.textSub,flex:1}}>{col.type}</span>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {col.pk&&<Badge label="PK"/>}{col.fk&&<Badge label="FK"/>}
            {col.notNull&&!col.pk&&<Badge label="NOT NULL"/>}{col.unique&&!col.pk&&<Badge label="UNIQUE"/>}
            {col.check&&<Badge label="CHECK"/>}{col.default!=null&&<Badge label="DEFAULT"/>}
          </div>
        </div>
      ))}
      {schema.foreignKeys.length>0&&(
        <div style={{padding:"7px 14px",background:"#ede9fe",borderTop:"1px solid "+C.border}}>
          {schema.foreignKeys.map((fk,i)=>(
            <div key={i} style={{fontSize:11,color:"#5b21b6",fontFamily:C.mono}}>🔗 {fk.column} → {fk.refTable}({fk.refColumn})</div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataTable({columns,rows}){
  if(!columns||columns.length===0)return <div style={{color:C.muted,fontSize:13}}>컬럼 없음</div>;
  return(
    <div style={{overflowX:"auto",borderRadius:8,border:"1px solid "+C.border}}>
      <table style={{borderCollapse:"collapse",width:"100%",fontFamily:C.mono,fontSize:13}}>
        <thead>
          <tr>{columns.map((col,i)=><th key={i} style={{background:"#1e40af",color:"#e0f2fe",padding:"8px 14px",textAlign:"left",fontWeight:700,whiteSpace:"nowrap"}}>{col}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length===0
            ?<tr><td colSpan={columns.length} style={{padding:16,color:C.muted,textAlign:"center",fontFamily:C.sans}}>결과 없음 (0 rows)</td></tr>
            :rows.map((row,ri)=>(
              <tr key={ri} style={{background:ri%2===0?"#f8fafc":"#fff"}}>
                {columns.map((col,ci)=>(
                  <td key={ci} style={{padding:"7px 14px",borderBottom:"1px solid "+C.border,color:row[col]==null?C.muted:C.text,fontStyle:row[col]==null?"italic":"normal"}}>
                    {row[col]==null?"NULL":String(row[col])}
                  </td>
                ))}
              </tr>
            ))
          }
        </tbody>
      </table>
      <div style={{padding:"5px 14px",background:"#f8fafc",borderTop:"1px solid "+C.border,fontSize:11,color:C.muted,fontFamily:C.sans}}>{rows.length}개 행</div>
    </div>
  );
}

function QueryExpl({result,sql}){
  if(!result||result.error)return null;
  const items=[];
  const sm=sql.match(/^SELECT\s+([\s\S]+?)\s+FROM\b/i);
  items.push({icon:"📋",label:"조회 컬럼",val:sm?sm[1].trim():"*"});
  const fm=sql.match(/\bFROM\s+(\w+)/i);
  if(fm)items.push({icon:"📁",label:"대상 테이블",val:fm[1]});
  if(result.whereClause)items.push({icon:"🔍",label:"WHERE 조건",val:result.whereClause});
  if(result.groupInfo)items.push({icon:"📦",label:"GROUP BY",val:result.groupInfo.groupCol+" 기준, "+Object.keys(result.groupInfo.groups).length+"개 그룹"});
  if(result.havingClause)items.push({icon:"🎛",label:"HAVING",val:result.havingClause});
  if(result.orderInfo)items.push({icon:"↕️",label:"정렬",val:result.orderInfo.col+" "+result.orderInfo.dir});
  items.push({icon:"📊",label:"결과",val:result.rows.length+"개 행 반환"});
  return(
    <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:14,marginBottom:10}}>
      <div style={{fontWeight:700,color:"#1d4ed8",fontSize:13,marginBottom:8,fontFamily:C.sans}}>🤖 쿼리 해설</div>
      <div style={{display:"flex",flexDirection:"column",gap:5}}>
        {items.map((it,i)=>(
          <div key={i} style={{display:"flex",gap:10,fontSize:13}}>
            <span>{it.icon}</span>
            <span style={{color:C.textSub,minWidth:90,fontFamily:C.sans}}>{it.label}:</span>
            <code style={{color:C.text,fontFamily:C.mono,fontSize:12}}>{it.val}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConceptCard({concept}){
  const [open,setOpen]=useState(false);
  const cc={"기본 조회":"#1d4ed8","집계":"#15803d","조인":"#7c3aed","제약조건":"#b45309"}[concept.cat]||"#475569";
  return(
    <div style={{border:"1px solid "+(open?C.accent:C.border),borderRadius:10,overflow:"hidden",background:C.surface,cursor:"pointer"}} onClick={()=>setOpen(o=>!o)}>
      <div style={{padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{background:cc+"18",color:cc,fontSize:10,padding:"2px 8px",borderRadius:4,fontWeight:700,fontFamily:C.sans}}>{concept.cat}</span>
          <span style={{color:C.text,fontWeight:700,fontFamily:C.mono,fontSize:14}}>{concept.title}</span>
        </div>
        <span style={{color:C.muted,fontSize:16}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{padding:"0 16px 16px",borderTop:"1px solid "+C.border}}>
          <p style={{color:C.textSub,fontSize:13,marginTop:12,lineHeight:1.8,fontFamily:C.sans}}>{concept.desc}</p>
          <div style={{background:"#f8fafc",borderRadius:8,padding:"10px 14px",margin:"10px 0",border:"1px solid "+C.border}}>
            <div style={{color:C.muted,fontSize:10,marginBottom:4,fontFamily:C.sans}}>문법</div>
            <pre style={{color:"#0e7490",fontSize:12,margin:0,fontFamily:C.mono,whiteSpace:"pre-wrap"}}>{concept.syntax}</pre>
          </div>
          <div style={{background:"#f0fdf4",borderRadius:8,padding:"10px 14px",margin:"10px 0",border:"1px solid #bbf7d0"}}>
            <div style={{color:C.muted,fontSize:10,marginBottom:4,fontFamily:C.sans}}>예제</div>
            <pre style={{color:"#166534",fontSize:12,margin:0,fontFamily:C.mono,whiteSpace:"pre-wrap"}}>{concept.example}</pre>
          </div>
          <div style={{marginTop:10}}>
            <div style={{color:C.muted,fontSize:11,marginBottom:6,fontFamily:C.sans}}>💡 핵심 포인트</div>
            {concept.tips.map((tip,i)=><div key={i} style={{color:C.textSub,fontSize:13,padding:"2px 0",fontFamily:C.sans}}>• {tip}</div>)}
          </div>
          <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 14px",marginTop:12}}>
            <div style={{color:"#92400e",fontSize:11,fontWeight:700,marginBottom:4,fontFamily:C.sans}}>📝 시험 포인트</div>
            <div style={{color:"#78350f",fontSize:12,lineHeight:1.7,fontFamily:C.sans}}>{concept.exam}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExercisePanel({tables}){
  const [sel,setSel]=useState(0);
  const [ans,setAns]=useState("");
  const [res,setRes]=useState(null);
  const ex=EXERCISES[sel];
  const check=()=>{if(ex.check(ans.trim()))setRes({ok:true,msg:"✅ 정답입니다! 완벽해요."});else setRes({ok:false,msg:"❌ 틀렸어요. 힌트를 참고해보세요."});};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        {EXERCISES.map((e,i)=>{
          const lc=e.level==="초급"?C.green:e.level==="중급"?C.gold:C.red;
          return(
            <button key={e.id} onClick={()=>{setSel(i);setAns("");setRes(null);}} style={{padding:"6px 14px",borderRadius:8,border:"1.5px solid "+(i===sel?C.accent:C.border),background:i===sel?C.accentBg:"#fff",color:i===sel?C.accent:C.textSub,cursor:"pointer",fontSize:13,fontFamily:C.sans}}>
              <span style={{fontSize:10,marginRight:5,color:lc,fontWeight:700}}>{e.level}</span>{e.title}
            </button>
          );
        })}
      </div>
      <div style={{background:C.surface,borderRadius:10,padding:20,border:"1px solid "+C.border}}>
        <div style={{fontWeight:700,color:C.text,marginBottom:8,fontFamily:C.sans}}>문제 {ex.id}. {ex.title}</div>
        <div style={{color:C.textSub,fontSize:13,lineHeight:1.8,marginBottom:14,fontFamily:C.sans}}>{ex.desc}</div>
        <textarea value={ans} onChange={e=>setAns(e.target.value)} placeholder="SQL을 입력하세요..." style={{width:"100%",minHeight:80,background:"#f8fafc",border:"1.5px solid "+C.border,borderRadius:8,padding:"10px 14px",color:C.text,fontFamily:C.mono,fontSize:13,resize:"vertical",boxSizing:"border-box",outline:"none"}}/>
        <div style={{display:"flex",gap:8,marginTop:10}}>
          <button onClick={check} style={{background:C.accent,color:"#fff",border:"none",borderRadius:8,padding:"8px 20px",cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:C.sans}}>채점하기</button>
          <button onClick={()=>setAns(ex.hint)} style={{background:"#fff",color:C.textSub,border:"1px solid "+C.border,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13,fontFamily:C.sans}}>힌트 보기</button>
          <button onClick={()=>setRes({ok:null,showAns:ex.answer})} style={{background:"#fff",color:C.textSub,border:"1px solid "+C.border,borderRadius:8,padding:"8px 14px",cursor:"pointer",fontSize:13,fontFamily:C.sans}}>정답 보기</button>
        </div>
        {res&&(
          <div style={{marginTop:12,padding:14,borderRadius:8,background:res.ok===true?C.greenBg:res.ok===false?C.redBg:"#f8fafc",border:"1px solid "+(res.ok===true?"#bbf7d0":res.ok===false?"#fecaca":C.border)}}>
            {res.msg&&<div style={{color:res.ok?C.green:C.red,fontWeight:700,fontFamily:C.sans}}>{res.msg}</div>}
            {res.showAns&&<div style={{marginTop:8}}><div style={{color:C.textSub,fontSize:11,marginBottom:4,fontFamily:C.sans}}>정답 예시:</div><code style={{color:C.text,fontFamily:C.mono,fontSize:13}}>{res.showAns}</code></div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function App(){
  const [tab,setTab]=useState("editor");
  const [sql,setSql]=useState(SAMPLE["학생 DB"]);
  const [tables,setTables]=useState({});
  const [outputs,setOutputs]=useState([]);
  const [runError,setRunError]=useState(null);
  const outRef=useRef(null);

  const runSQL=()=>{
    const cleaned=sql.split("\n").filter(l=>!l.trim().startsWith("--")).join("\n");
    const stmts=splitStatements(cleaned);
    const newOut=[];
    let t={};
    Object.keys(tables).forEach(k=>{t[k]={...tables[k],rows:[...tables[k].rows]};});
    let hadErr=false;
    for(const stmt of stmts){
      if(!stmt.trim())continue;
      const up=stmt.trimStart().toUpperCase();
      if(up.startsWith("CREATE TABLE")){
        const schema=parseCreate(stmt);
        if(!schema){newOut.push({type:"error",msg:"CREATE TABLE 파싱 실패 — 문법을 확인하세요.",stmt});hadErr=true;}
        else{const key=schema.tableName.toLowerCase();t[key]={colDefs:schema.columns,rows:[],schema};newOut.push({type:"create",schema,stmt});}
      }else if(up.startsWith("INSERT INTO")){
        const res=parseInsert(stmt,t);
        if(res.error){newOut.push({type:"error",msg:res.error,stmt});hadErr=true;}
        else{const key=res.tableName.toLowerCase();if(t[key])t[key]={...t[key],rows:[...t[key].rows,...res.rows]};newOut.push({type:"insert",tableName:res.tableName,rows:res.rows,colNames:res.colNames,stmt});}
      }else if(up.startsWith("SELECT")){
        const res=execSelect(stmt,t);
        newOut.push({type:"select",result:res,stmt});
        if(res.error)hadErr=true;
      }else if(up.startsWith("DROP TABLE")){
        const m=stmt.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)/i);
        if(m){delete t[m[1].toLowerCase()];newOut.push({type:"drop",tableName:m[1],stmt});}
      }else{
        newOut.push({type:"error",msg:"지원되지 않는 SQL: "+stmt.slice(0,40),stmt});
      }
    }
    setTables(t);setOutputs(newOut);
    setRunError(hadErr?"일부 구문에 오류가 있습니다. ❌ 항목을 확인하세요.":null);
    setTimeout(()=>{if(outRef.current)outRef.current.scrollIntoView({behavior:"smooth"});},100);
  };

  const reset=()=>{setSql("");setTables({});setOutputs([]);setRunError(null);};
  const lineCount=sql.split("\n").length;

  const NAV=[{id:"editor",label:"SQL 실행",icon:"▶"},{id:"tables",label:"테이블 시각화",icon:"⊞"},{id:"learn",label:"개념 학습",icon:"📖"},{id:"practice",label:"연습문제",icon:"✏️"}];
  const TL={create:"✅ CREATE TABLE",insert:"✅ INSERT",select:"📊 SELECT",error:"❌ 오류",drop:"🗑 DROP TABLE"};
  const TB={create:C.greenBg,insert:C.accentBg,select:"#f0f9ff",error:C.redBg,drop:"#f1f5f9"};
  const TBr={create:"#bbf7d0",insert:"#bfdbfe",select:"#bae6fd",error:"#fecaca",drop:C.border};

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:C.sans}}>
      {/* Header */}
      <header style={{background:C.surface,borderBottom:"1px solid "+C.border,padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:54,position:"sticky",top:0,zIndex:100,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,background:"#2563eb",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:11,fontFamily:C.mono}}>SQL</div>
          <span style={{color:C.text,fontWeight:800,fontSize:17}}>SQL<span style={{color:"#2563eb"}}>Visual</span></span>
          <span style={{color:C.muted,fontSize:12}}>SQL 시각화 학습 플랫폼</span>
        </div>
        <nav style={{display:"flex",gap:4}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setTab(n.id)} style={{padding:"6px 14px",borderRadius:8,border:"1.5px solid "+(tab===n.id?C.accent:C.border),background:tab===n.id?C.accentBg:"transparent",color:tab===n.id?C.accent:C.textSub,cursor:"pointer",fontSize:13,fontFamily:C.sans,fontWeight:tab===n.id?700:400}}>
              {n.icon} {n.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{maxWidth:1080,margin:"0 auto",padding:"24px 20px"}}>

        {/* ── SQL 실행 ── */}
        {tab==="editor"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Example buttons */}
            <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:C.muted,fontSize:12,fontWeight:600}}>예제:</span>
              {Object.entries(SAMPLE).map(([k,v])=>(
                <button key={k} onClick={()=>{setSql(v);setOutputs([]);setRunError(null);}} style={{padding:"4px 12px",borderRadius:6,border:"1px solid "+C.border,background:C.surface,color:C.textSub,cursor:"pointer",fontSize:12,fontFamily:C.sans}}>{k}</button>
              ))}
            </div>

            {/* Editor box */}
            <div style={{border:"1.5px solid "+C.border,borderRadius:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{background:"#1e40af",padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div style={{display:"flex",gap:6}}>
                  {["#ef4444","#f59e0b","#10b981"].map((c,i)=><div key={i} style={{width:12,height:12,borderRadius:"50%",background:c}}/>)}
                </div>
                <span style={{color:"#93c5fd",fontSize:11,fontFamily:C.mono}}>SQL Editor — {lineCount} lines</span>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={reset} style={{background:"transparent",border:"1px solid #3b82f6",color:"#93c5fd",padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontFamily:C.sans}}>초기화</button>
                  <button onClick={runSQL} style={{background:"#fff",border:"none",color:"#1e40af",padding:"4px 18px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:800,fontFamily:C.sans}}>▶ 실행</button>
                </div>
              </div>
              <div style={{display:"flex",background:"#0f172a"}}>
                <div style={{background:"#0f172a",padding:"14px 10px 14px 14px",color:"#334155",fontSize:12,fontFamily:C.mono,lineHeight:"1.6",textAlign:"right",userSelect:"none",minWidth:36,borderRight:"1px solid #1e293b"}}>
                  {Array.from({length:lineCount},(_,i)=><div key={i}>{i+1}</div>)}
                </div>
                <textarea value={sql} onChange={e=>setSql(e.target.value)} style={{flex:1,background:"#0f172a",border:"none",outline:"none",color:"#e2e8f0",fontFamily:C.mono,fontSize:13,lineHeight:"1.6",padding:"14px 16px",resize:"none",minHeight:280}} spellCheck={false}/>
              </div>
            </div>

            {runError&&<div style={{background:C.redBg,border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",color:C.red,fontSize:13}}>⚠️ {runError}</div>}

            <div ref={outRef} style={{display:"flex",flexDirection:"column",gap:14}}>
              {outputs.map((out,i)=>(
                <div key={i} style={{background:TB[out.type]||"#fff",border:"1px solid "+(TBr[out.type]||C.border),borderRadius:10,overflow:"hidden"}}>
                  <div style={{padding:"8px 14px",borderBottom:"1px solid "+(TBr[out.type]||C.border),display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontWeight:700,fontSize:13}}>{TL[out.type]||out.type}</span>
                    <code style={{color:C.muted,fontSize:11,fontFamily:C.mono}}>{(out.stmt||"").replace(/\s+/g," ").slice(0,65)}</code>
                  </div>
                  <div style={{padding:14}}>
                    {out.type==="create"&&<TableCard schema={out.schema}/>}
                    {out.type==="insert"&&<div><div style={{color:C.textSub,fontSize:12,marginBottom:8}}><b>{out.tableName}</b>에 <b>{out.rows.length}개</b> 행 삽입됨</div><DataTable columns={out.colNames} rows={out.rows}/></div>}
                    {out.type==="select"&&(out.result.error?<div style={{color:C.red,fontSize:13}}>❌ {out.result.error}</div>:<div><QueryExpl result={out.result} sql={out.stmt}/><DataTable columns={out.result.columns} rows={out.result.rows}/></div>)}
                    {out.type==="error"&&<div><div style={{color:C.red,fontSize:13,fontWeight:700}}>{out.msg}</div><div style={{color:C.textSub,fontSize:12,marginTop:6}}>💡 SQL 문법을 확인하거나 예제를 불러와서 비교해보세요.</div></div>}
                    {out.type==="drop"&&<div style={{color:C.textSub}}>테이블 '{out.tableName}' 삭제 완료</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 테이블 시각화 ── */}
        {tab==="tables"&&(
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {Object.keys(tables).length===0?(
              <div style={{textAlign:"center",padding:60,color:C.muted}}>
                <div style={{fontSize:40,marginBottom:12}}>⊞</div>
                <div style={{fontSize:15,fontWeight:600,marginBottom:6,color:C.textSub}}>테이블이 없습니다</div>
                <div style={{fontSize:13}}>SQL 실행 탭에서 CREATE TABLE과 INSERT를 실행하면 여기에 나타납니다.</div>
              </div>
            ):(
              <div>
                <div style={{padding:20,background:C.surface,borderRadius:12,border:"1px solid "+C.border,marginBottom:20}}>
                  <div style={{fontWeight:700,marginBottom:14,fontSize:14}}>📐 ERD — 테이블 관계도</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:16}}>
                    {Object.values(tables).filter(t=>t.schema).map((t,i)=><TableCard key={i} schema={t.schema}/>)}
                  </div>
                </div>
                {Object.entries(tables).map(([name,t])=>(
                  <div key={name} style={{background:C.surface,borderRadius:12,border:"1px solid "+C.border,overflow:"hidden",marginBottom:16}}>
                    <div style={{background:"#1e40af",padding:"10px 16px",display:"flex",alignItems:"center",gap:10}}>
                      <span style={{color:"#93c5fd"}}>⊞</span>
                      <span style={{color:"#fff",fontWeight:700,fontFamily:C.mono}}>{t.schema?t.schema.tableName:name}</span>
                      <span style={{color:"#93c5fd",fontSize:11}}>{t.rows.length} rows</span>
                    </div>
                    <div style={{padding:16}}>
                      {t.rows.length>0?<DataTable columns={t.colDefs.map(c=>c.name)} rows={t.rows}/>:<div style={{color:C.muted,fontSize:13}}>데이터 없음 — INSERT를 실행하세요.</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 개념 학습 ── */}
        {tab==="learn"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{marginBottom:12}}>
              <h2 style={{fontSize:20,fontWeight:800,color:C.text,margin:0}}>SQL 개념 학습</h2>
              <p style={{color:C.textSub,fontSize:13,marginTop:4}}>항목을 클릭하면 설명, 문법, 예제, 시험 포인트가 펼쳐집니다.</p>
            </div>
            {CONCEPTS.map(c=><ConceptCard key={c.id} concept={c}/>)}
          </div>
        )}

        {/* ── 연습문제 ── */}
        {tab==="practice"&&(
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            <div>
              <h2 style={{fontSize:20,fontWeight:800,color:C.text,margin:0}}>SQL 연습문제</h2>
              <p style={{color:C.textSub,fontSize:13,marginTop:4}}>먼저 SQL 실행 탭에서 <b>학생 DB</b> 예제를 실행한 뒤 풀어보세요.</p>
            </div>
            <div style={{background:C.accentBg,border:"1px solid #bfdbfe",borderRadius:8,padding:"10px 14px",fontSize:12,color:C.textSub}}>
              <b style={{color:C.accent}}>현재 로드된 테이블: </b>
              {Object.keys(tables).length===0?"없음 (SQL 실행 탭에서 예제를 실행하세요)":Object.keys(tables).join(", ")}
            </div>
            <ExercisePanel tables={tables}/>
          </div>
        )}

      </main>

      <footer style={{textAlign:"center",padding:"20px",color:C.muted,fontSize:11,borderTop:"1px solid "+C.border,marginTop:40}}>
        SQLVisual — SQL 시각화 학습 플랫폼 | 브라우저 내 SQL 실행 엔진
      </footer>
    </div>
  );
}
