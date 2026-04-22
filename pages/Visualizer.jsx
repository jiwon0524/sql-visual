import { useState } from "react";

// ── parsers (same robust logic as before) ────────────────────────────────────
function splitCols(body){const p=[];let d=0,c="",inS=false,sc="";for(const ch of body){if(!inS&&(ch==="'"||ch==='"')){inS=true;sc=ch;c+=ch;}else if(inS&&ch===sc){inS=false;c+=ch;}else if(!inS&&ch==="("){d++;c+=ch;}else if(!inS&&ch===")"){d--;c+=ch;}else if(!inS&&ch===","&&d===0){p.push(c);c="";}else{c+=ch;}}if(c.trim())p.push(c);return p;}

function parseCreate(sql){
  try{
    const nm=sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(/i);
    if(!nm)return null;
    const tableName=nm[1];
    const body=sql.slice(sql.indexOf("(")+1,sql.lastIndexOf(")"));
    const lines=splitCols(body);
    const columns=[];const foreignKeys=[];let tablePKs=[];
    for(const line of lines){
      const t=line.trim();if(!t)continue;
      const up=t.toUpperCase().trimStart();
      if(up.startsWith("PRIMARY KEY")){const m=t.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);if(m)tablePKs=m[1].split(",").map(s=>s.trim().toLowerCase());continue;}
      if(up.startsWith("FOREIGN KEY")){const m=t.match(/FOREIGN\s+KEY\s*\(\s*(\w+)\s*\)\s+REFERENCES\s+(\w+)\s*\(\s*(\w+)\s*\)/i);if(m)foreignKeys.push({column:m[1],refTable:m[2],refColumn:m[3]});continue;}
      if(up.startsWith("UNIQUE(")||up.startsWith("UNIQUE ")||up.startsWith("CHECK")||up.startsWith("INDEX")||up.startsWith("KEY "))continue;
      const cm=t.match(/^(\w+)\s+(\w+(?:\s*\([^)]*\))?)([\s\S]*)$/i);
      if(!cm)continue;
      const[,colName,colType,rest]=cm;const ru=rest.toUpperCase();
      columns.push({name:colName,type:colType.toUpperCase().replace(/\s+/g,""),pk:ru.includes("PRIMARY KEY"),notNull:ru.includes("NOT NULL")||ru.includes("PRIMARY KEY"),unique:ru.includes("UNIQUE"),fk:false,refTable:null,refColumn:null,default:(()=>{const m=rest.match(/DEFAULT\s+(\S+)/i);return m?m[1]:null;})(),check:(()=>{const m=rest.match(/CHECK\s*\(([^)]+)\)/i);return m?m[1]:null;})(),});
    }
    tablePKs.forEach(pk=>{const col=columns.find(c=>c.name.toLowerCase()===pk);if(col){col.pk=true;col.notNull=true;}});
    foreignKeys.forEach(fk=>{const col=columns.find(c=>c.name.toLowerCase()===fk.column.toLowerCase());if(col){col.fk=true;col.refTable=fk.refTable;col.refColumn=fk.refColumn;}});
    return{tableName,columns,foreignKeys};
  }catch{return null;}
}

function splitStatements(sql){const s=[];let c="",inStr=false,sc="";for(let i=0;i<sql.length;i++){const ch=sql[i];if(!inStr&&(ch==="'"||ch==='"')){inStr=true;sc=ch;c+=ch;}else if(inStr&&ch===sc){inStr=false;c+=ch;}else if(!inStr&&ch===";"){const t=c.trim();if(t)s.push(t);c="";}else{c+=ch;}}const l=c.trim();if(l&&!l.startsWith("--"))s.push(l);return s;}

const SAMPLES = {
"학생 DB":`CREATE TABLE department (
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

CREATE TABLE enrollment (
  student_id INT,
  course_id VARCHAR(10),
  grade CHAR(1) CHECK(grade IN ('A','B','C','D','F')),
  enrolled_at DATE,
  PRIMARY KEY(student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES student(student_id)
);`,
"쇼핑몰":`CREATE TABLE customer (
  customer_id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE product (
  product_id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) CHECK(price >= 0),
  stock INT DEFAULT 0
);

CREATE TABLE orders (
  order_id INT PRIMARY KEY,
  customer_id INT NOT NULL,
  order_date DATE DEFAULT CURRENT_DATE,
  total DECIMAL(10,2),
  FOREIGN KEY (customer_id) REFERENCES customer(customer_id)
);`,
};

function Badge({label}){
  const st={PK:{bg:"#fef3c7",b:"#f59e0b",t:"#92400e"},FK:{bg:"#ede9fe",b:"#8b5cf6",t:"#5b21b6"},"NOT NULL":{bg:"#dbeafe",b:"#3b82f6",t:"#1e40af"},UNIQUE:{bg:"#d1fae5",b:"#10b981",t:"#065f46"},CHECK:{bg:"#cffafe",b:"#06b6d4",t:"#164e63"},DEFAULT:{bg:"#f1f5f9",b:"#94a3b8",t:"#475569"}};
  const s=st[label]||{bg:"#f1f5f9",b:"#94a3b8",t:"#475569"};
  return <span style={{background:s.bg,border:"1px solid "+s.b,color:s.t,fontSize:10,padding:"1px 6px",borderRadius:4,fontWeight:700}}>{label}</span>;
}

function TableCard({schema, D}){
  const tips = [
    schema.columns.some(c=>c.pk) && `🔑 ${schema.columns.filter(c=>c.pk).map(c=>c.name).join(', ')}을(를) 기본키로 사용합니다`,
    schema.foreignKeys.length > 0 && schema.foreignKeys.map(fk=>`🔗 ${fk.column}은(는) ${fk.refTable} 테이블을 참조하는 외래키입니다`).join('\n'),
    schema.columns.some(c=>c.check) && `✅ CHECK 제약조건으로 데이터 유효성을 검사합니다`,
  ].filter(Boolean);

  return(
    <div style={{border:"2px solid "+(D?"#334155":"#e2e8f0"),borderRadius:10,overflow:"hidden",minWidth:260,background:D?"#1e293b":"#fff",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
      <div style={{background:"#1e40af",padding:"9px 14px",display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:"#93c5fd",fontSize:12}}>⊞</span>
        <span style={{color:"#fff",fontWeight:700,fontFamily:"monospace",fontSize:14}}>{schema.tableName}</span>
        <span style={{color:"#93c5fd",fontSize:11,marginLeft:"auto"}}>{schema.columns.length} cols</span>
      </div>
      {schema.columns.map((col,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 14px",borderBottom:"1px solid "+(D?"#334155":"#e2e8f0"),background:col.pk?"#fffbeb":i%2===0?D?"#0f172a":"#f8f9fb":D?"#1e293b":"#fff"}}>
          <span style={{width:18,textAlign:"center",fontSize:12}}>{col.pk?"🔑":col.fk?"🔗":"·"}</span>
          <span style={{fontFamily:"monospace",fontSize:13,minWidth:100,color:col.pk?"#92400e":col.fk?"#5b21b6":D?"#f1f5f9":"#0f172a",fontWeight:col.pk?700:400}}>{col.name}</span>
          <span style={{fontFamily:"monospace",fontSize:11,color:"#64748b",flex:1}}>{col.type}</span>
          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
            {col.pk&&<Badge label="PK"/>}{col.fk&&<Badge label="FK"/>}
            {col.notNull&&!col.pk&&<Badge label="NOT NULL"/>}{col.unique&&!col.pk&&<Badge label="UNIQUE"/>}
            {col.check&&<Badge label="CHECK"/>}{col.default!=null&&<Badge label="DEFAULT"/>}
          </div>
        </div>
      ))}
      {schema.foreignKeys.length>0&&(
        <div style={{padding:"7px 14px",background:D?"#2d1f5e":"#ede9fe",borderTop:"1px solid "+(D?"#334155":"#e2e8f0")}}>
          {schema.foreignKeys.map((fk,i)=><div key={i} style={{fontSize:11,color:"#5b21b6",fontFamily:"monospace"}}>🔗 {fk.column} → {fk.refTable}({fk.refColumn})</div>)}
        </div>
      )}
      {/* Learning tips */}
      {tips.length > 0 && (
        <div style={{padding:"8px 14px",background:D?"#1e3a5f":"#eff6ff",borderTop:"1px solid "+(D?"#334155":"#bfdbfe")}}>
          {tips.map((t,i)=><div key={i} style={{fontSize:11,color:D?"#93c5fd":"#1d4ed8",lineHeight:1.6}}>{t}</div>)}
        </div>
      )}
    </div>
  );
}

export default function Visualizer({ darkMode }) {
  const D = darkMode;
  const [sql, setSql] = useState(SAMPLES["학생 DB"]);
  const [schemas, setSchemas] = useState([]);
  const [errors, setErrors] = useState([]);

  const run = () => {
    const stmts = splitStatements(sql.split("\n").filter(l=>!l.trim().startsWith("--")).join("\n"));
    const results = []; const errs = [];
    for(const stmt of stmts){
      if(!stmt.trim())continue;
      if(/CREATE\s+TABLE/i.test(stmt)){
        const schema = parseCreate(stmt);
        if(schema) results.push(schema);
        else errs.push(`파싱 실패: ${stmt.slice(0,50)}...`);
      }
    }
    setSchemas(results);
    setErrors(errs);
  };

  const lineCount = sql.split("\n").length;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Sample buttons */}
      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
        <span style={{fontSize:12,color:"#94a3b8",fontWeight:600}}>예제:</span>
        {Object.entries(SAMPLES).map(([k,v])=>(
          <button key={k} onClick={()=>{setSql(v);setSchemas([]);setErrors([]);}} style={{padding:"4px 12px",borderRadius:6,border:"1px solid "+(D?"#334155":"#e2e8f0"),background:D?"#1e293b":"#fff",color:D?"#94a3b8":"#475569",cursor:"pointer",fontSize:12}}>{k}</button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Editor */}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{border:"1.5px solid "+(D?"#334155":"#e2e8f0"),borderRadius:12,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{background:"#1e40af",padding:"8px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",gap:6}}>
                {["#ef4444","#f59e0b","#10b981"].map((c,i)=><div key={i} style={{width:12,height:12,borderRadius:"50%",background:c}}/>)}
              </div>
              <span style={{color:"#93c5fd",fontSize:11,fontFamily:"monospace"}}>SQL Editor — {lineCount} lines</span>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{setSql("");setSchemas([]);setErrors([]);}} style={{background:"transparent",border:"1px solid #3b82f6",color:"#93c5fd",padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:12}}>초기화</button>
                <button onClick={run} style={{background:"#fff",border:"none",color:"#1e40af",padding:"4px 16px",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:800}}>▶ 시각화</button>
              </div>
            </div>
            <div style={{display:"flex",background:"#0f172a"}}>
              <div style={{background:"#0f172a",padding:"14px 10px 14px 12px",color:"#334155",fontSize:12,fontFamily:"monospace",lineHeight:"1.6",textAlign:"right",userSelect:"none",minWidth:34,borderRight:"1px solid #1e293b"}}>
                {Array.from({length:lineCount},(_,i)=><div key={i}>{i+1}</div>)}
              </div>
              <textarea value={sql} onChange={e=>setSql(e.target.value)}
                style={{flex:1,background:"#0f172a",border:"none",outline:"none",color:"#e2e8f0",fontFamily:"'JetBrains Mono','Fira Code',monospace",fontSize:13,lineHeight:"1.6",padding:"14px 14px",resize:"none",minHeight:340}} spellCheck={false}/>
            </div>
          </div>

          {/* Errors */}
          {errors.map((e,i)=>(
            <div key={i} style={{background:"#fef2f2",border:"1px solid #fecaca",borderRadius:8,padding:"10px 14px",color:"#dc2626",fontSize:13}}>
              ❌ {e}
            </div>
          ))}

          {/* Tips */}
          <div style={{background:D?"#1e293b":"#eff6ff",border:"1px solid "+(D?"#334155":"#bfdbfe"),borderRadius:10,padding:14}}>
            <div style={{fontWeight:700,fontSize:12,color:"#3b82f6",marginBottom:8}}>💡 시각화 팁</div>
            <div style={{fontSize:12,color:D?"#93c5fd":"#1d4ed8",lineHeight:1.8}}>
              • CREATE TABLE 문을 입력하면 구조가 시각화됩니다<br/>
              • PK는 🔑, FK는 🔗로 표시됩니다<br/>
              • 여러 테이블을 한 번에 시각화할 수 있습니다<br/>
              • FOREIGN KEY 관계가 자동으로 표시됩니다
            </div>
          </div>
        </div>

        {/* Visualization */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {schemas.length === 0 ? (
            <div style={{background:D?"#1e293b":"#fff",border:"1px solid "+(D?"#334155":"#e2e8f0"),borderRadius:12,padding:40,textAlign:"center",color:"#94a3b8"}}>
              <div style={{fontSize:40,marginBottom:10}}>⊞</div>
              <div style={{fontSize:14,fontWeight:600,marginBottom:6,color:D?"#f1f5f9":"#0f172a"}}>테이블 구조 시각화</div>
              <div style={{fontSize:13}}>CREATE TABLE SQL을 입력하고 ▶ 시각화 버튼을 누르세요</div>
            </div>
          ) : (
            <>
              {/* ERD overview */}
              {schemas.length > 1 && (
                <div style={{background:D?"#1e293b":"#fff",border:"1px solid "+(D?"#334155":"#e2e8f0"),borderRadius:12,padding:14}}>
                  <div style={{fontWeight:700,fontSize:13,color:D?"#f1f5f9":"#0f172a",marginBottom:10}}>📐 ERD 관계도</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,alignItems:"center"}}>
                    {schemas.map((s,i)=>(
                      <span key={i}>
                        <span style={{background:"#3b82f620",color:"#3b82f6",padding:"4px 10px",borderRadius:6,fontSize:13,fontFamily:"monospace"}}>{s.tableName}</span>
                        {i < schemas.length-1 && schemas[i+1].foreignKeys.some(fk=>fk.refTable===s.tableName) && (
                          <span style={{margin:"0 6px",color:"#94a3b8"}}>←→</span>
                        )}
                      </span>
                    ))}
                  </div>
                  {/* FK list */}
                  {schemas.flatMap(s=>s.foreignKeys.map(fk=>({from:s.tableName,...fk}))).map((rel,i)=>(
                    <div key={i} style={{marginTop:6,fontSize:12,color:"#94a3b8",fontFamily:"monospace"}}>
                      <span style={{color:"#3b82f6"}}>{rel.from}</span>.{rel.column} → <span style={{color:"#10b981"}}>{rel.refTable}</span>.{rel.refColumn}
                    </div>
                  ))}
                </div>
              )}
              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {schemas.map((s,i)=><TableCard key={i} schema={s} D={D}/>)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
