# SQLVisual Backend Deployment

GitHub Pages only serves the React files. Naver OAuth, saved SQL documents, and recent SQL history need this Node backend to run on a public server.

`localhost` is only the current computer. If the frontend is opened from another computer, `http://localhost:3001/api` points to that other computer, not to your development PC.

## Recommended Setup

Deploy `backend/` to a public Node host such as Render, Railway, Fly.io, or a VPS.

For Render Web Service:

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Node version: 20 or newer

Set these environment variables on the backend host:

```env
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
NAVER_CALLBACK_URL=https://your-backend.example.com/api/auth/naver/callback
FRONTEND_URL=https://jiwon0524.github.io/sql-visual/
CORS_ORIGINS=https://jiwon0524.github.io,http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174
JWT_SECRET=replace_with_a_long_random_secret
```

Most hosts provide `PORT` automatically. Only set `PORT` manually if your host tells you to.

## Naver Developers Settings

In the Naver Developers app settings, add:

- Service URL: `https://jiwon0524.github.io`
- Callback URL: `https://your-backend.example.com/api/auth/naver/callback`

For local testing on this computer, you can also keep:

- Service URL: `http://127.0.0.1:5174`
- Callback URL: `http://localhost:3001/api/auth/naver/callback`

The callback URL in Naver Developers must exactly match `NAVER_CALLBACK_URL`.

## Connect GitHub Pages To The Backend

After the backend is deployed, open the login screen on:

```text
https://jiwon0524.github.io/sql-visual/
```

Enter the public API URL:

```text
https://your-backend.example.com/api
```

The app stores that API URL in the browser. You can also share a setup link:

```text
https://jiwon0524.github.io/sql-visual/?api=https://your-backend.example.com/api
```

For a permanent build-time connection, set this frontend environment variable before running `npm run deploy`:

```env
VITE_API_BASE_URL=https://your-backend.example.com/api
```

## Local Network Preview

If you only want another device on the same Wi-Fi to see the frontend preview:

```bash
cd frontend
npm run dev:host
```

Then open the shown network URL from the other device. OAuth login still needs a backend URL and Naver callback URL that are reachable from that device, so a public backend is the clean path for real login.
