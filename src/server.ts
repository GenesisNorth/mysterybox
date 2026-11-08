import { createServer, type IncomingMessage } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { RecipientJourney, type RecipientJourneyRepository } from "./application/recipient-journey.js";
import { MyStories, type MyStoriesRepository } from "./application/my-stories.js";
import { CheckoutValidationError, PassItForward, type PassItForwardRepository } from "./application/pass-it-forward.js";
import { PaymentConfirmation } from "./application/payment-confirmation.js";
import { GiverTracker, type GiverTrackerRepository } from "./application/giver-tracker.js";
import { checkoutHtml, homeHtml, pageHtml, paymentCompleteHtml, profileHtml, remindersHtml, saveStoryHtml, storiesHtml, trackerHtml } from "./web/views.js";
import { InMemoryRecipientJourneyRepository, demoRecipientBoxes } from "./infrastructure/in-memory-recipient-journey.js";
import { postgresRecipientJourneyRepository } from "./infrastructure/postgres-recipient-journey.js";
import { PaystackGateway } from "./infrastructure/paystack.js";
import { StaffOperations, type CardStatus } from "./application/staff-operations.js";
import type { FulfilmentStatus } from "./domain/box.js";

const port = Number(process.env.PORT ?? 3000);
const passOnAmountKobo = Number(process.env.PASS_ON_AMOUNT_KOBO);
const postgresRepository = process.env.DATABASE_URL
  ? postgresRecipientJourneyRepository(process.env.DATABASE_URL, passOnAmountKobo)
  : null;
const demoRepository = postgresRepository ? null : new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
const repository: RecipientJourneyRepository & PassItForwardRepository & GiverTrackerRepository & MyStoriesRepository = postgresRepository ?? demoRepository!;
/** The payment simulator exists only for the in-memory demo, never with a database or in production. */
const demoPayments = demoRepository && process.env.NODE_ENV !== "production" ? demoRepository : null;
const journey = new RecipientJourney(repository);
const passItForward = new PassItForward(repository);
const giverTracker = new GiverTracker(repository);
const myStories = new MyStories(repository);
const paystack = process.env.PAYSTACK_SECRET_KEY ? new PaystackGateway(process.env.PAYSTACK_SECRET_KEY) : null;
const paymentConfirmation = paystack && postgresRepository ? new PaymentConfirmation(paystack, postgresRepository) : null;
const paystackCallbackUrl = process.env.PAYSTACK_CALLBACK_URL;
if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
const secureCookie = process.env.NODE_ENV === "production" ? "; Secure" : "";
const requestWindows = new Map<string, { count: number; resetAt: number }>();
const requestMetrics = new Map<string, number>();
const heroImage = new URL("../public/gratitude-gift-hero.png", import.meta.url);
function isRateLimited(request: IncomingMessage, limit: number): boolean {
  const now = Date.now();
  if (requestWindows.size > 10_000) for (const [address, window] of requestWindows) if (window.resetAt <= now) requestWindows.delete(address);
  const forwarded = process.env.TRUST_PROXY === "true" ? request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() : undefined;
  const key = forwarded || request.socket.remoteAddress || "unknown"; const current = requestWindows.get(key);
  if (!current || current.resetAt <= now) { requestWindows.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  current.count += 1; return current.count > limit;
}
const staffOperations = postgresRepository ? new StaffOperations(postgresRepository) : null;

function cookieValue(request: IncomingMessage, name: string): string | undefined {
  const prefix = `${name}=`;
  const cookie = request.headers.cookie?.split(";").map((item) => item.trim()).find((item) => item.startsWith(prefix));
  return cookie?.slice(prefix.length);
}
function holderCookie(request: IncomingMessage): string | undefined { return cookieValue(request, "holder_session"); }
async function formValues(request: IncomingMessage, maxLength = 10_000): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > maxLength) throw new Error("Request body is too large"); }
  return new URLSearchParams(body);
}
async function formValue(request: IncomingMessage, name: string): Promise<string> {
  return (await formValues(request)).get(name) ?? "";
}
async function rawBody(request: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > 100_000) throw new Error("Request body is too large"); }
  return body;
}
type StaffIdentity = { actor: string; role: "admin" | "operations" };
async function staffIdentity(request: IncomingMessage): Promise<StaffIdentity | null> {
  const provided = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const credentials: Array<[string | undefined, StaffIdentity]> = [[process.env.STAFF_ADMIN_TOKEN, { actor: "staff-admin", role: "admin" }], [process.env.STAFF_OPERATIONS_TOKEN, { actor: "staff-operations", role: "operations" }], [process.env.STAFF_ACCESS_TOKEN, { actor: "staff-legacy", role: "admin" }]];
  if (!provided) return null;
  for (const [secret, identity] of credentials) if (secret && secret.length === provided.length && timingSafeEqual(Buffer.from(secret), Buffer.from(provided))) return identity;
  if (postgresRepository) return postgresRepository.findStaffIdentityByToken(provided);
  return null;
}
function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}
function logRoute(pathname: string): string {
  if (/^\/b\//.test(pathname)) return "/b/:token";
  if (/^\/t\//.test(pathname)) return "/t/:token";
  if (/^\/staff\/users\//.test(pathname)) return "/staff/users/:identity";
  if (/^\/staff\/boxes\//.test(pathname)) return "/staff/boxes/:box";
  return pathname;
}
const server = createServer(async (request, response) => {
  const requestId = randomUUID();
  response.setHeader("x-request-id", requestId);
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "same-origin");
  response.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  response.setHeader("cache-control", "no-store");
  if (process.env.NODE_ENV === "production") response.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  response.on("finish", () => { const route=logRoute(pathname); const metric=`${request.method ?? "UNKNOWN"} ${route} ${response.statusCode}`; requestMetrics.set(metric,(requestMetrics.get(metric) ?? 0)+1); console.info(JSON.stringify({ requestId, method: request.method, route, status: response.statusCode })); });
  if (request.method === "POST" && isRateLimited(request, 30)) { response.writeHead(429, { "retry-after": "60", "content-type": "text/plain; charset=utf-8" }); response.end("Too many requests"); return; }
  if (pathname === "/health") { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "ok" })); return; }
  if (pathname === "/favicon.svg") { response.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" }); response.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f8d27a"/><stop offset="1" stop-color="#7e5dcc"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#g)"/><path d="M32 14l4.3 13.7L50 32l-13.7 4.3L32 50l-4.3-13.7L14 32l13.7-4.3z" fill="#fff"/></svg>`); return; }
  if (pathname === "/assets/gratitude-gift-hero.png") { try { response.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=604800, immutable" }); response.end(await readFile(heroImage)); } catch { response.writeHead(404); response.end(); } return; }
  if (pathname === "/" && request.method === "GET") { response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(homeHtml()); return; }
  if (pathname === "/metrics") {
    const token = process.env.METRICS_TOKEN; const provided = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token || !provided || token.length !== provided.length || !timingSafeEqual(Buffer.from(token), Buffer.from(provided))) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ requests: Object.fromEntries(requestMetrics) })); return;
  }
  if (pathname === "/ready") {
    try { if (postgresRepository) await postgresRepository.ping(); response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "ready", storage: postgresRepository ? "postgres" : "demo-memory" })); }
    catch { response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "not-ready" })); }
    return;
  }
  if (pathname.startsWith("/staff/")) {
    if (!staffOperations) { json(response, 503, { error: "Staff operations require PostgreSQL" }); return; }
    const identity = await staffIdentity(request);
    if (!identity) { response.writeHead(401, { "www-authenticate": "Bearer" }); response.end(); return; }
    const adminOnly = request.method === "POST" && (pathname === "/staff/cards" || pathname === "/staff/boxes" || /\/staff\/cards\/GS-CARD-[A-Z0-9]+\/void$/.test(pathname) || /\/staff\/boxes\/[^/]+\/card\/replacement$/.test(pathname));
    if (adminOnly && identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
    if (/^\/staff\/boxes\/[^/]+\/participants$/.test(pathname) && identity.role !== "admin") { json(response, 403, { error: "Administrator access is required for participant records" }); return; }
    try {
      if (pathname === "/staff/cards" && request.method === "GET") {
        const status = new URL(request.url ?? "/", "http://localhost").searchParams.get("status");
        if (status && !["available", "assigned", "voided"].includes(status)) throw new Error("Card status is not valid");
        json(response, 200, { cards: await staffOperations.inventory(status ? status as CardStatus : undefined) }); return;
      }
      if (pathname === "/staff/cards" && request.method === "POST") {
        const quantity = Number(await formValue(request, "quantity"));
        json(response, 201, { cards: await staffOperations.issueCards(quantity) }); return;
      }
      if (pathname === "/staff/users" && request.method === "POST") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        const values = await formValues(request); const role = values.get("role");
        if (role !== "admin" && role !== "operations") throw new Error("Staff role is not valid");
        json(response, 201, await staffOperations.provisionStaffUser(values.get("email") ?? "", role)); return;
      }
      if (pathname === "/staff/users" && request.method === "GET") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        json(response, 200, { users: await staffOperations.staffUsers() }); return;
      }
      const revokeUser = pathname.match(/^\/staff\/users\/([^/]+)\/revoke$/);
      if (revokeUser?.[1] && request.method === "POST") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        await staffOperations.revokeStaffUser(decodeURIComponent(revokeUser[1])); json(response, 204, null); return;
      }
      const rotateUser = pathname.match(/^\/staff\/users\/([^/]+)\/rotate-token$/);
      if (rotateUser?.[1] && request.method === "POST") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        json(response, 200, await staffOperations.rotateStaffUserToken(decodeURIComponent(rotateUser[1]))); return;
      }
      const changeRole = pathname.match(/^\/staff\/users\/([^/]+)\/role$/);
      if (changeRole?.[1] && request.method === "POST") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        const role = await formValue(request, "role"); if (role !== "admin" && role !== "operations") throw new Error("Staff role is not valid");
        if (identity.actor === decodeURIComponent(changeRole[1]).trim().toLowerCase() && role !== "admin") { json(response, 409, { error: "An administrator cannot demote their own active identity" }); return; }
        await staffOperations.changeStaffRole(decodeURIComponent(changeRole[1]), role); json(response, 204, null); return;
      }
      const userAudit = pathname.match(/^\/staff\/users\/([^/]+)\/audit$/);
      if (userAudit?.[1] && request.method === "GET") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        json(response, 200, { events: await staffOperations.staffAuditHistory(decodeURIComponent(userAudit[1])) }); return;
      }
      const reminder = pathname.match(/^\/staff\/boxes\/([^/]+)\/reminders$/);
      if (reminder?.[1] && request.method === "GET") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        json(response, 200, { jobs: await staffOperations.reminderJobs(decodeURIComponent(reminder[1])) }); return;
      }
      if (reminder?.[1] && request.method === "POST") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        const kind = await formValue(request, "kind"); if (kind !== "receipt_confirmation" && kind !== "pass_forward") throw new Error("Reminder kind is not valid");
        await staffOperations.scheduleReminder(decodeURIComponent(reminder[1]), kind); json(response, 202, { status: "queued" }); return;
      }
      if (pathname === "/staff/reminders/recover" && request.method === "POST") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        json(response, 200, { recovered: await staffOperations.recoverStaleReminderClaims() }); return;
      }
      const cancelReminder = pathname.match(/^\/staff\/boxes\/([^/]+)\/reminders\/([^/]+)\/cancel$/);
      if (cancelReminder?.[1] && cancelReminder[2] && request.method === "POST") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        const kind = cancelReminder[2]; if (kind !== "receipt_confirmation" && kind !== "pass_forward") throw new Error("Reminder kind is not valid");
        await staffOperations.cancelScheduledReminder(decodeURIComponent(cancelReminder[1]), kind); json(response, 204, null); return;
      }
      const retryReminder = pathname.match(/^\/staff\/boxes\/([^/]+)\/reminders\/([^/]+)\/retry$/);
      if (retryReminder?.[1] && retryReminder[2] && request.method === "POST") {
        if (identity.role !== "admin") { json(response, 403, { error: "Administrator access is required" }); return; }
        const kind = retryReminder[2]; if (kind !== "receipt_confirmation" && kind !== "pass_forward") throw new Error("Reminder kind is not valid");
        await staffOperations.retryFailedReminder(decodeURIComponent(retryReminder[1]), kind); json(response, 202, { status: "queued" }); return;
      }
      if (pathname === "/staff/boxes" && request.method === "POST") {
        json(response, 201, await staffOperations.createStarterBox()); return;
      }
      if (pathname === "/staff/boxes" && request.method === "GET") { json(response, 200, { boxes: await staffOperations.searchBoxes(new URL(request.url ?? "/", "http://localhost").searchParams.get("query") ?? "") }); return; }
      const staffBox = pathname.match(/^\/staff\/boxes\/([^/]+)$/);
      if (staffBox?.[1] && request.method === "GET") {
        json(response, 200, await staffOperations.boxOverview(decodeURIComponent(staffBox[1]))); return;
      }
      const audit = pathname.match(/^\/staff\/boxes\/([^/]+)\/audit$/);
      if (audit?.[1] && request.method === "GET") { json(response, 200, { events: await staffOperations.auditHistory(decodeURIComponent(audit[1])) }); return; }
      const delivery = pathname.match(/^\/staff\/boxes\/([^/]+)\/delivery$/);
      if (delivery?.[1] && request.method === "GET") {
        json(response, 200, await staffOperations.deliveryDetails(decodeURIComponent(delivery[1]))); return;
      }
      if (delivery?.[1] && request.method === "POST") {
        const values = await formValues(request);
        await staffOperations.recordDeliveryDetails(decodeURIComponent(delivery[1]), {
          addressLine1: values.get("addressLine1") ?? "", addressLine2: values.get("addressLine2"), city: values.get("city") ?? "",
          region: values.get("region"), deliveryNotes: values.get("deliveryNotes")
        });
        json(response, 204, null); return;
      }
      const participants = pathname.match(/^\/staff\/boxes\/([^/]+)\/participants$/);
      if (participants?.[1] && request.method === "GET") { json(response, 200, await staffOperations.participantIntake(decodeURIComponent(participants[1]))); return; }
      if (participants?.[1] && request.method === "POST") {
        const v = await formValues(request); const get = (name: string) => v.get(name);
        await staffOperations.recordParticipantIntake(decodeURIComponent(participants[1]), { giver: { firstName: get("giverFirstName"), lastInitial: get("giverLastInitial"), area: get("giverArea"), email: get("giverEmail"), phone: get("giverPhone"), displayConsent: get("giverDisplayConsent") === "yes" }, recipient: { firstName: get("recipientFirstName"), lastInitial: get("recipientLastInitial"), area: get("recipientArea"), email: get("recipientEmail"), phone: get("recipientPhone"), displayConsent: false }, giverNote: get("giverNote") });
        json(response, 204, null); return;
      }
      const packing = pathname.match(/^\/staff\/boxes\/([^/]+)\/packing$/);
      if (packing?.[1] && request.method === "GET") { json(response, 200, await staffOperations.packingRecord(decodeURIComponent(packing[1]))); return; }
      if (packing?.[1] && request.method === "POST") {
        const v = await formValues(request);
        await staffOperations.recordPacking(decodeURIComponent(packing[1]), { packedBy: v.get("packedBy") ?? "", checklistComplete: v.get("checklistComplete") === "yes", notes: v.get("notes") });
        json(response, 204, null); return;
      }
      const collection = pathname.match(/^\/staff\/boxes\/([^/]+)\/collection$/);
      if (collection?.[1] && request.method === "GET") { json(response, 200, await staffOperations.collectionRecord(decodeURIComponent(collection[1]))); return; }
      if (collection?.[1] && request.method === "POST") { const v = await formValues(request); await staffOperations.recordCollection(decodeURIComponent(collection[1]), { courier: v.get("courier") ?? "", handoffReference: v.get("handoffReference") }); json(response, 204, null); return; }
      const deliveryRecord = pathname.match(/^\/staff\/boxes\/([^/]+)\/delivery-proof$/);
      if (deliveryRecord?.[1] && request.method === "GET") { json(response, 200, await staffOperations.deliveryRecord(decodeURIComponent(deliveryRecord[1]))); return; }
      if (deliveryRecord?.[1] && request.method === "POST") { const v = await formValues(request); await staffOperations.recordDelivery(decodeURIComponent(deliveryRecord[1]), { deliveredBy: v.get("deliveredBy") ?? "", proofReference: v.get("proofReference") ?? "" }); json(response, 204, null); return; }
      const voidCard = pathname.match(/^\/staff\/cards\/(GS-CARD-[A-Z0-9]+)\/void$/);
      if (voidCard?.[1] && request.method === "POST") {
        await staffOperations.voidCard(voidCard[1]);
        json(response, 204, null); return;
      }
      const assignment = pathname.match(/^\/staff\/boxes\/([^/]+)\/card$/);
      if (assignment?.[1] && request.method === "POST") {
        await staffOperations.assignCard(decodeURIComponent(assignment[1]), await formValue(request, "cardCode"));
        json(response, 204, null); return;
      }
      const replacement = pathname.match(/^\/staff\/boxes\/([^/]+)\/card\/replacement$/);
      if (replacement?.[1] && request.method === "POST") {
        await staffOperations.replaceCard(decodeURIComponent(replacement[1]), await formValue(request, "cardCode"));
        json(response, 204, null); return;
      }
      const fulfilment = pathname.match(/^\/staff\/boxes\/([^/]+)\/fulfilment$/);
      if (fulfilment?.[1] && request.method === "POST") {
        const status = await formValue(request, "status");
        if (!["paid", "packed", "collected", "delivered", "cancelled", "refunded"].includes(status)) throw new Error("Fulfilment status is not valid");
        const box = await staffOperations.advanceFulfilment(decodeURIComponent(fulfilment[1]), status as FulfilmentStatus);
        json(response, 200, { boxNumber: box.boxNumber, fulfilmentStatus: box.fulfilmentStatus }); return;
      }
      response.writeHead(405, { allow: "GET, POST" }); response.end(); return;
    } catch (error) { json(response, 400, { error: error instanceof Error ? error.message : "Staff operation failed" }); return; }
  }
  const trackerMatch = pathname.match(/^\/t\/([A-Za-z0-9_-]+)$/);
  if (trackerMatch?.[1] && request.method === "GET") {
    const page = await giverTracker.getPage(trackerMatch[1]);
    response.writeHead(page.kind === "tracker" ? 200 : 404, { "content-type": "text/html; charset=utf-8" }); response.end(trackerHtml(page)); return;
  }
  if (pathname === "/webhooks/paystack" && request.method === "POST") {
    if (!paystack || !paymentConfirmation) { response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Payments are not configured" })); return; }
    try {
      const body = await rawBody(request);
      const signature = request.headers["x-paystack-signature"];
      if (!paystack.verifyWebhookSignature(body, typeof signature === "string" ? signature : undefined)) { response.writeHead(401); response.end(); return; }
      const event = JSON.parse(body) as { event?: string; data?: { reference?: string } };
      if (event.event === "charge.success" && event.data?.reference) await paymentConfirmation.confirm(event.data.reference);
      response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ received: true }));
    } catch { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Webhook could not be processed" })); }
    return;
  }
  if (pathname === "/checkout/complete" && request.method === "GET") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(paymentCompleteHtml(cookieValue(request, "giver_tracker"))); return;
  }
  if (pathname === "/checkout") {
    const referralToken = cookieValue(request, "checkout_referral");
    if (request.method === "GET") {
      const page = await passItForward.checkoutPage(referralToken);
      response.writeHead(page.kind === "ready" ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
      response.end(checkoutHtml(page.kind === "ready" ? { kind: "ready" } : { kind: "invalid" }));
      return;
    }
    if (request.method === "POST") {
      let values: Record<string, string> = {};
      try {
        // Large enough for two 500-character free-text fields written in non-Latin scripts once URL-encoded.
        values = Object.fromEntries(await formValues(request, 40_000));
        const field = (name: string) => values[name] ?? "";
        const order = await passItForward.createOrder(referralToken, {
          email: field("email"), giverName: field("giverName"), note: field("note"), deliveryTo: field("deliveryTo"),
          deliveryName: field("deliveryName"), deliveryPhone: field("deliveryPhone"), addressLine1: field("addressLine1"), addressLine2: field("addressLine2"),
          city: field("city"), region: field("region"), deliveryNotes: field("deliveryNotes")
        });
        if (paystack && postgresRepository && paystackCallbackUrl) {
          const checkout = await paystack.initialize({ reference: order.paymentReference, email: order.details.customerEmail, amountKobo: passOnAmountKobo, callbackUrl: paystackCallbackUrl });
          response.writeHead(303, { location: checkout.authorizationUrl, "set-cookie": order.trackerToken ? `giver_tracker=${order.trackerToken}; HttpOnly${secureCookie}; SameSite=Lax; Path=/checkout; Max-Age=2592000` : undefined }); response.end(); return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(checkoutHtml({ kind: "pending", reference: order.reference, trackerToken: order.trackerToken, demoPayment: Boolean(demoPayments) }));
      } catch (error) {
        if (error instanceof CheckoutValidationError) { response.writeHead(422, { "content-type": "text/html; charset=utf-8" }); response.end(checkoutHtml({ kind: "ready", error: error.message, values })); }
        else { response.writeHead(404, { "content-type": "text/html; charset=utf-8" }); response.end(checkoutHtml({ kind: "invalid" })); }
      }
      return;
    }
  }
  if (pathname === "/demo/pay" && request.method === "POST" && demoPayments) {
    try {
      const { cardToken } = await demoPayments.simulatePaidAndDelivered(await formValue(request, "reference"));
      response.writeHead(303, { location: `/b/${encodeURIComponent(cardToken)}` }); response.end();
    } catch { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end("Demo order not found"); }
    return;
  }
  const profileMatch = pathname.match(/^\/b\/([A-Za-z0-9_-]+)\/profile$/);
  if (profileMatch?.[1]) {
    const token = profileMatch[1];
    if (request.method === "GET") {
      const page = await journey.profilePage(token, holderCookie(request));
      if (page.kind !== "ready") { response.writeHead(page.kind === "not-found" ? 404 : 403, { "content-type": "text/plain; charset=utf-8" }); response.end("Profile is unavailable"); return; }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(profileHtml()); return;
    }
    if (request.method === "POST") {
      try {
        const values = await formValues(request);
        await journey.registerProfile(token, holderCookie(request), { firstName: values.get("firstName") ?? "", lastInitial: values.get("lastInitial") ?? "", area: values.get("area") ?? "", displayConsent: values.get("displayConsent") === "yes" });
        response.writeHead(303, { location: `/b/${encodeURIComponent(token)}` }); response.end(); return;
      } catch { response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }); response.end("Profile could not be saved"); return; }
    }
    response.writeHead(405, { allow: "GET, POST" }); response.end(); return;
  }
  const remindersMatch = pathname.match(/^\/b\/([A-Za-z0-9_-]+)\/reminders$/);
  if (remindersMatch?.[1]) {
    const token = remindersMatch[1];
    if (request.method === "GET") { try { const optedIn=await journey.reminderPreference(token, holderCookie(request)); response.writeHead(200,{"content-type":"text/html; charset=utf-8"}); response.end(remindersHtml(optedIn)); } catch { response.writeHead(403); response.end("Reminder preferences are unavailable"); } return; }
    if (request.method === "POST") { try { const values=await formValues(request); await journey.setReminderPreference(token,holderCookie(request),values.get("emailOptIn")==="yes"); response.writeHead(303,{location:`/b/${encodeURIComponent(token)}`}); response.end(); } catch { response.writeHead(403); response.end("Reminder preferences are unavailable"); } return; }
  }
  const saveStory = pathname.match(/^\/b\/([A-Za-z0-9_-]+)\/save-story$/);
  if (saveStory?.[1]) {
    const token=saveStory[1]; const profile=await journey.profilePage(token,holderCookie(request));
    if (profile.kind!=="ready") { response.writeHead(403); response.end("Story profile is unavailable"); return; }
    if (request.method === "GET") { response.writeHead(200,{"content-type":"text/html; charset=utf-8"}); response.end(saveStoryHtml()); return; }
    if (request.method === "POST") { try { const box=await repository.findByCardToken(token); if(!box) throw new Error(); const magic=await myStories.request(box.id,await formValue(request,"email")); const developmentLink=process.env.NODE_ENV === "production" ? "<p class=\"muted\">Check your email for a secure link.</p>" : `<p class="muted">Local preview link: <a href="/me/verify/${encodeURIComponent(magic)}">Open My Stories</a></p>`; response.writeHead(200,{"content-type":"text/html; charset=utf-8"}); response.end(saveStoryHtml(developmentLink)); } catch { response.writeHead(400); response.end("A valid email is required"); } return; }
  }
  const verifyStory=pathname.match(/^\/me\/verify\/([A-Za-z0-9_-]+)$/);
  if (verifyStory?.[1] && request.method === "GET") { const session=await myStories.verify(verifyStory[1]); if(!session){response.writeHead(404);response.end("This link is invalid or expired");return;} response.writeHead(303,{location:"/me","set-cookie":`stories_session=${session}; HttpOnly${secureCookie}; SameSite=Lax; Path=/me; Max-Age=7776000`});response.end();return; }
  if (pathname === "/me" && request.method === "GET") { const stories=await myStories.stories(cookieValue(request,"stories_session")); if(!stories){response.writeHead(403);response.end("Sign in from a saved story link");return;} response.writeHead(200,{"content-type":"text/html; charset=utf-8"});response.end(storiesHtml(stories));return; }
  const match = pathname.match(/^\/b\/([A-Za-z0-9_-]+)(?:\/(confirm|pass|decline))?$/);
  if (!match || !match[1]) { response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); response.end("Not found"); return; }
  const [, token, action] = match;
  if (request.method === "POST" && action === "confirm") {
    try {
      const { sessionToken } = await journey.confirm(token, holderCookie(request));
      response.writeHead(303, { location: `/b/${encodeURIComponent(token)}`, "set-cookie": `holder_session=${sessionToken}; HttpOnly${secureCookie}; SameSite=Lax; Path=/; Max-Age=2592000` });
      response.end();
    } catch {
      // Not delivered yet, already received on another device, or unknown: the box page explains each state.
      response.writeHead(303, { location: `/b/${encodeURIComponent(token)}` }); response.end();
    }
    return;
  }
  if (request.method === "POST" && action === "pass") {
    try {
      const { referralToken } = await passItForward.begin(token, holderCookie(request));
      response.writeHead(303, { location: "/checkout", "set-cookie": `checkout_referral=${referralToken}; HttpOnly; SameSite=Lax; Path=/checkout; Max-Age=2592000` }); response.end();
    } catch { response.writeHead(403, { "content-type": "text/plain; charset=utf-8" }); response.end("Only the confirmed holder can pass this box forward"); }
    return;
  }
  if (request.method === "POST" && action === "decline") {
    try { await passItForward.decline(token, holderCookie(request)); response.writeHead(303, { location: `/b/${encodeURIComponent(token)}` }); response.end(); }
    catch { response.writeHead(403, { "content-type": "text/plain; charset=utf-8" }); response.end("Only the confirmed holder can make this choice"); }
    return;
  }
  if (request.method === "GET" && !action) {
    const page = await journey.getPage(token, holderCookie(request));
    response.writeHead(page.kind === "not-found" ? 404 : 200, { "content-type": "text/html; charset=utf-8" }); response.end(pageHtml(page, token)); return;
  }
  response.writeHead(405, { allow: "GET, POST", "content-type": "text/plain; charset=utf-8" }); response.end("Method not allowed");
});

server.listen(port, () => console.log(`Gratitude Stories running at http://localhost:${port}`));
async function shutdown(signal: string): Promise<void> {
  console.info(JSON.stringify({ event: "shutdown", signal }));
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  server.close(async () => { clearTimeout(forceExit); if (postgresRepository) await postgresRepository.close(); process.exit(0); });
}
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
