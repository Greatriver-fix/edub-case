# Erobb Case Opener

Source for the Erobb case-opening site. This repo currently includes the live runtime snapshot, including the SQLite database and uploaded assets.

## Requirements

- Bun 1.3.x

## Setup

1. Install dependencies:

```bash
bun install
```

2. Copy `.env.example` to `.env` and fill in any values you need.

3. The current repo snapshot already includes:

- `database.sqlite*`
- `uploads/`
- `DBBackups/`

If you remove the runtime data later, the backend will create a new empty SQLite database on first start and create empty upload folders automatically.

## Commands

```bash
bun run dev:backend
bun run dev:frontend
bun run build
bun run start:backend
bun run hash:admin -- "your-admin-password"
```

## Notes

- The app uses SQLite at `./database.sqlite`.
- Admin mode requires `ADMIN_PASSWORD_HASH` to be set.
- `PUBLIC_BASE_URL` and `CORS_ORIGINS` control deployment-specific URLs.
- If you deploy under a different domain, also update `public/robots.txt` and `public/sitemap.xml`.
