# Foundation admin (standalone)

Separate Next.js app for managing the Obijiaku Wives in Diaspora Care Foundation website.
Deploy it as its **own Vercel project** on a subdomain (e.g. `admin.your-domain.org`). It shares only the MongoDB database with the public site.

## Run locally
    npm install
    cp .env.example .env.local        # fill in MONGODB_URI, AUTH_SECRET, RESEND_API_KEY, MAIL_FROM
    npm run create-superadmin         # prompts for email + password (hidden)
    npm run dev                       # http://localhost:3100

## What exists today (phase 1 + part of 2)
- Sign-in: password, then a 6-digit code emailed through Resend. Optional authenticator app (Account page) replaces the email code, with backup codes.
- Roles: `superAdmin` (you) and `admin` (client). Admins are invited by the SuperAdmin only.
- Dashboard, donations (search, filters, date range, CSV export), account (password, authenticator, sessions), users and audit log (SuperAdmin only).

Not built yet: news/programs/trustees editing, image uploads (Cloudflare R2), volunteer and contact inboxes.

## Tests
    npm run build && npm run test:e2e   # 63 checks against a throwaway database; set CHROME_PATH if Chrome isn't in the default macOS location

## Deploying on Vercel
1. New Vercel project from this folder/repo. Add the environment variables from `.env.example`.
2. Production and Preview must use **different** `MONGODB_DB` / database users and a different `AUTH_SECRET`.
3. Add the domain `admin.your-domain.org`. Create the SuperAdmin with `npm run create-superadmin` from your machine, pointing `MONGODB_URI` at the production database.
4. Read SECURITY.md before going live.
