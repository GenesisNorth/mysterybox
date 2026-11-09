import assert from "node:assert/strict";
import test from "node:test";
import { productionConfigProblems } from "./production-config.js";

const good = { NODE_ENV: "production", DATABASE_URL: "postgres://x", PASS_ON_AMOUNT_KOBO: "1500000", PUBLIC_BASE_URL: "https://gratitude.example", STAFF_ADMIN_TOKEN: "a".repeat(40) };

test("development never blocks startup", () => assert.deepEqual(productionConfigProblems({}), []));
test("a complete production configuration passes", () => assert.deepEqual(productionConfigProblems(good), []));
test("every production problem is reported at once", () => {
  const problems = productionConfigProblems({ NODE_ENV: "production", PASS_ON_AMOUNT_KOBO: "15000.50", PUBLIC_BASE_URL: "http://gratitude.example/app", METRICS_TOKEN: "short" });
  for (const pattern of [/DATABASE_URL/, /PASS_ON_AMOUNT_KOBO/, /https:\/\//, /no path/, /METRICS_TOKEN/, /STAFF_ADMIN_TOKEN is required/]) assert.ok(problems.some((problem) => pattern.test(problem)), pattern.source);
});
test("short staff tokens are refused", () => assert.match(productionConfigProblems({ ...good, STAFF_OPERATIONS_TOKEN: "ops123" })[0] ?? "", /at least 32/));
