/**
 * serializeForClient
 *
 * Converts Decimal instances, Dates, and nested objects into plain JSON-serializable
 * values so they can safely pass across Next.js Server-to-Client boundaries
 * without triggering "Only plain objects can be passed to Client Components".
 */
export function serializeForClient<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(
    JSON.stringify(obj, (_key, val) => {
      if (typeof val === "object" && val !== null) {
        // Decimal instances (decimal.js, @prisma/client Decimal)
        if (
          typeof val.toFixed === "function" ||
          typeof val.d === "object" ||
          val._isDecimal
        ) {
          return val.toString();
        }
      }
      return val;
    }),
  );
}
