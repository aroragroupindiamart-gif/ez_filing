"""Backend API tests for GST-ECOM-EZ MVP."""
import io
import os
import time
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://ecom-compliance-ez.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
SELLER = "29ABCDE1234F1Z5"
PERIOD = datetime.now(timezone.utc).strftime("%Y-%m")


@pytest.fixture(scope="session")
def s():
    sess = requests.Session()
    sess.headers.update({"Accept": "application/json"})
    return sess


# ---- Health & Seed ----
def test_health(s):
    r = s.get(f"{API}/health", timeout=15)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_seed_idempotent(s):
    r1 = s.post(f"{API}/seed/demo", timeout=30).json()
    r2 = s.post(f"{API}/seed/demo", timeout=30).json()
    assert r1["seeded"] == r2["seeded"] == {"marketplace_invoices": 5, "vendor_invoices": 3, "ims_actions": 2}
    assert r1["seller_gstin"] == SELLER
    assert r1["period"] == PERIOD


# ---- Sellers ----
def test_sellers_list(s):
    r = s.get(f"{API}/sellers", timeout=15)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_seller_invalid_gstin(s):
    r = s.post(f"{API}/sellers", json={"legal_name": "X", "gstin": "BAD"}, timeout=15)
    assert r.status_code == 400


# ---- Upload flow ----
def test_upload_marketplace_csv_and_job(s):
    csv = (
        "invoice_number,invoice_date,buyer_state_code,taxable_value,igst,cgst,sgst,invoice_type\n"
        f"TEST-INV-001,{PERIOD}-10,29,1000,0,90,90,b2cs\n"
        f"TEST-INV-002,{PERIOD}-11,27,2000,360,0,0,b2cs\n"
    )
    files = {"file": ("test.csv", io.BytesIO(csv.encode()), "text/csv")}
    data = {"kind": "marketplace_csv", "period": PERIOD, "seller_gstin": SELLER, "marketplace": "amazon"}
    r = s.post(f"{API}/uploads", files=files, data=data, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["job"]["status"] in ("queued", "running")
    job_id = j["job"]["id"]

    # Poll
    final = None
    for _ in range(30):
        jr = s.get(f"{API}/jobs/{job_id}", timeout=15).json()
        if jr["status"] in ("complete", "exception"):
            final = jr
            break
        time.sleep(1)
    assert final is not None, "job did not finish"
    assert final["status"] in ("complete", "exception")
    assert final.get("progress") == 100 or final["status"] == "exception"

    # Encryption check: raw stored file bytes should not match plaintext
    storage_ref = None
    # find upload record
    ups = s.get(f"{API}/uploads", params={"seller_gstin": SELLER, "period": PERIOD}, timeout=15).json()
    for u in ups:
        if u["filename"] == "test.csv":
            storage_ref = u["storage_ref"]
            break
    assert storage_ref
    path = f"/app/backend/storage/{storage_ref}"
    if os.path.exists(path):
        with open(path, "rb") as f:
            raw = f.read()
        assert csv.encode() not in raw, "stored file is not encrypted"


def test_invoices_marketplace_listed(s):
    r = s.get(f"{API}/invoices/marketplace", params={"seller_gstin": SELLER, "period": PERIOD}, timeout=15)
    assert r.status_code == 200
    assert len(r.json()) >= 5


# ---- Compliance preview ----
def test_compliance_preview_structure(s):
    r = s.get(f"{API}/compliance/preview", params={"seller_gstin": SELLER, "period": PERIOD}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "gstr1" in d and "gstr3b" in d
    for k in ("b2b", "b2cs", "b2cl", "hsn"):
        assert k in d["gstr1"], f"missing gstr1.{k}"
    assert "3.1" in d["gstr3b"]
    assert "4" in d["gstr3b"]
    t4 = d["gstr3b"]["4"]
    for cell in ("4A", "4B(1)", "4B(2)", "4D"):
        assert cell in t4, f"missing {cell}"
        for f in ("igst", "cgst", "sgst", "cess", "source_ids", "label"):
            assert f in t4[cell], f"missing {cell}.{f}"


def test_table4a_only_verified_vendors(s):
    prev = s.get(f"{API}/compliance/preview", params={"seller_gstin": SELLER, "period": PERIOD}, timeout=15).json()
    v = s.get(f"{API}/invoices/vendor", params={"seller_gstin": SELLER, "period": PERIOD}, timeout=15).json()
    verified_ids = {x["id"] for x in v if x.get("verified_gstin") and x.get("itc_eligible")}
    src = set(prev["gstr3b"]["4"]["4A"]["source_ids"])
    # 4A source_ids must be subset of verified+eligible vendor invoices
    assert src.issubset(verified_ids), f"4A includes unverified ids: {src - verified_ids}"


# ---- IMS decisions ----
def test_ims_accept_and_pending_rules(s):
    ims = s.get(f"{API}/ims/actions", params={"seller_gstin": SELLER, "period": PERIOD}, timeout=15).json()
    assert len(ims) >= 2
    original_cn = next(a for a in ims if a["is_original_cn"])
    amendment = next(a for a in ims if a["is_amendment"])

    # pending on original CN -> 400
    r = s.post(f"{API}/ims/actions/{original_cn['id']}/decision", json={"decision": "pending"}, timeout=15)
    assert r.status_code == 400

    # accept on amendment -> reversal reflected in Table 4B(2)
    r = s.post(f"{API}/ims/actions/{amendment['id']}/decision", json={"decision": "accept"}, timeout=15)
    assert r.status_code == 200
    prev = s.get(f"{API}/compliance/preview", params={"seller_gstin": SELLER, "period": PERIOD}, timeout=15).json()
    t4b2 = prev["gstr3b"]["4"]["4B(2)"]
    total_rev = t4b2["igst"] + t4b2["cgst"] + t4b2["sgst"]
    assert total_rev > 0, f"expected reversal >0, got {t4b2}"


# ---- Interest ----
def test_interest_estimate(s):
    body = {
        "net_cash_liability": 50000,
        "ecl_min_cash_balance": 10000,
        "due_date": "2026-01-20",
        "filing_date": "2026-02-10",
    }
    r = s.post(f"{API}/interest/estimate", json=body, timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["days_late"] == 21
    assert d["interest_base"] == 40000
    assert abs(d["interest_amount"] - 414.25) < 1.0
    assert d["late_fee_total"] == 1050


# ---- Export ----
def test_export_gstr1_download_token(s):
    r = s.post(f"{API}/export/gstr1", params={"seller_gstin": SELLER, "period": PERIOD}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    eid = d["export_id"]
    tok = d["download_token"]
    assert "preview" in d
    # valid token
    r2 = s.get(f"{API}/export/{eid}/download", params={"token": tok}, timeout=15)
    assert r2.status_code == 200
    # tampered
    r3 = s.get(f"{API}/export/{eid}/download", params={"token": tok + "x"}, timeout=15)
    assert r3.status_code == 403
    # missing token
    r4 = s.get(f"{API}/export/{eid}/download", timeout=15)
    assert r4.status_code in (403, 422)


def test_export_gstr3b(s):
    r = s.post(f"{API}/export/gstr3b", params={"seller_gstin": SELLER, "period": PERIOD}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "export_id" in d and "download_token" in d and "preview" in d
