import { dbCreate } from './db.js';
import type { Seller, MarketplaceInvoice, VendorInvoice } from './models.js';

export async function seedDemo(db: D1Database): Promise<object> {
  const sellerGstin = '27AAPFU0939F1ZV';
  const period = '042025';

  const sellerId = crypto.randomUUID();
  const seller: Omit<Seller, 'id'> = {
    legal_name: 'Demo Enterprises Pvt Ltd',
    gstin: sellerGstin,
    trade_name: 'DemoShop',
    state_code: '27',
    created_at: new Date().toISOString(),
  };
  await dbCreate(db, 'sellers', sellerId, seller);

  const sampleInvoices = [
    { buyer: '29GGGGG1314R9Z6', state: '29', type: 'b2b' as const, taxable: 45000, igst: 8100 },
    { buyer: null, state: '27', type: 'b2cs' as const, taxable: 12000, igst: 0, cgst: 900, sgst: 900 },
    { buyer: null, state: '19', type: 'b2cl' as const, taxable: 280000, igst: 50400 },
    { buyer: '06AABCU9603R1ZP', state: '06', type: 'b2b' as const, taxable: 78000, igst: 14040 },
    { buyer: null, state: '27', type: 'b2cs' as const, taxable: 8500, igst: 0, cgst: 765, sgst: 765 },
  ];

  let invCount = 0;
  for (const [i, s] of sampleInvoices.entries()) {
    const id = crypto.randomUUID();
    const inv: Omit<MarketplaceInvoice, 'id'> = {
      seller_gstin: sellerGstin,
      period,
      marketplace: 'amazon',
      invoice_number: `INV-2025-${(i + 1).toString().padStart(4, '0')}`,
      invoice_date: `2025-04-${(i + 5).toString().padStart(2, '0')}`,
      invoice_type: s.type,
      buyer_gstin: s.buyer ?? undefined,
      buyer_state_code: s.state,
      place_of_supply: s.state,
      is_intrastate: s.state === '27',
      taxable_value: s.taxable,
      igst: s.igst ?? 0,
      cgst: s.cgst ?? 0,
      sgst: s.sgst ?? 0,
      cess: 0,
      total_value: s.taxable + (s.igst ?? 0) + (s.cgst ?? 0) * 2,
      items: [{
        description: 'Sample Product',
        hsn: '6403',
        quantity: 10,
        unit_price: s.taxable / 10,
        taxable_value: s.taxable,
        gst_rate: 18,
        igst: s.igst ?? 0,
        cgst: s.cgst ?? 0,
        sgst: s.sgst ?? 0,
        cess: 0,
      }],
      created_at: new Date().toISOString(),
    };
    await dbCreate(db, 'marketplace_invoices', id, inv);
    invCount++;
  }

  const vendorId = crypto.randomUUID();
  const vendor: Omit<VendorInvoice, 'id'> = {
    seller_gstin: sellerGstin,
    period,
    supplier_name: 'Sample Supplier Ltd',
    supplier_gstin: '29AABCS1234D1Z1',
    invoice_number: 'SINV-001',
    invoice_date: '2025-04-10',
    taxable_value: 25000,
    igst: 4500,
    cgst: 0,
    sgst: 0,
    cess: 0,
    itc_eligible: true,
    verified_gstin: true,
    is_credit_note: false,
    created_at: new Date().toISOString(),
  };
  await dbCreate(db, 'vendor_invoices', vendorId, vendor);

  return {
    seller: sellerGstin,
    period,
    marketplace_invoices: invCount,
    vendor_invoices: 1,
    message: 'Demo data seeded successfully',
  };
}
