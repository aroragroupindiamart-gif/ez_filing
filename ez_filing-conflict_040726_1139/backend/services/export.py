"""Export — build GSTN portal-ready JSON (plain on download, encrypted at rest).

GSTR-1 JSON follows the GSTN offline-tool schema (b2b, b2cs, b2cl, hsn).
GSTR-3B JSON follows the section layout the user validates on the portal
(3.1 outward + 4 ITC with 4A/4B(1)/4B(2)/4D).
"""
import hashlib
import json
from datetime import datetime
from typing import Any, Dict, List


def _add_hsn_checksum(hsn: Dict[str, Any]) -> Dict[str, Any]:
    """Add GSTN-required SHA-256 checksum over the HSN data array."""
    data = hsn.get("data", [])
    canonical = json.dumps(data, sort_keys=True, separators=(",", ":"))
    chksum = hashlib.sha256(canonical.encode()).hexdigest()
    return {"chksum": chksum, "data": data}


def build_gstr1_json(seller_gstin: str, period: str, gstr1: Dict[str, Any]) -> Dict[str, Any]:
    # period expected as YYYY-MM → GSTN portal wants MMYYYY
    y, m = period.split("-")
    fp = f"{m}{y}"
    return {
        "gstin": seller_gstin,
        "fp": fp,
        "gt": gstr1["totals"]["taxable_value"],
        "cur_gt": gstr1["totals"]["taxable_value"],
        "b2b": [
            {k: v for k, v in row.items() if k != "invoice_id"}
            for row in gstr1.get("b2b", [])
        ],
        "b2cs": [
            {k: v for k, v in row.items() if k != "invoice_ids"}
            for row in gstr1.get("b2cs", [])
        ],
        "b2cl": [
            {k: v for k, v in row.items() if k != "invoice_id"}
            for row in gstr1.get("b2cl", [])
        ],
        "hsn": _add_hsn_checksum(gstr1.get("hsn", {"data": []})),
    }


def build_gstr3b_json(seller_gstin: str, period: str, gstr3b: Dict[str, Any]) -> Dict[str, Any]:
    y, m = period.split("-")
    fp = f"{m}{y}"
    t4 = gstr3b["4"]
    t31 = gstr3b["3.1"]

    def _strip(d):
        return {k: v for k, v in d.items() if k not in {"source_ids", "label"}}

    return {
        "gstin": seller_gstin,
        "ret_period": fp,
        "sup_details": {
            "osup_det": t31["3.1(a)"],
            "osup_zero": t31["3.1(b)"],
            "osup_nil_exmp": t31["3.1(c)"],
            "isup_rev": t31["3.1(d)"],
            "osup_nongst": t31["3.1(e)"],
        },
        "itc_elg": {
            "itc_avl": [{"ty": "IMPG", **_strip(t4["4A"])}],
            "itc_rev": [
                {"ty": "OTH", **_strip(t4["4B(1)"])},
                {"ty": "RUL", **_strip(t4["4B(2)"])},
            ],
            "itc_net": _strip(t4["4D"]),
        },
    }
