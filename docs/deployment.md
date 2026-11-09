# Deploying Gratitude Stories

The app is one Node.js 22 service plus one PostgreSQL 16 database. Any host that runs a Node process or a container works. This guide covers Render (simplest) and any Docker host.

## Before you start

You need:

- **The domain printed on the cards** (e.g. `gratitude.ng`). It becomes `PUBLIC_BASE_URL` and can never change once cards are printed.
- **A managed PostgreSQL database with automatic daily backups.** Both options below include one.
- Optional, but recommended before the pilot: a **Resend** account with that domain verified, for sign-in links and reminder emails.

## Settings

The server refuses to start in production until the required settings are present, and lists every missing one in the log.

| Setting | Required | What it is |
| --- | --- | --- |
| `NODE_ENV` | yes | `production` |
| `DATABASE_URL` | yes | PostgreSQL connection string (use the host's *internal* URL when it offers one) |
| `PUBLIC_BASE_URL` | yes | `https://` origin printed on cards, no path. Used in QR codes, reminder and recovery links |
| `PASS_ON_AMOUNT_KOBO` | yes | Price of a passed-forward box in kobo (₦15,000 = `1500000`) |
| `STAFF_ADMIN_TOKEN` | yes, at first | 32+ random characters. Lets you sign in once to create named staff accounts; remove it afterwards |
| `TRUST_PROXY` | behind a proxy | `true` on Render, Railway, Fly and most hosts, so rate limiting sees real visitors |
| `SUPPORT_WHATSAPP_NUMBER` | optional | Digits only, e.g. `2348030000000`. Shows a WhatsApp button on the help page |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | optional | `resend` plus key and a sender on your verified domain. Unset = reminders stay manual |
| `METRICS_TOKEN` | optional | 32+ characters; enables `GET /metrics` |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_CALLBACK_URL` | later | Online payments (deferred) |

Generate random tokens with `openssl rand -base64 33`. Never commit them; set them in the host's dashboard.

## Option A: Render

1. Push the repository to GitHub (already done).
2. In Render: **New → Blueprint**, choose the repository. Render reads `render.yaml` and proposes a web service and a database in Frankfurt (its closest region to Lagos).
3. Check the plans and prices on the preview screen, then fill in the values it asks for: `PUBLIC_BASE_URL`, `PASS_ON_AMOUNT_KOBO`, and optionally WhatsApp and email.
4. Apply. Each deploy builds the app, **runs database migrations**, then starts the new version once `/ready` answers.
5. **Custom domain:** in the web service's Settings, add your domain and create the DNS record Render shows. HTTPS certificates are automatic.
6. Your bootstrap admin token is under the web service's **Environment** tab (`STAFF_ADMIN_TOKEN`).

## Option B: any Docker host (Railway, Fly.io, a VPS, …)

```sh
docker build -t gratitude-stories .
# Once per deploy, before starting the new version:
docker run --rm --env-file .env.production gratitude-stories npm run db:migrate:built
docker run -d --env-file .env.production -p 3000:3000 gratitude-stories
```

Put HTTPS in front (most platforms do this for you), point the domain at it, and set `TRUST_PROXY=true`. The container reports health on `/health`. Use `/ready` (which also checks the database) for the platform's health check.

Without Docker, the same steps are: `npm ci --include=dev && npm run build && npm prune --omit=dev`, then `npm run db:migrate:built`, then `npm start`.

## First sign-in

1. Open `https://<your domain>/admin` and paste the `STAFF_ADMIN_TOKEN`.
2. Go to **Staff** and create an administrator account for yourself. Copy the token it shows (it is shown once) into your password manager.
3. Sign out, sign in with your own token, and create accounts for the rest of the team (operations for fulfilment staff).
4. Remove `STAFF_ADMIN_TOKEN` from the host's settings and redeploy. From now on the history shows each person by name.

## Every deploy

- Migrations run automatically on Render (`preDeployCommand`); on other hosts run `npm run db:migrate:built` before starting the new version. Migrations are safe to re-run.
- CI must be green first: it runs the database tests, builds the production bundle and boots it in production mode.

## Checks after the first deploy

- `https://<domain>/ready` returns `{"status":"ready","storage":"postgres"}`.
- Sign in to `/admin`, start a test trail, issue a 1-card batch and scan the printed QR with a phone: it should open `https://<domain>/b/…`.
- Run the full dry run from the brief (a test trail reaching its third person) before inviting real recipients.

## Backups and recovery

- Confirm in the host's database settings that **daily backups** are on and note how long they are kept.
- Before the pilot, do one **restore drill**: restore a backup into a new database, point a copy of the app at it, and check `/ready`. A backup you have never restored is a hope, not a plan.

## Rolling back

Redeploy the previous version from the host's dashboard. Migrations only ever add tables and columns, so the previous version keeps working against the newer database.
