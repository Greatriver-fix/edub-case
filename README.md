# Erobb Case Opener

This repo is the old Erobb case-opening site, handed off more or less as-is with the current working data snapshot.

The main thing to know up front: this is not a Vite app, not a Next app, and not a separate frontend/backend monorepo. It is one Bun-powered project with:

- a React + TypeScript frontend
- a Hono backend running on Bun
- a SQLite database
- uploaded image/audio assets stored on disk

I left the live runtime files in here on purpose so the next person can boot it with the existing content instead of starting from an empty DB.

## Exact stack

- Runtime / package manager / build tool: Bun `1.3.x`
- Frontend: React `19` + TypeScript
- Frontend styling: plain CSS files in `src/styles` and component CSS files
- Backend: Hono `4`
- Database: SQLite via `bun:sqlite`
- Image processing: `sharp`
- Audio metadata parsing: `music-metadata-browser`
- Drag and drop in admin UI: `@dnd-kit/*`
- Markdown rendering for FAQ pages: `marked`
- Logging: `pino`
- Admin password hashing: `bcrypt`
- Process manager in production: PM2 config included in `ecosystem.config.cjs`

If someone asks "what framework is this?", the honest answer is:

- frontend is a custom Bun + React app
- backend is a small Hono server
- data layer is raw SQLite, no ORM

## Repo layout

- `src/` = frontend app
- `server/` = Hono API, DB setup, migrations, upload handling
- `public/` = static files copied into the frontend build
- `uploads/` = runtime image/audio assets used by the app
- `database.sqlite*` = live SQLite database files
- `DBBackups/` = backup folder, currently just kept in the repo structure
- `scripts/build-frontend.ts` = production frontend build script
- `scripts/process-existing-images.ts` = one-off asset migration script

## Important handoff notes

- This repo currently includes the runtime snapshot:
  - `database.sqlite`
  - `database.sqlite-shm`
  - `database.sqlite-wal`
  - `uploads/`
- The backend will auto-create missing `uploads/` folders and a fresh SQLite DB if those files are removed later.
- The frontend talks to `http://localhost:3001` in development and uses relative API paths in production.
- The FAQ pages are server-rendered from `src/faq/faq.md` and served under `/api/faq`.
- The backend also serves `/uploads/*` directly.
- `public/robots.txt` and `public/sitemap.xml` still point at the live domain. If the site moves, update those.
- There is no real test suite in this repo right now.

## Local setup

1. Install dependencies:

```bash
bun install
```

2. Copy the example env file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Set any env values you want to override.

For most local work, the defaults are enough except for admin mode, which needs an admin password hash.

## Environment variables

Current env vars:

- `PORT`
  - Backend port. Defaults to `3001`.
- `PUBLIC_BASE_URL`
  - Used for canonical URLs in the FAQ pages.
- `CORS_ORIGINS`
  - Comma-separated allowed origins for the backend.
- `ADMIN_PASSWORD_HASH`
  - Required if you want to use admin mode.

To generate a bcrypt hash for the admin password:

```bash
bun run hash:admin -- "your-admin-password"
```

Then paste the generated `ADMIN_PASSWORD_HASH=...` value into `.env`.

## Running locally

Backend:

```bash
bun run dev:backend
```

Frontend:

```bash
bun run dev:frontend
```

If you want both at once:

```bash
bun run dev
```

Frontend dev server runs from `src/index.tsx`.
Backend entry point is `server/index.ts`.

## Production-ish build

Build the frontend:

```bash
bun run build
```

That outputs a static frontend build into `build/`.

Start the backend in production mode:

```bash
bun run start:backend
```

There is also a PM2 config in `ecosystem.config.cjs` if you want to run the backend that way.

## A few practical notes for the next dev

- Most of the app logic is pretty direct. If you want to understand the whole thing quickly, start with:
  - `src/components/App.tsx`
  - `server/index.ts`
  - `server/db.ts`
  - `server/routes/cases.ts`
  - `server/routes/itemTemplates.ts`
- Schema setup and migrations live in `server/db.ts`.
- The admin UI is part of the main frontend, not a separate app.
- A lot of content is data-driven from the SQLite DB and `uploads/`, so the runtime files matter.
- If you ever want to make the repo lighter, the easiest cleanup is to stop tracking `uploads/` and `database.sqlite*` again and move them out of git.

## If something looks broken

- Missing assets usually means `uploads/` paths no longer match the DB rows.
- A fresh empty DB will make the app look "working but blank".
- Admin mode not working usually means `ADMIN_PASSWORD_HASH` is missing or wrong.
- If FAQ links look wrong in production, check `PUBLIC_BASE_URL`, `public/robots.txt`, and `public/sitemap.xml`.
