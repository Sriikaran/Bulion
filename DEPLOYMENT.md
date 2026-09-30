# Bullion Production Deployment Guide (Vercel)

This guide documents the exact procedure to deploy **Bullion** to [Vercel](https://vercel.com) with PostgreSQL and Better Auth.

---

## 1. System Requirements

- **Node.js**: 20.x or 22.x LTS
- **PostgreSQL**: PostgreSQL 15+ (e.g. Supabase, Neon, AWS RDS, Railway) with connection pooling support
- **Package Manager**: npm (uses `package-lock.json`)
- **Vercel Account**: With access to GitHub integration

---

## 2. Vercel Import Instructions

1. Log into your **Vercel Dashboard**.
2. Click **Add New...** → **Project**.
3. Import the repository: `https://github.com/Sriikaran/Bulion` (*Note: repository is named "Bulion"*).
4. Keep Framework Preset as **Next.js**.
5. Keep Root Directory as `./`.
6. Verify Build and Output Settings:
   - **Build Command**: `prisma generate && next build` (detected automatically from `package.json`)
   - **Output Directory**: `.next` (default)
   - **Install Command**: `npm install` or `npm ci` (default)
7. Configure the Environment Variables (see Section 3 below).
8. Click **Deploy**.

---

## 3. Environment Variables Contract

Add the following variables in Vercel under **Settings → Environment Variables**:

| Variable Name | Required | Target Environments | Secret / Public | Purpose | Example Placeholder |
|---|---|---|---|---|---|
| `DATABASE_URL` | **Yes** | Production, Preview, Development | Server-only (Secret) | Pooled PostgreSQL connection string for serverless runtime | `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | **Yes** | Production, Preview, Development | Server-only (Secret) | Direct PostgreSQL connection string for Prisma CLI operations | `postgresql://postgres:[pass]@db.[ref].supabase.co:5432/postgres` |
| `BETTER_AUTH_SECRET` | **Yes** | Production, Preview | Server-only (Secret) | High-entropy random secret key (min 32 chars) for session tokens | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | **Yes** | Production | Server-only | Canonical public URL of the deployed application | `https://bulion.vercel.app` |
| `NEXT_PUBLIC_APP_URL` | **Yes** | Production | Public | Client-side public base URL for metadataBase & client auth | `https://bulion.vercel.app` |
| `DB_POOL_MAX` | No | Production | Server-only | Maximum pool connections per serverless container (default: 10) | `10` |
| `DEBUG` | No | Production, Preview | Server-only | Enable verbose service logging (default: false) | `false` |

---

## 4. Production Database Initialization

Before deploying or upon provisioning a fresh PostgreSQL database:

1. In your local terminal, export your production `DIRECT_URL`:
   ```bash
   export DIRECT_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/bullion_db"
   export DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:6543/bullion_db?pgbouncer=true"
   ```
2. Push the schema to create tables and indexes:
   ```bash
   npx prisma db push
   ```
   *Note: `prisma db reset` or `--force-reset` is strictly forbidden in production.*

---

## 5. First Admin User & Master Data Bootstrap Procedure

A fresh production database requires:
1. One initial **ADMIN** user.
2. Initial metal masters (e.g. Gold, Silver) and standard purities (e.g. 24K, 22K, 18K, 999 Fine Silver, 925 Sterling Silver).

To bootstrap securely:
1. Ensure your local environment is configured with the production `DATABASE_URL` and `DIRECT_URL`.
2. Run the secure production bootstrap script:
   ```bash
   npx tsx prisma/seed.ts
   ```
   *Note: Bullion's seed script uses `upsert` and checks for existing records to prevent duplicating data if run repeatedly.*
3. Once bootstrapped, log in with the admin credentials at `/login` and immediately update the password under `/profile`.

---

## 6. Build & Verification Commands

To verify locally before any deployment:
```bash
# 1. Generate Prisma Client
npm run db:generate

# 2. Typecheck
npm run typecheck

# 3. Lint
npm run lint

# 4. Run Automated Test Suite (88/88 passing)
npm test

# 5. Production Build
npm run build
```

---

## 7. Production Verification Checklist

After Vercel finishes deploying:

- [ ] Visit `https://your-bullion-deployment.vercel.app/login` — verify the login page loads cleanly.
- [ ] Log in with the ADMIN account.
- [ ] Verify Masters: Metal and Purity configurations are visible.
- [ ] Create a Counterparty (Supplier / Buyer).
- [ ] Post an Opening Stock or Purchase entry; verify stock movements increment accordingly.
- [ ] Attempt a Sale exceeding available stock; verify oversell prevention halts the transaction.
- [ ] Post a valid Sale; verify stock decreases and StockMovement append-only audit entry is created.
- [ ] Verify Reports: Stock positions, Purchase Register, Sales Register, and CSV exports work without errors.
- [ ] Verify STAFF accounts cannot perform ADMIN-restricted operations.
- [ ] Test Logout.

---

## 8. Troubleshooting Common Deployment Failures

1. **Prisma Client not found / P2021 error**:
   - Verify `prisma generate` is run during build (`"build": "prisma generate && next build"`).
2. **Database Connection Pool Exhaustion**:
   - Make sure `DATABASE_URL` points to your pooled connection (e.g. PgBouncer/Supabase pooler).
3. **Authentication Session Fails on HTTPS**:
   - Ensure `BETTER_AUTH_URL` uses `https://` matching your exact Vercel production domain.
