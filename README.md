# SQLVisual v2 — SQL 학습 플랫폼

SQL을 직접 작성하고, 자동 해설을 받고, 테이블 구조를 시각화하고, 개념을 학습하는 웹앱입니다.

## 먼저 알아둘 점

- GitHub Pages는 정적 프론트엔드만 호스팅합니다.
- `https://jiwon0524.github.io/sql-visual/`에서는 SQL 실행, 해설, 시각화, 로컬 문서 저장을 체험할 수 있습니다.
- 네이버 로그인과 서버 DB 문서 저장을 쓰려면 `backend`를 로컬 또는 Render/Railway/Fly.io 같은 별도 서버에서 실행해야 합니다.
- 로컬 미리보기 주소는 프론트엔드 `http://localhost:5173`입니다.
- `http://localhost:3001`은 백엔드 API 주소라서 브라우저 화면 대신 `http://localhost:3001/api/health` 같은 API 응답을 확인하는 용도입니다.

## 폴더 구조

```text
sqlvisual2/
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── utils/
│   │       ├── sqlAnalyzer.js
│   │       └── api.js
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example
│
└── backend/
    ├── server.js
    ├── package.json
    └── .env.example
```

## 실행 방법

### 프론트엔드만 실행

백엔드 없이 SQL 실행, 해설, 시각화, 로컬 문서 저장을 체험합니다.

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

### 백엔드 API 실행

```bash
cd backend
npm install
cp .env.example .env
npm run dev
# API: http://localhost:3001
# 상태 확인: http://localhost:3001/api/health
```

Windows PowerShell에서는 `cp` 대신 아래 명령을 사용할 수 있습니다.

```powershell
Copy-Item .env.example .env
```

### 프론트엔드와 백엔드 함께 실행

터미널 1:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

터미널 2:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

프론트엔드는 `.env`의 `VITE_API_BASE_URL=http://localhost:3001/api` 값을 사용해 백엔드에 연결합니다.

## 네이버 로그인 설정

1. https://developers.naver.com 접속
2. 애플리케이션 등록
3. 사용 API: 네아로(네이버 아이디로 로그인)
4. 제공 정보: 닉네임, 이메일, 프로필 사진
5. 개발용 서비스 URL: `http://localhost:5173`
6. 개발용 콜백 URL: `http://localhost:3001/api/auth/naver/callback`
7. 배포 시 콜백 URL은 배포된 백엔드 주소로 추가 등록합니다. 예: `https://your-api.example.com/api/auth/naver/callback`

백엔드 `.env` 예시:

```env
PORT=3001
NAVER_CLIENT_ID=발급받은_클라이언트_ID
NAVER_CLIENT_SECRET=발급받은_시크릿
NAVER_CALLBACK_URL=http://localhost:3001/api/auth/naver/callback
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,https://jiwon0524.github.io
JWT_SECRET=랜덤한_긴_비밀키
```

## API 설계

| Method | Path | 설명 |
|--------|------|------|
| GET | /api/health | 백엔드 상태 확인 |
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

## GitHub Pages 배포

```bash
cd frontend
npm run deploy
```

GitHub Pages는 정적 호스팅이므로 백엔드 서버를 자동으로 실행하지 않습니다. 로그인/클라우드 저장까지 배포하려면 백엔드를 별도 서비스에 배포하고, 프론트엔드 빌드 환경에 `VITE_API_BASE_URL=https://배포된-api주소/api`를 설정해야 합니다.

## 공개 백엔드 연결

다른 컴퓨터에서도 네이버 로그인과 문서 저장을 사용하려면 `localhost`가 아니라 공개 배포된 백엔드 API 주소가 필요합니다. 자세한 설정 순서는 [`backend/DEPLOY.md`](backend/DEPLOY.md)를 참고하세요.

## 협업 기능

네이버 로그인 후 최초 1회 표시 이름을 설정할 수 있고, SQL 문서는 사이트 저장 또는 `.sql` 파일 다운로드로 저장할 수 있습니다. 로그인 사용자는 내 문서 관리, 공유 게시판 등록, 공유 문서 복사, 댓글 작성 기능을 사용할 수 있습니다. 비로그인 사용자는 SQL 실행과 컴퓨터 파일 저장/불러오기를 계속 사용할 수 있습니다.

## 주소 변경과 네이버 검색 등록

`https://jiwon0524.github.io/sql-visual/` 대신 짧은 주소를 쓰려면 도메인을 구매한 뒤 GitHub Pages custom domain을 설정해야 합니다. 네이버 검색 노출은 Naver Search Advisor에 사이트와 sitemap을 등록해야 하며, 자세한 순서는 [`docs/DOMAIN_AND_SEARCH.md`](docs/DOMAIN_AND_SEARCH.md)를 참고하세요.
