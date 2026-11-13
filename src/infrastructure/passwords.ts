import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Staff password hashing with scrypt (built into Node, memory-hard). Stored as
 * `scrypt$N$r$p$<salt base64>$<hash base64>` so the cost can be raised later without breaking old hashes.
 */
const cost = { N: 16384, r: 8, p: 1 } as const;
const keyLength = 32;

function scrypt(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password.normalize("NFKC"), salt, keyLength, { ...options, maxmem: 64 * 1024 * 1024 }, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, cost);
  return `scrypt$${cost.N}$${cost.r}$${cost.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // With no stored hash, still spend the same work so response time does not reveal which emails exist.
  const parts = (stored ?? dummyHash).split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash!, "base64");
  const actual = await scrypt(password, Buffer.from(salt!, "base64"), { N: Number(n), r: Number(r), p: Number(p) });
  return stored !== null && actual.length === expected.length && timingSafeEqual(actual, expected);
}
const dummyHash = `scrypt$${cost.N}$${cost.r}$${cost.p}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(keyLength).toString("base64")}`;

const common = new Set(["password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop", "iloveyou12", "letmein123", "welcome123", "gratitude", "gratitudestories", "administrator", "changeme123", "abcdefghij", "0123456789"]);

/** Returns a message the person can act on, or null when the password is acceptable. */
export function passwordProblem(password: string, email: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (password.length > 200) return "Use at most 200 characters.";
  const lower = password.toLowerCase();
  if (common.has(lower) || /^(.)\1+$/.test(password)) return "That password is too easy to guess. Try a short phrase of a few words.";
  const name = email.split("@")[0]?.toLowerCase() ?? "";
  if (name.length >= 4 && lower.includes(name)) return "Don't include your email address in your password.";
  return null;
}
