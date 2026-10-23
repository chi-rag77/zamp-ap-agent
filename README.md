# Zamp AP Agent — Phases 01–04, Policy Intelligence, and local workspace UI

The repository contains a Supabase domain foundation, a server-side NVIDIA invoice extraction pipeline, and a deterministic invoice matching engine. Phase 02 reads documents and stores append-only extraction history. Phase 03 resolves vendors and purchase orders, compares invoice lines with purchase orders and receipts, checks financial arithmetic and duplicates, and stores versioned validation results. Phase 04 evaluates those facts against a versioned policy and records approval, review, rejection, or cannot-decide eligibility. It does not execute invoice actions.

## Live project

The dedicated Supabase project is [zamp-ap-agent](https://supabase.com/dashboard/project/umredhscpvsuwqbnreod) in Mumbai (`ap-south-1`). Its API URL is `https://umredhscpvsuwqbnreod.supabase.co`. The SQL migrations in `supabase/migrations` are applied there. Public tables have RLS enabled and no browser policies; the server uses a secret key. Never put the secret key or `EXTRACTION_API_TOKEN` in a public environment variable or Git.

Copy `.env.example` to `.env.local` at the repository root. Fill the project URL, publishable key, server secret, and an independent random `EXTRACTION_API_TOKEN`. The local file is ignored by Git. Set `AI_PROVIDER=mock` for fixture extraction or `AI_PROVIDER=nvidia` for real NIM. The local `npm run dev` command loads this root file automatically.

## NVIDIA setup

Set `NVIDIA_API_KEY` in `.env.local` for real mode. The default model in `.env.example` is `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, selected after live invoice tests. `NVIDIA_BASE_URL` defaults to `https://integrate.api.nvidia.com/v1`; change it for a self-hosted NIM. Set `NVIDIA_REQUEST_TIMEOUT_MS` (default 90000), `NVIDIA_MAX_OUTPUT_TOKENS` (default 8192), `NVIDIA_MAX_ATTEMPTS` (maximum 3), and `NVIDIA_JSON_MODE=true` only when the selected model supports JSON response format. Nano Omni's reasoning output is disabled for JSON extraction. The provider offers a `health()` method that checks the configured model against `GET /models`. Extraction calls `POST /chat/completions` with ordered text and base64 image parts. It retries timeouts, network errors, HTTP 429 and 5xx, but never retries auth errors or invalid documents. It retries truncated/malformed model output once before failing closed. The app never switches to mock after a real provider failure.

NVIDIA model availability, input limits, and structured-output support depend on the selected model. See the [model survey and live test notes](docs/nvidia-model-selection.md) and the [Nano Omni API reference](https://docs.api.nvidia.com/nim/re/reference/nvidia-nemotron-3-nano-omni-30b-a3b-reasoning-infer) before changing `NVIDIA_MODEL`. The repository does not contain an NVIDIA API key; the ignored local `.env.local` is required for real NIM calls.

## Document support

`packages/document` checks the file signature against its MIME type and enforces `MAX_INVOICE_FILE_SIZE_MB=20`. It reads PNG and JPEG with `sharp`, corrects orientation, and keeps full resolution. PDF rendering uses `pdfinfo` and `pdftoppm` (Poppler), with `MAX_INVOICE_PAGES=20`, 150 DPI PNG output, and deterministic page order. Install Poppler on any deployment host. Temporary PDF files and rendered pages are removed after processing. The private `invoice-documents` Supabase Storage bucket accepts PDF, PNG, and JPEG.

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
| `PDF_RENDER_FAILED` | Install Poppler (`pdftoppm` and `pdfinfo`) on the server. |
| Supabase permission error | Confirm the project server secret in `.env.local`; browser publishable keys cannot read protected tables. |

## Checks and limits

Unit tests use the mock provider and stub HTTP responses; they never spend NVIDIA API credits. A real NVIDIA extraction of the Phase 03 invoice image was followed by a persisted PASS validation with matched vendor, PO, both lines, and 2-way and 3-way results. The local pgTAP command requires a running Docker/Supabase database; the connected project was checked with live integration runs and SQL assertions. The matching repository currently fails closed above 500 candidate master records or 1,000 related lines, rather than silently truncating results. Production authentication, paging/search at larger scale, human actions, and payment execution remain for later phases.
