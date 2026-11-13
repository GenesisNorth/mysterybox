/**
 * Settings production cannot run safely without. The server refuses to start and lists every problem at once,
 * so a misconfigured deploy fails loudly at boot instead of half-working.
 */
export function productionConfigProblems(env: NodeJS.ProcessEnv): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is required (the managed PostgreSQL connection string).");
  const amount = Number(env.PASS_ON_AMOUNT_KOBO);
  if (!Number.isInteger(amount) || amount <= 0) problems.push("PASS_ON_AMOUNT_KOBO must be a positive whole number of kobo (₦15,000 = 1500000).");
  if (env.STARTER_AMOUNT_KOBO !== undefined && env.STARTER_AMOUNT_KOBO !== "") {
    const starter = Number(env.STARTER_AMOUNT_KOBO);
    if (!Number.isInteger(starter) || starter <= 0) problems.push("STARTER_AMOUNT_KOBO must be a positive whole number of kobo, or left unset to use PASS_ON_AMOUNT_KOBO.");
  }
  const base = env.PUBLIC_BASE_URL;
  if (!base) problems.push("PUBLIC_BASE_URL is required: the https:// address printed on the cards, e.g. https://gratitude.ng");
  else {
    try {
      const url = new URL(base);
      if (url.protocol !== "https:") problems.push("PUBLIC_BASE_URL must start with https://");
      if (url.pathname !== "/" || url.search || url.hash) problems.push("PUBLIC_BASE_URL must be just the origin, with no path, e.g. https://gratitude.ng");
    } catch { problems.push("PUBLIC_BASE_URL is not a valid URL."); }
  }
  for (const name of ["STAFF_ADMIN_TOKEN", "STAFF_OPERATIONS_TOKEN", "STAFF_ACCESS_TOKEN", "METRICS_TOKEN"]) {
    const value = env[name];
    if (value && value.length < 32) problems.push(`${name} must be at least 32 random characters (or left unset).`);
  }
  if (!env.STAFF_ADMIN_TOKEN && !env.STAFF_ACCESS_TOKEN) problems.push("STAFF_ADMIN_TOKEN is required to bootstrap the first administrator (you can remove it once named staff accounts exist).");
  return problems;
}
