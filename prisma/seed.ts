/**
 * Bullion — Database Seed
 *
 * Seeds:
 * - Admin user
 * - Metal master (Gold, Silver)
 * - Purity master (standard purities for each metal)
 * - App settings
 *
 * Safe to re-run (upsert semantics).
 * Does NOT seed transactions or opening stock — that is done via the app.
 */

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const connectionString =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/bullion?schema=bullion";

let schema = "bullion";
try {
  const parsedUrl = new URL(connectionString);
  schema = parsedUrl.searchParams.get("schema") || "bullion";
} catch {
  schema = "bullion";
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool, { schema });
const prisma = new PrismaClient({ adapter });

function generateId(): string {
  return crypto.randomBytes(12).toString("hex");
}

import { auth } from "../src/lib/auth/auth";

async function main() {
  console.log("Seeding Bullion database...");

  // ---- Admin user ----
  const adminEmail = process.env.ADMIN_EMAIL || "admin@bullion.local";
  const adminPassword = process.env.ADMIN_PASSWORD || "bullion@admin123";
  const adminName = process.env.ADMIN_NAME || "Bullion Admin";

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`Admin user ${adminEmail} already exists. Ensuring ADMIN role...`);
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { role: "ADMIN", emailVerified: true, isActive: true },
    });
  } else {
    const resAdmin = await auth.api.signUpEmail({
      body: {
        email: adminEmail,
        password: adminPassword,
        name: adminName,
      },
    });

    if (resAdmin?.user?.id) {
      await prisma.user.update({
        where: { id: resAdmin.user.id },
        data: {
          role: "ADMIN",
          emailVerified: true,
          isActive: true,
        },
      });
      console.log(`Created admin user: ${adminEmail}`);
    }
  }

  // ---- Staff user ----
  const existingStaff = await prisma.user.findUnique({
    where: { email: "staff@bullion.local" },
  });
  if (existingStaff) {
    console.log("Staff user staff@bullion.local already exists. Ensuring STAFF role...");
    await prisma.user.update({
      where: { id: existingStaff.id },
      data: { role: "STAFF", emailVerified: true, isActive: true },
    });
  } else {
    const resStaff = await auth.api.signUpEmail({
      body: {
        email: "staff@bullion.local",
        password: "bullion@staff123",
        name: "Bullion Staff",
      },
    });

    if (resStaff?.user?.id) {
      await prisma.user.update({
        where: { id: resStaff.user.id },
        data: {
          role: "STAFF",
          emailVerified: true,
          isActive: true,
        },
      });
      console.log("Created staff user: staff@bullion.local");
    }
  }

  // ---- Metal: Gold ----
  const gold = await prisma.metal.upsert({
    where: { type: "GOLD" },
    update: { code: "GOLD" },
    create: {
      name: "Gold",
      code: "GOLD",
      type: "GOLD",
      isActive: true,
    },
  });

  // ---- Metal: Silver ----
  const silver = await prisma.metal.upsert({
    where: { type: "SILVER" },
    update: { code: "SILVER" },
    create: {
      name: "Silver",
      code: "SILVER",
      type: "SILVER",
      isActive: true,
    },
  });

  // ---- Purities: Gold ----
  const goldPurities = [
    { label: "24K (999.9)", fineness: "0.9999", sortOrder: 1, displayInfo: "24 Karat / 999.9 Fine" },
    { label: "24K (999)", fineness: "0.9990", sortOrder: 2, displayInfo: "24 Karat / 999 Fine" },
    { label: "22K (916)", fineness: "0.9160", sortOrder: 3, displayInfo: "22 Karat / 916 Fine" },
    { label: "18K (750)", fineness: "0.7500", sortOrder: 4, displayInfo: "18 Karat / 750 Fine" },
    { label: "14K (585)", fineness: "0.5850", sortOrder: 5, displayInfo: "14 Karat / 585 Fine" },
  ];

  for (const p of goldPurities) {
    await prisma.purity.upsert({
      where: { metalId_label: { metalId: gold.id, label: p.label } },
      update: { fineness: p.fineness, displayInfo: p.displayInfo, sortOrder: p.sortOrder },
      create: {
        metalId: gold.id,
        label: p.label,
        fineness: p.fineness,
        displayInfo: p.displayInfo,
        isActive: true,
        sortOrder: p.sortOrder,
      },
    });
  }

  // ---- Purities: Silver ----
  const silverPurities = [
    { label: "999 Fine", fineness: "0.9990", sortOrder: 1, displayInfo: "999 Fine Silver" },
    { label: "925 Sterling", fineness: "0.9250", sortOrder: 2, displayInfo: "925 Sterling Silver" },
    { label: "900 Coin", fineness: "0.9000", sortOrder: 3, displayInfo: "900 Coin Silver" },
  ];

  for (const p of silverPurities) {
    await prisma.purity.upsert({
      where: { metalId_label: { metalId: silver.id, label: p.label } },
      update: { fineness: p.fineness, displayInfo: p.displayInfo, sortOrder: p.sortOrder },
      create: {
        metalId: silver.id,
        label: p.label,
        fineness: p.fineness,
        displayInfo: p.displayInfo,
        isActive: true,
        sortOrder: p.sortOrder,
      },
    });
  }

  // ---- App Settings ----
  await prisma.appSetting.upsert({
    where: { key: "company_name" },
    update: {},
    create: { key: "company_name", value: "Bullion India" },
  });
  await prisma.appSetting.upsert({
    where: { key: "company_branch" },
    update: {},
    create: { key: "company_branch", value: "Main Branch" },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });