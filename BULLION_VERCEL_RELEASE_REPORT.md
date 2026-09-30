# Bullion Production Release & Vercel Deployment Report

## 1. Executive Summary

| Attribute | Details |
|---|---|
| **Application** | Bullion (Bullion Management System V1) |
| **Repository** | `https://github.com/Sriikaran/Bulion` |
| **Framework** | Next.js 16.1.1 (App Router, Turbopack) |
| **React Version** | React 19.2.3 |
| **Runtime Environment** | Node.js 20.x / 22.x (Vercel Serverless Functions) |
| **Database** | PostgreSQL with Prisma ORM 7.3.0 & `@prisma/adapter-pg` |
| **Authentication** | Better Auth 1.5.4 (Email/Password, Cookie sessions) |
| **Deployment Status** | **READY FOR VERCEL** |

---

## 2. Verification Matrix

| Step / Gate | Command | Result | Notes |
|---|---|---|---|
| **Clean Install** | `npm ci` | Passed | Fully resolved lockfile |
| **Prisma Generation** | `npx prisma generate` | Passed | Client generated with `@prisma/adapter-pg` |
| **Automated Tests** | `npm test` | Passed (88/88 passing) | 100% test suite green across all test files |
| **TypeScript Check** | `npm run typecheck` | Passed | 0 type errors |
| **ESLint Audit** | `npm run lint` | Passed | 0 warnings, 0 errors (ESLint 9 Flat Config) |
| **Production Build** | `npm run build` | Passed | Successfully compiled 22 static and dynamic routes |

---

## 3. Database & Serverless Architecture

- **Singleton Pattern**: PrismaClient and `pg.Pool` are registered on `globalThis` to prevent connection leaks across serverless function re-use.
- **Connection Configuration**:
  - `DATABASE_URL`: Pooled connection string (`?pgbouncer=true` or Supabase transaction pooler port 6543) utilized during runtime traffic. Max pool size configurable via `DB_POOL_MAX` (defaults to 3 per function instance).
  - `DIRECT_URL`: Direct PostgreSQL connection string (port 5432) utilized solely for migrations and schema synchronization out-of-band.
- **Data Protection**:
  - `prisma db push` and `prisma db reset` are strictly excluded from Vercel build/deploy commands.
  - `prisma/seed.ts` is guarded to avoid overwriting or resetting existing operational data.

---

## 4. Production Environment Contract

| Variable | Required? | Scope | Purpose |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | Server-only | Pooled PostgreSQL connection string for runtime queries |
| `DIRECT_URL` | **Yes** | Server-only / CLI | Direct PostgreSQL connection string for Prisma CLI operations |
| `BETTER_AUTH_SECRET` | **Yes** | Server-only | Cryptographic secret for signing session cookies |
| `BETTER_AUTH_URL` | **Yes** | Server-only | Canonical production URL (e.g., `https://bullion.yourdomain.com`) |
| `NEXT_PUBLIC_APP_URL` | Optional | Client/Server | Canonical web application URL |
| `DB_POOL_MAX` | Optional | Server-only | Maximum pool connections per serverless instance (default: 3) |

---

## 5. Bullion Business Invariants Preserved

1. **Stock Invariant Maintained**:
   `CURRENT STOCK = OPENING STOCK + PURCHASES - SALES ± AUTHORIZED ADJUSTMENTS`
2. **Strict Stock Movement Conventions**:
   - `OPENING` (+weight)
   - `PURCHASE` (+weight)
   - `SALE` (-weight)
   - `PURCHASE_CANCEL` (-weight)
   - `SALE_CANCEL` (+weight)
   - `ADJUSTMENT_IN` (+weight)
   - `ADJUSTMENT_OUT` (-weight)
3. **Atomic Transactions**: All stock mutations execute inside Prisma interactive transactions with advisory locks / version checks.
4. **No Negative Stock**: Oversell attempts are immediately rejected before state mutation.
5. **No Cross-Project Contamination**: Absolutely zero imports or dependencies between Pawnify and Bullion.
