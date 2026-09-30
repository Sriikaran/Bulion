/**
 * Error Sanitization Utility for Bullion Server Actions
 *
 * Ensures that client-facing error responses:
 * - Return clear, actionable business domain errors.
 * - Strip internal Prisma error codes, database connection strings, and stack traces.
 * - Never leak database URLs, environment variables, or secrets.
 */

import { ZodError } from "zod";
import {
  InsufficientStockError,
  InactiveEntityError,
  UnauthorizedError,
} from "@/lib/services/stock-service";

export function sanitizeErrorMessage(err: unknown, fallbackMessage = "An unexpected error occurred"): string {
  if (!err) return fallbackMessage;

  // 1. Zod Validation Errors
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    return firstIssue ? `${firstIssue.path.join(".")}: ${firstIssue.message}` : "Validation failed";
  }

  // 2. Specific Domain Errors
  if (err instanceof InsufficientStockError) {
    return `Insufficient stock: ${err.message}`;
  }
  if (err instanceof InactiveEntityError) {
    return err.message;
  }
  if (err instanceof UnauthorizedError) {
    return err.message;
  }

  // 3. Known Business Error Messages
  if (err instanceof Error) {
    const msg = err.message;

    // Check for sensitive database strings or internal traces
    if (
      msg.includes("DATABASE_URL") ||
      msg.includes("DIRECT_URL") ||
      msg.includes("postgresql://") ||
      msg.includes("password=") ||
      msg.includes("prisma.")
    ) {
      return "Database connection error. Please contact administrator.";
    }

    // Prisma Unique Constraint Error (P2002)
    if (msg.includes("Unique constraint failed") || msg.includes("P2002")) {
      return "A record with this identifier or invoice number already exists.";
    }

    // Prisma Record Not Found (P2025)
    if (msg.includes("Record to update not found") || msg.includes("P2025") || msg.includes("findUniqueOrThrow")) {
      return "Requested record was not found.";
    }

    // Return the clean message if it doesn't look like an internal stack trace or raw SQL
    if (!msg.includes("at ") && !msg.includes("Error:") && msg.length < 250) {
      return msg;
    }

    return fallbackMessage;
  }

  return fallbackMessage;
}
