"""LLM extraction — vendor PDF text → structured VendorInvoice payload.

Uses Emergent Universal LLM key + GPT-5.2 via emergentintegrations.
Returns a plain dict; caller wraps it into a VendorInvoice.

Non-streaming JSON extraction is intentional (this is a background job,
not a chat UI). Falls back to heuristic parse if LLM fails.
"""
from __future__ import annotations

import json
import os
import re
from typing import Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

SYSTEM = """You are an expert at extracting fields from Indian GST invoices.
Return STRICT JSON matching this schema (all keys required, use null when unknown):
{
 "supplier_gstin": "15-char GSTIN or null",
 "supplier_name": "string",
 "invoice_number": "string",
 "invoice_date": "YYYY-MM-DD",
 "is_credit_note": true|false,
 "is_intrastate": true|false,
 "taxable_value": number,
 "igst": number,
 "cgst": number,
 "sgst": number,
 "cess": number,
 "total_value": number,
 "itc_eligible": true|false,
 "itc_ineligible_reason": "string or null (only if not eligible, e.g. 'blocked u/s 17(5): motor vehicle')"
}
No prose, no code fences — JSON only."""

GSTIN_RE = re.compile(r"[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}")


def _heuristic(text: str) -> dict:
    """Minimal fallback so uploads never hard-fail."""
    gstin_match = GSTIN_RE.search(text or "")
    return {
        "supplier_gstin": gstin_match.group(0) if gstin_match else None,
        "supplier_name": "Unknown Supplier",
        "invoice_number": "AUTO-" + str(abs(hash(text or "")) % 100000),
        "invoice_date": "",
        "is_credit_note": "credit note" in (text or "").lower(),
        "is_intrastate": True,
        "taxable_value": 0.0,
        "igst": 0.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0,
        "total_value": 0.0,
        "itc_eligible": True,
        "itc_ineligible_reason": None,
    }


async def extract_vendor_invoice(text: str, session_id: Optional[str] = None) -> dict:
    if not text or not text.strip():
        return _heuristic(text)

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        return _heuristic(text)

    try:
        chat = (
            LlmChat(
                api_key=api_key,
                session_id=session_id or "vendor-extract",
                system_message=SYSTEM,
            )
            .with_model("openai", "gpt-5.2")
        )
        msg = UserMessage(text=f"Extract the invoice fields from this text:\n\n{text[:12000]}")
        resp = await chat.send_message(msg)

        # Strip fences if any
        raw = resp.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?", "", raw).rstrip("`").strip()
        data = json.loads(raw)

        # Coerce numeric fields
        for k in ("taxable_value", "igst", "cgst", "sgst", "cess", "total_value"):
            data[k] = float(data.get(k) or 0.0)
        data["is_credit_note"] = bool(data.get("is_credit_note"))
        data["is_intrastate"] = bool(data.get("is_intrastate"))
        data["itc_eligible"] = bool(data.get("itc_eligible", True))
        return data
    except Exception:  # noqa: BLE001
        return _heuristic(text)
