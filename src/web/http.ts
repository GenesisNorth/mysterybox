import type { IncomingMessage } from "node:http";

export function cookieValue(request: IncomingMessage, name: string): string | undefined {
  const prefix = `${name}=`;
  const cookie = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return cookie?.slice(prefix.length);
}

export async function formValues(request: IncomingMessage, maxLength = 10_000): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > maxLength) throw new Error("Request body is too large"); }
  return new URLSearchParams(body);
}

export async function formValue(request: IncomingMessage, name: string): Promise<string> {
  return (await formValues(request)).get(name) ?? "";
}

export async function rawBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > 100_000) throw new Error("Request body is too large"); }
  return body;
}

/**
 * CSRF defence for cookie-authenticated forms: the browser's Origin (or, failing that, Referer) must name this host.
 * Browsers always send Origin on cross-site POSTs, so a missing or foreign origin is refused.
 */
export function isSameOrigin(request: IncomingMessage): boolean {
  const host = request.headers.host;
  const source = request.headers.origin ?? request.headers.referer;
  if (!host || !source || source === "null") return false;
  try { return new URL(source).host === host; } catch { return false; }
}
