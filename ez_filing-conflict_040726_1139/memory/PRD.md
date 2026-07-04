# GST-ECOM-EZ — Product Requirements & Build Status

**Last updated:** 2026-02 (first-finish MVP)

## Original problem statement
Fix 5 critical gaps + interest estimator + IMS logic in a GST compliance app for
Indian e-commerce sellers (Amazon / Flipkart / Meesho). Ship portal-ready
GSTR-1 and GSTR-3B JSON with side-by-side ITC preview, IMS credit-note
tracker, async processing, encryption, and Rule 88B(1) interest.

## Users
- E-commerce sellers filing GSTR-1 / GSTR-3B monthly or quarterly
- Accountants managing multiple seller GSTINs

## Core requirements (static)
1. Stack modernization — clean service layers (ingestion / parsing / compliance / export).
2. GSTR-3B Table 4 preview with drill-down (4A / 4B(1) / 4B(2) / 4D).
3. Encryption at rest (AES-256-GCM) + signed download URLs.
4. Async processing (FastAPI BackgroundTasks + MongoDB job status).
5. IMS engine (Accept / Reject / Pending / No-action) with rules encoded.
6. Interest estimator per Rule 88B(1) + late fee.

## Tech stack (this environment)
- Frontend: React (CRA) + JS + Tailwind + shadcn/ui — kept template-native.
- Backend: FastAPI, structured into `services/` (ingestion, parsing, ims,
  compliance, interest, jobs, export) + `routes/api.py` + `services/repository.py`
  (single seam for future Postgres swap).
- DB: MongoDB via motor (strict Pydantic schemas + repository pattern).
- Async: FastAPI BackgroundTasks (Celery scaffolding deferred to Phase 2 stretch).
- OCR/LLM: emergentintegrations GPT-5.2 for vendor PDF structured extraction.
- Encryption: AES-256-GCM for stored files & payloads; HMAC-signed 10-min
  download tokens.

## Implemented (MVP-1 · 2026-02)
- Domain models: Seller, UploadRecord, ProcessingJob, MarketplaceInvoice,
  VendorInvoice, IMSAction, ExceptionRow, ComplianceSnapshot, Interest*.
- Repository layer isolating all Mongo access.
- Ingestion parser: tolerant to Amazon / Flipkart / Meesho column names,
  routes bad rows to Exception Ledger.
- Vendor PDF pipeline: pypdf → GPT-5.2 structured extraction (with heuristic fallback).
- Async job runner + retries with exponential backoff + progress updates.
- IMS engine: pending-blocked rules for original/amendment CNs; reversal
  computation for accepted CNs; ITC-not-previously-claimed short-circuit.
- Compliance builder: GSTR-1 (b2b/b2cs/b2cl/hsn) + GSTR-3B 3.1 & Table 4
  with source-ID drill-down.
- Table 4A validated: only regex-verified supplier GSTINs count.
- Interest estimator: Rule 88B(1) + ₹50/day late fee (CGST/SGST split).
- Export: GSTN offline-tool schema JSON + signed download.
- Encryption: file blobs, LLM payloads, download URLs.
- Frontend: Dashboard (control-room grid), Upload dropzone with live job
  progress + sample buttons, Exception ledger (inline fix), IMS tracker,
  Compliance preview (side-by-side + drill-down modal), Interest form,
  Export page.
- Seed endpoint for one-click demo data (idempotent).

## Backlog / Prioritized
### P1
- Frontend migration to Vite + TypeScript (spec calls for this; deferred
  because the template's supervisor + preview URL are wired to CRA).
- Celery + Redis worker for true horizontal async (scaffolding + swap point).
- Auth (multi-tenant): JWT or Emergent-managed Google.
- Bulk vendor PDF drag-drop with per-file progress cards.

### P2
- Object storage integration (S3/GCS) instead of local encrypted disk.
- IMS "one tax period pending → deemed accepted" cron.
- Marketplace-specific column presets & MTR report auto-detect.
- GSTR-1 tables 4/7/14/15 & GSTR-3B Table 5.1 (Jan 2026 changes) once
  official schemas published.
- Direct GSP/GSTN filing (v2 goal).

### P3
- Multi-user role model (seller / accountant / view-only).
- Audit trail per invoice change.
- Excel export of exception ledger for offline review.

## Next actions
- Testing pass via testing_agent_v3 on backend + frontend flows.
- If green: finish + surface user prompt for auth / Celery migration.
