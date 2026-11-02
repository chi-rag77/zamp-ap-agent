# Deployment

## Architecture

```text
Browser → Render Node.js Web Service → Supabase (database and private storage)
                                  ↘ WorkOS, Gmail/Google Pub/Sub, NVIDIA NIM
```

The app uses Next.js server rendering and API routes, so it must run as a Render Web Service. It is not a static export. Invoice and attachment files stay in private Supabase Storage; Render's local filesystem is temporary.

## Render service

- Branch: `main`
- Root directory: repository root
- Runtime: Node.js 22.22.0
- Build: `npm ci && npm run build`
- Start: `npm start -- --hostname 0.0.0.0` (Next reads Render's `PORT`)
- Health: `/health` (process liveness only; no secrets or database details)
- Instance plan in Blueprint: Free

The free service sleeps after 15 minutes without inbound traffic, can take about a minute to wake, and may restart. Render documents that free instances are intended for testing/hobby workloads and are not recommended for production. Use a paid instance for reliable production availability.

## Environment variables

Set secrets in Render's Environment screen; never add them to this file or source control. `ZAMP_AUTH_REQUIRED=true` is intentional: the service must fail closed until WorkOS credentials and verified Supabase tenant isolation are configured.

Required to enable the signed-in workspace:

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL | Public configuration |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser/RLS key | Public configuration |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side privileged data operations | Secret |
| `WORKOS_API_KEY` | WorkOS server API | Secret |
| `WORKOS_CLIENT_ID` | WorkOS AuthKit client | Server configuration |
| `WORKOS_COOKIE_PASSWORD` | Session cookie encryption | Secret |
| `NEXT_PUBLIC_WORKOS_REDIRECT_URI` | Render AuthKit callback URL (`https://<service>.onrender.com/callback`) | Public URL |
| `ZAMP_TENANT_ISOLATION_READY` | Must be `true` only after WorkOS JWT/RLS tenant isolation is verified in Supabase | Server configuration |
| `NEXT_PUBLIC_APP_URL` | Canonical Render URL used for email links | Public URL |
| `AGENT_WORKER_SECRET` | Authenticates internal agent worker dispatch | Secret |
| `NVIDIA_API_KEY` | Invoice extraction and Copilot provider | Secret |
| `GMAIL_CLIENT_ID` | Gmail OAuth client | Secret/configuration |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth client secret | Secret |
| `GMAIL_INVOICE_MAILBOX` | Connected invoice mailbox address | Configuration |

Other optional settings are listed by name in `.env.example`. Keep production values in Render's secret store. Gmail refresh credentials remain in the existing Supabase credential table. Do not set `ZAMP_TENANT_ISOLATION_READY=true` until the WorkOS JWT template, Supabase third-party Auth integration, and tenant RLS policies have been verified. Update Google OAuth's authorized redirect URI to `/api/email/gmail/callback` on the Render host and WorkOS redirect URI to `/callback` before enabling sign-in.

## Scheduled recovery

The daily agent-worker recovery fallback is retained as a GitHub Actions scheduled workflow at 03:00 UTC. Set the repository variable `RENDER_APP_URL` and repository secret `AGENT_WORKER_SECRET` to enable it. Normal agent stages still dispatch immediately; the scheduled call recovers a queued stage. Render Cron Jobs have a minimum monthly charge, so the free setup does not create a paid cron service. Keep the existing Vercel schedule until this replacement is verified, then disable it to avoid duplicate fallback calls.

## Local development

```bash
npm ci
npm run dev
```

## Production build

```bash
npm run build
npm start
```

## Rollback

Keep the existing Vercel project and deployment active during validation. To roll back before domain cutover, point users back to the existing Vercel URL. After a custom-domain cutover, restore its prior Vercel DNS records and keep the Render service available until the rollback is verified. Do not delete Vercel or its cron until Render authentication, database access, API routes, email callbacks, uploads, and scheduled recovery have been proven.

## Cutover checklist

1. Configure Render environment variables and confirm the health endpoint.
2. Verify WorkOS sign-in and Supabase tenant scoping before enabling business data.
3. Update Google OAuth and Pub/Sub callback URLs, then test Gmail intake and email links.
4. Verify invoice reads/writes, document uploads/downloads, and agent dispatch.
5. Set and test the GitHub Actions URL/secret, then disable the Vercel cron only after the Render fallback succeeds.
6. Only then update custom-domain DNS and monitor before retiring Vercel.
