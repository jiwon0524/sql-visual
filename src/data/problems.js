// ── 문제 스키마 ──────────────────────────────────────────────────────────────
// id, title, difficulty, category, step, description, starterCode,
// expectedKeywords, hints, explanation, relatedConcepts, type, options(객관식)

export const PROBLEMS = [
  // ── STEP 1: 테이블/컬럼 이해 ─────────────────────────────────────────────
  {
    id:"SQL-001", title:"첫 번째 테이블 만들기", difficulty:"입문", category:"CREATE TABLE",
    step:1, type:"write",
    description:"학생 정보를 저장하는 student 테이블을 만드세요.\n컬럼: student_id(INT), name(VARCHAR(50)), age(INT)",
    starterCode:"CREATE TABLE student (\n  \n);",
    expectedKeywords:["CREATE TABLE","student","student_id","INT","name","VARCHAR","age"],
    hints:["CREATE TABLE 테이블명 ( 컬럼정의 ) 형식을 사용하세요","각 컬럼은 콤마로 구분합니다","VARCHAR는 길이를 괄호 안에 지정해야 합니다"],
    explanation:"CREATE TABLE은 새 테이블을 생성하는 DDL 명령어입니다. 컬럼명과 데이터 타입을 지정해야 합니다.",
    relatedConcepts:["CREATE TABLE","데이터 타입"],
    checkFn: s => /CREATE\s+TABLE\s+student/i.test(s) && /student_id/i.test(s) && /name/i.test(s) && /age/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/CREATE\s+TABLE\s+student/i.test(s)) f.push("테이블명 student가 없습니다");
      if(!/student_id/i.test(s)) f.push("student_id 컬럼이 없습니다");
      if(!/VARCHAR\s*\(\d+\)/i.test(s)) f.push("VARCHAR에 길이 지정이 필요합니다 예: VARCHAR(50)");
      return f;
    }
  },
  {
    id:"SQL-002", title:"PRIMARY KEY 추가하기", difficulty:"입문", category:"PRIMARY KEY",
    step:1, type:"write",
    description:"student 테이블에 student_id를 PRIMARY KEY로 지정하세요.",
    starterCode:"CREATE TABLE student (\n  student_id INT,\n  name VARCHAR(50),\n  age INT\n);",
    expectedKeywords:["PRIMARY KEY","student_id"],
    hints:["컬럼 뒤에 PRIMARY KEY를 붙이거나","테이블 끝에 PRIMARY KEY(컬럼명)을 추가하세요"],
    explanation:"PRIMARY KEY는 각 행을 고유하게 식별합니다. NULL 불가 + 중복 불가 특성을 가집니다.",
    relatedConcepts:["PRIMARY KEY","무결성 제약조건"],
    checkFn: s => /PRIMARY\s+KEY/i.test(s) && /student_id/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/PRIMARY\s+KEY/i.test(s)) f.push("PRIMARY KEY 키워드가 없습니다");
      if(!/student_id/i.test(s)) f.push("student_id가 기본키로 지정되지 않았습니다");
      return f;
    }
  },
  {
    id:"SQL-003", title:"NOT NULL 제약조건", difficulty:"입문", category:"제약조건",
    step:1, type:"write",
    description:"student 테이블에서 name 컬럼에 NOT NULL 제약조건을 추가하세요.",
    starterCode:"CREATE TABLE student (\n  student_id INT PRIMARY KEY,\n  name VARCHAR(50),\n  age INT\n);",
    expectedKeywords:["NOT NULL","name"],
    hints:["컬럼 정의 뒤에 NOT NULL을 붙이면 됩니다","NOT NULL은 해당 컬럼에 NULL 값을 허용하지 않습니다"],
    explanation:"NOT NULL은 컬럼에 반드시 값이 있어야 함을 보장합니다. INSERT 시 해당 컬럼 생략 불가.",
    relatedConcepts:["NOT NULL","제약조건"],
    checkFn: s => /name\s+VARCHAR.*NOT\s+NULL/i.test(s) || /name\s+NOT\s+NULL/i.test(s),
    feedbackFn: s => [!/NOT\s+NULL/i.test(s) ? "NOT NULL 키워드가 없습니다":"", !/name/i.test(s)?"name 컬럼을 찾을 수 없습니다":""].filter(Boolean)
  },
  {
    id:"SQL-004", title:"OX - PRIMARY KEY 특성", difficulty:"입문", category:"PRIMARY KEY",
    step:1, type:"ox",
    description:"PRIMARY KEY 컬럼에는 NULL 값을 저장할 수 있다.",
    answer:"X",
    explanation:"PRIMARY KEY는 NOT NULL + UNIQUE 두 특성을 동시에 가집니다. NULL 저장 불가입니다.",
    relatedConcepts:["PRIMARY KEY"],
    hints:["PRIMARY KEY의 두 가지 특성을 생각해보세요"],
    expectedKeywords:[],
    checkFn: s => s.trim().toUpperCase()==="X",
    feedbackFn: ()=>["PRIMARY KEY는 NULL을 허용하지 않습니다. NOT NULL + UNIQUE 특성을 갖습니다."]
  },
  {
    id:"SQL-005", title:"객관식 - VARCHAR vs CHAR", difficulty:"입문", category:"데이터 타입",
    step:2, type:"choice",
    description:"길이가 고정된 문자열을 저장할 때 가장 적합한 데이터 타입은?",
    options:["VARCHAR","CHAR","TEXT","INT"],
    answer:"CHAR",
    explanation:"CHAR는 고정 길이 문자열 타입입니다. 예: CHAR(10)이면 항상 10바이트를 사용합니다. VARCHAR는 가변 길이입니다.",
    relatedConcepts:["데이터 타입"],
    hints:["고정 vs 가변 길이를 생각해보세요"],
    expectedKeywords:[],
    checkFn: s => s.trim()==="CHAR",
    feedbackFn: ()=>["CHAR는 고정 길이, VARCHAR는 가변 길이입니다. 주민번호처럼 길이가 항상 같은 데이터엔 CHAR가 적합합니다."]
  },

  // ── STEP 2: 데이터 타입 ──────────────────────────────────────────────────
  {
    id:"SQL-006", title:"적절한 데이터 타입 선택", difficulty:"기초", category:"데이터 타입",
    step:2, type:"write",
    description:"product 테이블을 만드세요.\n- product_id: 정수, 기본키\n- product_name: 최대 100자 문자열, NOT NULL\n- price: 소수점 2자리까지의 숫자 (DECIMAL)\n- stock: 정수\n- created_at: 날짜",
    starterCode:"CREATE TABLE product (\n  \n);",
    expectedKeywords:["product_id","INT","PRIMARY KEY","product_name","VARCHAR(100)","NOT NULL","DECIMAL","stock","DATE"],
    hints:["소수점은 DECIMAL(전체자리수, 소수자리수) 형식입니다","날짜 타입은 DATE를 사용하세요"],
    explanation:"데이터 타입을 정확히 지정하면 저장공간을 효율적으로 사용하고 데이터 무결성을 보장합니다.",
    relatedConcepts:["데이터 타입","CREATE TABLE"],
    checkFn: s => /product_id/i.test(s) && /PRIMARY\s+KEY/i.test(s) && /DECIMAL/i.test(s) && /DATE/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/PRIMARY\s+KEY/i.test(s)) f.push("product_id에 PRIMARY KEY가 없습니다");
      if(!/DECIMAL/i.test(s)) f.push("price에 DECIMAL 타입이 필요합니다");
      if(!/DATE/i.test(s)) f.push("created_at에 DATE 타입이 필요합니다");
      if(!/NOT\s+NULL/i.test(s)) f.push("product_name에 NOT NULL이 없습니다");
      return f;
    }
  },
  {
    id:"SQL-007", title:"오류 찾기 - 데이터 타입", difficulty:"기초", category:"데이터 타입",
    step:2, type:"fix",
    description:"아래 SQL에서 잘못된 부분을 찾아 수정하세요.\n\nCREATE TABLE member (\n  member_id INT PRIMARY KEY,\n  email VARCHAR NOT NULL,\n  age CHAR,\n  score DECIMAL\n);",
    starterCode:"CREATE TABLE member (\n  member_id INT PRIMARY KEY,\n  email VARCHAR NOT NULL,\n  age CHAR,\n  score DECIMAL\n);",
    expectedKeywords:["VARCHAR(","DECIMAL(","INT"],
    hints:["VARCHAR는 반드시 길이를 지정해야 합니다","나이는 CHAR보다 INT가 적합합니다","DECIMAL은 자릿수 지정을 권장합니다"],
    explanation:"VARCHAR는 VARCHAR(100)처럼 최대 길이를 반드시 지정해야 합니다. 나이는 숫자이므로 INT가 적합합니다.",
    relatedConcepts:["데이터 타입"],
    checkFn: s => /VARCHAR\s*\(\d+\)/i.test(s) && /age\s+INT/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/VARCHAR\s*\(\d+\)/i.test(s)) f.push("VARCHAR에 길이가 없습니다. VARCHAR(100) 처럼 지정하세요");
      if(!/age\s+INT/i.test(s)) f.push("나이(age)는 CHAR가 아닌 INT가 적합합니다");
      return f;
    }
  },

  // ── STEP 3: 기본키/외래키 ────────────────────────────────────────────────
  {
    id:"SQL-008", title:"FOREIGN KEY 만들기", difficulty:"기초", category:"FOREIGN KEY",
    step:3, type:"write",
    description:"student 테이블에 department 테이블을 참조하는 외래키를 추가하세요.\n- dept_id 컬럼 추가 (INT)\n- department 테이블의 dept_id를 참조",
    starterCode:"CREATE TABLE student (\n  student_id INT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL,\n  dept_id INT,\n  \n);",
    expectedKeywords:["FOREIGN KEY","dept_id","REFERENCES","department"],
    hints:["FOREIGN KEY (컬럼명) REFERENCES 참조테이블(참조컬럼) 형식을 사용하세요","테이블 끝 부분에 FOREIGN KEY 정의를 추가하세요"],
    explanation:"FOREIGN KEY는 다른 테이블의 PK를 참조합니다. 참조 무결성을 보장하여 존재하지 않는 값을 참조할 수 없게 합니다.",
    relatedConcepts:["FOREIGN KEY","참조 무결성"],
    checkFn: s => /FOREIGN\s+KEY/i.test(s) && /REFERENCES\s+department/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/FOREIGN\s+KEY/i.test(s)) f.push("FOREIGN KEY 키워드가 없습니다");
      if(!/REFERENCES/i.test(s)) f.push("REFERENCES 키워드가 없습니다");
      if(!/department/i.test(s)) f.push("참조 대상 테이블 department가 없습니다");
      return f;
    }
  },
  {
    id:"SQL-009", title:"복합 기본키", difficulty:"기초", category:"PRIMARY KEY",
    step:3, type:"write",
    description:"수강신청 테이블(enrollment)을 만드세요.\n- student_id (INT)\n- course_id (VARCHAR(10))\n- 두 컬럼을 합친 복합 기본키\n- enrolled_at (DATE)",
    starterCode:"CREATE TABLE enrollment (\n  student_id INT,\n  course_id VARCHAR(10),\n  enrolled_at DATE,\n  \n);",
    expectedKeywords:["PRIMARY KEY","student_id","course_id"],
    hints:["복합 기본키는 PRIMARY KEY(컬럼1, 컬럼2) 형식으로 테이블 끝에 지정합니다"],
    explanation:"복합 기본키는 두 컬럼의 조합이 유일함을 보장합니다. 수강신청처럼 '학생+강의'가 중복되면 안 되는 경우에 사용합니다.",
    relatedConcepts:["PRIMARY KEY","복합키"],
    checkFn: s => /PRIMARY\s+KEY\s*\(\s*student_id\s*,\s*course_id\s*\)/i.test(s) || /PRIMARY\s+KEY\s*\(\s*course_id\s*,\s*student_id\s*\)/i.test(s),
    feedbackFn: s => [!/PRIMARY\s+KEY\s*\([^)]+,[^)]+\)/i.test(s) ? "복합 기본키는 PRIMARY KEY(col1, col2) 형식입니다":""].filter(Boolean)
  },
  {
    id:"SQL-010", title:"OX - FOREIGN KEY NULL 허용", difficulty:"기초", category:"FOREIGN KEY",
    step:3, type:"ox",
    description:"FOREIGN KEY 컬럼에는 NULL 값을 저장할 수 있다.",
    answer:"O",
    explanation:"FK 컬럼 자체는 NULL을 허용합니다. 단, NULL이 아닌 값을 넣으면 참조 대상이 반드시 존재해야 합니다.",
    relatedConcepts:["FOREIGN KEY"],
    hints:["FK 컬럼과 NOT NULL은 별개의 제약조건입니다"],
    expectedKeywords:[],
    checkFn: s => s.trim().toUpperCase()==="O",
    feedbackFn: ()=>["FK 컬럼은 기본적으로 NULL 허용입니다. NOT NULL을 명시해야만 NULL이 금지됩니다."]
  },

  // ── STEP 4: 제약조건 ─────────────────────────────────────────────────────
  {
    id:"SQL-011", title:"UNIQUE 제약조건", difficulty:"기초", category:"제약조건",
    step:4, type:"write",
    description:"member 테이블에서 email이 중복되지 않도록 UNIQUE 제약조건을 추가하세요.",
    starterCode:"CREATE TABLE member (\n  member_id INT PRIMARY KEY,\n  email VARCHAR(100),\n  name VARCHAR(50) NOT NULL\n);",
    expectedKeywords:["UNIQUE","email"],
    hints:["컬럼 뒤에 UNIQUE를 붙이거나","UNIQUE(컬럼명) 형식으로 테이블 끝에 추가할 수 있습니다"],
    explanation:"UNIQUE는 해당 컬럼의 값이 테이블 내에서 중복될 수 없도록 합니다. NULL은 여러 개 허용(DB에 따라 다름).",
    relatedConcepts:["UNIQUE","제약조건"],
    checkFn: s => /email.*UNIQUE/i.test(s) || /UNIQUE.*email/i.test(s) || /UNIQUE\s*\(\s*email\s*\)/i.test(s),
    feedbackFn: s => [!/UNIQUE/i.test(s) ? "UNIQUE 키워드가 없습니다":""].filter(Boolean)
  },
  {
    id:"SQL-012", title:"CHECK 제약조건", difficulty:"기초", category:"제약조건",
    step:4, type:"write",
    description:"student 테이블에서 age가 반드시 18 이상이 되도록 CHECK 제약조건을 추가하세요.",
    starterCode:"CREATE TABLE student (\n  student_id INT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL,\n  age INT\n);",
    expectedKeywords:["CHECK","age","18"],
    hints:["CHECK(조건식) 형식으로 사용합니다","age >= 18 조건을 작성하세요"],
    explanation:"CHECK는 컬럼에 저장될 수 있는 값의 범위나 조건을 제한합니다. 조건을 위반하는 INSERT/UPDATE는 거부됩니다.",
    relatedConcepts:["CHECK","제약조건"],
    checkFn: s => /CHECK\s*\(.*age.*18/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/CHECK/i.test(s)) f.push("CHECK 키워드가 없습니다");
      if(!/18/i.test(s)) f.push("조건값 18이 없습니다");
      return f;
    }
  },
  {
    id:"SQL-013", title:"DEFAULT 값 설정", difficulty:"기초", category:"제약조건",
    step:4, type:"write",
    description:"post 테이블을 만들되 view_count의 기본값을 0으로, is_public의 기본값을 TRUE로 설정하세요.",
    starterCode:"CREATE TABLE post (\n  post_id INT PRIMARY KEY,\n  title VARCHAR(200) NOT NULL,\n  view_count INT,\n  is_public BOOLEAN\n);",
    expectedKeywords:["DEFAULT","0","TRUE"],
    hints:["DEFAULT 기본값 형식으로 컬럼 뒤에 추가합니다"],
    explanation:"DEFAULT는 INSERT 시 해당 컬럼 값을 생략하면 자동으로 사용될 기본값을 지정합니다.",
    relatedConcepts:["DEFAULT","제약조건"],
    checkFn: s => /DEFAULT\s+0/i.test(s) && /DEFAULT\s+TRUE/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/DEFAULT\s+0/i.test(s)) f.push("view_count의 DEFAULT 0이 없습니다");
      if(!/DEFAULT\s+TRUE/i.test(s)) f.push("is_public의 DEFAULT TRUE가 없습니다");
      return f;
    }
  },
  {
    id:"SQL-014", title:"객관식 - CHECK vs NOT NULL", difficulty:"기초", category:"제약조건",
    step:4, type:"choice",
    description:"나이가 0보다 커야 한다는 조건을 적용할 때 올바른 제약조건은?",
    options:["NOT NULL","UNIQUE","CHECK(age > 0)","DEFAULT 0"],
    answer:"CHECK(age > 0)",
    explanation:"값의 범위나 조건을 제한할 때는 CHECK를 사용합니다. NOT NULL은 NULL 여부만 체크합니다.",
    relatedConcepts:["CHECK","제약조건"],
    hints:["값의 범위를 제한하는 제약조건을 생각해보세요"],
    expectedKeywords:[],
    checkFn: s => s.includes("CHECK(age > 0)"),
    feedbackFn: ()=>["CHECK는 특정 조건을 만족하는 값만 허용합니다. NOT NULL은 NULL 여부만 체크합니다."]
  },

  // ── STEP 5: 관계형 설계 ──────────────────────────────────────────────────
  {
    id:"SQL-015", title:"1:N 관계 설계", difficulty:"중급", category:"FOREIGN KEY",
    step:5, type:"write",
    description:"부서(department)와 직원(employee)의 1:N 관계를 설계하세요.\n- department: dept_id(PK), dept_name(NOT NULL)\n- employee: emp_id(PK), name(NOT NULL), dept_id(FK→department)",
    starterCode:"-- department 테이블\nCREATE TABLE department (\n  \n);\n\n-- employee 테이블\nCREATE TABLE employee (\n  \n);",
    expectedKeywords:["department","dept_id","PRIMARY KEY","employee","emp_id","FOREIGN KEY","REFERENCES"],
    hints:["부모 테이블(department)을 먼저 만들어야 합니다","FOREIGN KEY는 자식 테이블(employee)에 추가합니다"],
    explanation:"1:N 관계에서 '다(N)' 쪽 테이블이 FK를 가집니다. 직원 여러 명이 하나의 부서에 속하므로 employee가 FK를 가집니다.",
    relatedConcepts:["FOREIGN KEY","관계형 설계","1:N 관계"],
    checkFn: s => /CREATE\s+TABLE\s+department/i.test(s) && /CREATE\s+TABLE\s+employee/i.test(s) && /FOREIGN\s+KEY/i.test(s) && /REFERENCES\s+department/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/CREATE\s+TABLE\s+department/i.test(s)) f.push("department 테이블이 없습니다");
      if(!/CREATE\s+TABLE\s+employee/i.test(s)) f.push("employee 테이블이 없습니다");
      if(!/FOREIGN\s+KEY/i.test(s)) f.push("FOREIGN KEY가 없습니다");
      if(!/REFERENCES\s+department/i.test(s)) f.push("department 테이블 참조가 없습니다");
      return f;
    }
  },
  {
    id:"SQL-016", title:"N:M 관계 설계", difficulty:"중급", category:"관계형 설계",
    step:5, type:"write",
    description:"학생(student)과 강의(course)의 N:M 관계를 위한 수강신청(enrollment) 테이블을 설계하세요.\n- enrollment: student_id + course_id 복합 PK, grade(VARCHAR(2))",
    starterCode:"-- 수강신청 테이블만 작성하세요\nCREATE TABLE enrollment (\n  \n);",
    expectedKeywords:["enrollment","student_id","course_id","PRIMARY KEY","FOREIGN KEY","REFERENCES"],
    hints:["N:M 관계는 중간 테이블로 해결합니다","두 FK 컬럼을 복합 기본키로 사용합니다"],
    explanation:"N:M 관계는 직접 표현이 불가능합니다. 연결 테이블(junction table)을 만들고 양쪽 테이블의 FK를 복합 PK로 사용합니다.",
    relatedConcepts:["N:M 관계","복합키","FOREIGN KEY"],
    checkFn: s => /PRIMARY\s+KEY\s*\([^)]+,[^)]+\)/i.test(s) && /FOREIGN\s+KEY/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/PRIMARY\s+KEY\s*\([^)]+,[^)]+\)/i.test(s)) f.push("복합 기본키 PRIMARY KEY(col1, col2)가 없습니다");
      if(!/FOREIGN\s+KEY/i.test(s)) f.push("FOREIGN KEY가 없습니다");
      return f;
    }
  },
  {
    id:"SQL-017", title:"ON DELETE CASCADE", difficulty:"중급", category:"FOREIGN KEY",
    step:5, type:"write",
    description:"부서가 삭제되면 소속 직원도 자동 삭제되도록 ON DELETE CASCADE를 추가하세요.",
    starterCode:"CREATE TABLE employee (\n  emp_id INT PRIMARY KEY,\n  name VARCHAR(50) NOT NULL,\n  dept_id INT,\n  FOREIGN KEY (dept_id) REFERENCES department(dept_id)\n);",
    expectedKeywords:["ON DELETE CASCADE"],
    hints:["FOREIGN KEY ... REFERENCES ... ON DELETE CASCADE 형식입니다"],
    explanation:"ON DELETE CASCADE는 부모 레코드 삭제 시 자식 레코드도 자동 삭제합니다. 참조 무결성을 유지하는 방법 중 하나입니다.",
    relatedConcepts:["FOREIGN KEY","참조 무결성"],
    checkFn: s => /ON\s+DELETE\s+CASCADE/i.test(s),
    feedbackFn: ()=>["ON DELETE CASCADE가 없습니다. REFERENCES department(dept_id) ON DELETE CASCADE 형식을 사용하세요."]
  },

  // ── STEP 6: 조회/조인 ────────────────────────────────────────────────────
  {
    id:"SQL-018", title:"기본 SELECT", difficulty:"기초", category:"SELECT",
    step:6, type:"write",
    description:"student 테이블에서 name과 age만 조회하세요.",
    starterCode:"-- student 테이블: student_id, name, age, dept_id\n",
    expectedKeywords:["SELECT","name","age","FROM","student"],
    hints:["SELECT 컬럼1, 컬럼2 FROM 테이블명 형식입니다"],
    explanation:"SELECT는 테이블에서 원하는 컬럼만 골라 조회합니다. *는 전체 컬럼을 의미합니다.",
    relatedConcepts:["SELECT"],
    checkFn: s => /SELECT.*name.*age.*FROM\s+student/i.test(s) || /SELECT.*age.*name.*FROM\s+student/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/SELECT/i.test(s)) f.push("SELECT 키워드가 없습니다");
      if(!/FROM\s+student/i.test(s)) f.push("FROM student가 없습니다");
      if(!/name/i.test(s)) f.push("name 컬럼이 없습니다");
      return f;
    }
  },
  {
    id:"SQL-019", title:"WHERE 조건 조회", difficulty:"기초", category:"SELECT",
    step:6, type:"write",
    description:"student 테이블에서 age가 20 이상인 학생의 name과 age를 조회하세요.",
    starterCode:"",
    expectedKeywords:["SELECT","FROM","student","WHERE","age","20"],
    hints:["WHERE 절에 조건을 작성합니다",">= 연산자를 사용하세요"],
    explanation:"WHERE는 조건을 만족하는 행만 필터링합니다. 실행 순서: FROM → WHERE → SELECT",
    relatedConcepts:["WHERE","SELECT"],
    checkFn: s => /SELECT/i.test(s) && /FROM\s+student/i.test(s) && /WHERE.*age\s*>=\s*20/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/WHERE/i.test(s)) f.push("WHERE 절이 없습니다");
      if(!/>=\s*20/i.test(s)) f.push("age >= 20 조건이 없습니다");
      return f;
    }
  },
  {
    id:"SQL-020", title:"INNER JOIN", difficulty:"중급", category:"JOIN",
    step:6, type:"write",
    description:"student와 department 테이블을 INNER JOIN해서 학생 이름과 학과명을 조회하세요.",
    starterCode:"-- student: student_id, name, dept_id\n-- department: dept_id, dept_name\n",
    expectedKeywords:["SELECT","INNER JOIN","ON","student","department","dept_id"],
    hints:["FROM 테이블A INNER JOIN 테이블B ON 조인조건 형식입니다","두 테이블의 공통 컬럼(dept_id)으로 연결합니다"],
    explanation:"INNER JOIN은 두 테이블에서 조건이 일치하는 행만 반환합니다. 일치하지 않는 행은 결과에서 제외됩니다.",
    relatedConcepts:["JOIN","INNER JOIN"],
    checkFn: s => /INNER\s+JOIN/i.test(s) && /ON/i.test(s) && /dept_id/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/INNER\s+JOIN/i.test(s)) f.push("INNER JOIN 키워드가 없습니다");
      if(!/ON/i.test(s)) f.push("ON 조건이 없습니다");
      return f;
    }
  },
  {
    id:"SQL-021", title:"GROUP BY + COUNT", difficulty:"중급", category:"GROUP BY",
    step:6, type:"write",
    description:"student 테이블에서 학과(dept_id)별 학생 수를 조회하세요.",
    starterCode:"",
    expectedKeywords:["SELECT","COUNT","FROM","student","GROUP BY","dept_id"],
    hints:["GROUP BY로 그룹을 만들고 COUNT(*)로 개수를 셉니다"],
    explanation:"GROUP BY는 같은 값을 가진 행들을 그룹으로 묶습니다. SELECT에는 GROUP BY 컬럼이나 집계함수만 올 수 있습니다.",
    relatedConcepts:["GROUP BY","집계함수"],
    checkFn: s => /GROUP\s+BY.*dept_id/i.test(s) && /COUNT\s*\(\s*\*\s*\)/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/GROUP\s+BY/i.test(s)) f.push("GROUP BY가 없습니다");
      if(!/COUNT/i.test(s)) f.push("COUNT 집계함수가 없습니다");
      return f;
    }
  },
  {
    id:"SQL-022", title:"HAVING으로 그룹 필터", difficulty:"중급", category:"GROUP BY",
    step:6, type:"write",
    description:"학과별 학생 수를 구하되, 학생이 3명 이상인 학과만 표시하세요.",
    starterCode:"",
    expectedKeywords:["GROUP BY","HAVING","COUNT","3"],
    hints:["그룹 조건은 WHERE가 아닌 HAVING을 사용합니다","HAVING COUNT(*) >= 3"],
    explanation:"HAVING은 GROUP BY 이후 그룹에 조건을 적용합니다. WHERE는 그룹화 전, HAVING은 그룹화 후 필터입니다.",
    relatedConcepts:["HAVING","GROUP BY"],
    checkFn: s => /HAVING.*COUNT.*>=?\s*3/i.test(s) || /HAVING.*3.*<=?\s*COUNT/i.test(s),
    feedbackFn: s => [!/HAVING/i.test(s)?"HAVING 절이 없습니다. 그룹 조건은 WHERE가 아닌 HAVING을 사용합니다":""].filter(Boolean)
  },
  {
    id:"SQL-023", title:"LEFT JOIN", difficulty:"중급", category:"JOIN",
    step:6, type:"write",
    description:"모든 학생을 조회하되 학과 정보가 없어도 포함하세요. (department에 없는 학생도 표시)",
    starterCode:"",
    expectedKeywords:["LEFT JOIN","student","department","ON"],
    hints:["LEFT JOIN은 왼쪽 테이블(FROM 뒤) 전체를 반환합니다","오른쪽에 일치하는 값이 없으면 NULL로 표시됩니다"],
    explanation:"LEFT OUTER JOIN은 왼쪽 테이블의 모든 행을 반환하고, 오른쪽에서 일치하는 행이 없으면 NULL을 채웁니다.",
    relatedConcepts:["LEFT JOIN","OUTER JOIN"],
    checkFn: s => /LEFT\s+(OUTER\s+)?JOIN/i.test(s),
    feedbackFn: ()=>["LEFT JOIN 또는 LEFT OUTER JOIN을 사용하세요. INNER JOIN은 양쪽 모두 일치하는 행만 반환합니다."]
  },
  {
    id:"SQL-024", title:"ORDER BY 정렬", difficulty:"기초", category:"SELECT",
    step:6, type:"write",
    description:"student 테이블에서 GPA를 기준으로 내림차순 정렬하여 조회하세요.",
    starterCode:"",
    expectedKeywords:["ORDER BY","gpa","DESC"],
    hints:["ORDER BY 컬럼 DESC 형식입니다"],
    explanation:"ORDER BY는 결과를 정렬합니다. ASC(오름차순, 기본값), DESC(내림차순). 실행 순서에서 가장 마지막입니다.",
    relatedConcepts:["ORDER BY"],
    checkFn: s => /ORDER\s+BY.*gpa.*DESC/i.test(s),
    feedbackFn: s => [!/DESC/i.test(s)?"DESC(내림차순) 키워드가 없습니다":""].filter(Boolean)
  },

  // ── STEP 7: 고급 SQL ─────────────────────────────────────────────────────
  {
    id:"SQL-025", title:"서브쿼리 - WHERE절", difficulty:"실전", category:"서브쿼리",
    step:7, type:"write",
    description:"평균 GPA보다 높은 학생의 이름과 GPA를 조회하세요.",
    starterCode:"",
    expectedKeywords:["SELECT","WHERE","gpa","AVG","student"],
    hints:["WHERE gpa > (SELECT AVG(gpa) FROM student) 형식입니다","서브쿼리는 괄호 안에 작성합니다"],
    explanation:"서브쿼리는 쿼리 안에 또 다른 쿼리를 중첩하는 방법입니다. WHERE절 서브쿼리는 단일 값이나 목록을 반환합니다.",
    relatedConcepts:["서브쿼리","SELECT"],
    checkFn: s => /SELECT.*AVG.*FROM\s+student/i.test(s) && /WHERE/i.test(s),
    feedbackFn: s => [!/SELECT.*AVG/i.test(s)?"서브쿼리에 AVG() 집계함수가 필요합니다":""].filter(Boolean)
  },
  {
    id:"SQL-026", title:"뷰(View) 생성", difficulty:"실전", category:"뷰",
    step:7, type:"write",
    description:"학생 이름과 학과명을 조인한 결과를 student_dept_view 뷰로 만드세요.",
    starterCode:"",
    expectedKeywords:["CREATE VIEW","student_dept_view","AS","SELECT","JOIN"],
    hints:["CREATE VIEW 뷰이름 AS SELECT ... 형식입니다"],
    explanation:"뷰는 자주 사용하는 쿼리를 저장해두는 가상 테이블입니다. 실제 데이터를 저장하지 않고 쿼리를 저장합니다.",
    relatedConcepts:["뷰","SELECT"],
    checkFn: s => /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+student_dept_view/i.test(s) && /AS\s+SELECT/i.test(s),
    feedbackFn: s => [!/CREATE.*VIEW/i.test(s)?"CREATE VIEW 키워드가 없습니다":""].filter(Boolean)
  },
  {
    id:"SQL-027", title:"정규화 - 1NF", difficulty:"실전", category:"정규화",
    step:7, type:"choice",
    description:"1NF(제1정규형)의 조건으로 올바른 것은?",
    options:["모든 컬럼이 기본키에 완전 종속","반복 그룹이 없고 각 컬럼이 원자값을 가짐","이행적 함수 종속이 없음","모든 컬럼이 NULL이 아님"],
    answer:"반복 그룹이 없고 각 컬럼이 원자값을 가짐",
    explanation:"1NF: 모든 컬럼이 원자값(더 이상 분리 불가능한 값)을 가져야 하고, 반복 그룹이 없어야 합니다.",
    relatedConcepts:["정규화","1NF"],
    hints:["1NF는 가장 기본적인 정규화입니다"],
    expectedKeywords:[],
    checkFn: s => s.includes("반복 그룹이 없고 각 컬럼이 원자값을 가짐"),
    feedbackFn: ()=>["1NF: 원자값 + 반복 그룹 제거 / 2NF: 완전 함수 종속 / 3NF: 이행적 종속 제거"]
  },
  {
    id:"SQL-028", title:"인덱스 생성", difficulty:"실전", category:"인덱스",
    step:7, type:"write",
    description:"student 테이블의 name 컬럼에 인덱스를 생성하세요. 인덱스명: idx_student_name",
    starterCode:"",
    expectedKeywords:["CREATE INDEX","idx_student_name","ON","student","name"],
    hints:["CREATE INDEX 인덱스명 ON 테이블명(컬럼명) 형식입니다"],
    explanation:"인덱스는 검색 속도를 높이는 데이터 구조입니다. WHERE, JOIN, ORDER BY에 자주 사용되는 컬럼에 생성합니다.",
    relatedConcepts:["인덱스"],
    checkFn: s => /CREATE\s+INDEX\s+idx_student_name\s+ON\s+student/i.test(s),
    feedbackFn: s => [!/CREATE\s+INDEX/i.test(s)?"CREATE INDEX 키워드가 없습니다":""].filter(Boolean)
  },
  {
    id:"SQL-029", title:"실전 미션 - 쇼핑몰 DB 설계", difficulty:"실전", category:"관계형 설계",
    step:7, type:"write",
    description:"쇼핑몰 DB를 설계하세요.\n- customer: customer_id(PK), name(NOT NULL), email(UNIQUE)\n- orders: order_id(PK), customer_id(FK→customer), order_date(DATE), total(DECIMAL(10,2))\n- 두 테이블 모두 작성하세요.",
    starterCode:"",
    expectedKeywords:["customer","orders","PRIMARY KEY","FOREIGN KEY","UNIQUE","DECIMAL","REFERENCES"],
    hints:["customer 테이블을 먼저 만드세요","orders의 customer_id는 customer를 참조하는 FK입니다"],
    explanation:"실전 설계 문제입니다. 관계를 파악하고 각 테이블의 제약조건을 적절히 설정하는 것이 핵심입니다.",
    relatedConcepts:["관계형 설계","FOREIGN KEY","제약조건"],
    checkFn: s => /CREATE\s+TABLE\s+customer/i.test(s) && /CREATE\s+TABLE\s+orders/i.test(s) && /FOREIGN\s+KEY/i.test(s) && /UNIQUE/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/CREATE\s+TABLE\s+customer/i.test(s)) f.push("customer 테이블이 없습니다");
      if(!/CREATE\s+TABLE\s+orders/i.test(s)) f.push("orders 테이블이 없습니다");
      if(!/UNIQUE/i.test(s)) f.push("email에 UNIQUE가 없습니다");
      if(!/FOREIGN\s+KEY/i.test(s)) f.push("FOREIGN KEY가 없습니다");
      if(!/DECIMAL/i.test(s)) f.push("total에 DECIMAL 타입이 없습니다");
      return f;
    }
  },
  {
    id:"SQL-030", title:"오류 찾기 - 종합", difficulty:"실전", category:"제약조건",
    step:7, type:"fix",
    description:"아래 SQL에서 모든 오류를 찾아 수정하세요.\n\nCREATE TABLE orders (\n  order_id INT,\n  customer_id INT NOT NULL,\n  amount VARCHAR(10),\n  status CHAR,\n  FOREIGN KEY customer_id REFERENCES customer\n);",
    starterCode:"CREATE TABLE orders (\n  order_id INT,\n  customer_id INT NOT NULL,\n  amount VARCHAR(10),\n  status CHAR,\n  FOREIGN KEY customer_id REFERENCES customer\n);",
    expectedKeywords:["PRIMARY KEY","DECIMAL","FOREIGN KEY (customer_id)","REFERENCES customer("],
    hints:["order_id에 기본키가 없습니다","금액은 DECIMAL이 적합합니다","FOREIGN KEY 문법: FOREIGN KEY (컬럼) REFERENCES 테이블(컬럼)"],
    explanation:"여러 오류: ① order_id에 PK 없음 ② amount는 DECIMAL이 적합 ③ FOREIGN KEY 문법 오류 ④ status는 VARCHAR가 적합",
    relatedConcepts:["PRIMARY KEY","FOREIGN KEY","데이터 타입"],
    checkFn: s => /order_id.*PRIMARY\s+KEY/i.test(s) && /FOREIGN\s+KEY\s*\(\s*customer_id\s*\)/i.test(s) && /DECIMAL/i.test(s),
    feedbackFn: s => {
      const f=[];
      if(!/PRIMARY\s+KEY/i.test(s)) f.push("order_id에 PRIMARY KEY가 없습니다");
      if(!/DECIMAL/i.test(s)) f.push("금액(amount)은 DECIMAL이 적합합니다");
      if(!/FOREIGN\s+KEY\s*\(/i.test(s)) f.push("FOREIGN KEY 문법 오류: FOREIGN KEY (컬럼명) REFERENCES 테이블(컬럼) 형식이어야 합니다");
      return f;
    }
  },
];

export const STEPS = [
  {step:1, title:"테이블/컬럼 이해", desc:"CREATE TABLE 기본 문법과 데이터 타입을 배웁니다"},
  {step:2, title:"데이터 타입",      desc:"INT, VARCHAR, DECIMAL, DATE 등 적절한 타입 선택"},
  {step:3, title:"기본키/외래키",    desc:"PK와 FK의 역할과 설정 방법을 마스터합니다"},
  {step:4, title:"제약조건",         desc:"NOT NULL, UNIQUE, CHECK, DEFAULT로 데이터 무결성 보장"},
  {step:5, title:"관계형 설계",      desc:"1:N, N:M 관계를 올바르게 설계합니다"},
  {step:6, title:"조회/조인",        desc:"SELECT, WHERE, JOIN, GROUP BY로 데이터 조회"},
  {step:7, title:"고급 SQL",         desc:"서브쿼리, 뷰, 인덱스, 정규화 등 심화 주제"},
];
