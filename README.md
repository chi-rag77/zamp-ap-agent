# Zamp AP Agent — Phases 01 and 02

The repository contains the Supabase domain foundation and a server-side invoice extraction pipeline. Phase 02 validates PDF/PNG/JPEG documents, renders every PDF page, sends ordered page images to a configurable NVIDIA NIM vision model, validates its JSON with Zod, checks financial arithmetic in deterministic code, and stores append-only extraction history. The pipeline does not approve, reject, match vendors or POs, or make policy decisions.

## Live project

The dedicated Supabase project is [zamp-ap-agent](https://supabase.com/dashboard/project/umredhscpvsuwqbnreod) in Mumbai (`ap-south-1`). Its API URL is `https://umredhscpvsuwqbnreod.supabase.co`. The SQL migrations in `supabase/migrations` are applied there. Public tables have RLS enabled and no browser policies; the server uses a secret key. Never put the secret key or `EXTRACTION_API_TOKEN` in a public environment variable or Git.

Copy `.env.example` to `.env.local` at the repository root. Fill the project URL, publishable key, server secret, and an independent random `EXTRACTION_API_TOKEN`. The local file is ignored by Git. Set `AI_PROVIDER=mock` for fixture extraction or `AI_PROVIDER=nvidia` for real NIM. The local `npm run dev` command loads this root file automatically.

## NVIDIA setup

Set `NVIDIA_API_KEY` and `NVIDIA_MODEL` in `.env.local` for real mode. `NVIDIA_BASE_URL` defaults to `https://integrate.api.nvidia.com/v1`; change it for a self-hosted NIM. Set `NVIDIA_REQUEST_TIMEOUT_MS` (default 60000), `NVIDIA_MAX_ATTEMPTS` (maximum 3), and `NVIDIA_JSON_MODE=true` only when the selected model supports JSON response format. The provider offers a `health()` method that checks the configured model against `GET /models`. Extraction calls `POST /chat/completions` with ordered text and base64 image parts. It retries timeouts, network errors, HTTP 429 and 5xx, but never retries auth errors or invalid documents. It retries truncated/malformed model output once before failing closed. The app never switches to mock after a real provider failure.

NVIDIA model availability, input limits, and structured-output support depend on the selected model. Verify its [official request reference](https://docs.api.nvidia.com/nim/reference/qwen-qwen3-5-122b-a10b-infer) when choosing `NVIDIA_MODEL`. The repository does not contain an NVIDIA API key, so real NIM calls require configuration.

## Document support

`packages/document` checks the file signature against its MIME type and enforces `MAX_INVOICE_FILE_SIZE_MB=20`. It reads PNG and JPEG with `sharp`, corrects orientation, and keeps full resolution. PDF rendering uses `pdfinfo` and `pdftoppm` (Poppler), with `MAX_INVOICE_PAGES=20`, 150 DPI PNG output, and deterministic page order. Install Poppler on any deployment host. Temporary PDF files and rendered pages are removed after processing. The private `invoice-documents` Supabase Storage bucket accepts PDF, PNG, and JPEG.

## Extraction schema and persistence

The model output includes document classification, invoice number and dates, vendor and buyer, PO number, currency, line items, subtotal, tax, total, payment terms, and per-field confidence. Zod rejects wrong types or confidence outside 0–1. Normalization maps explicit currency symbols and names to ISO codes, parses common date forms, and flags ambiguous dates. Math checks compare quantity × price, line sums, and subtotal + tax without changing extracted values. Missing PO alone is allowed. A non-invoice or blank document cannot become a successful invoice extraction.

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

For a **dedicated demo project only**, `RUN_LIVE_SMOKE=yes npm run smoke:live` creates one synthetic invoice and verifies a mock extraction, canonical pointer, and five agent steps in Supabase. It leaves that labelled demo record for inspection.

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

Unit tests use the mock provider and stub HTTP responses; they never spend NVIDIA API credits. `npm run smoke:live` verified the connected Supabase transaction using synthetic data. A two-page PDF was rendered and extracted in mock CLI mode. A real NVIDIA request still requires a user-provided key and model. The first UI page remains a minimal shell. The signed-in [Base44 reference](https://zamp-invoice-flow.base44.app/) and requested light-blue styling are the target for a later UI phase; Phase 02 specifically covers extraction and data persistence.
