import * as XLSX from 'xlsx';
import { isValidGstin } from './models.js';
import type { MarketplaceInvoice, LineItem } from './models.js';

const COLUMN_ALIASES: Record<string, string[]> = {
  invoice_number: ['invoice number', 'invoice_number', 'invoice_no', 'invoice #', 'invoice no.', 'bill number', 'order id', 'order-id', 'order_id'],
  invoice_date: ['invoice date', 'invoice_date', 'order date', 'order_date', 'shipment date', 'shipment_date'],
  buyer_state: ['buyer state', 'buyer_state', 'ship to state', 'ship_to_state', 'state', 'customer state', 'customer_state', 'ship-to-state', 'shipping state', 'shipping_state'],
  buyer_gstin: ['buyer gstin', 'buyer_gstin', 'customer gstin', 'customer_gstin', 'gstin of buyer', 'gstin_of_buyer'],
  taxable_value: ['taxable value', 'taxable_value', 'principal amount', 'principal_amount', 'invoice value (without tax)', 'amount'],
  igst: ['igst', 'igst amount', 'igst_amount', 'igst rate * taxable'],
  cgst: ['cgst', 'cgst amount', 'cgst_amount'],
  sgst: ['sgst', 'sgst amount', 'sgst_amount', 'utgst', 'utgst_amount'],
  cess: ['cess', 'cess amount', 'cess_amount'],
  total_value: ['invoice amount', 'invoice_amount', 'total value', 'total_value', 'invoice total', 'invoice_total', 'total'],
  gst_rate: ['gst rate', 'gst_rate', 'tax rate', 'tax_rate', 'rate'],
  hsn: ['hsn', 'hsn_sc', 'hsn/sac', 'hsn code', 'hsn_code'],
  quantity: ['quantity', 'qty'],
};

const STATE_CODE_MAP: Record<string, string> = {
  'andhra pradesh': '37', 'arunachal pradesh': '12', 'assam': '18', 'bihar': '10',
  'chhattisgarh': '22', 'goa': '30', 'gujarat': '24', 'haryana': '06',
  'himachal pradesh': '02', 'jharkhand': '20', 'karnataka': '29', 'kerala': '32',
  'madhya pradesh': '23', 'maharashtra': '27', 'manipur': '14', 'meghalaya': '17',
  'mizoram': '15', 'nagaland': '13', 'odisha': '21', 'punjab': '03',
  'rajasthan': '08', 'sikkim': '11', 'tamil nadu': '33', 'telangana': '36',
  'tripura': '16', 'uttar pradesh': '09', 'uttarakhand': '05', 'west bengal': '19',
  'delhi': '07', 'chandigarh': '04', 'jammu and kashmir': '01', 'ladakh': '38',
  'puducherry': '34', 'andaman and nicobar': '35', 'dadra and nagar haveli': '26',
  'daman and diu': '26', 'lakshadweep': '31',
};

function norm(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function matchCol(colsLower: Record<string, string>, aliases: string[]): string {
  for (const a of aliases) {
    if (colsLower[a]) return colsLower[a];
  }
  return '';
}

function stateCode(s: unknown): string {
  const n = norm(s);
  if (STATE_CODE_MAP[n]) return STATE_CODE_MAP[n];
  const m = /^(\d{2})[\s-]/.exec(String(s ?? ''));
  return m ? m[1] : '';
}

function toFloat(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const s = String(v).replace(/,/g, '').replace(/₹/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function toDate(v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  const s = String(v).trim();
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/,
    /^(\d{2})-(\d{2})-(\d{4})$/,
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
  ];
  for (const fmt of formats) {
    const m = fmt.exec(s);
    if (m) {
      if (s.startsWith('20') || s.startsWith('19')) return s;
      return `${m[3]}-${m[2]}-${m[1]}`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

export function parseMarketplaceFile(
  content: Uint8Array,
  filename: string,
  marketplace: string,
  sellerGstin: string,
  period: string
): { invoices: Omit<MarketplaceInvoice, 'id' | 'created_at'>[]; exceptions: object[] } {
  let wb: XLSX.WorkBook;
  const lname = filename.toLowerCase();
  if (lname.endsWith('.csv')) {
    const text = new TextDecoder().decode(content);
    wb = XLSX.read(text, { type: 'string' });
  } else if (lname.endsWith('.xls') || lname.endsWith('.xlsx')) {
    wb = XLSX.read(content, { type: 'array' });
  } else {
    throw new Error(`Unsupported file type: ${filename}`);
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null });

  if (rows.length === 0) return { invoices: [], exceptions: [] };

  const colsLower: Record<string, string> = {};
  for (const key of Object.keys(rows[0])) {
    colsLower[norm(key)] = key;
  }
  const col: Record<string, string> = {};
  for (const [k, aliases] of Object.entries(COLUMN_ALIASES)) {
    col[k] = matchCol(colsLower, aliases);
  }

  const sellerState = isValidGstin(sellerGstin) ? sellerGstin.slice(0, 2) : '00';
  const invoices: Omit<MarketplaceInvoice, 'id' | 'created_at'>[] = [];
  const exceptions: object[] = [];

  rows.forEach((row, idx) => {
    const raw: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) raw[k] = v;
    try {
      const invNo = col.invoice_number ? String(row[col.invoice_number] ?? '') : '';
      const invDate = col.invoice_date ? toDate(row[col.invoice_date]) : '';
      const buyerStateRaw = col.buyer_state ? row[col.buyer_state] : '';
      const buyerState = stateCode(buyerStateRaw) || sellerState;
      let buyerGstin: string | null = col.buyer_gstin ? String(row[col.buyer_gstin] ?? '').trim() : null;
      if (buyerGstin && !isValidGstin(buyerGstin)) buyerGstin = null;

      const taxable = toFloat(col.taxable_value ? row[col.taxable_value] : 0);
      const igst = toFloat(col.igst ? row[col.igst] : 0);
      const cgst = toFloat(col.cgst ? row[col.cgst] : 0);
      const sgst = toFloat(col.sgst ? row[col.sgst] : 0);
      const cess = toFloat(col.cess ? row[col.cess] : 0);
      const total = toFloat(col.total_value ? row[col.total_value] : 0) || (taxable + igst + cgst + sgst + cess);
      const rate = toFloat(col.gst_rate ? row[col.gst_rate] : 0);
      const hsn = col.hsn ? String(row[col.hsn] ?? '').trim() || null : null;
      const qty = toFloat(col.quantity ? row[col.quantity] : 1) || 1;

      if (!invNo || taxable <= 0) throw new Error('Missing invoice number or taxable value');

      const isIntra = buyerState === sellerState;
      let invType: 'b2b' | 'b2cs' | 'b2cl';
      if (buyerGstin) invType = 'b2b';
      else if (total > 250000 && !isIntra) invType = 'b2cl';
      else invType = 'b2cs';

      const item: LineItem = {
        description: hsn ? String(hsn) : 'Item',
        hsn,
        quantity: qty,
        unit_price: Math.round((taxable / qty) * 100) / 100,
        taxable_value: taxable,
        gst_rate: rate,
        igst, cgst, sgst, cess,
      };

      invoices.push({
        seller_gstin: sellerGstin,
        period,
        marketplace,
        invoice_number: invNo,
        invoice_date: invDate,
        invoice_type: invType,
        buyer_gstin: buyerGstin,
        buyer_state_code: buyerState,
        place_of_supply: buyerState,
        is_intrastate: isIntra,
        taxable_value: taxable,
        igst, cgst, sgst, cess,
        total_value: total,
        items: [item],
        raw_row: raw,
      });
    } catch (e) {
      exceptions.push({ row_index: idx, reason: String(e), raw });
    }
  });

  return { invoices, exceptions };
}

export async function extractPdfText(content: Uint8Array): Promise<string> {
  try {
    const { extractText } = await import('unpdf');
    const result = await extractText(content, { mergePages: true });
    return Array.isArray(result.text) ? result.text.join('\n') : String(result.text ?? '');
  } catch {
    return '';
  }
}

const GSTIN_RE = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g;
const AMOUNT_RE = /(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/gi;
const INV_NO_RE = /(?:invoice\s*(?:no\.?|number|#)\s*[:\-]?\s*)([A-Z0-9\/\-]+)/i;
const DATE_RE = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/g;

export function parseVendorInvoiceText(
  text: string,
  sellerGstin: string,
  period: string
) {
  const gstins = [...new Set((text.match(GSTIN_RE) ?? []))];
  const supplierGstin = gstins.find((g) => g !== sellerGstin) ?? null;
  const amounts = [...text.matchAll(AMOUNT_RE)].map((m) => parseFloat(m[1].replace(/,/g, '')));
  const dates = text.match(DATE_RE) ?? [];
  const invMatch = INV_NO_RE.exec(text);
  const taxable = amounts.length > 0 ? Math.max(...amounts.slice(0, 5)) : 0;

  return {
    seller_gstin: sellerGstin,
    period,
    supplier_name: 'Unknown (extracted from PDF)',
    supplier_gstin: supplierGstin,
    invoice_number: invMatch ? invMatch[1].trim() : `PDF-${Date.now()}`,
    invoice_date: dates[0] ? toDate(dates[0]) : new Date().toISOString().slice(0, 10),
    taxable_value: taxable,
    igst: 0, cgst: 0, sgst: 0, cess: 0,
    itc_eligible: true,
    verified_gstin: supplierGstin ? isValidGstin(supplierGstin) : false,
    is_credit_note: false,
  };
}

export function parseOutwardInvoiceText(
  text: string,
  sellerGstin: string,
  period: string
) {
  const amounts = [...text.matchAll(AMOUNT_RE)].map((m) => parseFloat(m[1].replace(/,/g, '')));
  const dates = text.match(DATE_RE) ?? [];
  const invMatch = INV_NO_RE.exec(text);
  const gstins = [...new Set((text.match(GSTIN_RE) ?? []))];
  const buyerGstin = gstins.find((g) => g !== sellerGstin) ?? null;
  const total = amounts.length > 0 ? Math.max(...amounts.slice(0, 5)) : 0;

  return {
    seller_gstin: sellerGstin,
    period,
    marketplace: 'manual',
    invoice_number: invMatch ? invMatch[1].trim() : `PDF-${Date.now()}`,
    invoice_date: dates[0] ? toDate(dates[0]) : new Date().toISOString().slice(0, 10),
    invoice_type: buyerGstin ? 'b2b' : 'b2cs' as 'b2b' | 'b2cs',
    buyer_gstin: buyerGstin,
    buyer_state_code: buyerGstin ? buyerGstin.slice(0, 2) : sellerGstin.slice(0, 2),
    place_of_supply: buyerGstin ? buyerGstin.slice(0, 2) : sellerGstin.slice(0, 2),
    is_intrastate: true,
    taxable_value: total * 0.85,
    igst: 0, cgst: total * 0.075, sgst: total * 0.075, cess: 0,
    total_value: total,
    items: [],
  };
}
