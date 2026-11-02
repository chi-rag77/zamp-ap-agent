# Zamp AP Agent — Phases 01–07, Policy Intelligence, and AP workspace UI

The repository contains a Supabase domain foundation, a server-side NVIDIA invoice extraction pipeline, and a deterministic invoice matching engine. Phase 02 reads documents and stores append-only extraction history. Phase 03 resolves vendors and purchase orders, compares invoice lines with purchase orders and receipts, checks financial arithmetic and duplicates, and stores versioned validation results. Phase 04 evaluates those facts against a versioned policy and records approval, review, rejection, or cannot-decide eligibility. Phase 05 orchestrates those services and executes guarded invoice status actions. There is no payment execution.

## Phase 06 email intake

`packages/email` adds Gmail OAuth refresh, message/history APIs, watch renewal, MIME tree parsing, deterministic classification, size/MIME/signature checks, SHA-256 deduplication, private Storage uploads, email document records, source-linked invoices, extraction, and extraction. Phase 07 starts a durable agent run after intake and dispatches each orchestration stage to a separate worker request. The code uses `gmail.readonly`; it does not send or relabel mail. A valid Pub/Sub push request must carry a Google-signed OIDC token matching the configured audience and service account. The webhook saves a sync job and schedules work after its response. A separate manual or scheduled sync can recover from missed notifications or expired Gmail history.

The existing invoice document table is the canonical extraction source. Source email metadata is held in `email_intakes`, `email_messages`, and `email_attachments`. `email_documents` preserves both invoice and supporting files; inline logos are ignored. The private `invoice-documents` bucket is reused. No vendor, PO, amount, or currency is guessed at intake time. The existing Phase 02 extraction fills those values, followed by validation, policy, and the agent. Content hashes are claimed before invoice creation to avoid parallel duplicate invoices. Email bodies and document content remain untrusted inputs.

Configure `.env.local` using `.env.example`. For local OAuth setup, create a Web application client with redirect URI `http://localhost:3000/api/email/gmail/callback`, then set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_INVOICE_MAILBOX`. Open `/api/email/gmail/connect` from the app and grant the Gmail read-only scope to issue a refresh token; the callback stores it in a server-only Supabase table protected by RLS and explicit grants. The Gmail OAuth refresh token must belong to `GMAIL_INVOICE_MAILBOX` and include the `gmail.readonly` scope. For Vercel, enable Vercel Authentication with **All Deployments** before setting `ZAMP_ENABLE_PROTECTED_WORKSPACE=true`; set all required service credentials as encrypted Vercel environment variables and add the deployed callback URI to the Google OAuth client. Never commit `.env.local` or place service-role, OAuth, NVIDIA, or refresh-token credentials in `NEXT_PUBLIC_*` variables. Set `GMAIL_PUBSUB_TOPIC` to a topic in the same Google Cloud project as the Gmail watch; grant Gmail's push service account publisher access. Create an authenticated Pub/Sub push subscription pointing to `/api/email/gmail/webhook`, then set its OIDC audience and service-account email as `GMAIL_PUBSUB_AUDIENCE` and `GMAIL_PUBSUB_SERVICE_ACCOUNT`. Set a strong `EMAIL_ADMIN_TOKEN` for remote sync, watch renewal, and status calls. In local development and the protected Vercel workspace, same-origin UI calls are also accepted. Run `npm run email:watch` to create the watch, renew it daily before expiry, and run `npm run email:sync` on a schedule as a fallback. A full sync is capped at 1,000 recent messages per run; it fails without advancing the cursor if more pages remain.

`/email-intake` shows intake counts, statuses, attachments, invoice links, and agent runs. **Sync Gmail now** calls the manual route when configured. **Test with fixture** submits a development-only synthetic email and may flag the file as a duplicate after its first use. `npm run email:test` runs local parser, classification, security, and API retry tests. `npm run test:e2e` creates a uniquely marked fixture document in the connected Supabase project, drains the durable worker stages, and checks storage, extraction, final verification, and audit links using the mock vision provider. It creates labelled demo data. A genuine Gmail-to-Pub/Sub test still requires mailbox OAuth, topic, and push subscription configuration; these credentials are not in this repository.

Gmail watch and sync behavior follow [Google's push guide](https://developers.google.com/workspace/gmail/api/guides/push) and [synchronization guide](https://developers.google.com/workspace/gmail/api/guides/sync). The webhook validates tokens according to [Pub/Sub authenticated push](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions). Document previews should use short-lived [private bucket signed URLs](https://supabase.com/docs/guides/storage/serving/downloads).

## Phase 07 agent orchestration

`packages/agent` contains an explicit state machine, bounded planner, registered Zod-validated tools, retry policy, action guard, verifier, and run manager. The planner is deterministic. The invoice text, OCR, vendor names, and attachment metadata are never used as instructions or as an authority to select a financial action. The `prompts.ts` boundary is prepared for future explanatory model use; Phase 05 currently does **not** call an LLM in the orchestration path. This prevents unsupported model output from affecting decisions.

Each live run and its first `agent_jobs` row are created atomically. One locked worker claims one stage, writes tool traces and a JSON context checkpoint, then atomically stores the checkpoint and queues the next stage. A lease permits a crashed worker job to be reclaimed. Retries stay at the failed stage with bounded exponential backoff; Vercel Cron recovers missed dispatches daily as a fallback. Run and intake triggers dispatch immediately, then each worker dispatches the next stage. Duplicate triggers return the existing active run. `agent_run_steps`, audit events, and immutable Phase 04 decisions preserve traceability. The action RPC checks the current run, invoice status, policy, validation, extraction identity, evidence, decision freshness, and action type under row locks. A unique partial index permits one active live run per invoice. Review decisions put the run in `WAITING`; human decisions record a distinct `HUMAN_APPROVED` or `HUMAN_REJECTED` outcome and audit event. Automatic approval or rejection is reported only after invoice state and action records verify. No payment execution occurs.

The workspace exposes `POST /api/agent/runs`, the authenticated `POST /api/agent/worker` stage runner, run status, steps, actions, events, retry, cancel, and saved decision routes. `POST /api/agent/runs/:runId/decision` resolves a waiting human review with a required reason. Worker calls require `AGENT_WORKER_SECRET` (or Vercel's `CRON_SECRET`); set it in Preview and Production. Vercel Hobby allows daily Cron schedules, so the configured daily job is a recovery fallback; normal run and email intake triggers dispatch immediately, and each worker dispatches the next stage. Run and email intake triggers dispatch immediately after their response. `POST /api/agent/runs` returns `202 QUEUED` for live mode. Use `{ "invoiceId": "UUID", "mode": "SIMULATION" }` for a read-only result. These endpoints are local and same-origin only until application authentication and organization permissions are implemented. The invoice case offers **Run agent**, and Agent Activity links to a run detail with steps, actions, events, and decision.

Run the required checks with `npm run typecheck`, `npm run lint`, `npm test`, `npm test -- agent`, `npm run test:integration`, and `npm run build`. The integration script simulates an existing dedicated demo invoice and verifies that the invoice and action counts are unchanged. A live demo review run and isolated, labelled demo approval and confirmed-duplicate rejection runs have been verified in Supabase. The isolated live smoke command is `RUN_LIVE_AGENT_SMOKE=yes npm run smoke:agent:live`; it creates labelled demo records and leaves them for inspection. Run it only against the dedicated Zamp Supabase project. Exhausted jobs are marked `FAILED` and audited as `SYSTEM_PROCESSING_FAILURE`; no financial action is attempted. Human decisions are available only for runs paused in `WAITING` with an open review case.

## Live project

The dedicated Supabase project is [zamp-ap-agent](https://supabase.com/dashboard/project/umredhscpvsuwqbnreod) in Mumbai (`ap-south-1`). Its API URL is `https://umredhscpvsuwqbnreod.supabase.co`. The SQL migrations in `supabase/migrations` are applied there. Public tables have RLS enabled and no browser policies; the server uses a secret key. Never put the secret key or `EXTRACTION_API_TOKEN` in a public environment variable or Git.

Copy `.env.example` to `.env.local` at the repository root. Fill the project URL, publishable key, server secret, and an independent random `EXTRACTION_API_TOKEN`. The local file is ignored by Git. Set `AI_PROVIDER=mock` for fixture extraction or `AI_PROVIDER=nvidia` for real NIM. The local `npm run dev` command loads this root file automatically.

## NVIDIA setup

Set `NVIDIA_API_KEY` in `.env.local` for real mode. The default model in `.env.example` is `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, selected after live invoice tests. `NVIDIA_BASE_URL` defaults to `https://integrate.api.nvidia.com/v1`; change it for a self-hosted NIM. Set `NVIDIA_REQUEST_TIMEOUT_MS` (default 90000), `NVIDIA_MAX_OUTPUT_TOKENS` (default 8192), `NVIDIA_MAX_ATTEMPTS` (maximum 3), and `NVIDIA_JSON_MODE=true` only when the selected model supports JSON response format. Nano Omni's reasoning output is disabled for JSON extraction. The provider offers a `health()` method that checks the configured model against `GET /models`. Extraction calls `POST /chat/completions` with ordered text and base64 image parts. It retries timeouts, network errors, HTTP 429 and 5xx, but never retries auth errors or invalid documents. It retries truncated/malformed model output once before failing closed. The app never switches to mock after a real provider failure.

NVIDIA model availability, input limits, and structured-output support depend on the selected model. See the [model survey and live test notes](docs/nvidia-model-selection.md) and the [Nano Omni API reference](https://docs.api.nvidia.com/nim/re/reference/nvidia-nemotron-3-nano-omni-30b-a3b-reasoning-infer) before changing `NVIDIA_MODEL`. The repository does not contain an NVIDIA API key; the ignored local `.env.local` is required for real NIM calls.

## Zamp Copilot MVP

Set `NVIDIA_COPILOT_MODEL=nvidia/nemotron-3.5-bolt-e4b` alongside the server-only `NVIDIA_API_KEY` to enable the read-only Copilot panel. Copilot uses organization-authorized invoice search and detail, PO and linked procurement history, vendor history, active policy, approved policy-source search, invoice activity, queue summaries, and original invoice document inspection tools. It can use the current invoice/PO/vendor page as conversational context. Multi-tool lookups are bounded and parallelized; all record searches are organization-filtered and capped. The assistant never changes records, approves/rejects invoices, or decides financial outcomes.

Copilot routes ordinary questions to the configured compact model, complex cross-record analysis to `NVIDIA_COPILOT_DEEP_MODEL` (default `nvidia/nemotron-3-ultra-550b-a55b`), and original-document questions to `NVIDIA_COPILOT_VL_MODEL` (default `nvidia/nemotron-3.5-super-vl-120b-a12b`). Specialized model errors fall back once to the configured default; document questions then use saved extraction evidence and disclose that visual inspection was unavailable. Visual inspection renders at most three pages from the invoice on the current tenant and only when the user asks about the document. Policy-source retrieval searches active organization policy imports and returns at most six short excerpts; it currently uses bounded text search rather than vector embeddings/reranking. Model routing can be disabled or changed through server-side environment variables without changing invoice extraction configuration.

## Document support

`packages/document` checks the file signature against its MIME type and enforces `MAX_INVOICE_FILE_SIZE_MB=20`. It reads PNG and JPEG with `sharp`, corrects orientation, and keeps full resolution. PDF page counting and rendering use the pinned `pdf-parse`/PDF.js runtime, with `MAX_INVOICE_PAGES=20`, 1240-pixel page width, and deterministic page order; this works in serverless deployments without a system Poppler install. The private `invoice-documents` Supabase Storage bucket accepts PDF, PNG, and JPEG.

## Extraction schema and persistence

The model output includes document classification, invoice number and dates, vendor and buyer, PO number, currency, line items, subtotal, tax, total, payment terms, per-field confidence, and optional page provenance. Zod rejects wrong types or confidence outside 0–1. Normalization maps explicit currency symbols and names to ISO codes, parses common date forms, and flags ambiguous dates. Math checks compare quantity × price, line sums, and subtotal + tax without changing extracted values. Missing PO alone is allowed. A non-invoice or blank document cannot become a successful invoice extraction.

`invoice_extractions` stores the raw model response, parsed and normalized outputs, model and prompt versions, usage, latency, validation result, status (`COMPLETE`, `PARTIAL`, `INVALID`, `FAILED`), and a canonical flag. History is append-only except for changing the canonical flag. `invoices.current_extraction_id` points to the latest successful result. A single Postgres RPC updates current invoice fields, complete line items, run steps, run status, and audit event. Incomplete line items remain in extraction history and are not fabricated in `invoice_lines`. A separate RPC records failures. No Phase 02 code changes vendor, PO, approval, or rejection decisions.

## Run locally

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```

`npm run dev` starts a Webpack development server with polling for this macOS environment, then serves the connected workspace at `http://localhost:3000`. The UI follows the supplied Base44 layout with a light-blue theme: overview, invoice list and case, purchase orders, vendors, exceptions, processing activity, live runs, email intake, rules, analytics, settings, and audit log. Its metrics and tables use actual Supabase records, not fabricated approvals. The upload button stores a PDF/PNG/JPEG privately, runs NVIDIA extraction, then invokes deterministic validation. The UI and its upload/document endpoints are deliberately available only in local development until authentication and authorization are implemented; the existing bearer-token extraction endpoints remain separate.

## Phase 04 policy decisions

`packages/policy` consumes the exact saved Phase 03 result, the active version of the existing `policies` record, and server-loaded extraction confidence and vendor status. It produces a deterministic decision, reason code, threshold evidence, blockers, warnings, and a recommended next step. Missing or invalid facts fail closed. The database stores immutable decision history and an audit event, while `action=NONE` keeps eligibility separate from approval, rejection, and payment execution.

The local Rules & Policies page displays the active policy in the light-blue Base44 style. An invoice case shows saved decision evidence and offers an explicit **Evaluate policy** button. The local-only endpoint requires a same-origin POST. From the command line, run:

```bash
node --import tsx scripts/evaluate-policy.ts INVOICE_UUID
```

The default active policy is installed by the Phase 04 migration. Create a new policy version for future configuration changes; used versions cannot be edited. Two real saved invoices were evaluated in the connected project: one eligible for automatic approval and one requiring review. Neither changed invoice status or initiated payment.

## Policy Intelligence import

Open **Rules & Policies → Import policy with AI** in the local workspace. Upload up to 12 policy files per package (PDF, DOCX, XLSX, XLS, CSV, PNG, or JPEG; 20 MB per file and 40 MB total). File signatures, extensions, and MIME claims are checked before the originals enter the private `policy-sources` bucket. PDF and Word text, spreadsheet cells, and CSV rows are parsed before AI extraction; scanned pages and images use the configured NVIDIA vision model. Legacy XLS conversion needs LibreOffice `soffice` on the host. PDF processing needs Poppler. Temporary conversion files are removed after use.

The review page shows each proposed rule, confidence, exact source quote, and original document. The reviewer can edit, approve, or ignore rules and resolve ambiguities, conflicts, unsupported statements, and drift. A source-aware assistant answers questions from the saved extraction and cites documents. Approved thresholds can produce deterministic boundary test cases. Saving creates a **draft** policy by applying supported rules to the active baseline; unsupported operators, actions, scopes, and values fail closed. Historical simulation compares the draft with the current policy on recent validated invoices. Activation is an explicit action after review and simulation, performed in one database transaction; it also rejects a stale simulation if the active policy has changed.

Policy import tables and storage have RLS with service-role-only access. Import API routes are restricted to the local same-origin workspace because user authentication and organization authorization are not yet present. The live smoke test used a synthetic CSV and confirmed upload, NVIDIA extraction, review, draft creation, and simulation; no sample policy was activated.

## Phase 03 matching

`packages/matching` evaluates normalized vendor GSTIN/tax ID or exact name, PO number and ownership, one-to-one SKU/description line matches, remaining PO quantity after approved prior invoices, price and tax variances, amount arithmetic, duplicate signals, and optional aggregate receipt quantities. It uses decimal arithmetic and emits evidence, reasons, blockers, warnings, 2-way and 3-way statuses. Fuzzy vendor names only produce review candidates. Missing evidence never becomes a passing check.

`packages/database/src/matching-repository.ts` loads related records in batches. Migration `20261022233800_invoice_validation.sql` adds immutable `invoice_validation_runs` with engine version, processing-run linkage, audit events and atomic completion/failure functions. The table has RLS enabled and is service-role only. Each call creates a new run; it does not overwrite validation history.

Validate an existing canonical extraction (or a labelled demo invoice) with:

```bash
npm run validate:invoice -- INVOICE_UUID
```

Live integration checks against **only the dedicated demo project**:

```bash
RUN_LIVE_SMOKE=yes npm exec -- tsx scripts/smoke-matching-live.ts
RUN_LIVE_SMOKE=yes npm exec -- tsx scripts/smoke-extraction-matching-live.ts
```

The second command sends `tests/fixtures/phase03-real-invoice.png` to NVIDIA and checks a real Phase 02 extraction through persisted Phase 03 validation. Both scripts create labelled synthetic records. They require the ignored `.env.local` and leave records for inspection.

For command-line extraction without a database:

```bash
AI_PROVIDER=mock npm run extract:invoice -- ./path/to/invoice.pdf INV-1048
AI_PROVIDER=nvidia npm run extract:invoice -- ./path/to/invoice.pdf
```

For the authenticated API, create an invoice record first (for example through a server-side repository), then upload its document and start extraction:

```bash
curl -H "Authorization: Bearer $EXTRACTION_API_TOKEN" \
  -F "file=@./invoice.pdf;type=application/pdf" \
  http://localhost:3000/api/invoices/INVOICE_UUID/document
curl -X POST -H "Authorization: Bearer $EXTRACTION_API_TOKEN" \
  http://localhost:3000/api/invoices/INVOICE_UUID/extract
```

The endpoint requires a server-held bearer token and uses the latest uploaded document. Never expose that token in a browser bundle. The API is intended for development and a controlled server integration; a later phase should add user sessions and authorization policies.

For a **dedicated demo project only**, `RUN_LIVE_SMOKE=yes npm run smoke:live` creates synthetic success and invalid-output invoices and verifies the canonical pointer, five agent steps, and distinct `INVALID` status in Supabase. It leaves those labelled demo records for inspection.

The Phase 01 seed remains in `supabase/seed.sql` for local Docker resets. It contains labelled, precomputed decisions for demo scenarios. It was not loaded into the live project as real agent decisions.

## Troubleshooting

| Symptom | Check |
|---|---|
| `NVIDIA_AUTH_ERROR` / HTTP 401 | Key is valid and set only on the server. |
| HTTP 429 | Retry is automatic up to the configured attempt limit; wait for quota. |
| `NVIDIA_TIMEOUT` | Increase timeout or use fewer/lower-resolution pages if model limits require it. |
| Model unavailable | Confirm `NVIDIA_MODEL` with the provider `health()` method and NVIDIA's current model list. |
| `EXTRACTION_JSON_INVALID` / incomplete | Verify model JSON support and output token capacity. Raw response is retained in extraction history on failure. |
| `UNSUPPORTED_DOCUMENT_TYPE` | Upload PDF, PNG, or JPEG with a matching file signature. |
| `PDF_RENDER_FAILED` | Confirm the PDF opens correctly and stays within the configured page and size limits. |
| Supabase permission error | Confirm the project server secret in `.env.local`; browser publishable keys cannot read protected tables. |

## Checks and limits

Unit tests use the mock provider and stub HTTP responses; they never spend NVIDIA API credits. A real NVIDIA extraction of the Phase 03 invoice image was followed by a persisted PASS validation with matched vendor, PO, both lines, and 2-way and 3-way results. The local pgTAP command requires a running Docker/Supabase database; the connected project was checked with live integration runs and SQL assertions. The matching repository currently fails closed above 500 candidate master records or 1,000 related lines, rather than silently truncating results. Production authentication, paging/search at larger scale, human actions, and payment execution remain for later phases.
