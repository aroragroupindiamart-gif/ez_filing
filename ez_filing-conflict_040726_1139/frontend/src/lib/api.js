import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API_BASE, timeout: 60000 });

export const api = {
  seedDemo: () => client.post("/seed/demo").then(r => r.data),

  listSellers: () => client.get("/sellers").then(r => r.data),
  createSeller: (body) => client.post("/sellers", body).then(r => r.data),

  listUploads: (params) => client.get("/uploads", { params }).then(r => r.data),
  uploadFile: (formData) => client.post("/uploads", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then(r => r.data),

  getJob: (id) => client.get(`/jobs/${id}`).then(r => r.data),
  listJobs: () => client.get("/jobs").then(r => r.data),

  listMarketplaceInvoices: (seller_gstin, period) =>
    client.get("/invoices/marketplace", { params: { seller_gstin, period } }).then(r => r.data),
  listVendorInvoices: (seller_gstin, period) =>
    client.get("/invoices/vendor", { params: { seller_gstin, period } }).then(r => r.data),
  patchVendorInvoice: (id, patch) =>
    client.patch(`/invoices/vendor/${id}`, patch).then(r => r.data),

  listExceptions: (seller_gstin, period) =>
    client.get("/exceptions", { params: { seller_gstin, period } }).then(r => r.data),
  resolveException: (id, corrected) =>
    client.post(`/exceptions/${id}/resolve`, { corrected }).then(r => r.data),

  listIMS: (seller_gstin, period) =>
    client.get("/ims/actions", { params: { seller_gstin, period } }).then(r => r.data),
  decideIMS: (id, decision) =>
    client.post(`/ims/actions/${id}/decision`, { decision }).then(r => r.data),

  compliancePreview: (seller_gstin, period) =>
    client.get("/compliance/preview", { params: { seller_gstin, period } }).then(r => r.data),

  estimateInterest: (body) =>
    client.post("/interest/estimate", body).then(r => r.data),

  exportGstr1: (seller_gstin, period) =>
    client.post("/export/gstr1", null, { params: { seller_gstin, period } }).then(r => r.data),
  exportGstr3b: (seller_gstin, period) =>
    client.post("/export/gstr3b", null, { params: { seller_gstin, period } }).then(r => r.data),
  downloadUrl: (export_id, token) =>
    `${API_BASE}/export/${export_id}/download?token=${encodeURIComponent(token)}`,
};

export default api;
