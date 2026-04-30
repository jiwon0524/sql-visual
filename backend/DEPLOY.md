# SQLVisual Backend Deployment

GitHub Pages only serves the React files. Naver OAuth, saved SQL documents, and recent SQL history need this Node backend to run on a public server.

The frontend must call the public Render backend. A browser opened on another computer cannot use a backend address that points to the developer's own machine.

## Recommended Setup

Deploy `backend/` to a public Node host such as Render, Railway, Fly.io, or a VPS.

This repository includes `render.yaml` for Render Blueprint deployment. The intended public API URL is:

```text
https://sql-visual.onrender.com/api
```

The GitHub Pages frontend is configured to use that URL by default in production.

For Render Web Service:

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Node version: 24 or newer

Set these environment variables on the backend host:

```env
NAVER_CLIENT_ID=your_naver_client_id
NAVER_CLIENT_SECRET=your_naver_client_secret
NAVER_CALLBACK_URL=https://sql-visual.onrender.com/api/auth/naver/callback
FRONTEND_URL=https://jiwon0524.github.io/sql-visual
CORS_ORIGINS=https://jiwon0524.github.io
JWT_SECRET=replace_with_a_long_random_secret
DATA_FILE=/var/data/sqlvisual-data.json
SQLITE_FILE=/var/data/sqlvisual-data.sqlite
STORE_ENGINE=sqlite
ADMIN_NAVER_IDS=your_naver_account_id
ADMIN_EMAILS=you@example.com
```

Most hosts provide `PORT` automatically. Only set `PORT` manually if your host tells you to.

## Persistent Data

Saved documents, shared board posts, comments, likes, and display names are stored in SQLite when Node 24+ is available. The older JSON file remains as a migration source and fallback. On Render, a normal web service filesystem can be reset when the service redeploys or restarts. To keep data after updates, attach a persistent disk and store the SQLite file there.

If you deploy with the included `render.yaml`, it creates:

- Disk name: `sqlvisual-data`
- Mount path: `/var/data`
- SQLite file: `/var/data/sqlvisual-data.sqlite`
- Legacy migration file: `/var/data/sqlvisual-data.json`

If you created the Render service manually, add the disk in Render Dashboard and set:

```env
SQLITE_FILE=/var/data/sqlvisual-data.sqlite
STORE_ENGINE=sqlite
```

You can confirm the backend is using persistent storage at:

```text
https://sql-visual.onrender.com/api/health
```

The response should include `"store": "sqlite"` and `"persistentStore": true`.

## Admin Account

The operation console is only shown when the logged-in Naver account matches an admin allowlist on the backend. Do not hard-code your personal account in the repository.

Set one or both of these backend environment variables:

```env
ADMIN_NAVER_IDS=naver_profile_id_from_login
ADMIN_EMAILS=your_naver_login_email@example.com
```

`ADMIN_NAVER_IDS` is the safest identifier because it comes from Naver's stable profile `id`. After setting it, log in once, open `/api/me` while authenticated, and confirm `"is_admin": true`.

Admins can review reports, hide shared posts, hide comments, block users from writing, and export a full JSON backup from the operation console.

## Naver Developers Settings

In the Naver Developers app settings, add:

- Service URL: `https://jiwon0524.github.io`
- Callback URL: `https://sql-visual.onrender.com/api/auth/naver/callback`

The Naver app key is the service key for SQLVisual. Users do not share your Naver account. When they click Naver login, Naver authenticates their own Naver account and the backend stores a separate SQLVisual user by that account's `naver_id`.

For a public service, make sure the Naver Developers app is configured for real users, not only local development testers. If Naver requires review for your selected profile permissions, complete the Naver Login review/service application before inviting other users.

The callback URL in Naver Developers must exactly match `NAVER_CALLBACK_URL`.

## Connect GitHub Pages To The Backend

After the backend is deployed, open the login screen on:

```text
https://jiwon0524.github.io/sql-visual/
```

The app is hard-wired to call `https://sql-visual.onrender.com/api` in production so every visitor uses the same public backend.

## Local Network Preview

If you only want another device on the same Wi-Fi to see the frontend preview:

```bash
cd frontend
npm run dev:host
```

Then open the shown network URL from the other device. OAuth login still uses the public Render backend.

## Account Switching

The frontend has two login buttons:

- `네이버 OAuth 로그인`: continues with the Naver account already signed in to the browser when possible.
- `다른 네이버 아이디로 로그인`: asks Naver to reauthenticate so a different person can choose their own Naver ID on a shared browser.
