# SQLVisual v2 — SQL 학습 플랫폼

SQL을 직접 작성하고, 자동 해설을 받고, 테이블 구조를 시각화하고, 개념을 학습하는 풀스택 웹앱입니다.

## 폴더 구조

```
sqlvisual2/
├── frontend/
│   ├── src/
│   │   ├── App.jsx              ← 전체 앱 (홈/편집기/시각화/개념/마이페이지)
│   │   ├── main.jsx
│   │   └── utils/
│   │       ├── sqlAnalyzer.js   ← SQL 해설 + 에러 분석
│   │       └── api.js           ← 백엔드 API 호출
│   ├── index.html               ← Noto Sans KR + JetBrains Mono
│   ├── vite.config.js
│   └── package.json
│
└── backend/
    ├── server.js                ← Express + 네이버 OAuth + SQLite
    └── package.json
```

## DB 스키마

```sql
-- 사용자 (네이버 OAuth)
CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  naver_id      TEXT UNIQUE,           -- 네이버 고유 ID
  username      TEXT NOT NULL,         -- 네이버 닉네임
  email         TEXT,
  profile_image TEXT,
  created_at    TEXT DEFAULT (datetime('now'))
);

-- SQL 문서
CREATE TABLE sql_documents (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  title      TEXT DEFAULT '제목 없음',
  sql_code   TEXT DEFAULT '',
  memo       TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- SQL 실행 기록
CREATE TABLE sql_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  sql_code    TEXT,
  executed_at TEXT DEFAULT (datetime('now'))
);
```

## API 설계

| Method | Path | 설명 |
|--------|------|------|
| GET | /api/auth/naver | 네이버 로그인 URL 반환 |
| GET | /api/auth/naver/callback | 네이버 OAuth 콜백 처리 |
| GET | /api/auth/me | 현재 사용자 정보 |
| GET | /api/docs | 내 문서 목록 |
| GET | /api/docs/:id | 문서 단건 |
| POST | /api/docs | 새 문서 생성 |
| PUT | /api/docs/:id | 문서 수정 |
| DELETE | /api/docs/:id | 문서 삭제 |
| POST | /api/history | SQL 실행 기록 저장 |
| GET | /api/history | 실행 기록 조회 |

## 네이버 로그인 설정 방법

### 1. 네이버 개발자 센터 등록

1. https://developers.naver.com 접속
2. 애플리케이션 등록 클릭
3. 애플리케이션 이름: `SQLVisual`
4. 사용 API: **네아로(네이버 아이디로 로그인)** 선택
5. 제공 정보: 닉네임, 이메일, 프로필 사진 선택
6. 서비스 URL: `http://localhost:5173` (개발용)
7. **콜백 URL**: `http://localhost:3001/api/auth/naver/callback` ← 반드시 등록!

### 2. 환경변수 설정

```bash
# backend/.env 파일 생성
NAVER_CLIENT_ID=발급받은_클라이언트_ID
NAVER_CLIENT_SECRET=발급받은_시크릿
NAVER_CALLBACK_URL=http://localhost:3001/api/auth/naver/callback
FRONTEND_URL=http://localhost:5173
JWT_SECRET=랜덤한_비밀키_문자열
```

## 실행 방법

### 프론트엔드만 (백엔드 없이 체험)

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

> 로그인/저장 없이 SQL 실행, 자동 해설, 시각화, 개념 학습 모두 가능!

### 전체 실행 (로그인/저장 포함)

```bash
# 터미널 1: 백엔드
cd backend
npm install
npm run dev   # nodemon 사용
# → http://localhost:3001

# 터미널 2: 프론트엔드  
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### GitHub Pages 배포

```bash
cd frontend
# vite.config.js의 base: "/sql-visual/" 확인
# package.json의 homepage를 본인 주소로 수정
npm run deploy
```

## 주요 기능

| 기능 | 설명 |
|------|------|
| 🏠 홈 | 2단 히어로, 기능 소개, CTA |
| ✏️ SQL 편집기 | 줄번호, Ctrl+Enter 실행, 자동 해설 |
| 🗂 테이블 시각화 | CREATE TABLE → 다이어그램, FK 관계선 |
| 📖 개념 학습 | 11개 개념, Java API 스타일 사이드바 |
| 💾 문서 저장 | 로그인 후 클라우드 저장/불러오기 |
| 🔐 네이버 로그인 | OAuth 2.0, 프로필 이미지 표시 |
| 👤 마이페이지 | 문서 관리, 이름 수정, 삭제 |
| ❌ 에러 분석 | 오타/괄호/쉼표 누락 등 친절한 설명 |
