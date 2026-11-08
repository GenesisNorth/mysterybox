import { createHash, randomBytes } from "node:crypto";

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/** A Paystack-safe reference: Paystack only accepts alphanumerics, "-", "." and "=". */
export function createReference(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex").toUpperCase()}`;
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
