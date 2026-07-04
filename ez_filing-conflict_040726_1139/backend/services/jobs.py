"""Async job runner — FastAPI BackgroundTasks + retries with backoff.

Chosen over Redis/Celery for this environment: same UX (job ID, poll,
per-file progress), no extra broker. The runner is written so that
swapping in Celery later is mechanical — every entry point is a single
async function taking a job_id.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from crypto_util import decrypt_str, encrypt_str
from services import repository as repo
from services.ingestion import extract_pdf_text, parse_marketplace_file
from services.llm_extract import extract_vendor_invoice
from models import MarketplaceInvoice, VendorInvoice, is_valid_gstin

_DEFAULT_STORAGE = Path(__file__).parent.parent / "storage"
STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", str(_DEFAULT_STORAGE)))
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _update_progress(job_id: str, progress: int, message: str = "", status: str | None = None):
    patch = {"progress": progress, "message": message, "updated_at": _now_iso()}
    if status:
        patch["status"] = status
    await repo.update_job(job_id, patch)


async def read_storage(storage_ref: str) -> bytes:
    p = STORAGE_DIR / storage_ref
    ct = p.read_bytes().decode("ascii")
    plain_b64 = decrypt_str(ct, aad=storage_ref)
    import base64
    return base64.b64decode(plain_b64)


async def write_storage(storage_ref: str, content: bytes) -> None:
    import base64
    ct = encrypt_str(base64.b64encode(content).decode("ascii"), aad=storage_ref)
    (STORAGE_DIR / storage_ref).write_text(ct)


async def run_marketplace_parse(job_id: str) -> None:
    job = await repo.get_job(job_id)
    if not job:
        return
    upload = await repo.get_upload(job["upload_id"])
    seller_gstin = upload.get("seller_gstin") or ""
    period = upload["period"]
    marketplace = upload.get("marketplace") or "other"

    for attempt in range(1, 4):
        try:
            await _update_progress(job_id, 10, "Reading file…", status="processing")
            content = await read_storage(upload["storage_ref"])

            await _update_progress(job_id, 35, "Parsing rows…")
            invoices, exceptions = parse_marketplace_file(
                content, upload["filename"], marketplace, seller_gstin, period,
            )

            await _update_progress(job_id, 70, f"Storing {len(invoices)} invoices…")
            docs = [i.model_dump() for i in invoices]
            for d in docs:
                d["source_upload_id"] = upload["id"]
            await repo.insert_marketplace_invoices(docs)

            for ex in exceptions:
                await repo.add_exception({
                    "id": __import__("uuid").uuid4().hex,
                    "created_at": _now_iso(),
                    "updated_at": _now_iso(),
                    "seller_gstin": seller_gstin,
                    "period": period,
                    "upload_id": upload["id"],
                    "row_index": ex["row_index"],
                    "reason": ex["reason"],
                    "raw": ex["raw"],
                    "resolved": False,
                })

            status = "complete" if not exceptions else "exception"
            await _update_progress(
                job_id, 100,
                f"Done — {len(invoices)} invoices, {len(exceptions)} exceptions.",
                status=status,
            )
            await repo.update_job(job_id, {"attempts": attempt})
            return
        except Exception as e:  # noqa: BLE001
            await repo.update_job(job_id, {"attempts": attempt, "error": str(e)})
            if attempt == 3:
                await _update_progress(job_id, 100, f"Failed: {e}", status="failed")
                return
            await asyncio.sleep(2 ** attempt)  # backoff


async def run_inward_ocr(job_id: str) -> None:
    """Process inward purchase invoice PDFs → VendorInvoice (GSTR-3B Table 4 ITC)."""
    job = await repo.get_job(job_id)
    if not job:
        return
    upload = await repo.get_upload(job["upload_id"])
    seller_gstin = upload.get("seller_gstin") or ""
    period = upload["period"]

    for attempt in range(1, 4):
        try:
            await _update_progress(job_id, 15, "Reading PDF…", status="processing")
            content = await read_storage(upload["storage_ref"])

            await _update_progress(job_id, 30, "Extracting text…")
            text = extract_pdf_text(content)

            await _update_progress(job_id, 55, "LLM structured extraction…")
            data = await extract_vendor_invoice(text, session_id=job_id)

            await _update_progress(job_id, 85, "Persisting invoice…")
            supplier_gstin = data.get("supplier_gstin")
            verified = bool(supplier_gstin and is_valid_gstin(supplier_gstin))
            import json as _json
            enc = encrypt_str(_json.dumps(data), aad=job_id)

            vi = VendorInvoice(
                seller_gstin=seller_gstin,
                period=period,
                supplier_gstin=supplier_gstin if verified else None,
                supplier_name=data.get("supplier_name") or "Unknown Supplier",
                invoice_number=data.get("invoice_number") or f"AUTO-{job_id[:8]}",
                invoice_date=data.get("invoice_date") or "",
                is_credit_note=bool(data.get("is_credit_note")),
                is_intrastate=bool(data.get("is_intrastate", True)),
                taxable_value=float(data.get("taxable_value") or 0),
                igst=float(data.get("igst") or 0),
                cgst=float(data.get("cgst") or 0),
                sgst=float(data.get("sgst") or 0),
                cess=float(data.get("cess") or 0),
                total_value=float(data.get("total_value") or 0),
                itc_eligible=bool(data.get("itc_eligible", True)),
                itc_ineligible_reason=data.get("itc_ineligible_reason"),
                verified_gstin=verified,
                source_upload_id=upload["id"],
                encrypted_payload=enc,
            )
            await repo.insert_vendor_invoices([vi.model_dump()])

            msg = "Done — ITC invoice stored for GSTR-3B Table 4."
            status = "complete"
            if not verified:
                msg = "Parsed, but supplier GSTIN could not be verified — review in Exceptions."
                status = "exception"
                await repo.add_exception({
                    "id": __import__("uuid").uuid4().hex,
                    "created_at": _now_iso(), "updated_at": _now_iso(),
                    "seller_gstin": seller_gstin, "period": period,
                    "upload_id": upload["id"], "row_index": None,
                    "reason": "Supplier GSTIN missing or failed regex — ITC NOT counted",
                    "raw": data, "resolved": False,
                    "doc_type": "inward",
                })
            await _update_progress(job_id, 100, msg, status=status)
            await repo.update_job(job_id, {"attempts": attempt, "result_ref": vi.id})
            return
        except Exception as e:  # noqa: BLE001
            await repo.update_job(job_id, {"attempts": attempt, "error": str(e)})
            if attempt == 3:
                await _update_progress(job_id, 100, f"Failed: {e}", status="failed")
                return
            await asyncio.sleep(2 ** attempt)


async def run_outward_ocr(job_id: str) -> None:
    """Process outward B2B sales invoice PDFs → MarketplaceInvoice type=b2b (GSTR-1 Table 4)."""
    job = await repo.get_job(job_id)
    if not job:
        return
    upload = await repo.get_upload(job["upload_id"])
    seller_gstin = upload.get("seller_gstin") or ""
    period = upload["period"]
    seller_state = seller_gstin[:2] if len(seller_gstin) >= 2 else "00"

    for attempt in range(1, 4):
        try:
            await _update_progress(job_id, 15, "Reading PDF…", status="processing")
            content = await read_storage(upload["storage_ref"])

            await _update_progress(job_id, 30, "Extracting text…")
            text = extract_pdf_text(content)

            await _update_progress(job_id, 55, "LLM structured extraction…")
            # extract_vendor_invoice returns supplier_gstin — for outward invoices
            # the GSTIN on the invoice is the buyer's (bill-to party).
            data = await extract_vendor_invoice(text, session_id=job_id)

            await _update_progress(job_id, 85, "Persisting B2B invoice…")
            buyer_gstin = data.get("supplier_gstin")
            verified = bool(buyer_gstin and is_valid_gstin(buyer_gstin))
            buyer_state = buyer_gstin[:2] if verified else seller_state
            is_intrastate = buyer_state == seller_state

            inv = MarketplaceInvoice(
                seller_gstin=seller_gstin,
                period=period,
                marketplace="other",
                invoice_number=data.get("invoice_number") or f"AUTO-{job_id[:8]}",
                invoice_date=data.get("invoice_date") or "",
                invoice_type="b2b",
                buyer_gstin=buyer_gstin if verified else None,
                buyer_state_code=buyer_state,
                place_of_supply=buyer_state,
                is_intrastate=is_intrastate,
                taxable_value=float(data.get("taxable_value") or 0),
                igst=float(data.get("igst") or 0),
                cgst=float(data.get("cgst") or 0),
                sgst=float(data.get("sgst") or 0),
                cess=float(data.get("cess") or 0),
                total_value=float(data.get("total_value") or 0),
                source_upload_id=upload["id"],
            )
            doc = inv.model_dump()
            doc["source_upload_id"] = upload["id"]
            await repo.insert_marketplace_invoices([doc])

            msg = "Done — B2B invoice stored for GSTR-1 Table 4."
            status = "complete"
            if not verified:
                msg = "Parsed, but buyer GSTIN not verified — review in Exceptions."
                status = "exception"
                await repo.add_exception({
                    "id": __import__("uuid").uuid4().hex,
                    "created_at": _now_iso(), "updated_at": _now_iso(),
                    "seller_gstin": seller_gstin, "period": period,
                    "upload_id": upload["id"], "row_index": None,
                    "reason": "Buyer GSTIN missing or failed validation — B2B invoice may be incomplete",
                    "raw": data, "resolved": False,
                    "doc_type": "outward",
                })
            await _update_progress(job_id, 100, msg, status=status)
            await repo.update_job(job_id, {"attempts": attempt, "result_ref": inv.id})
            return
        except Exception as e:  # noqa: BLE001
            await repo.update_job(job_id, {"attempts": attempt, "error": str(e)})
            if attempt == 3:
                await _update_progress(job_id, 100, f"Failed: {e}", status="failed")
                return
            await asyncio.sleep(2 ** attempt)


JOB_RUNNERS: dict[str, Callable] = {
    "marketplace_parse": run_marketplace_parse,
    "vendor_ocr": run_inward_ocr,   # backward compat alias
    "inward_ocr": run_inward_ocr,
    "outward_ocr": run_outward_ocr,
}


async def dispatch(job_id: str, kind: str) -> None:
    runner = JOB_RUNNERS.get(kind)
    if not runner:
        await repo.update_job(job_id, {"status": "failed", "error": f"unknown kind {kind}"})
        return
    await runner(job_id)
