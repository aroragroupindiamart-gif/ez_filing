"""Repository layer — the ONLY module that talks to the DB directly.

Swapping MongoDB for Postgres later means rewriting this file only;
services/routes stay untouched.
"""
from typing import Any, List, Optional

from db import (
    exceptions_log,
    exports,
    ims_actions,
    jobs,
    marketplace_invoices,
    sellers,
    uploads,
    vendor_invoices,
)

_PROJ = {"_id": 0}


# ---- generic helpers ----
async def _insert(coll, doc: dict) -> None:
    await coll.insert_one({**doc})


async def _find_by_id(coll, _id: str) -> Optional[dict]:
    return await coll.find_one({"id": _id}, _PROJ)


async def _update(coll, _id: str, patch: dict) -> None:
    await coll.update_one({"id": _id}, {"$set": patch})


async def _list(coll, query: dict, limit: int = 500, sort: Optional[List] = None) -> List[dict]:
    cur = coll.find(query, _PROJ)
    if sort:
        cur = cur.sort(sort)
    return await cur.to_list(limit)


# ---- sellers ----
async def create_seller(doc: dict): await _insert(sellers, doc)
async def get_seller(seller_id: str): return await _find_by_id(sellers, seller_id)
async def list_sellers(): return await _list(sellers, {})
async def get_seller_by_gstin(gstin: str): return await sellers.find_one({"gstin": gstin}, _PROJ)


# ---- uploads ----
async def create_upload(doc: dict): await _insert(uploads, doc)
async def get_upload(uid: str): return await _find_by_id(uploads, uid)
async def list_uploads(seller_gstin: Optional[str] = None, period: Optional[str] = None):
    q = {}
    if seller_gstin:
        q["seller_gstin"] = seller_gstin
    if period:
        q["period"] = period
    return await _list(uploads, q, sort=[("created_at", -1)])


# ---- jobs ----
async def create_job(doc: dict): await _insert(jobs, doc)
async def get_job(jid: str): return await _find_by_id(jobs, jid)
async def update_job(jid: str, patch: dict): await _update(jobs, jid, patch)
async def list_jobs(limit: int = 100): return await _list(jobs, {}, limit=limit, sort=[("created_at", -1)])
async def list_jobs_for_upload(upload_id: str): return await _list(jobs, {"upload_id": upload_id})


# ---- invoices ----
async def insert_marketplace_invoices(docs: List[dict]):
    if docs:
        await marketplace_invoices.insert_many([{**d} for d in docs])


async def list_marketplace_invoices(seller_gstin: str, period: str) -> List[dict]:
    return await _list(marketplace_invoices, {"seller_gstin": seller_gstin, "period": period}, limit=5000)


async def insert_vendor_invoices(docs: List[dict]):
    if docs:
        await vendor_invoices.insert_many([{**d} for d in docs])


async def list_vendor_invoices(seller_gstin: str, period: str) -> List[dict]:
    return await _list(vendor_invoices, {"seller_gstin": seller_gstin, "period": period}, limit=5000)


async def update_vendor_invoice(vid: str, patch: dict): await _update(vendor_invoices, vid, patch)


# ---- IMS ----
async def upsert_ims_action(doc: dict):
    await ims_actions.update_one(
        {
            "seller_gstin": doc["seller_gstin"],
            "period": doc["period"],
            "credit_note_number": doc["credit_note_number"],
        },
        {"$set": {**doc}},
        upsert=True,
    )


async def list_ims_actions(seller_gstin: str, period: str) -> List[dict]:
    return await _list(ims_actions, {"seller_gstin": seller_gstin, "period": period}, limit=5000)


async def get_ims_action(aid: str): return await _find_by_id(ims_actions, aid)
async def update_ims_action(aid: str, patch: dict): await _update(ims_actions, aid, patch)


# ---- exceptions ----
async def add_exception(doc: dict): await _insert(exceptions_log, doc)
async def list_exceptions(seller_gstin: str, period: str):
    return await _list(exceptions_log, {"seller_gstin": seller_gstin, "period": period, "resolved": False}, limit=5000)


async def resolve_exception(eid: str, corrected: dict):
    await _update(exceptions_log, eid, {"resolved": True, "corrected_payload": corrected})


# ---- exports ----
async def save_export(doc: dict): await _insert(exports, doc)
async def get_export(eid: str): return await _find_by_id(exports, eid)
async def list_exports(seller_gstin: str, period: str):
    return await _list(exports, {"seller_gstin": seller_gstin, "period": period}, sort=[("created_at", -1)])
