import { headers } from "next/headers";
import { auth } from "@/lib/auth/auth";
import type { Role } from "@prisma/client";

export async function getCurrentUser() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    return {
      id: session.user.id,
      name: session.user.name ?? "User",
      email: session.user.email ?? "",
      role: ((session.user as { role?: string }).role ?? "STAFF") as Role,
    };
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest === "DYNAMIC_SERVER_USAGE") {
      throw err;
    }
    if (process.env.DEBUG === "true") {
      console.error("Failed to get session:", err);
    }
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized: Please sign in to continue");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new Error("Forbidden: This action requires ADMIN privileges");
  }
  return user;
}
