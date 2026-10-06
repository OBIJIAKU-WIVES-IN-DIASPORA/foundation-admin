# Security notes

## How access is controlled
- **Sign-in:** Argon2id passwords, then a second step that is mandatory: an emailed 6-digit code (10 minutes, 5 attempts, hashed, single use), or an authenticator app code (TOTP, replay-protected), or a one-time backup code.
- **Sessions:** random 256-bit token in a `__Host-` HttpOnly, Secure, SameSite=Strict cookie. Only its SHA-256 hash is stored, so sessions can be revoked. 30 minutes idle, 12 hours maximum. The role is read from the database on every request.
- **Authorization:** `lib/dal.ts` (`requireUser`, `requireRole`) runs in every page, Server Action and route handler. `proxy.ts` only redirects for convenience and sets the CSP.
- **Sensitive actions** (inviting, disabling, resetting 2FA) require the current password again.
- **No self-service sign-up.** The SuperAdmin is created only by `npm run create-superadmin` on a trusted machine. The web UI can never create or change a SuperAdmin.
- **Brute force:** per-IP, per-account and per-account-per-IP counters in MongoDB (auto-expiring), plus per-challenge attempt limits.
- **Data:** authenticator secrets are AES-256-GCM encrypted (key derived from `AUTH_SECRET`); backup codes, invite tokens and session tokens are hashed. Audit log never stores secrets.
- **Browser:** per-request CSP nonce (no inline scripts), `frame-ancestors 'none'`, HSTS, `no-store`, `noindex`, `no-referrer`.

## Known trade-offs
- **Lockout can't lock the real owner out.** An attacker who knows only an email address can trip the lockout for *unrecognised* browsers, but not for browsers the owner has already signed in from. Those carry a secret "known browser" cookie (stored hashed, 90 days) and are limited only by their own failure count (10 per 15 minutes), so a stolen cookie still can't brute-force the password. A known browser always needs the password and the second step. The owner is emailed (at most once an hour) when someone keeps failing. Known browsers are forgotten when the password changes, an account is disabled or reset, or the owner clicks "Forget all known browsers". Remaining effect: the owner on a brand-new browser has to wait 15 minutes if an attack is in progress.
- Email codes are only as safe as the mailbox. Turn on the authenticator app for the SuperAdmin, and enable 2FA on the client's email account.
- Changing `AUTH_SECRET` signs everyone out and disables every enrolled authenticator (they must re-enrol; the SuperAdmin can reset them).

## Database users (do this in MongoDB Atlas)
Use separate users so a hole in the public site can never touch admin data:
| App | Allowed |
|---|---|
| Public website | read/write `donations`, `counters`; read content collections; **no access** to `admin*` or `auditLogs` |
| Admin app | read/write `admin*`, `auditLogs`; read `donations`; read/write content collections (later) |
Also: restrict Atlas network access, turn on backups, use a long random password for each user.

## Before going live
- [ ] `AUTH_SECRET` is 48+ random characters and different per environment
- [ ] Resend domain verified (SPF, DKIM, DMARC) so sign-in codes arrive
- [ ] SuperAdmin has the authenticator app on
- [ ] `npm run test:e2e` passes against the production build
- [ ] Vercel Firewall rate-limit rule on `/login` (extra layer)
- [ ] Optionally restrict the subdomain with Cloudflare Access or an IP allowlist
- [ ] Have someone independent review the setup
