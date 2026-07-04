export interface Seller {
  id: string;
  legal_name: string;
  gstin: string;
  trade_name?: string | null;
  state_code: string;
  created_at: string;
}

export interface UploadRecord {
  id: string;
  seller_gstin: string;
  period: string;
  filename: string;
  kind: string;
  doc_type?: string;
  storage_ref: string;
  checksum: string;
  marketplace?: string;
  created_at: string;
}

export interface ProcessingJob {
  id: string;
  upload_id: string;
  kind: string;
  status: 'queued' | 'processing' | 'complete' | 'failed';
  progress: number;
  error?: string;
  created_at: string;
}

export interface LineItem {
  description: string;
  hsn?: string | null;
  quantity: number;
  unit_price: number;
  taxable_value: number;
  gst_rate: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
}

export interface MarketplaceInvoice {
  id: string;
  seller_gstin: string;
  period: string;
  marketplace: string;
  invoice_number: string;
  invoice_date: string;
  invoice_type: 'b2b' | 'b2cs' | 'b2cl';
  buyer_gstin?: string | null;
  buyer_state_code: string;
  place_of_supply: string;
  is_intrastate: boolean;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total_value: number;
  items: LineItem[];
  raw_row?: Record<string, unknown>;
  created_at: string;
}

export interface VendorInvoice {
  id: string;
  seller_gstin: string;
  period: string;
  supplier_name: string;
  supplier_gstin?: string | null;
  invoice_number: string;
  invoice_date: string;
  taxable_value: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  itc_eligible: boolean;
  verified_gstin: boolean;
  is_credit_note?: boolean;
  encrypted_payload?: string;
  created_at: string;
}

export interface VendorPatch {
  supplier_gstin?: string;
  itc_eligible?: boolean;
  verified_gstin?: boolean;
}

export interface IMSAction {
  id: string;
  seller_gstin: string;
  period: string;
  credit_note_no: string;
  supplier_gstin: string;
  original_invoice_no?: string;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  note_type: 'credit' | 'debit';
  decision: 'accept' | 'reject' | 'pending';
  reversal_amount: number;
  created_at: string;
}

export interface ExceptionRow {
  id: string;
  seller_gstin: string;
  period: string;
  reason: string;
  raw_row: Record<string, unknown>;
  resolved: boolean;
  doc_type: string;
  upload_id?: string;
  created_at: string;
}

export interface ExportRecord {
  id: string;
  seller_gstin: string;
  period: string;
  type: 'gstr1' | 'gstr3b';
  payload: string;
  download_token: string;
  expires_at: number;
  created_at: string;
}

export function isValidGstin(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    (gstin || '').toUpperCase().trim()
  );
}
