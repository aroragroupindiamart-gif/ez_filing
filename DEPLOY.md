# Deployment Guide

## Architecture

```
Browser → Cloudflare Pages (frontend) → Backend API (Render free tier)
                                      → PostgreSQL (Neon free tier)
```

---

## 1 — PostgreSQL database (Neon — free)

1. Sign up at https://neon.tech (free tier, no credit card)
2. Create a project → copy the **Connection string** (starts with `postgresql://`)
3. Keep it handy — you'll need it as `DATABASE_URL`

---

## 2 — Backend (Render.com — free tier)

1. Sign up at https://render.com and connect your GitHub account
2. **New → Web Service** → select repo `aroragroupindiamart-gif/ez_filing`
3. Settings:
   - **Root Directory**: *(leave blank)*
   - **Build Command**: `pip install -r ez_filing-conflict_040726_1139/backend/requirements.txt`
   - **Start Command**: `cd ez_filing-conflict_040726_1139/backend && uvicorn server:app --host 0.0.0.0 --port $PORT`
   - **Instance type**: Free
4. **Environment Variables** (add these in the Render dashboard):

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | your Neon connection string |
   | `ENCRYPTION_KEY` | 64-char hex string (generate: `python3 -c "import secrets; print(secrets.token_hex(32))"`) |
   | `CORS_ORIGINS` | `https://your-app.pages.dev` (your Cloudflare Pages URL) |

5. Deploy → copy the service URL (e.g. `https://gst-ecom-ez-backend.onrender.com`)

> **Note**: Render free tier sleeps after 15 min of inactivity. First request after sleep takes ~30s.
> Upgrade to Starter ($7/mo) for always-on.

---

## 3 — Frontend (Cloudflare Pages — free)

1. Go to https://dash.cloudflare.com → **Pages → Create a project → Connect to Git**
2. Select repo `aroragroupindiamart-gif/ez_filing`
3. Build settings:

   | Setting | Value |
   |---------|-------|
   | **Framework preset** | None (Custom) |
   | **Build command** | `npm install -g pnpm && pnpm install && pnpm --filter @workspace/gst-ecom-ez run build` |
   | **Build output directory** | `artifacts/gst-ecom-ez/dist/public` |
   | **Root directory** | *(leave blank)* |
   | **Node version** | `20` |

4. **Environment variables** (add in Cloudflare Pages settings):

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | `https://gst-ecom-ez-backend.onrender.com/api` |

5. Deploy → your app is live at `https://your-app.pages.dev`

---

## 4 — Custom domain (optional, Cloudflare free)

In Cloudflare Pages → Custom domains → add your domain.
Cloudflare handles SSL automatically.

---

## Environment variable checklist

| Variable | Where | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Render backend | PostgreSQL connection string from Neon |
| `ENCRYPTION_KEY` | Render backend | 64-char hex — must match the one used when data was first written |
| `CORS_ORIGINS` | Render backend | Comma-separated list of allowed frontend origins |
| `VITE_API_URL` | Cloudflare Pages | Full URL to the backend `/api` path |
