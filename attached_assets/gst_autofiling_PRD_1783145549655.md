# GST-ECOM-EZ — Product Requirements Document
**E-Commerce GST Filing SaaS | India | v1.0 — Draft (2026-06-30)**

---

## 1. Problem & Positioning

**Who this is for:** E-commerce sellers (Amazon, Flipkart, Meesho, etc.) who currently reconcile multi-channel marketplace settlement reports against scattered B2B/vendor purchase PDFs by hand before every GSTR-1/3B filing.

**Core pain:** Marketplace reports come in different schemas per platform, vendor invoices come as unstructured PDFs, and the merchant (or their CA) manually stitches these into filing-ready numbers — slow and error-prone, especially around HSN-wise tax rate splits and ITC matching.

**Positioning note:** This is a *different* product from GST AutoFile (your existing B2B-first, QRMP-first SaaS). GST-ECOM-EZ is e-commerce-first and TCS-aware. Decide explicitly: separate product, or does this replace/extend GST AutoFile's roadmap? Recommend treating as separate product line given the different ICP and different tech stack, unless you want to consolidate stacks first.

---

## 2. Goals

- Ingest raw, messy marketplace exports (CSV/XLSX) and vendor PDFs in one drop zone.
- Normalize everything into one internal ledger.
- Run GST validation math (PoS routing, HSN aggregation, credit note adjustments) automatically.
- Output GSTN-portal-ready JSON for GSTR-1 (Tables 4, 7, 12, 14/15) and GSTR-3B (Tables 3.1, 4).
- Surface exceptions for manual correction rather than silently failing.

## 3. Non-Goals (v1)

- Direct GSP/GSTN API filing (this version produces JSON for upload, not auto-submission — confirm if auto-filing is a later phase).
- Marketplaces beyond Amazon/Flipkart/Meesho (note these in scope; others deferred).
- Annual return (GSTR-9) or e-way bill generation.

---

## 4. Architecture

### 4.1 Pipeline

| Stage | Mechanism |
|---|---|
| Ingestion | Unified drag-and-drop control center; bulk CSV/XLSX/PDF, async queue |
| Marketplace extraction | Python (pandas/openpyxl) parsers, one schema-mapper per platform |
| Vendor PDF extraction | LLM Structured Outputs or Document AI OCR, format-agnostic key extraction |
| Tax logic | State-wise PoS routing (CGST+SGST vs IGST), HSN-wise aggregation, credit note auto-adjustment |
| Output | GSTN-schema JSON, encrypted, portal-upload-ready |

### 4.2 Tech Stack

- **Frontend:** Next.js (App Router), Tailwind, Shadcn UI
- **Backend:** Python FastAPI
- **DB:** PostgreSQL (core), Redis + Celery (async OCR/parsing jobs)
- **OCR:** OpenAI Structured Outputs API or Google Cloud Document AI (pick one for v1 — recommend starting with LLM Structured Outputs given lower setup cost, fall back to Document AI if accuracy on Indian invoice formats proves insufficient)

**⚠️ Stack flag:** This diverges from the Node/Express/React/PostgreSQL stack already locked for GST AutoFile. If both products are live, you're maintaining two backend ecosystems. Worth a deliberate decision, not a default.

---

## 5. Compliance Logic

### 5.1 GSTR-1 Mapping

| Table | Rule |
|---|---|
| 4 (B2B) | Invoices with a regex-verified buyer GSTIN |
| 7 (B2C) | Marketplace sales with no buyer GSTIN, aggregated by State + Tax Rate |
| 12 (HSN Summary) | Grouped by unique (HSN code, GST rate) pair |
| 14/15 (E-comm operator supplies) | Sales via e-comm operators, TCS under Section 52 tracked separately |

### 5.2 GSTR-3B Mapping

| Table | Rule |
|---|---|
| 3.1 (Liability) | Auto-summed from compiled GSTR-1 outward tax |
| 4 (ITC) | Pulled from verified vendor purchase invoices only — must not mix with outward data |

### 5.3 Regulatory Guardrails

- **IMS tracking:** Monitor buyer accept/reject actions to gate credit note claims. *Verify current IMS rollout status and mandatory-use date with GSTN before building — this is a relatively new mechanism and rules may have shifted since this spec was drafted.*
- **Interest estimator:** 18% late-filing interest, computed only on net cash shortfall per Rule 88B(1).
- **Rounding:** Two-decimal precision enforced everywhere: `Round(txval * (rt/100), 2)`.
- **Out-of-period invoices:** Auto-grouped by document date for correct tax period payload formatting.

---

## 6. Portal Schema — GSTR-1 Table 12 (HSN Summary)

```json
{
  "hsn": {
    "chksum": "SHA-256 hash",
    "data": [
      {
        "num": "int, sequential index",
        "hsn_sc": "string, 4/6/8-digit code",
        "desc": "string, optional, max 30 chars",
        "uqc": "string, 3-letter unit or 'NA' for services",
        "qty": "decimal, 0.00 for services",
        "txval": "decimal, net taxable value",
        "rt": "decimal, combined tax rate %",
        "iamt": "decimal, IGST",
        "camt": "decimal, CGST",
        "samt": "decimal, SGST (must equal camt)",
        "csamt": "decimal, Cess"
      }
    ]
  }
}
```
*Same hsn_sc/HSN-rate split logic should extend cleanly to other GSTR-1 tables — this is the only schema fully specified in the source doc; the remaining table schemas (4, 7, 14/15, and GSTR-3B 3.1/4) need to be fully specified before a builder can implement them.*

---

## 7. UI Workspaces

1. **Dropzone File Control Center** — unified drag-and-drop, real-time processing queue.
2. **Exception Management Ledger** — high-density grid flagging structural anomalies, inline editable cells (no re-upload needed).
3. **Compliance Payload Preview** — side-by-side GSTR-1/GSTR-3B verification grids, one-click encrypted JSON export.

---

## 8. Test Cases (Agent-Automatable)

| ID | Name | Assertion |
|---|---|---|
| TC-01 | Marketplace Aggregation | Multi-row marketplace input compresses correctly into Table 7, strictly by State + Tax Rate |
| TC-02 | HSN Split Array | Same HSN code at conflicting tax rates (e.g. 5% vs 12%) serializes into separate Table 12 array objects |
| TC-03 | ITC Isolation | Vendor-invoice ITC values feed Table 4 without mutating outward (sales) tax values |

---

## 9. Open Risks (flagged for resolution before build)

1. **Product overlap with GST AutoFile** — resolve positioning before committing engineering time to a second stack.
2. **OCR accuracy on vendor PDFs** — budget for a correction-UI-heavy v1; don't assume >90% clean extraction on Indian vendor invoice formats out of the gate.
3. **Marketplace schema drift** — Amazon/Flipkart/Meesho settlement report formats change without notice; build schema-version detection, not static column maps.
4. **IMS rules currency** — confirm current GSTN Invoice Management System rules before encoding accept/reject logic.
5. **No GSP/auto-filing in v1** — confirm this is intentional (JSON-for-manual-upload) vs. a future requirement, since it changes the value prop significantly (filing-ready vs. filing-automated).
6. **Schema completeness** — only HSN Table 12 schema is fully specified; Tables 4, 7, 14/15, and GSTR-3B 3.1/4 need full JSON schemas before a Replit/dev build prompt can be written, the same way GST AutoFile's build prompt specified all GSTN JSON schemas upfront.

---

## 10. Suggested Next Step

Before writing a full build prompt (Replit-style, like GST AutoFile's), resolve risks #1 and #5 — they change scope significantly — then fill in the remaining table schemas (#6).
