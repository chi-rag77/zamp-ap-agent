# NVIDIA Build model survey — 22 October 2026

This is a snapshot of the 83 model IDs returned by this account's authenticated NVIDIA `GET /v1/models` endpoint, plus relevant official Build model cards. That API list is account-specific and is not the entire public Build catalog. The inventory includes language, vision, embedding, safety, speech, video, and specialist document models. For invoice extraction, only models that understand page images and return text are direct candidates.

## Decision

Use **`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`** as the current production candidate. It is available to this account, reads images, supports document intelligence and OCR, and returned usable structured invoice fields in both synthetic tests. The provider disables its default reasoning output and validates every result before persistence. Keep **`nvidia/nemotron-3.5-super-vl-120b-a12b`** as a candidate for later accuracy evaluation, rather than automatic fallback: its endpoint was inconsistent and slower in this small test. A model switch is a configuration change through `NVIDIA_MODEL`.

| Candidate | Official fit | Live synthetic test | Decision |
|---|---|---|---|
| [Nemotron 3 Nano Omni](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-omni-30b-a3b-reasoning) | Image OCR and document intelligence, long context | Sparse invoice: ~12 s, correct number/vendor/total, absent subtotal and tax left null after prompt revision. Two-line invoice: ~22 s, correct number, PO, subtotal, tax, total, two lines, all arithmetic checks pass. A purchase order was classified `NOT_INVOICE` and rejected; that endpoint call took much longer, showing latency variability. | Default |
| [Nemotron 3.5 Super VL](https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b) | Newer high-capability document and multimodal reasoning | One short request returned HTTP 500; a second short request succeeded in ~29 s; the full schema request timed out at 90 s. | Evaluate later |
| [Llama 3.2 90B Vision](https://build.nvidia.com/meta/llama-3.2-90b-vision-instruct) | Image understanding | Short invoice request timed out at 90 s. | Not default |
| [Nemotron Parse 2.0](https://docs.api.nvidia.com/nim/re/reference/nvidia-nemotron-parse-2_0) | Dedicated OCR, layout and table parsing | No live benchmark in this work; its document parsing output needs a separate integration path. | Possible preprocessing stage |
| [Qwen3.5 122B A10B](https://build.nvidia.com/qwen/qwen3.5-122b-a10b) | Multimodal reasoning | Its free Build endpoint is marked deprecated and this account's /models response did not list it. | Not default |

The measurements are a small functional check, not an accuracy or load benchmark. Production release should test representative vendor formats, poor scans, handwritten fields, multi-page invoices, non-invoices, languages and tax regimes; then measure field-level precision, latency percentiles, 429/5xx rates, and cost. Any payment or posting action still needs the later review workflow.

## Product design consequences

- **Accuracy:** Page images preserve layout; a strict schema rejects malformed output; missing fields stay null; arithmetic is checked in deterministic code; each extraction is stored with model, prompt version, raw output, and validation for audit.
- **Speed:** Nano Omni's reasoning is disabled for extraction; output length is bounded; PDF pages are rendered in order. Endpoint latency is variable and needs percentile monitoring.
- **Reliability:** Transient HTTP errors and timeouts retry with bounded backoff; auth errors fail immediately; malformed or truncated JSON retries once and then records a failure. The app never silently replaces real inference with a mock result.
- **Scale:** Supabase keeps immutable extraction attempts and a canonical pointer. The current synchronous API is suitable for development; production volume needs a queue, worker concurrency limits, idempotency, and provider quotas before accepting large batches.
- **Security:** The NVIDIA API key remains in ignored, server-only `.env.local`; invoice images leave the service for NVIDIA inference only when real mode is selected. No key is committed.

## Account model inventory (83 IDs)

```text
01-ai/yi-large
adept/fuyu-8b
ai21labs/jamba-1.5-large-instruct
aisingapore/sea-lion-7b-instruct
bigcode/starcoder2-15b
databricks/dbrx-instruct
deepseek-ai/deepseek-coder-6.7b-instruct
deepseek-ai/deepseek-v4.1-flash
google/codegemma-1.1-7b
google/codegemma-7b
google/deplot
google/diffusiongemma-26b-a4b-it
google/gemma-2b
google/gemma-3-12b-it
google/gemma-3-4b-it
google/gemma-4-31b-it
google/recurrentgemma-2b
ibm/granite-3.0-3b-a800m-instruct
ibm/granite-3.0-8b-instruct
ibm/granite-34b-code-instruct
ibm/granite-8b-code-instruct
meta/codellama-70b
meta/llama-3.2-11b-vision-instruct
meta/llama-3.2-90b-vision-instruct
meta/llama-guard-4-12b
meta/llama2-70b
meta/muse-glimmer-30b
microsoft/kosmos-2
microsoft/phi-3-vision-128k-instruct
microsoft/phi-3.5-moe-instruct
mistralai/codestral-22b-instruct-v0.1
mistralai/mistral-7b-instruct-v0.3
mistralai/mistral-large
mistralai/mistral-large-2-instruct
mistralai/mixtral-8x22b-v0.1
moonshotai/kimi-k2.6
nv-mistralai/mistral-nemo-12b-instruct
nvidia/ai-synthetic-video-detector
nvidia/cosmos-reason2-8b
nvidia/embed-qa-4
nvidia/ising-calibration-1.5-31b
nvidia/llama-3.1-nemoguard-8b-content-safety
nvidia/llama-3.1-nemoguard-8b-topic-control
nvidia/llama-3.1-nemotron-51b-instruct
nvidia/llama-3.1-nemotron-70b-instruct
nvidia/llama-3.1-nemotron-safety-guard-8b-v3
nvidia/llama-3.1-nemotron-ultra-253b-v1
nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1
nvidia/llama-3.2-nv-embedqa-1b-v1
nvidia/llama-nemotron-embed-vl-1b-v2
nvidia/llama3-chatqa-1.5-70b
nvidia/mistral-nemo-minitron-8b-8k-instruct
nvidia/nemotron-3-embed-1b
nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
nvidia/nemotron-3-super-120b-a12b
nvidia/nemotron-3-ultra-550b-a55b
nvidia/nemotron-3.5-content-safety
nvidia/nemotron-3.5-embed-1b
nvidia/nemotron-3.5-embed-8b
nvidia/nemotron-3.5-lightning-30b-a3b
nvidia/nemotron-3.5-super-vl-120b-a12b
nvidia/nemotron-4-340b-instruct
nvidia/nemotron-4-340b-reward
nvidia/nemotron-nano-3-30b-a3b
nvidia/nemotron-parse
nvidia/nemotron-parse-2.0
nvidia/neva-22b
nvidia/nv-embedqa-mistral-7b-v2
nvidia/nvclip
nvidia/riva-translate-4b-instruct
nvidia/riva-translate-4b-instruct-v2
nvidia/vila
openai/gpt-oss-20b
poolside/laguna-xs-2.1
snowflake/arctic-embed-l
stepfun-ai/step-5-preview
writer/palmyra-creative-122b
writer/palmyra-fin-70b-32k
writer/palmyra-med-70b
writer/palmyra-med-70b-32k
z-ai/glm-5.3
z-ai/glm-5.3-flash
zyphra/zamba2-7b-instruct
```
