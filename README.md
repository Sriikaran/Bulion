# Bullion — Gold & Silver Inventory Management System

**Bullion** is a production-grade bullion inventory and transaction management system for Indian jewellery and bullion traders. It is a **completely independent application** and has **zero coupling** with Pawnify.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI Library | React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database ORM | Prisma 7 |
| Database | PostgreSQL |
| Authentication | Better Auth |
| Validation | Zod |
| Testing | Vitest |
| Icons | Lucide React |
| Charts | Recharts |

## Getting Started

### 1. Prerequisites

- Node.js 18+
- PostgreSQL (local or remote)

### 2. Environment Setup

```bash
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL, DIRECT_URL, BETTER_AUTH_SECRET
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Database Setup

```bash
npm run db:push    # Push schema to database
npm run db:seed    # Seed initial data (metals, purities, admin user)
```

### 5. Run Dev Server

```bash
npm run dev        # Runs on http://localhost:3001
```

### 6. Default Credentials (after seed)

```
Email:    admin@bullion.local
Password: bullion@admin123
```

> **Change these immediately in production.**

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (port 3001) |
| `npm run build` | Production build |
| `npm run test` | Run unit tests |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npm run db:push` | Push Prisma schema |
| `npm run db:seed` | Seed database |
| `npm run db:studio` | Prisma Studio |

## Domain Modules

| Module | Path | Status |
|--------|------|--------|
| Auth | `src/lib/auth/` | ✅ Foundation |
| Database | `src/lib/db/` | ✅ Foundation |
| Stock Service | `src/lib/services/stock-service.ts` | ✅ Foundation |
| Validations | `src/lib/validations/` | ✅ Schemas defined |
| Dashboard | `src/app/(app)/dashboard/` | ✅ Foundation |
| Purchases | TBD (Step 2) | ⏳ |
| Sales | TBD (Step 2) | ⏳ |
| Stock | TBD (Step 2) | ⏳ |
| Adjustments | TBD (Step 3) | ⏳ |
| Reports | TBD (Step 4) | ⏳ |

## Independence from Pawnify

Bullion has **zero runtime dependency** on Pawnify:
- Separate `package.json` and `node_modules`
- Separate Prisma schema (`bullion_db` database)
- Separate Better Auth instance
- Separate `BETTER_AUTH_SECRET`
- No `../Pawnify/...` imports anywhere
- No shared source directories

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full architecture documentation.