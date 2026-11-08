import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import type { StaffOperations } from "../application/staff-operations.js";
import { handleAdmin, type StaffIdentity } from "./admin.js";
import { HelpDesk, HolderRecovery, PassForwardReminders } from "../application/support.js";
import { InMemoryRecipientJourneyRepository, demoRecipientBoxes } from "../infrastructure/in-memory-recipient-journey.js";

const support = new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
const helpDesk = new HelpDesk(support);
const reminders = new PassForwardReminders(support);

const tokens: Record<string, StaffIdentity> = { "admin-token": { actor: "admin@example.com", role: "admin" }, "ops-token": { actor: "ops@example.com", role: "operations" } };
const calls: string[] = [];
const staff = {
  recentBoxes: async () => [], searchBoxes: async () => [], inventory: async () => [],
  issueCards: async (quantity: number) => { calls.push(`issue:${quantity}`); return [{ cardCode: "GS-CARD-ABC", cardToken: "secret-card-token" }]; },
  createStarterBox: async () => { calls.push("starter"); return { boxNumber: "GS-00009", trailCode: "TRAIL-X" }; },
  recordPacking: async () => { calls.push("pack"); throw new Error("Packing checklist must be complete"); }
} as unknown as StaffOperations;

async function withServer(run: (base: string) => Promise<void>, production = false): Promise<void> {
  const server: Server = createServer(async (request, response) => {
    if (!await handleAdmin(request, response, { staffOperations: staff, helpDesk, reminders, recovery: new HolderRecovery(support), automaticEmail: false, identify: async (token) => (token && tokens[token]) || null, production, publicBaseUrl: production ? undefined : undefined })) { response.writeHead(404); response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  try { await run(base); } finally { server.close(); }
}
const post = (base: string, path: string, body: Record<string, string>, headers: Record<string, string> = {}) =>
  fetch(base + path, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", origin: base, ...headers }, body: new URLSearchParams(body) });
const flashOf = (response: Response) => { const url = new URL(response.headers.get("location") ?? "", "http://x"); return { path: url.pathname, notice: url.searchParams.get("notice"), error: url.searchParams.get("error") }; };
const as = (token: string) => ({ cookie: `staff_token=${token}` });

test("console pages require sign-in and non-admin paths are left alone", () => withServer(async (base) => {
  const response = await fetch(`${base}/admin/boxes`, { redirect: "manual" });
  assert.equal(response.status, 303); assert.equal(response.headers.get("location"), "/admin/login");
  assert.equal((await fetch(`${base}/b/anything`)).status, 404);
}));

test("signing in sets a strict, http-only, admin-scoped cookie; a wrong token is refused", () => withServer(async (base) => {
  assert.equal((await post(base, "/admin/login", { token: "nope" })).status, 401);
  const response = await post(base, "/admin/login", { token: "admin-token" });
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie") ?? "";
  for (const part of ["staff_token=admin-token", "HttpOnly", "SameSite=Strict", "Path=/admin"]) assert.ok(cookie.includes(part), part);
  assert.ok(!cookie.includes("Secure"), "Secure only in production");
}));

test("a POST from another site is refused even with a valid session cookie", () => withServer(async (base) => {
  calls.length = 0;
  const forged = await post(base, "/admin/boxes", {}, { ...as("admin-token"), origin: "https://evil.example" });
  assert.equal(forged.status, 403);
  const noOrigin = await fetch(`${base}/admin/boxes`, { method: "POST", redirect: "manual", headers: as("admin-token") });
  assert.equal(noOrigin.status, 403);
  assert.deepEqual(calls, []);
}));

test("operations staff cannot start trails or issue cards; administrators can", () => withServer(async (base) => {
  calls.length = 0;
  const denied = await post(base, "/admin/boxes", {}, as("ops-token"));
  assert.match(flashOf(denied).error ?? "", /Only an administrator/);
  await post(base, "/admin/cards", { quantity: "3" }, as("ops-token"));
  assert.deepEqual(calls, []);
  const started = await post(base, "/admin/boxes", {}, as("admin-token"));
  assert.match(started.headers.get("location") ?? "", /^\/admin\/boxes\/GS-00009\?notice=/);
}));

test("issuing cards returns a printable QR sheet once, encoding the card URL", () => withServer(async (base) => {
  const response = await post(base, "/admin/cards", { quantity: "1" }, as("admin-token"));
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const page = await response.text();
  assert.match(page, /GS-CARD-ABC/); assert.match(page, /<svg/);
}));

test("in production, cards cannot be issued until PUBLIC_BASE_URL names the printed domain", () => withServer(async (base) => {
  calls.length = 0;
  const response = await post(base, "/admin/cards", { quantity: "1" }, as("admin-token"));
  assert.match(flashOf(response).error ?? "", /PUBLIC_BASE_URL/);
  assert.deepEqual(calls, []);
}, true));

test("a failed action returns to the box with its error message", () => withServer(async (base) => {
  const response = await post(base, "/admin/boxes/GS-00001/pack", { packedBy: "Bisi" }, as("ops-token"));
  assert.equal(response.status, 303);
  assert.deepEqual(flashOf(response), { path: "/admin/boxes/GS-00001", notice: null, error: "Packing checklist must be complete" });
}));

test("reminder contact details are administrator-only; help requests are visible to operations", () => withServer(async (base) => {
  await helpDesk.submit("demo-card-token", { category: "not_arrived", message: "Still waiting <b>", contact: "ade@example.com" });
  const opsHelp = await fetch(`${base}/admin/help`, { headers: as("ops-token") });
  assert.equal(opsHelp.status, 200);
  const page = await opsHelp.text();
  assert.match(page, /Still waiting &lt;b&gt;/); assert.match(page, /ade@example\.com/);
  assert.equal((await fetch(`${base}/admin/reminders`, { headers: as("ops-token") })).status, 403);
  assert.equal((await fetch(`${base}/admin/reminders`, { headers: as("admin-token") })).status, 200);
}));

test("the reminders page splits due, upcoming and not-needed, and shows a prepared message once", async () => {
  const { remindersPageHtml } = await import("./admin-views.js");
  const now = new Date("2026-11-20T12:00:00Z");
  const base = { channel: "email" as const, status: "scheduled" as const, sentAt: null, respondedAt: null, passedOn: false, attempts: 0 };
  const page = remindersPageHtml({ actor: "admin@example.com", role: "admin" }, [
    { ...base, id: "11111111-1111-1111-1111-111111111111", boxNumber: "GS-00001", destination: "due@example.com<script>", sendAt: new Date("2026-11-20T10:00:00Z") },
    { ...base, id: "22222222-2222-2222-2222-222222222222", boxNumber: "GS-00002", destination: "later@example.com", sendAt: new Date("2026-11-21T10:00:00Z") },
    { ...base, id: "33333333-3333-3333-3333-333333333333", boxNumber: "GS-00003", destination: "done@example.com", sendAt: new Date("2026-11-19T10:00:00Z"), passedOn: true }
  ], now, {}, { id: "11111111-1111-1111-1111-111111111111", message: "Reminder text https://x/r/abc", link: "https://x/r/abc" });
  assert.match(page, /Due now \(1\)/); assert.match(page, /Coming up \(1\)/); assert.match(page, /No longer needed \(1\)/);
  assert.match(page, /<textarea readonly rows="4">Reminder text https:\/\/x\/r\/abc<\/textarea>/);
  assert.match(page, /reminders\/11111111-1111-1111-1111-111111111111\/sent/);
  assert.ok(!page.includes("<script>")); assert.ok(!page.includes("later@example.com"), "upcoming reminders do not show the destination yet");
});

test("only an administrator who confirms verification can issue a recovery link; opening it does not use it", () => withServer(async (base) => {
  const ops = await post(base, "/admin/boxes/GS-00001/recovery-link", { verified: "yes" }, as("ops-token"));
  assert.match(flashOf(ops).error ?? "", /Only an administrator/);
  const unverified = await post(base, "/admin/boxes/GS-00001/recovery-link", {}, as("admin-token"));
  assert.match(flashOf(unverified).error ?? "", /Confirm you have verified/);
  const notReceived = await post(base, "/admin/boxes/GS-00001/recovery-link", { verified: "yes" }, as("admin-token"));
  assert.match(flashOf(notReceived).error ?? "", /already been received/);
  await new (await import("../application/recipient-journey.js")).RecipientJourney(support).confirm("demo-card-token");
  const issued = await post(base, "/admin/boxes/GS-00001/recovery-link", { verified: "yes" }, as("admin-token"));
  assert.equal(issued.status, 201);
  assert.match(await issued.text(), /\/h\/[A-Za-z0-9_-]{43}/);
}));
