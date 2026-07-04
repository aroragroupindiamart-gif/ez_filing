import { encryptStr, signDownloadToken } from './crypto.js';
import { buildGstr1, buildGstr3bTable31, buildGstr3bTable4 } from './compliance.js';
import type { MarketplaceInvoice, VendorInvoice, IMSAction } from './models.js';

export async function generateGstr1Export(
  sellerGstin: string,
  period: string,
  invoices: MarketplaceInvoice[],
  encKey: string
) {
  const gstr1 = buildGstr1(invoices);
  const fp = period.replace(/-/g, '');
  const payload = JSON.stringify({ gstin: sellerGstin, fp, version: 'GST3.0.4', hash: 'hash', ...gstr1 });

  const id = crypto.randomUUID();
  const { token, expiresAt } = await signDownloadToken(id, encKey, 3600);
  const encryptedPayload = await encryptStr(payload, id, encKey);

  return {
    export_id: id,
    download_token: token,
    expires_at: expiresAt,
    encrypted_payload: encryptedPayload,
    preview: gstr1,
  };
}

export async function generateGstr3bExport(
  sellerGstin: string,
  period: string,
  invoices: MarketplaceInvoice[],
  vendorInvoices: VendorInvoice[],
  imsActions: IMSAction[],
  encKey: string
) {
  const table31 = buildGstr3bTable31(invoices);
  const table4 = buildGstr3bTable4(vendorInvoices, imsActions);
  const fp = period.replace(/-/g, '');
  const gstr3b = { gstin: sellerGstin, fp, ret_period: fp, '3.1': table31, '4': table4 };
  const payload = JSON.stringify(gstr3b);

  const id = crypto.randomUUID();
  const { token, expiresAt } = await signDownloadToken(id, encKey, 3600);
  const encryptedPayload = await encryptStr(payload, id, encKey);

  return {
    export_id: id,
    download_token: token,
    expires_at: expiresAt,
    encrypted_payload: encryptedPayload,
    preview: gstr3b,
  };
}
