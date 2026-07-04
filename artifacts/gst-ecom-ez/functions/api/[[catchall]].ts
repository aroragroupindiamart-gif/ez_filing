import { Hono } from 'hono';
import { handle } from 'hono/cloudflare-pages';
import { cors } from 'hono/cors';
import { dbCreate, dbGet, dbList, dbUpdate, dbPatch } from './_lib/db.js';
import { sha256Hex, signDownloadToken, verifyDownloadToken, encryptStr, decryptStr } from './_lib/crypto.js';
import { storeFile, retrieveFile } from './_lib/storage.js';
import { parseMarketplaceFile, extractPdfText, parseVendorInvoiceText, parseOutwardInvoiceText } from './_lib/ingestion.js';
import { buildSnapshot } from './_lib/compliance.js';
import { computeInterest } from './_lib/interest.js';
import { validateImsDecision, computeReversal } from './_lib/ims.js';
import { generateGstr1Export, generateGstr3bExport } from './_lib/export.js';
import { seedDemo } from './_lib/seed.js';
import type {
  Seller, UploadRecord, ProcessingJob, MarketplaceInvoice,
  VendorInvoice, IMSAction, ExceptionRow, ExportRecord,
} from './_lib/models.js';

type Env = {
  DB: D1Database;
  STORAGE: R2Bucket;
  ENCRYPTION_KEY: string;
};

const app = new Hono<{ Bindings: Env }>().basePath('/api');

app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] }));

async function processJob(jobId: string, uploadId: string, kind: string, env: Env) {
  const rawJob = await dbGet<ProcessingJob>(env.DB, 'jobs', jobId);
  if (!rawJob) return;

  const setProgress = (p: number, status: ProcessingJob['status'] = 'processing', error?: string) =>
    dbUpdate(env.DB, 'jobs', jobId, { ...rawJob, status, progress: p, ...(error ? { error } : {}) });

  try {
    await setProgress(10);
    const upload = await dbGet<UploadRecord>(env.DB, 'uploads', uploadId);
    if (!upload) throw new Error('Upload record not found');

    const fileContent = await retrieveFile(env.STORAGE, upload.storage_ref, env.ENCRYPTION_KEY);
    if (!fileContent) throw new Error('File not found in storage');

    await setProgress(30);

    if (kind === 'marketplace_parse') {
      const { invoices, exceptions } = parseMarketplaceFile(
        fileContent, upload.filename, upload.marketplace ?? 'unknown',
        upload.seller_gstin, upload.period
      );
      await setProgress(60);
      for (const inv of invoices) {
        await dbCreate(env.DB, 'marketplace_invoices', crypto.randomUUID(), {
          ...inv, created_at: new Date().toISOString(),
        });
      }
      for (const exc of exceptions) {
        await dbCreate(env.DB, 'exceptions_log', crypto.randomUUID(), {
          seller_gstin: upload.seller_gstin, period: upload.period,
          doc_type: upload.doc_type ?? 'marketplace',
          upload_id: uploadId, resolved: false,
          created_at: new Date().toISOString(), ...exc,
        });
      }
      await setProgress(100, 'complete');

    } else if (kind === 'inward_ocr') {
      const text = await extractPdfText(fileContent);
      await setProgress(60);
      const parsed = parseVendorInvoiceText(text, upload.seller_gstin, upload.period);
      await dbCreate(env.DB, 'vendor_invoices', crypto.randomUUID(), {
        ...parsed, created_at: new Date().toISOString(),
      });
      await setProgress(100, 'complete');

    } else if (kind === 'outward_ocr') {
      const text = await extractPdfText(fileContent);
      await setProgress(60);
      const parsed = parseOutwardInvoiceText(text, upload.seller_gstin, upload.period);
      await dbCreate(env.DB, 'marketplace_invoices', crypto.randomUUID(), {
        ...parsed, created_at: new Date().toISOString(),
      });
      await setProgress(100, 'complete');

    } else {
      throw new Error(`Unknown job kind: ${kind}`);
    }
  } catch (err) {
    const job = await dbGet<ProcessingJob>(env.DB, 'jobs', jobId);
    if (job) await dbUpdate(env.DB, 'jobs', jobId, { ...job, status: 'failed', error: String(err), progress: 0 });
  }
}

app.get('/', (c) => c.json({ service: 'GST-ECOM-EZ', status: 'ok', runtime: 'cloudflare-pages' }));
app.get('/health', (c) => c.json({ status: 'ok', ts: new Date().toISOString() }));

app.post('/sellers', async (c) => {
  const body = await c.req.json<{ legal_name: string; gstin: string; trade_name?: string }>();
  const { legal_name, gstin, trade_name } = body;
  if (!legal_name || !gstin) return c.json({ error: 'legal_name and gstin required' }, 400);
  const id = crypto.randomUUID();
  const seller: Omit<Seller, 'id'> = {
    legal_name, gstin: gstin.toUpperCase().trim(),
    trade_name: trade_name ?? null,
    state_code: gstin.slice(0, 2),
    created_at: new Date().toISOString(),
  };
  await dbCreate(c.env.DB, 'sellers', id, seller);
  return c.json({ ...seller, id }, 201);
});

app.get('/sellers', async (c) => {
  const sellers = await dbList<Seller>(c.env.DB, 'sellers', {}, { orderBy: 'created_at DESC' });
  return c.json(sellers);
});

app.post('/uploads', async (c) => {
  let formData: FormData;
  try { formData = await c.req.formData(); }
  catch { return c.json({ error: 'Multipart form data required' }, 400); }

  const file = formData.get('file') as File | null;
  const kind = formData.get('kind') as string | null;
  const period = formData.get('period') as string | null;
  const sellerGstin = formData.get('seller_gstin') as string | null;
  const marketplace = formData.get('marketplace') as string | null;
  const docType = formData.get('doc_type') as string | null;

  if (!file || !kind || !period || !sellerGstin)
    return c.json({ error: 'file, kind, period, seller_gstin required' }, 400);

  const content = new Uint8Array(await file.arrayBuffer());
  const checksum = await sha256Hex(content);
  const storageRef = `${sellerGstin}/${period}/${crypto.randomUUID()}_${file.name}`;

  if (!c.env.ENCRYPTION_KEY) return c.json({ error: 'ENCRYPTION_KEY not configured' }, 500);

  await storeFile(c.env.STORAGE, storageRef, content, c.env.ENCRYPTION_KEY);

  const uploadId = crypto.randomUUID();
  const upload: Omit<UploadRecord, 'id'> = {
    seller_gstin: sellerGstin, period, filename: file.name,
    kind, doc_type: docType ?? undefined,
    storage_ref: storageRef, checksum,
    marketplace: marketplace ?? undefined,
    created_at: new Date().toISOString(),
  };
  await dbCreate(c.env.DB, 'uploads', uploadId, upload);

  const jobId = crypto.randomUUID();
  const job: Omit<ProcessingJob, 'id'> = {
    upload_id: uploadId, kind, status: 'queued', progress: 0,
    created_at: new Date().toISOString(),
  };
  await dbCreate(c.env.DB, 'jobs', jobId, job);

  c.executionCtx.waitUntil(processJob(jobId, uploadId, kind, c.env));

  return c.json({ upload: { ...upload, id: uploadId }, job: { ...job, id: jobId } }, 201);
});

app.get('/uploads', async (c) => {
  const { seller_gstin, period } = c.req.query();
  const filters: Record<string, string> = {};
  if (seller_gstin) filters.seller_gstin = seller_gstin;
  if (period) filters.period = period;
  const uploads = await dbList<UploadRecord>(c.env.DB, 'uploads', filters, { orderBy: 'created_at DESC' });
  return c.json(uploads);
});

app.get('/jobs/:id', async (c) => {
  const job = await dbGet<ProcessingJob>(c.env.DB, 'jobs', c.req.param('id'));
  if (!job) return c.json({ error: 'Job not found' }, 404);
  return c.json(job);
});

app.get('/jobs', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '100');
  const jobs = await dbList<ProcessingJob>(c.env.DB, 'jobs', {}, { limit, orderBy: 'created_at DESC' });
  return c.json(jobs);
});

app.get('/invoices/marketplace', async (c) => {
  const { seller_gstin, period } = c.req.query();
  if (!seller_gstin || !period) return c.json({ error: 'seller_gstin and period required' }, 400);
  const invoices = await dbList<MarketplaceInvoice>(
    c.env.DB, 'marketplace_invoices',
    { seller_gstin, period },
    { orderBy: 'created_at DESC' }
  );
  return c.json(invoices);
});

app.get('/invoices/vendor', async (c) => {
  const { seller_gstin, period } = c.req.query();
  if (!seller_gstin || !period) return c.json({ error: 'seller_gstin and period required' }, 400);
  const invoices = await dbList<VendorInvoice>(
    c.env.DB, 'vendor_invoices',
    { seller_gstin, period },
    { orderBy: 'created_at DESC' }
  );
  return c.json(invoices);
});

app.patch('/invoices/vendor/:id', async (c) => {
  const vid = c.req.param('id');
  const patch = await c.req.json<Record<string, unknown>>();
  const allowed = ['supplier_gstin', 'itc_eligible', 'verified_gstin', 'is_credit_note', 'supplier_name'];
  const safe: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) safe[k] = patch[k];

  const updated = await dbPatch(c.env.DB, 'vendor_invoices', vid, safe);
  if (!updated) return c.json({ error: 'Vendor invoice not found' }, 404);
  return c.json({ ok: true, patch: safe });
});

app.get('/exceptions', async (c) => {
  const { seller_gstin, period, doc_type } = c.req.query();
  if (!seller_gstin || !period) return c.json({ error: 'seller_gstin and period required' }, 400);
  const filters: Record<string, string> = { seller_gstin, period };
  if (doc_type) filters.doc_type = doc_type;
  const rows = await dbList<ExceptionRow>(
    c.env.DB, 'exceptions_log', filters, { orderBy: 'created_at DESC' }
  );
  return c.json(rows.filter((r) => !r.resolved));
});

app.post('/exceptions/:id/resolve', async (c) => {
  const eid = c.req.param('id');
  const body = await c.req.json<{ corrected?: object }>().catch(() => ({}));
  const updated = await dbPatch(c.env.DB, 'exceptions_log', eid, { resolved: true, corrected: body.corrected });
  if (!updated) return c.json({ error: 'Exception not found' }, 404);
  return c.json({ ok: true });
});

app.post('/ims/actions', async (c) => {
  const body = await c.req.json<Omit<IMSAction, 'id' | 'decision' | 'reversal_amount' | 'created_at'>>();
  const { seller_gstin, period, credit_note_no, supplier_gstin } = body;
  if (!seller_gstin || !period || !credit_note_no || !supplier_gstin)
    return c.json({ error: 'seller_gstin, period, credit_note_no, supplier_gstin required' }, 400);

  const id = crypto.randomUUID();
  const action: Omit<IMSAction, 'id'> = {
    ...body,
    decision: 'pending',
    reversal_amount: 0,
    created_at: new Date().toISOString(),
  };
  await dbCreate(c.env.DB, 'ims_actions', id, action);
  return c.json({ ...action, id }, 201);
});

app.get('/ims/actions', async (c) => {
  const { seller_gstin, period } = c.req.query();
  if (!seller_gstin || !period) return c.json({ error: 'seller_gstin and period required' }, 400);
  const actions = await dbList<IMSAction>(
    c.env.DB, 'ims_actions', { seller_gstin, period }, { orderBy: 'created_at DESC' }
  );
  return c.json(actions);
});

app.post('/ims/actions/:id/decision', async (c) => {
  const aid = c.req.param('id');
  const { decision } = await c.req.json<{ decision: string }>();
  const action = await dbGet<IMSAction>(c.env.DB, 'ims_actions', aid);
  if (!action) return c.json({ error: 'IMS action not found' }, 404);

  const { valid, error } = validateImsDecision(action, decision);
  if (!valid) return c.json({ error }, 422);

  const updated = { ...action, decision: decision as IMSAction['decision'] };
  updated.reversal_amount = computeReversal(updated);
  await dbUpdate(c.env.DB, 'ims_actions', aid, updated);
  return c.json({ ...updated, id: aid });
});

app.get('/compliance/preview', async (c) => {
  const { seller_gstin, period } = c.req.query();
  if (!seller_gstin || !period) return c.json({ error: 'seller_gstin and period required' }, 400);

  const [invoices, vendorInvoices, imsActions] = await Promise.all([
    dbList<MarketplaceInvoice>(c.env.DB, 'marketplace_invoices', { seller_gstin, period }),
    dbList<VendorInvoice>(c.env.DB, 'vendor_invoices', { seller_gstin, period }),
    dbList<IMSAction>(c.env.DB, 'ims_actions', { seller_gstin, period }),
  ]);

  const snapshot = buildSnapshot(seller_gstin, period, invoices, vendorInvoices, imsActions);
  return c.json(snapshot);
});

app.post('/interest/estimate', async (c) => {
  const body = await c.req.json<{ net_cash: number; ecl_balance: number; due_date: string; payment_date: string }>();
  const result = computeInterest(body);
  return c.json(result);
});

app.post('/export/gstr1', async (c) => {
  const { seller_gstin, period } = c.req.query();
  if (!seller_gstin || !period) return c.json({ error: 'seller_gstin and period required' }, 400);
  if (!c.env.ENCRYPTION_KEY) return c.json({ error: 'ENCRYPTION_KEY not configured' }, 500);

  const invoices = await dbList<MarketplaceInvoice>(c.env.DB, 'marketplace_invoices', { seller_gstin, period });
  const result = await generateGstr1Export(seller_gstin, period, invoices, c.env.ENCRYPTION_KEY);

  const exportId = result.export_id;
  const record: Omit<ExportRecord, 'id'> = {
    seller_gstin, period, type: 'gstr1',
    payload: result.encrypted_payload,
    download_token: result.download_token,
    expires_at: result.expires_at,
    created_at: new Date().toISOString(),
  };
  await dbCreate(c.env.DB, 'exports', exportId, record);
  return c.json({ export_id: exportId, download_token: result.download_token, preview: result.preview });
});

app.post('/export/gstr3b', async (c) => {
  const { seller_gstin, period } = c.req.query();
  if (!seller_gstin || !period) return c.json({ error: 'seller_gstin and period required' }, 400);
  if (!c.env.ENCRYPTION_KEY) return c.json({ error: 'ENCRYPTION_KEY not configured' }, 500);

  const [invoices, vendorInvoices, imsActions] = await Promise.all([
    dbList<MarketplaceInvoice>(c.env.DB, 'marketplace_invoices', { seller_gstin, period }),
    dbList<VendorInvoice>(c.env.DB, 'vendor_invoices', { seller_gstin, period }),
    dbList<IMSAction>(c.env.DB, 'ims_actions', { seller_gstin, period }),
  ]);

  const result = await generateGstr3bExport(seller_gstin, period, invoices, vendorInvoices, imsActions, c.env.ENCRYPTION_KEY);

  const exportId = result.export_id;
  const record: Omit<ExportRecord, 'id'> = {
    seller_gstin, period, type: 'gstr3b',
    payload: result.encrypted_payload,
    download_token: result.download_token,
    expires_at: result.expires_at,
    created_at: new Date().toISOString(),
  };
  await dbCreate(c.env.DB, 'exports', exportId, record);
  return c.json({ export_id: exportId, download_token: result.download_token, preview: result.preview });
});

app.get('/export/:id/download', async (c) => {
  const id = c.req.param('id');
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token required' }, 400);
  if (!c.env.ENCRYPTION_KEY) return c.json({ error: 'ENCRYPTION_KEY not configured' }, 500);

  const verified = await verifyDownloadToken(token, c.env.ENCRYPTION_KEY);
  if (!verified || verified !== id) return c.json({ error: 'Invalid or expired token' }, 403);

  const record = await dbGet<ExportRecord>(c.env.DB, 'exports', id);
  if (!record) return c.json({ error: 'Export not found' }, 404);

  const payload = await decryptStr(record.payload, id, c.env.ENCRYPTION_KEY);
  return new Response(payload, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${record.type}_${record.period}.json"`,
    },
  });
});

app.post('/seed/demo', async (c) => {
  const summary = await seedDemo(c.env.DB);
  return c.json(summary, 201);
});

app.notFound((c) => c.json({ error: 'Not found', path: new URL(c.req.url).pathname }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message ?? 'Internal server error' }, 500);
});

export const onRequest = handle(app);
