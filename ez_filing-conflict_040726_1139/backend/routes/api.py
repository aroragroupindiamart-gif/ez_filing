"""API routes — all under /api prefix.

Modules:
- sellers: register seller GSTINs
- uploads: file upload + async job dispatch
- jobs: job polling
- invoices: marketplace & vendor invoice listing / drill-down
- ims: credit-note action tracker
- compliance: GSTR-1 + GSTR-3B preview
- interest: Rule 88B(1) estimator
- export: GSTN-schema JSON generation + signed download
- exceptions: exception ledger + inline fixes
- seed: demo data seeding for quick evaluation
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel

from crypto_util import sign_download_token, verify_download_token
from models import (
    IMSAction,
    InterestInput,
    ProcessingJob,
    Seller,
    UploadRecord,
    is_valid_gstin,
)
from services import repository as repo
from services.compliance import build_snapshot
from services.export import build_gstr1_json, build_gstr3b_json
from services.ims import apply_decision, validate_decision
from services.interest import compute_interest
from services.jobs import dispatch, write_storage

router = APIRouter(prefix="/api")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/")
async def root():
    return {"service": "gst-ecom-ez", "status": "ok"}


@router.get("/health")
async def health():
    return {"status": "ok", "ts": _now_iso()}


# =========================== Sellers ===========================
class SellerIn(BaseModel):
    legal_name: str
    gstin: str
    trade_name: Optional[str] = None


@router.post("/sellers")
async def create_seller(body: SellerIn):
    if not is_valid_gstin(body.gstin):
        raise HTTPException(400, "Invalid GSTIN format")
    existing = await repo.get_seller_by_gstin(body.gstin)
    if existing:
        return existing
    seller = Seller(
        legal_name=body.legal_name,
        gstin=body.gstin,
        state_code=body.gstin[:2],
        trade_name=body.trade_name,
    )
    await repo.create_seller(seller.model_dump())
    return seller.model_dump()


@router.get("/sellers")
async def list_sellers():
    return await repo.list_sellers()


# =========================== Uploads ===========================
@router.post("/uploads")
async def upload_file(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    kind: str = Form(...),  # marketplace_csv | marketplace_xlsx | vendor_pdf
    period: str = Form(...),  # YYYY-MM
    seller_gstin: str = Form(...),
    marketplace: Optional[str] = Form(None),
):
    _KIND_TO_JOB = {
        "marketplace_csv": "marketplace_parse",
        "marketplace_xlsx": "marketplace_parse",
        "outward_pdf": "outward_ocr",
        "inward_pdf": "inward_ocr",
        "vendor_pdf": "inward_ocr",  # backward compat
    }
    _KIND_TO_DOCTYPE = {
        "marketplace_csv": "marketplace",
        "marketplace_xlsx": "marketplace",
        "outward_pdf": "outward",
        "inward_pdf": "inward",
        "vendor_pdf": "inward",
    }
    if kind not in _KIND_TO_JOB:
        raise HTTPException(400, f"Unknown kind {kind!r}. Use marketplace_csv, marketplace_xlsx, outward_pdf, or inward_pdf.")
    if not is_valid_gstin(seller_gstin):
        raise HTTPException(400, "Invalid seller_gstin")

    content = await file.read()
    checksum = hashlib.sha256(content).hexdigest()

    storage_ref = f"{uuid.uuid4().hex}_{file.filename}"
    await write_storage(storage_ref, content)

    doc_type = _KIND_TO_DOCTYPE[kind]
    upload = UploadRecord(
        filename=file.filename,
        size_bytes=len(content),
        kind=kind,  # type: ignore[arg-type]
        doc_type=doc_type,  # type: ignore[arg-type]
        marketplace=marketplace,  # type: ignore[arg-type]
        period=period,
        seller_gstin=seller_gstin,
        storage_ref=storage_ref,
        checksum_sha256=checksum,
    )
    await repo.create_upload(upload.model_dump())

    job_kind = _KIND_TO_JOB[kind]
    job = ProcessingJob(upload_id=upload.id, kind=job_kind, status="queued", message="Queued for processing")
    await repo.create_job(job.model_dump())

    background.add_task(dispatch, job.id, job_kind)

    return {"upload": upload.model_dump(), "job": job.model_dump()}


@router.get("/uploads")
async def list_uploads(seller_gstin: Optional[str] = None, period: Optional[str] = None):
    return await repo.list_uploads(seller_gstin, period)


# =========================== Jobs ===========================
@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    j = await repo.get_job(job_id)
    if not j:
        raise HTTPException(404, "Job not found")
    return j


@router.get("/jobs")
async def list_jobs(limit: int = 100):
    return await repo.list_jobs(limit=limit)


# =========================== Invoices ===========================
@router.get("/invoices/marketplace")
async def list_marketplace_invoices(seller_gstin: str, period: str):
    return await repo.list_marketplace_invoices(seller_gstin, period)


@router.get("/invoices/vendor")
async def list_vendor_invoices(seller_gstin: str, period: str):
    return await repo.list_vendor_invoices(seller_gstin, period)


class VendorPatch(BaseModel):
    supplier_gstin: Optional[str] = None
    supplier_name: Optional[str] = None
    itc_eligible: Optional[bool] = None
    itc_ineligible_reason: Optional[str] = None


@router.patch("/invoices/vendor/{vid}")
async def patch_vendor_invoice(vid: str, patch: VendorPatch):
    data = {k: v for k, v in patch.model_dump().items() if v is not None}
    if "supplier_gstin" in data:
        data["verified_gstin"] = bool(data["supplier_gstin"] and is_valid_gstin(data["supplier_gstin"]))
    data["updated_at"] = _now_iso()
    await repo.update_vendor_invoice(vid, data)
    return {"ok": True, "patch": data}


# =========================== Exceptions ===========================
@router.get("/exceptions")
async def list_exceptions(seller_gstin: str, period: str, doc_type: Optional[str] = Query(None)):
    return await repo.list_exceptions(seller_gstin, period, doc_type=doc_type or None)


class ExceptionFix(BaseModel):
    corrected: dict


@router.post("/exceptions/{eid}/resolve")
async def resolve_exception(eid: str, body: ExceptionFix):
    await repo.resolve_exception(eid, body.corrected)
    return {"ok": True}


# =========================== IMS ===========================
class IMSCreate(BaseModel):
    seller_gstin: str
    period: str
    supplier_gstin: str
    credit_note_number: str
    credit_note_date: str
    original_invoice_number: Optional[str] = None
    is_amendment: bool = False
    is_original_cn: bool = True
    taxable_value: float
    tax_amount: float
    itc_previously_claimed: bool = True


@router.post("/ims/actions")
async def upsert_ims(body: IMSCreate):
    if not is_valid_gstin(body.supplier_gstin):
        raise HTTPException(400, "Invalid supplier GSTIN")
    action = IMSAction(**body.model_dump())
    await repo.upsert_ims_action(action.model_dump())
    return action.model_dump()


@router.get("/ims/actions")
async def list_ims(seller_gstin: str, period: str):
    return await repo.list_ims_actions(seller_gstin, period)


class IMSDecisionIn(BaseModel):
    decision: str  # accept | reject | pending | no_action


@router.post("/ims/actions/{aid}/decision")
async def decide_ims(aid: str, body: IMSDecisionIn):
    doc = await repo.get_ims_action(aid)
    if not doc:
        raise HTTPException(404, "IMS action not found")
    action = IMSAction(**doc)
    ok, reason = validate_decision(action, body.decision)
    if not ok:
        raise HTTPException(400, reason)
    updated = apply_decision(action, body.decision, _now_iso())
    await repo.update_ims_action(aid, updated.model_dump())
    return updated.model_dump()


# =========================== Compliance ===========================
@router.get("/compliance/preview")
async def compliance_preview(seller_gstin: str, period: str):
    invoices = await repo.list_marketplace_invoices(seller_gstin, period)
    vendors = await repo.list_vendor_invoices(seller_gstin, period)
    ims = await repo.list_ims_actions(seller_gstin, period)
    snapshot = build_snapshot(seller_gstin, period, invoices, vendors, ims)
    return snapshot.model_dump()


# =========================== Interest ===========================
@router.post("/interest/estimate")
async def estimate_interest(body: InterestInput):
    return compute_interest(body).model_dump()


# =========================== Export ===========================
@router.post("/export/gstr1")
async def export_gstr1(seller_gstin: str = Query(...), period: str = Query(...)):
    invoices = await repo.list_marketplace_invoices(seller_gstin, period)
    vendors = await repo.list_vendor_invoices(seller_gstin, period)
    ims = await repo.list_ims_actions(seller_gstin, period)
    snap = build_snapshot(seller_gstin, period, invoices, vendors, ims)
    payload = build_gstr1_json(seller_gstin, period, snap.gstr1)

    export_id = uuid.uuid4().hex
    await repo.save_export({
        "id": export_id, "created_at": _now_iso(), "updated_at": _now_iso(),
        "seller_gstin": seller_gstin, "period": period,
        "kind": "gstr1", "payload": payload,
    })
    token = sign_download_token(export_id, ttl_seconds=600)
    return {"export_id": export_id, "download_token": token, "preview": payload}


@router.post("/export/gstr3b")
async def export_gstr3b(seller_gstin: str = Query(...), period: str = Query(...)):
    invoices = await repo.list_marketplace_invoices(seller_gstin, period)
    vendors = await repo.list_vendor_invoices(seller_gstin, period)
    ims = await repo.list_ims_actions(seller_gstin, period)
    snap = build_snapshot(seller_gstin, period, invoices, vendors, ims)
    payload = build_gstr3b_json(seller_gstin, period, snap.gstr3b)

    export_id = uuid.uuid4().hex
    await repo.save_export({
        "id": export_id, "created_at": _now_iso(), "updated_at": _now_iso(),
        "seller_gstin": seller_gstin, "period": period,
        "kind": "gstr3b", "payload": payload,
    })
    token = sign_download_token(export_id, ttl_seconds=600)
    return {"export_id": export_id, "download_token": token, "preview": payload}


@router.get("/export/{export_id}/download")
async def download_export(export_id: str, token: str):
    if not verify_download_token(export_id, token):
        raise HTTPException(403, "Invalid or expired download token")
    doc = await repo.get_export(export_id)
    if not doc:
        raise HTTPException(404, "Export not found")
    payload = doc.get("payload")
    filename = f"{doc.get('kind', 'export')}_{doc.get('period', '').replace('-', '')}_{doc.get('seller_gstin', '')}.json"
    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# =========================== Seed (demo data) ===========================
@router.post("/seed/demo")
async def seed_demo():
    """Seed one seller + sample invoices + vendor invoices + IMS actions
    so the UI has meaningful data on first run. Idempotent per (seller, period)."""
    seller_gstin = "29ABCDE1234F1Z5"
    period = datetime.now(timezone.utc).strftime("%Y-%m")

    # Clear prior seed data for this seller+period
    from db import marketplace_invoices as _mp, vendor_invoices as _vi, ims_actions as _ims
    await _mp.delete_many({"seller_gstin": seller_gstin, "period": period})
    await _vi.delete_many({"seller_gstin": seller_gstin, "period": period})
    await _ims.delete_many({"seller_gstin": seller_gstin, "period": period})

    # Seller
    existing = await repo.get_seller_by_gstin(seller_gstin)
    if not existing:
        seller = Seller(legal_name="Acme Traders Pvt Ltd", gstin=seller_gstin,
                        state_code="29", trade_name="Acme Traders")
        await repo.create_seller(seller.model_dump())

    # Marketplace invoices — mix of intra/inter-state
    from models import MarketplaceInvoice, LineItem
    mp_docs = []
    samples = [
        ("amazon", "AMZ-INV-001", "b2cs", "29", True, 5000, 450, 450, 0),
        ("amazon", "AMZ-INV-002", "b2cs", "27", False, 8000, 0, 0, 1440),
        ("flipkart", "FK-INV-101", "b2b", "24", False, 12000, 0, 0, 2160),
        ("meesho", "MSO-INV-501", "b2cs", "29", True, 3200, 288, 288, 0),
        ("flipkart", "FK-INV-102", "b2cl", "33", False, 260000, 0, 0, 46800),
    ]
    for mp, num, typ, pos, intra, txv, c, s, i in samples:
        rate = 18 if (c + s + i) > 0 and txv > 0 else 0
        item = LineItem(description=f"Item {num}", hsn="6109", quantity=1,
                        unit_price=txv, taxable_value=txv, gst_rate=rate,
                        igst=i, cgst=c, sgst=s)
        mp_docs.append(MarketplaceInvoice(
            seller_gstin=seller_gstin, period=period, marketplace=mp,  # type: ignore[arg-type]
            invoice_number=num, invoice_date=f"{period}-15",
            invoice_type=typ,  # type: ignore[arg-type]
            buyer_gstin=("29AAAAA0000A1Z5" if typ == "b2b" else None),
            buyer_state_code=pos, place_of_supply=pos, is_intrastate=intra,
            taxable_value=txv, igst=i, cgst=c, sgst=s, cess=0,
            total_value=txv + i + c + s, items=[item],
        ).model_dump())
    await repo.insert_marketplace_invoices(mp_docs)

    # Vendor invoices — some verified, some not; one ineligible
    from models import VendorInvoice
    v_docs = [
        VendorInvoice(
            seller_gstin=seller_gstin, period=period,
            supplier_gstin="29AABCU9603R1Z2", supplier_name="Bharti Airtel Ltd",
            invoice_number="BAL-9981", invoice_date=f"{period}-05",
            is_intrastate=True, taxable_value=2000, cgst=180, sgst=180,
            total_value=2360, itc_eligible=True, verified_gstin=True,
        ).model_dump(),
        VendorInvoice(
            seller_gstin=seller_gstin, period=period,
            supplier_gstin="27AAACR5055K1Z4", supplier_name="Reliance Retail",
            invoice_number="RR-4423", invoice_date=f"{period}-08",
            is_intrastate=False, taxable_value=15000, igst=2700,
            total_value=17700, itc_eligible=True, verified_gstin=True,
        ).model_dump(),
        VendorInvoice(
            seller_gstin=seller_gstin, period=period,
            supplier_gstin="29AAECF0000A1Z8", supplier_name="Fleet Motors",
            invoice_number="FM-77", invoice_date=f"{period}-11",
            is_intrastate=True, taxable_value=800000, cgst=112000, sgst=112000,
            total_value=1024000, itc_eligible=False,
            itc_ineligible_reason="Blocked u/s 17(5): motor vehicle for personal use",
            verified_gstin=True,
        ).model_dump(),
    ]
    await repo.insert_vendor_invoices(v_docs)

    # IMS credit notes
    ims_docs = [
        IMSAction(
            seller_gstin=seller_gstin, period=period,
            supplier_gstin="27AAACR5055K1Z4",
            credit_note_number="RR-CN-01", credit_note_date=f"{period}-20",
            original_invoice_number="RR-4423", is_amendment=False, is_original_cn=True,
            taxable_value=3000, tax_amount=540,
            itc_previously_claimed=True,
        ).model_dump(),
        IMSAction(
            seller_gstin=seller_gstin, period=period,
            supplier_gstin="29AABCU9603R1Z2",
            credit_note_number="BAL-CN-77", credit_note_date=f"{period}-22",
            original_invoice_number="BAL-9981", is_amendment=True, is_original_cn=False,
            taxable_value=500, tax_amount=90,
            itc_previously_claimed=True,
        ).model_dump(),
    ]
    for a in ims_docs:
        await repo.upsert_ims_action(a)

    return {"seller_gstin": seller_gstin, "period": period, "seeded": {
        "marketplace_invoices": len(mp_docs),
        "vendor_invoices": len(v_docs),
        "ims_actions": len(ims_docs),
    }}
