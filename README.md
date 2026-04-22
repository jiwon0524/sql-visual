# SQLVisual — SQL 실습 + 학습 도구

SQL을 직접 작성하고, 실행하고, 자동 해설을 받고, 테이블 구조를 그림으로 이해하는 학습 도구입니다.

## 폴더 구조

```
sqlvisual/
├── frontend/          ← React 프론트엔드
│   ├── src/
│   │   ├── App.jsx           ← 전체 앱 (홈/에디터/개념/마이페이지)
│   │   ├── main.jsx
│   │   └── utils/
│   │       ├── sqlAnalyzer.js  ← SQL 자동 해설 + 에러 분석
│   │       └── api.js          ← 백엔드 API 호출
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── backend/           ← Express 백엔드 (선택사항)
    ├── server.js         ← API 서버 (인증 + 문서 저장)
    └── package.json
```

## DB 스키마

```sql
-- 사용자
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- SQL 문서
CREATE TABLE sql_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '제목 없음',
  sql_code TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 최근 활동
CREATE TABLE recent_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  doc_id INTEGER,
  action TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

## 실행 방법

### 프론트엔드만 (백엔드 없이 체험 가능)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

> 백엔드 없이도 SQL 실행, 자동 해설, 테이블 시각화, 개념 학습은 모두 동작합니다.
> 로그인/저장 기능은 백엔드가 필요합니다.

### 백엔드 포함 전체 실행

```bash
# 터미널 1: 백엔드
cd backend
npm install
npm run dev
# → http://localhost:3001

# 터미널 2: 프론트엔드
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### GitHub Pages 배포 (프론트엔드)

```bash
cd frontend
# package.json의 homepage를 본인 주소로 수정
npm run deploy
```

## 주요 기능

| 기능 | 설명 |
|------|------|
| SQL 에디터 | 줄번호, 탭 지원, 코드 편집기 느낌 |
| SQL 실행 | sql.js로 브라우저 내 실행 |
| 자동 해설 | SELECT/CREATE/INSERT/UPDATE/DELETE 등 문법별 설명 |
| 에러 분석 | 키워드 오타, 괄호 누락, FK 오류 등 친절한 설명 |
| 테이블 시각화 | PK/FK/제약조건 뱃지, FK 관계 연결 표시 |
| 개념 학습 | CREATE TABLE, PRIMARY KEY, JOIN 등 10개 개념 문서 |
| 로그인/회원가입 | JWT 기반 인증 |
| 문서 저장/불러오기 | 로그인 후 문서 저장 및 목록 관리 |
| 마이페이지 | 문서 목록, 삭제, 이름 수정, 최근 활동 |

## 기술 스택

- **프론트엔드**: React 18, Vite, sql.js (브라우저 SQL 실행)
- **백엔드**: Express, better-sqlite3, bcryptjs, jsonwebtoken
- **DB**: SQLite (better-sqlite3)
- **인증**: JWT (7일 만료)
