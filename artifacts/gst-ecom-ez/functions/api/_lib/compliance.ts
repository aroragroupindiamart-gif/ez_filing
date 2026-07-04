import type { MarketplaceInvoice, VendorInvoice, IMSAction } from './models.js';

function r(v: number): number {
  return Math.round((v || 0) * 100) / 100;
}

export function buildGstr1(invoices: MarketplaceInvoice[]) {
  const b2b: object[] = [];
  const b2csMap: Record<string, Record<string, unknown>> = {};
  const b2cl: object[] = [];
  const hsnMap: Record<string, Record<string, unknown>> = {};

  const totals = { taxable_value: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };

  for (const inv of invoices) {
    totals.taxable_value += inv.taxable_value;
    totals.igst += inv.igst;
    totals.cgst += inv.cgst;
    totals.sgst += inv.sgst;
    totals.cess += inv.cess;

    for (const it of inv.items ?? []) {
      const key = `${it.hsn ?? '9999'}|${it.gst_rate ?? 0}`;
      if (!hsnMap[key]) {
        hsnMap[key] = { hsn: it.hsn ?? '9999', rate: it.gst_rate ?? 0, quantity: 0, taxable_value: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
      }
      const e = hsnMap[key];
      (e.quantity as number) += it.quantity ?? 0;
      (e.taxable_value as number) += it.taxable_value ?? 0;
      (e.igst as number) += it.igst ?? 0;
      (e.cgst as number) += it.cgst ?? 0;
      (e.sgst as number) += it.sgst ?? 0;
      (e.cess as number) += it.cess ?? 0;
    }

    if (inv.invoice_type === 'b2b' && inv.buyer_gstin) {
      b2b.push({
        invoice_id: inv.id,
        ctin: inv.buyer_gstin,
        inum: inv.invoice_number,
        idt: inv.invoice_date,
        val: r(inv.total_value),
        pos: inv.place_of_supply,
        rchrg: 'N',
        inv_typ: 'R',
        itms: (inv.items ?? []).map((it, i) => ({
          num: i + 1,
          itm_det: { txval: r(it.taxable_value), rt: it.gst_rate, iamt: r(it.igst), camt: r(it.cgst), samt: r(it.sgst), csamt: r(it.cess) },
        })),
      });
    } else if (inv.invoice_type === 'b2cl') {
      b2cl.push({
        invoice_id: inv.id,
        pos: inv.place_of_supply,
        inv: [{
          inum: inv.invoice_number,
          idt: inv.invoice_date,
          val: r(inv.total_value),
          itms: (inv.items ?? []).map((it, i) => ({
            num: i + 1,
            itm_det: { txval: r(it.taxable_value), rt: it.gst_rate, iamt: r(it.igst), csamt: r(it.cess) },
          })),
        }],
      });
    } else {
      const rate = inv.items?.[0]?.gst_rate ?? 0;
      const key = `${inv.place_of_supply}|${rate}`;
      if (!b2csMap[key]) {
        b2csMap[key] = { sply_ty: inv.is_intrastate ? 'INTRA' : 'INTER', pos: inv.place_of_supply, typ: 'OE', rt: rate, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0, invoice_ids: [] };
      }
      const e = b2csMap[key];
      (e.txval as number) += inv.taxable_value;
      (e.iamt as number) += inv.igst;
      (e.camt as number) += inv.cgst;
      (e.samt as number) += inv.sgst;
      (e.csamt as number) += inv.cess;
      (e.invoice_ids as string[]).push(inv.id);
    }
  }

  return {
    b2b,
    b2cs: Object.values(b2csMap).map((e) => ({
      ...e, txval: r(e.txval as number), iamt: r(e.iamt as number), camt: r(e.camt as number), samt: r(e.samt as number), csamt: r(e.csamt as number),
    })),
    b2cl,
    hsn: {
      data: Object.values(hsnMap).map((e) => ({
        ...e, taxable_value: r(e.taxable_value as number), igst: r(e.igst as number), cgst: r(e.cgst as number), sgst: r(e.sgst as number), cess: r(e.cess as number),
      })),
    },
    totals: { taxable_value: r(totals.taxable_value), igst: r(totals.igst), cgst: r(totals.cgst), sgst: r(totals.sgst), cess: r(totals.cess) },
  };
}

export function buildGstr3bTable31(invoices: MarketplaceInvoice[]) {
  const total = { taxable_value: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
  for (const inv of invoices) {
    total.taxable_value += inv.taxable_value;
    total.igst += inv.igst;
    total.cgst += inv.cgst;
    total.sgst += inv.sgst;
    total.cess += inv.cess;
  }
  return {
    '3.1(a)': { taxable_value: r(total.taxable_value), igst: r(total.igst), cgst: r(total.cgst), sgst: r(total.sgst), cess: r(total.cess) },
    '3.1(b)': { taxable_value: 0, igst: 0 },
    '3.1(c)': { taxable_value: 0 },
    '3.1(d)': { taxable_value: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 },
    '3.1(e)': { taxable_value: 0 },
  };
}

export function buildGstr3bTable4(vendorInvoices: VendorInvoice[], imsActions: IMSAction[]) {
  const a_all = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
  const a_src: string[] = [];
  const b1 = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
  const b1_src: string[] = [];

  for (const v of vendorInvoices) {
    if (!v.verified_gstin) continue;
    const isIneligible = !v.itc_eligible || v.is_credit_note;
    const bucket = isIneligible ? b1 : a_all;
    const src = isIneligible ? b1_src : a_src;
    bucket.igst += v.igst;
    bucket.cgst += v.cgst;
    bucket.sgst += v.sgst;
    bucket.cess += v.cess;
    src.push(v.id);
  }

  const b2 = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
  const b2_src: string[] = [];
  for (const a of imsActions) {
    if (a.decision === 'accept' && a.reversal_amount > 0) {
      b2.igst += a.reversal_amount;
      b2_src.push(a.id);
    }
  }

  const net = {
    igst: Math.max(r(a_all.igst - b1.igst - b2.igst), 0),
    cgst: Math.max(r(a_all.cgst - b1.cgst - b2.cgst), 0),
    sgst: Math.max(r(a_all.sgst - b1.sgst - b2.sgst), 0),
    cess: Math.max(r(a_all.cess - b1.cess - b2.cess), 0),
  };

  return {
    '4A': { igst: r(a_all.igst), cgst: r(a_all.cgst), sgst: r(a_all.sgst), cess: r(a_all.cess), source_ids: a_src, label: 'ITC available' },
    '4B(1)': { igst: r(b1.igst), cgst: r(b1.cgst), sgst: r(b1.sgst), cess: r(b1.cess), source_ids: b1_src, label: 'Ineligible ITC (17(5))' },
    '4B(2)': { igst: r(b2.igst), cgst: r(b2.cgst), sgst: r(b2.sgst), cess: r(b2.cess), source_ids: b2_src, label: 'Reversals (IMS-driven CN)' },
    '4D': { ...net, source_ids: [], label: 'Net ITC available' },
  };
}

export function buildSnapshot(
  sellerGstin: string,
  period: string,
  invoices: MarketplaceInvoice[],
  vendorInvoices: VendorInvoice[],
  imsActions: IMSAction[]
) {
  return {
    period,
    seller_gstin: sellerGstin,
    gstr1: buildGstr1(invoices),
    gstr3b: {
      '3.1': buildGstr3bTable31(invoices),
      '4': buildGstr3bTable4(vendorInvoices, imsActions),
    },
  };
}
