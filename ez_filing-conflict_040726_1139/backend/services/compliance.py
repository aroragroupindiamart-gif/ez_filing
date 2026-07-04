"""Compliance calculators — GSTR-1 & GSTR-3B builders.

Produces:
 - GSTR-1: b2b, b2cs, b2cl, hsn summary
 - GSTR-3B Table 3.1 (Outward supplies) and Table 4 (ITC)
   * 4A: ITC available (only from GSTIN-verified vendor invoices)
   * 4B(1): Ineligible ITC (u/s 17(5)) disclosure
   * 4B(2): Reversals — driven by accepted IMS credit notes
   * 4D: Net ITC = 4A − (4B(1) + 4B(2))

Drill-down: each Table 4 cell carries a list of source vendor invoice IDs.
"""
from typing import Any, Dict, List

from models import ComplianceSnapshot, is_valid_gstin


def _r(v: float) -> float:
    return round(float(v or 0.0), 2)


def build_gstr1(invoices: List[dict]) -> Dict[str, Any]:
    b2b: List[dict] = []
    b2cs: Dict[str, dict] = {}  # keyed by (state, rate)
    b2cl: List[dict] = []
    hsn: Dict[str, dict] = {}

    totals = {"taxable_value": 0.0, "igst": 0.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0}

    for inv in invoices:
        totals["taxable_value"] += inv["taxable_value"]
        totals["igst"] += inv["igst"]
        totals["cgst"] += inv["cgst"]
        totals["sgst"] += inv["sgst"]
        totals["cess"] += inv["cess"]

        # HSN summary
        for it in inv.get("items", []) or []:
            key = (it.get("hsn") or "9999") + f"|{it.get('gst_rate', 0)}"
            entry = hsn.setdefault(key, {
                "hsn": it.get("hsn") or "9999",
                "rate": it.get("gst_rate", 0),
                "quantity": 0.0,
                "taxable_value": 0.0,
                "igst": 0.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0,
            })
            entry["quantity"] += it.get("quantity", 0)
            entry["taxable_value"] += it.get("taxable_value", 0)
            entry["igst"] += it.get("igst", 0)
            entry["cgst"] += it.get("cgst", 0)
            entry["sgst"] += it.get("sgst", 0)
            entry["cess"] += it.get("cess", 0)

        if inv["invoice_type"] == "b2b" and inv.get("buyer_gstin"):
            b2b.append({
                "invoice_id": inv["id"],
                "ctin": inv["buyer_gstin"],
                "inum": inv["invoice_number"],
                "idt": inv["invoice_date"],
                "val": _r(inv["total_value"]),
                "pos": inv["place_of_supply"],
                "rchrg": "N",
                "inv_typ": "R",
                "itms": [{
                    "num": i + 1,
                    "itm_det": {
                        "txval": _r(it.get("taxable_value", 0)),
                        "rt": it.get("gst_rate", 0),
                        "iamt": _r(it.get("igst", 0)),
                        "camt": _r(it.get("cgst", 0)),
                        "samt": _r(it.get("sgst", 0)),
                        "csamt": _r(it.get("cess", 0)),
                    },
                } for i, it in enumerate(inv.get("items", []) or [])],
            })
        elif inv["invoice_type"] == "b2cl":
            b2cl.append({
                "invoice_id": inv["id"],
                "pos": inv["place_of_supply"],
                "inv": [{
                    "inum": inv["invoice_number"],
                    "idt": inv["invoice_date"],
                    "val": _r(inv["total_value"]),
                    "itms": [{
                        "num": i + 1,
                        "itm_det": {
                            "txval": _r(it.get("taxable_value", 0)),
                            "rt": it.get("gst_rate", 0),
                            "iamt": _r(it.get("igst", 0)),
                            "csamt": _r(it.get("cess", 0)),
                        },
                    } for i, it in enumerate(inv.get("items", []) or [])],
                }],
            })
        else:  # b2cs
            rate = inv.get("items", [{}])[0].get("gst_rate", 0) if inv.get("items") else 0
            key = f"{inv['place_of_supply']}|{rate}"
            entry = b2cs.setdefault(key, {
                "sply_ty": "INTRA" if inv["is_intrastate"] else "INTER",
                "pos": inv["place_of_supply"],
                "typ": "OE",
                "rt": rate,
                "txval": 0.0, "iamt": 0.0, "camt": 0.0, "samt": 0.0, "csamt": 0.0,
                "invoice_ids": [],
            })
            entry["txval"] += inv["taxable_value"]
            entry["iamt"] += inv["igst"]
            entry["camt"] += inv["cgst"]
            entry["samt"] += inv["sgst"]
            entry["csamt"] += inv["cess"]
            entry["invoice_ids"].append(inv["id"])

    return {
        "b2b": b2b,
        "b2cs": [{**v, "txval": _r(v["txval"]), "iamt": _r(v["iamt"]),
                  "camt": _r(v["camt"]), "samt": _r(v["samt"]), "csamt": _r(v["csamt"])}
                 for v in b2cs.values()],
        "b2cl": b2cl,
        "hsn": {
            "data": [{**v, "taxable_value": _r(v["taxable_value"]),
                      "igst": _r(v["igst"]), "cgst": _r(v["cgst"]),
                      "sgst": _r(v["sgst"]), "cess": _r(v["cess"])}
                     for v in hsn.values()],
        },
        "totals": {k: _r(v) for k, v in totals.items()},
    }


def build_gstr3b_table31(invoices: List[dict]) -> Dict[str, Any]:
    """Table 3.1(a) — Outward taxable supplies (other than zero rated, nil rated, exempted)."""
    total = {"taxable_value": 0.0, "igst": 0.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0}
    for inv in invoices:
        total["taxable_value"] += inv["taxable_value"]
        total["igst"] += inv["igst"]
        total["cgst"] += inv["cgst"]
        total["sgst"] += inv["sgst"]
        total["cess"] += inv["cess"]
    return {
        "3.1(a)": {k: _r(v) for k, v in total.items()},
        "3.1(b)": {"taxable_value": 0.0, "igst": 0.0},  # zero-rated (exports)
        "3.1(c)": {"taxable_value": 0.0},  # nil / exempted
        "3.1(d)": {"taxable_value": 0.0, "igst": 0.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0},  # inward RCM
        "3.1(e)": {"taxable_value": 0.0},  # non-GST outward
    }


def build_gstr3b_table4(vendor_invoices: List[dict], ims_actions: List[dict]) -> Dict[str, Any]:
    """Table 4 — ITC section with drill-down source IDs."""
    a_all = {"igst": 0.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0}
    a_src: List[str] = []
    b1 = {"igst": 0.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0}
    b1_src: List[str] = []

    for v in vendor_invoices:
        if not v.get("verified_gstin"):
            # ITC only from regex-verified supplier GSTIN — spec requirement
            continue
        bucket = a_all if v.get("itc_eligible", True) and not v.get("is_credit_note") else b1
        src = a_src if v.get("itc_eligible", True) and not v.get("is_credit_note") else b1_src
        bucket["igst"] += v["igst"]
        bucket["cgst"] += v["cgst"]
        bucket["sgst"] += v["sgst"]
        bucket["cess"] += v["cess"]
        src.append(v["id"])

    # 4B(2) reversals — driven by accepted IMS credit notes
    b2 = {"igst": 0.0, "cgst": 0.0, "sgst": 0.0, "cess": 0.0}
    b2_src: List[str] = []
    for a in ims_actions:
        if a.get("decision") == "accept" and a.get("reversal_amount", 0) > 0:
            # We keep it in a single bucket for v1 UI; UI shows breakup
            b2["igst"] += a["reversal_amount"]  # simplified allocation
            b2_src.append(a["id"])

    net = {
        "igst": max(_r(a_all["igst"] - b1["igst"] - b2["igst"]), 0.0),
        "cgst": max(_r(a_all["cgst"] - b1["cgst"] - b2["cgst"]), 0.0),
        "sgst": max(_r(a_all["sgst"] - b1["sgst"] - b2["sgst"]), 0.0),
        "cess": max(_r(a_all["cess"] - b1["cess"] - b2["cess"]), 0.0),
    }

    return {
        "4A": {**{k: _r(v) for k, v in a_all.items()}, "source_ids": a_src, "label": "ITC available"},
        "4B(1)": {**{k: _r(v) for k, v in b1.items()}, "source_ids": b1_src, "label": "Ineligible ITC (17(5))"},
        "4B(2)": {**{k: _r(v) for k, v in b2.items()}, "source_ids": b2_src, "label": "Reversals (IMS-driven CN)"},
        "4D": {**net, "source_ids": [], "label": "Net ITC available"},
    }


def build_snapshot(seller_gstin: str, period: str,
                   invoices: List[dict], vendor_invoices: List[dict],
                   ims_actions: List[dict]) -> ComplianceSnapshot:
    return ComplianceSnapshot(
        period=period,
        seller_gstin=seller_gstin,
        gstr1=build_gstr1(invoices),
        gstr3b={
            "3.1": build_gstr3b_table31(invoices),
            "4": build_gstr3b_table4(vendor_invoices, ims_actions),
        },
    )
