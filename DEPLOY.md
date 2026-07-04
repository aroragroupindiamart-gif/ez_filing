# GST-ECOM-EZ — Cloudflare Free Deployment Guide

## Architecture (100% Cloudflare free tier)

```
Browser → Cloudflare Pages (React frontend)
              └── /api/* → Pages Functions (TypeScript/Hono backend)
                               ├── Cloudflare D1 (SQLite database)
                               └── Cloudflare R2 (encrypted file storage)
```

Everything runs on Cloudflare's free plan:
- **Pages** — unlimited static hosting
- **D1** — 5 GB database, 5M reads/day
- **R2** — 10 GB storage, free egress
- **Workers (via Pages Functions)** — 100k requests/day

---

## Step 1 — Create a Cloudflare account

1. Sign up at https://dash.cloudflare.com (free)
2. Go to **Workers & Pages**

---

## Step 2 — Create the D1 database

1. Sidebar → **Storage & Databases → D1**
2. Click **Create database**
3. Name: `gst-ecom-ez-db`
4. After creation, copy the **Database ID** (looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
5. Open `artifacts/gst-ecom-ez/wrangler.toml` and replace `FILL_IN_AFTER_CF_DASHBOARD_CREATION` with your Database ID

---

## Step 3 — Run the database schema

In **Cloudflare Dashboard → D1 → gst-ecom-ez-db → Console**, paste and run the entire contents of `artifacts/gst-ecom-ez/schema.sql`.

---

## Step 4 — Create the R2 bucket

1. Sidebar → **Storage & Databases → R2**
2. Click **Create bucket**
3. Name: `gst-ecom-ez-storage`
4. Leave all defaults → Create

---

## Step 5 — Generate your ENCRYPTION_KEY

Run this in any terminal (or use an online tool):
```
python3 -c "import secrets; print(secrets.token_hex(32))"
```
Save the 64-character hex string — **you must never lose it** (it encrypts all uploaded files).

---

## Step 6 — Deploy to Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**
2. Select repo: `aroragroupindiamart-gif/ez_filing`
3. Build settings:

   | Setting | Value |
   |---------|-------|
   | **Build command** | `npm install -g pnpm && pnpm install && pnpm --filter @workspace/gst-ecom-ez run build` |
   | **Build output directory** | `artifacts/gst-ecom-ez/dist/public` |
   | **Root directory** | *(leave blank)* |

4. **Environment variables** — add these in the Pages settings (Settings → Environment Variables):

   | Key | Value |
   |-----|-------|
   | `ENCRYPTION_KEY` | your 64-char hex key from Step 5 |

5. Click **Save and Deploy** — your app goes live at `https://your-app.pages.dev`

---

## Step 7 — Bind D1 and R2 to your Pages project

After the first deploy:

1. Go to your Pages project → **Settings → Functions**
2. **D1 database bindings** → Add:
   - Variable name: `DB`
   - Database: `gst-ecom-ez-db`
3. **R2 bucket bindings** → Add:
   - Variable name: `STORAGE`
   - Bucket: `gst-ecom-ez-storage`
4. Click **Save** → **Deployments → Retry deployment** to rebuild with the bindings

---

## Step 8 — Verify it works

Visit `https://your-app.pages.dev` — you should see the GST-ECOM-EZ dashboard.

To test the API:
```
curl https://your-app.pages.dev/api/health
# → {"status":"ok","ts":"...","runtime":"cloudflare-pages"}
```

Seed demo data:
```
curl -X POST https://your-app.pages.dev/api/seed/demo
```

---

## Updating the app

Every `git push` to `main` automatically triggers a new deployment on Cloudflare Pages (zero config needed).

---

## Environment variable reference

| Variable | Where | Required | Description |
|----------|--------|----------|-------------|
| `ENCRYPTION_KEY` | Pages env vars | ✅ | 64-char hex — encrypts all uploaded files |
| `DB` | D1 binding | ✅ | Cloudflare D1 database |
| `STORAGE` | R2 binding | ✅ | Cloudflare R2 bucket |

---

## Limits on the free tier

| Feature | Free limit | Expected usage |
|---------|-----------|----------------|
| Requests/day | 100,000 | Very comfortable for 1-5 users |
| D1 reads/day | 5,000,000 | No concern |
| D1 storage | 5 GB | Years of data |
| R2 storage | 10 GB | Thousands of invoice PDFs |
| R2 egress | Free | — |
