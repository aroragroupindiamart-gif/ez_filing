"""Ingestion — parse marketplace CSV/XLSX + vendor PDF text extraction.

Marketplace parsers are tolerant: they look for common column headers
across Amazon MTR, Flipkart, Meesho. Unrecognised rows flow to the
Exception Ledger (never silently dropped).
"""
from __future__ import annotations

import io
import re
from datetime import datetime
from typing import Dict, List, Tuple

import pandas as pd
import pypdf

from models import LineItem, MarketplaceInvoice, is_valid_gstin

# Common column aliases seen across marketplaces
COLUMN_ALIASES = {
    "invoice_number": [
        "invoice number", "invoice_number", "invoice_no", "invoice #", "invoice no.",
        "bill number", "order id", "order-id", "order_id",
    ],
    "invoice_date": [
        "invoice date", "invoice_date", "order date", "order_date",
        "shipment date", "shipment_date",
    ],
    "buyer_state": [
        "buyer state", "buyer_state", "ship to state", "ship_to_state",
        "state", "customer state", "customer_state",
        "ship-to-state", "shipping state", "shipping_state",
    ],
    "buyer_gstin": [
        "buyer gstin", "buyer_gstin", "customer gstin", "customer_gstin",
        "gstin of buyer", "gstin_of_buyer",
    ],
    "taxable_value": [
        "taxable value", "taxable_value", "principal amount", "principal_amount",
        "invoice value (without tax)", "amount",
    ],
    "igst": ["igst", "igst amount", "igst_amount", "igst rate * taxable"],
    "cgst": ["cgst", "cgst amount", "cgst_amount"],
    "sgst": ["sgst", "sgst amount", "sgst_amount", "utgst", "utgst_amount"],
    "cess": ["cess", "cess amount", "cess_amount"],
    "total_value": [
        "invoice amount", "invoice_amount", "total value", "total_value",
        "invoice total", "invoice_total", "total",
    ],
    "gst_rate": ["gst rate", "gst_rate", "tax rate", "tax_rate", "rate"],
    "hsn": ["hsn", "hsn_sc", "hsn/sac", "hsn code", "hsn_code"],
    "quantity": ["quantity", "qty"],
}

STATE_CODE_MAP = {
    "andhra pradesh": "37", "arunachal pradesh": "12", "assam": "18",
    "bihar": "10", "chhattisgarh": "22", "goa": "30", "gujarat": "24",
    "haryana": "06", "himachal pradesh": "02", "jharkhand": "20",
    "karnataka": "29", "kerala": "32", "madhya pradesh": "23",
    "maharashtra": "27", "manipur": "14", "meghalaya": "17", "mizoram": "15",
    "nagaland": "13", "odisha": "21", "punjab": "03", "rajasthan": "08",
    "sikkim": "11", "tamil nadu": "33", "telangana": "36", "tripura": "16",
    "uttar pradesh": "09", "uttarakhand": "05", "west bengal": "19",
    "delhi": "07", "chandigarh": "04", "jammu and kashmir": "01",
    "ladakh": "38", "puducherry": "34", "andaman and nicobar": "35",
    "dadra and nagar haveli": "26", "daman and diu": "26", "lakshadweep": "31",
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s).strip().lower()) if s is not None else ""


def _match_col(df_cols_lower: Dict[str, str], aliases: List[str]) -> str:
    for a in aliases:
        if a in df_cols_lower:
            return df_cols_lower[a]
    return ""


def _state_code(s: str) -> str:
    n = _norm(s)
    if n in STATE_CODE_MAP:
        return STATE_CODE_MAP[n]
    m = re.match(r"^(\d{2})[\s-]", str(s or ""))
    if m:
        return m.group(1)
    return ""


def _to_float(v) -> float:
    if pd.isna(v):
        return 0.0
    try:
        return float(str(v).replace(",", "").replace("₹", "").strip())
    except (ValueError, TypeError):
        return 0.0


def _to_date(v) -> str:
    if pd.isna(v):
        return ""
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.strftime("%Y-%m-%d")
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d-%b-%Y", "%d-%b-%y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return s  # last resort


def parse_marketplace_file(
    content: bytes,
    filename: str,
    marketplace: str,
    seller_gstin: str,
    period: str,
) -> Tuple[List[MarketplaceInvoice], List[dict]]:
    """Return (invoices, exception_rows)."""
    if filename.lower().endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
    elif filename.lower().endswith((".xls", ".xlsx")):
        df = pd.read_excel(io.BytesIO(content))
    else:
        raise ValueError(f"Unsupported file type: {filename}")

    if df.empty:
        return [], []

    cols_lower = {_norm(c): c for c in df.columns}
    col = {k: _match_col(cols_lower, aliases) for k, aliases in COLUMN_ALIASES.items()}

    seller_state = seller_gstin[:2] if is_valid_gstin(seller_gstin) else "00"

    invoices: List[MarketplaceInvoice] = []
    exceptions: List[dict] = []

    for idx, row in df.iterrows():
        raw = {k: (None if pd.isna(v) else str(v)) for k, v in row.items()}
        try:
            inv_no = str(row[col["invoice_number"]]) if col["invoice_number"] else ""
            inv_date = _to_date(row[col["invoice_date"]]) if col["invoice_date"] else ""
            buyer_state_raw = row[col["buyer_state"]] if col["buyer_state"] else ""
            buyer_state = _state_code(buyer_state_raw) or seller_state
            buyer_gstin = str(row[col["buyer_gstin"]]).strip() if col["buyer_gstin"] and not pd.isna(row[col["buyer_gstin"]]) else None
            if buyer_gstin and not is_valid_gstin(buyer_gstin):
                buyer_gstin = None

            taxable = _to_float(row[col["taxable_value"]]) if col["taxable_value"] else 0.0
            igst = _to_float(row[col["igst"]]) if col["igst"] else 0.0
            cgst = _to_float(row[col["cgst"]]) if col["cgst"] else 0.0
            sgst = _to_float(row[col["sgst"]]) if col["sgst"] else 0.0
            cess = _to_float(row[col["cess"]]) if col["cess"] else 0.0
            total = _to_float(row[col["total_value"]]) if col["total_value"] else (taxable + igst + cgst + sgst + cess)
            rate = _to_float(row[col["gst_rate"]]) if col["gst_rate"] else 0.0
            hsn = str(row[col["hsn"]]).strip() if col["hsn"] and not pd.isna(row[col["hsn"]]) else None
            qty = _to_float(row[col["quantity"]]) if col["quantity"] else 1.0

            is_intra = buyer_state == seller_state
            # Classify invoice type
            if buyer_gstin:
                inv_type = "b2b"
            elif total > 250_000 and not is_intra:
                inv_type = "b2cl"
            else:
                inv_type = "b2cs"

            if not inv_no or taxable <= 0:
                raise ValueError("Missing invoice number or taxable value")

            item = LineItem(
                description=str(raw.get(col["hsn"], "") or "Item"),
                hsn=hsn,
                quantity=qty,
                unit_price=round(taxable / qty, 2) if qty else taxable,
                taxable_value=taxable,
                gst_rate=rate,
                igst=igst, cgst=cgst, sgst=sgst, cess=cess,
            )
            invoices.append(MarketplaceInvoice(
                seller_gstin=seller_gstin,
                period=period,
                marketplace=marketplace,
                invoice_number=inv_no,
                invoice_date=inv_date,
                invoice_type=inv_type,
                buyer_gstin=buyer_gstin,
                buyer_state_code=buyer_state,
                place_of_supply=buyer_state,
                is_intrastate=is_intra,
                taxable_value=taxable,
                igst=igst, cgst=cgst, sgst=sgst, cess=cess,
                total_value=total,
                items=[item],
                raw_row=raw,
            ))
        except Exception as e:  # noqa: BLE001
            exceptions.append({
                "row_index": int(idx),
                "reason": str(e),
                "raw": raw,
            })

    return invoices, exceptions


def extract_pdf_text(content: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(content))
    parts = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001
            continue
    return "\n".join(parts)
