-- Cloudflare D1 (SQLite) schema for GST-ECOM-EZ
-- Run via: wrangler d1 execute gst-ecom-ez-db --file=schema.sql --remote

CREATE TABLE IF NOT EXISTS sellers (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_uploads_gstin ON uploads (json_extract(data, '$.seller_gstin'));
CREATE INDEX IF NOT EXISTS idx_uploads_period ON uploads (json_extract(data, '$.period'));

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_upload_id ON jobs (json_extract(data, '$.upload_id'));

CREATE TABLE IF NOT EXISTS marketplace_invoices (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mkt_gstin_period ON marketplace_invoices (
  json_extract(data, '$.seller_gstin'),
  json_extract(data, '$.period')
);

CREATE TABLE IF NOT EXISTS vendor_invoices (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vendor_gstin_period ON vendor_invoices (
  json_extract(data, '$.seller_gstin'),
  json_extract(data, '$.period')
);

CREATE TABLE IF NOT EXISTS ims_actions (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ims_gstin_period ON ims_actions (
  json_extract(data, '$.seller_gstin'),
  json_extract(data, '$.period')
);

CREATE TABLE IF NOT EXISTS exceptions_log (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_exc_gstin_period ON exceptions_log (
  json_extract(data, '$.seller_gstin'),
  json_extract(data, '$.period')
);

CREATE TABLE IF NOT EXISTS exports (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
