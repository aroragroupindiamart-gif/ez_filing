"""Pydantic domain models. Strict schemas + repository-pattern-friendly.

All models are storage-agnostic: the same schema will be reused when the
DB is swapped for Postgres in the GST AutoFile stack unification.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------- Constants ----------
GSTIN_REGEX = re.compile(
    r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
)

Marketplace = Literal["amazon", "flipkart", "meesho", "other"]
JobStatus = Literal["queued", "processing", "parsed", "exception", "complete", "failed"]
IMSDecision = Literal["accept", "reject", "pending", "no_action"]
InvoiceType = Literal["b2b", "b2cs", "b2cl", "cdnr", "cdnur", "exp"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _now_iso() -> str:
    return _now().isoformat()


def is_valid_gstin(gstin: str) -> bool:
    return bool(gstin and GSTIN_REGEX.match(gstin))


# ---------- Base ----------
class BaseDoc(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)


# ---------- Seller ----------
class Seller(BaseDoc):
    legal_name: str
    gstin: str
    state_code: str  # first 2 chars of GSTIN
    trade_name: Optional[str] = None

    @field_validator("gstin")
    @classmethod
    def _valid_gstin(cls, v: str) -> str:
        if not is_valid_gstin(v):
            raise ValueError(f"Invalid GSTIN: {v}")
        return v


# ---------- Upload / Job ----------
class UploadRecord(BaseDoc):
    filename: str
    size_bytes: int
    kind: Literal["marketplace_csv", "marketplace_xlsx", "vendor_pdf"]
    marketplace: Optional[Marketplace] = None
    period: str  # YYYY-MM
    seller_gstin: Optional[str] = None
    storage_ref: str  # encrypted local path or object key
    checksum_sha256: str


class ProcessingJob(BaseDoc):
    upload_id: str
    kind: Literal["marketplace_parse", "vendor_ocr"]
    status: JobStatus = "queued"
    progress: int = 0  # 0..100
    message: str = ""
    attempts: int = 0
    max_attempts: int = 3
    error: Optional[str] = None
    result_ref: Optional[str] = None  # id of resulting invoice batch


# ---------- Invoices ----------
class LineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    description: str = ""
    hsn: Optional[str] = None
    quantity: float = 1.0
    unit_price: float = 0.0
    taxable_value: float = 0.0
    gst_rate: float = 0.0  # combined (5/12/18/28)
    igst: float = 0.0
    cgst: float = 0.0
    sgst: float = 0.0
    cess: float = 0.0


class MarketplaceInvoice(BaseDoc):
    seller_gstin: str
    period: str  # YYYY-MM
    marketplace: Marketplace
    invoice_number: str
    invoice_date: str  # YYYY-MM-DD
    invoice_type: InvoiceType = "b2cs"
    buyer_gstin: Optional[str] = None
    buyer_state_code: str
    place_of_supply: str  # state code
    is_intrastate: bool
    taxable_value: float
    igst: float = 0.0
    cgst: float = 0.0
    sgst: float = 0.0
    cess: float = 0.0
    total_value: float
    items: List[LineItem] = Field(default_factory=list)
    source_upload_id: Optional[str] = None
    raw_row: Optional[dict] = None  # kept for audit / drill-down

    @property
    def total_tax(self) -> float:
        return round(self.igst + self.cgst + self.sgst + self.cess, 2)


class VendorInvoice(BaseDoc):
    seller_gstin: str  # our seller (buyer of this invoice)
    period: str
    supplier_gstin: Optional[str] = None
    supplier_name: str
    invoice_number: str
    invoice_date: str
    is_credit_note: bool = False
    is_intrastate: bool
    taxable_value: float
    igst: float = 0.0
    cgst: float = 0.0
    sgst: float = 0.0
    cess: float = 0.0
    total_value: float
    itc_eligible: bool = True
    itc_ineligible_reason: Optional[str] = None  # blocked u/s 17(5) etc.
    verified_gstin: bool = False  # true only if regex passes
    source_upload_id: Optional[str] = None
    encrypted_payload: Optional[str] = None  # AES-GCM ciphertext of full extracted JSON

    @property
    def total_tax(self) -> float:
        return round(self.igst + self.cgst + self.sgst + self.cess, 2)


# ---------- IMS ----------
class IMSAction(BaseDoc):
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
    decision: IMSDecision = "no_action"
    decided_at: Optional[str] = None
    itc_previously_claimed: bool = True
    reversal_amount: float = 0.0  # computed based on decision
    notes: Optional[str] = None


# ---------- Exceptions ----------
class ExceptionRow(BaseDoc):
    seller_gstin: str
    period: str
    upload_id: Optional[str] = None
    row_index: Optional[int] = None
    reason: str
    raw: dict = Field(default_factory=dict)
    resolved: bool = False
    corrected_payload: Optional[dict] = None


# ---------- Compliance snapshot ----------
class ComplianceSnapshot(BaseModel):
    period: str
    seller_gstin: str
    generated_at: str = Field(default_factory=_now_iso)

    # GSTR-1
    gstr1: dict

    # GSTR-3B 3.1 outward + 4 ITC
    gstr3b: dict

    # Interest estimate (optional)
    interest: Optional[dict] = None


# ---------- Interest input ----------
class InterestInput(BaseModel):
    net_cash_liability: float
    ecl_min_cash_balance: float = 0.0
    due_date: str  # YYYY-MM-DD
    filing_date: str  # YYYY-MM-DD
    days_late_override: Optional[int] = None


class InterestResult(BaseModel):
    days_late: int
    interest_base: float  # amount on which interest is charged (net cash - min ECL)
    interest_amount: float
    late_fee_cgst: float
    late_fee_sgst: float
    late_fee_total: float
    rate_pct: float = 18.0
    formula: str
