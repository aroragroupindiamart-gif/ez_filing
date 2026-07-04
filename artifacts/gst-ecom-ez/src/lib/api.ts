import axios from "axios";

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

const client = axios.create({ baseURL: API_BASE, timeout: 60000 });

export const api = {
  seedDemo: () => client.post("/seed/demo").then((r) => r.data),

  listSellers: () => client.get("/sellers").then((r) => r.data),
  createSeller: (body: object) => client.post("/sellers", body).then((r) => r.data),

  listUploads: (params: object) => client.get("/uploads", { params }).then((r) => r.data),
  uploadFile: (formData: FormData) =>
    client
      .post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data),

  getJob: (id: string) => client.get(`/jobs/${id}`).then((r) => r.data),
  listJobs: () => client.get("/jobs").then((r) => r.data),

  listMarketplaceInvoices: (seller_gstin: string, period: string) =>
    client
      .get("/invoices/marketplace", { params: { seller_gstin, period } })
      .then((r) => r.data),
  listVendorInvoices: (seller_gstin: string, period: string) =>
    client
      .get("/invoices/vendor", { params: { seller_gstin, period } })
      .then((r) => r.data),
  patchVendorInvoice: (id: string, patch: object) =>
    client.patch(`/invoices/vendor/${id}`, patch).then((r) => r.data),

  listExceptions: (seller_gstin: string, period: string, doc_type?: string) =>
    client
      .get("/exceptions", { params: { seller_gstin, period, ...(doc_type ? { doc_type } : {}) } })
      .then((r) => r.data),
  resolveException: (id: string, corrected: object) =>
    client.post(`/exceptions/${id}/resolve`, { corrected }).then((r) => r.data),

  listIMS: (seller_gstin: string, period: string) =>
    client.get("/ims/actions", { params: { seller_gstin, period } }).then((r) => r.data),
  decideIMS: (id: string, decision: string) =>
    client.post(`/ims/actions/${id}/decision`, { decision }).then((r) => r.data),

  compliancePreview: (seller_gstin: string, period: string) =>
    client
      .get("/compliance/preview", { params: { seller_gstin, period } })
      .then((r) => r.data),

  estimateInterest: (body: object) =>
    client.post("/interest/estimate", body).then((r) => r.data),

  exportGstr1: (seller_gstin: string, period: string) =>
    client
      .post("/export/gstr1", null, { params: { seller_gstin, period } })
      .then((r) => r.data),
  exportGstr3b: (seller_gstin: string, period: string) =>
    client
      .post("/export/gstr3b", null, { params: { seller_gstin, period } })
      .then((r) => r.data),
  downloadUrl: (export_id: string, token: string) =>
    `${API_BASE}/export/${export_id}/download?token=${encodeURIComponent(token)}`,
};

export default api;
