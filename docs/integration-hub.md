# Organization Integration Hub

## Placement and release scope

Organization settings → Integrations. A settings shortcut sits next to the profile in the application header. The existing sidebar Settings entry now reads Organization settings.

This change delivers the Phase 11 **hub and connection-test foundation**, not the entire universal integration execution platform.

Implemented:
- Categorized, searchable 28-provider catalog. Availability is explicit.
- Existing Gmail integration opens Email Intake.
- REST/OData configuration wizard with development/staging/production labels.
- Optional OpenAPI 3.x JSON discovery in the browser; no remote references are fetched.
- Saved drafts, server-side read-only GET connection tests, health, runs, errors, credential references and audit history.
- Bearer/API-key header authentication using namespaced server secrets. No secret values are accepted or returned by this UI/API.
- Public IPv4 HTTPS-only network boundary, DNS address pinning, redirect refusal, timeout, bounded retries for transient HTTP errors, one concurrent test per connection and test rate limits.
- Disconnect clears the credential reference and retains history. It cannot be accidentally reactivated by a concurrent test.

Not implemented in this release:
- Native SAP/Oracle/Dynamics/Slack/Teams execution; those adapters are labeled Coming soon.
- Generic OAuth flows, credential rotation UI, canonical mapping editor, visual workflows, triggers, subscriptions, webhook delivery, execution workers, financial writes/readback verification, DLQ, role-specific access, production promotion/rollback, AI copilot and realtime subscriptions.
- Environment labels do not provide separate deployments or promotion. Version is the initial configuration version, not a version history feature.
- OpenAPI discovery does not save or execute operations; it only suggests a GET path.

No invoice processing/decision code is changed. No emails or Slack/Teams messages are sent by connection tests.

## Setup

Apply `20261024141458_organization_integration_hub.sql`. The UI uses the existing protected single-workspace access boundary. Browser roles have no direct database grants; routes require the enabled workspace and same-origin mutation requests. Keep Vercel deployment access protection enabled. This does not implement per-user RBAC or multi-organization tenancy.

For authenticated connections, add a server environment variable with a name such as `INTEGRATION_ERP_TOKEN`, then redeploy. Enter only that name in the credential-reference field. The code refuses references outside `INTEGRATION_*`; existing Supabase/Google/NVIDIA variables cannot be selected.

A successful connection test means the configured GET endpoint returned HTTP 2xx. It does not validate ERP posting permissions, business data or downstream execution. Responses are discarded; bodies, credentials and outbound headers are not logged. IPv6-only and mixed private/public DNS destinations are rejected.

## Validation

- 59 focused tests: config validation, credential reference boundaries, SSRF address/DNS rejection, retries, OpenAPI discovery and availability labels.
- Full existing suite: 166 passing tests.
- TypeScript, ESLint and production build.
- Browser: configuration wizard → draft save → live unauthenticated GET of GitHub's public API → HTTP 200, healthy state, audit trail.
- Database: verified RLS enabled and anon/authenticated grants revoked on all three new tables.
- Supabase advisor: deny-by-default RLS tables intentionally have no public policies. Existing `pg_net` public-schema warning predates this change; see https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public.
