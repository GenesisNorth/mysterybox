import type { IncomingMessage, ServerResponse } from "node:http";
import QRCode from "qrcode";
import type { StaffOperations } from "../application/staff-operations.js";
import type { HelpDesk, HolderRecovery, PassForwardReminders } from "../application/support.js";
import type { DataRetention } from "../application/privacy.js";
import type { AnalyticsRepository } from "../application/analytics.js";
import { dashboardHtml } from "./admin-dashboard.js";
import { accountHtml, boxDetailHtml, boxesHtml, cardsHtml, choosePasswordHtml, forgotHtml, helpQueueHtml, loginHtml, printSheetHtml, recoveryLinkHtml, remindersPageHtml, setupHtml, staffHtml, staffPasswordLinkHtml, type BoxDetail, type ConsoleIdentity, type Flash } from "./admin-views.js";
import { PasswordError, SignInError, type StaffAccounts } from "../application/staff-accounts.js";
import type { EmailSender } from "../infrastructure/email.js";
import { cookieValue, formValues, isSameOrigin } from "./http.js";
import { setActor } from "../infrastructure/actor-context.js";

export type StaffIdentity = ConsoleIdentity;
export interface AdminDependencies {
  staffOperations: StaffOperations | null;
  helpDesk: HelpDesk;
  reminders: PassForwardReminders;
  recovery: HolderRecovery;
  retention: DataRetention | null;
  /** Aggregate numbers for the Overview page. */
  analytics: AnalyticsRepository | null;
  /** An email provider is connected, so email reminders are sent automatically. */
  automaticEmail: boolean;
  /** Email and password sign-in, sessions and one-time password links. */
  accounts: null | Pick<StaffAccounts, "signIn" | "identify" | "signOut" | "issuePasswordLink" | "passwordLink" | "completePasswordLink" | "changePassword" | "setupAvailable" | "setUpFirstAdministrator">;
  /** Sends invite and reset links by email when a provider is configured; otherwise links are shown to the administrator. */
  email: EmailSender | null;
  production: boolean;
  /** The public origin printed into QR codes, e.g. https://gratitude.ng. Required in production. */
  publicBaseUrl: string | undefined;
}

const cookieName = "staff_session";
const sessionSeconds = 12 * 60 * 60;

function html(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(body);
}
function redirect(response: ServerResponse, location: string, flash: Flash = {}, headers: Record<string, string> = {}): void {
  const url = new URL(location, "http://placeholder");
  if (flash.notice) url.searchParams.set("notice", flash.notice);
  if (flash.error) url.searchParams.set("error", flash.error);
  response.writeHead(303, { location: url.pathname + url.search, ...headers }); response.end();
}
const message = (error: unknown) => error instanceof Error ? error.message : "That action could not be completed";
async function orNull<T>(load: () => Promise<T>): Promise<T | null> { try { return await load(); } catch { return null; } }

/** Handles every /admin request. Returns false when the path is not an admin path. */
export async function handleAdmin(request: IncomingMessage, response: ServerResponse, deps: AdminDependencies): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://localhost");
  const path = url.pathname;
  if (path !== "/admin" && !path.startsWith("/admin/")) return false;
  const flash: Flash = { notice: url.searchParams.get("notice"), error: url.searchParams.get("error") };
  const secure = deps.production ? "; Secure" : "";

  // Cookie-authenticated forms: refuse any POST that did not come from one of our own pages.
  if (request.method === "POST" && !isSameOrigin(request)) { html(response, 403, loginHtml({ error: "This request did not come from the staff console. Please try again from the console." })); return true; }
  const staff = deps.staffOperations;
  if (!staff || !deps.accounts) { html(response, 503, loginHtml({ error: "The staff console needs the PostgreSQL database (DATABASE_URL) to be configured." })); return true; }

  const sessionCookie = (token: string) => `${cookieName}=${token}; HttpOnly${secure}; SameSite=Strict; Path=/admin; Max-Age=${sessionSeconds}`;
  const signedIn = (token: string) => redirect(response, "/admin", {}, { "set-cookie": sessionCookie(token) });
  const base = () => (deps.publicBaseUrl ?? (deps.production ? undefined : `http://${request.headers.host}`))?.replace(/\/$/, "");
  const accounts = deps.accounts;

  if (path === "/admin/login") {
    if (request.method === "GET") { html(response, 200, loginHtml(flash, { setup: await accounts.setupAvailable() })); return true; }
    if (request.method === "POST") {
      const values = await formValues(request); const email = values.get("email") ?? "";
      try { const { sessionToken } = await accounts.signIn(email, values.get("password") ?? ""); signedIn(sessionToken); }
      catch (error) { html(response, 401, loginHtml({ error: error instanceof SignInError ? error.message : "Sign-in failed. Please try again." }, { setup: await accounts.setupAvailable(), email })); }
      return true;
    }
  }
  if (path === "/admin/setup") {
    if (!await accounts.setupAvailable()) { redirect(response, "/admin/login", { notice: "Setup is complete. Sign in with your email and password." }); return true; }
    if (request.method === "GET") { html(response, 200, setupHtml(flash)); return true; }
    if (request.method === "POST") {
      const values = await formValues(request); const get = (name: string) => values.get(name) ?? "";
      try { const { sessionToken } = await accounts.setUpFirstAdministrator(get("code"), get("email"), get("password"), get("confirm")); signedIn(sessionToken); }
      catch (error) { html(response, 422, setupHtml({ error: error instanceof PasswordError ? error.message : "Setup failed. Please try again." }, { email: get("email") })); }
      return true;
    }
  }
  if (path === "/admin/forgot") {
    if (request.method === "GET") { html(response, 200, forgotHtml(flash, { emailEnabled: Boolean(deps.email) })); return true; }
    if (request.method === "POST") {
      const email = (await formValues(request)).get("email")?.trim().toLowerCase() ?? "";
      const origin = base();
      if (deps.email && origin && email) {
        // The same answer whether or not the email has an account, so the page cannot be used to discover staff emails.
        try {
          const token = await accounts.issuePasswordLink(email, "reset", "self-service");
          if (token) await deps.email.send({ to: email, subject: "Reset your Gratitude Stories staff password", text: `Someone asked to reset the password for this staff account.\n\nChoose a new password here (the link works once and expires in 24 hours):\n${origin}/admin/password/${token}\n\nIf it wasn't you, you can ignore this email. Your password has not changed.` });
        } catch { console.error(JSON.stringify({ event: "staff.reset_email.error" })); }
      }
      html(response, 200, forgotHtml({}, { emailEnabled: Boolean(deps.email), sent: Boolean(deps.email) })); return true;
    }
  }
  const passwordRoute = path.match(/^\/admin\/password\/([A-Za-z0-9_-]{20,})$/);
  if (passwordRoute?.[1]) {
    const token = passwordRoute[1];
    if (request.method === "GET") { const link = await accounts.passwordLink(token); html(response, link ? 200 : 410, choosePasswordHtml(flash, token, link)); return true; }
    if (request.method === "POST") {
      const values = await formValues(request);
      try { const { sessionToken } = await accounts.completePasswordLink(token, values.get("password") ?? "", values.get("confirm") ?? ""); signedIn(sessionToken); }
      catch (error) { html(response, 422, choosePasswordHtml({ error: error instanceof PasswordError ? error.message : "That didn't work. Please try again." }, token, await accounts.passwordLink(token))); }
      return true;
    }
  }
  if (path === "/admin/logout" && request.method === "POST") {
    await accounts.signOut(cookieValue(request, cookieName));
    redirect(response, "/admin/login", { notice: "Signed out." }, { "set-cookie": `${cookieName}=; HttpOnly${secure}; SameSite=Strict; Path=/admin; Max-Age=0` });
    return true;
  }

  const session = cookieValue(request, cookieName);
  const identity = await accounts.identify(session);
  if (!identity) { redirect(response, "/admin/login", session ? { error: "Your session has ended. Please sign in again." } : {}); return true; }
  setActor(identity.actor);
  const admin = identity.role === "admin";
  const requireAdmin = () => { if (!admin) throw new Error("Only an administrator can do that"); };

  if (path === "/admin/account" && request.method === "GET") { html(response, 200, accountHtml(identity, flash)); return true; }
  if (path === "/admin/account/password" && request.method === "POST") {
    const values = await formValues(request);
    try { await accounts.changePassword(session!, values.get("current") ?? "", values.get("password") ?? "", values.get("confirm") ?? ""); redirect(response, "/admin/account", { notice: "Password changed. Your other devices were signed out." }); }
    catch (error) { redirect(response, "/admin/account", { error: error instanceof PasswordError ? error.message : "Your password could not be changed." }); }
    return true;
  }

  if ((path === "/admin" || path === "/admin/") && request.method === "GET") {
    html(response, 200, dashboardHtml(identity, deps.analytics ? await orNull(() => deps.analytics!.dashboardAnalytics()) : null, flash)); return true;
  }

  if (path === "/admin/boxes") {
    if (request.method === "GET") {
      const query = url.searchParams.get("query")?.trim() ?? "";
      try { html(response, 200, boxesHtml(identity, query ? await staff.searchBoxes(query) : await staff.recentBoxes(), query, flash)); }
      catch (error) { html(response, 200, boxesHtml(identity, await staff.recentBoxes(), "", { error: message(error) })); }
      return true;
    }
    if (request.method === "POST") {
      try { requireAdmin(); const starter = await staff.createStarterBox(); redirect(response, `/admin/boxes/${encodeURIComponent(starter.boxNumber)}`, { notice: `Started trail ${starter.trailCode} with box ${starter.boxNumber}.` }); }
      catch (error) { redirect(response, "/admin/boxes", { error: message(error) }); }
      return true;
    }
  }

  const boxRoute = path.match(/^\/admin\/boxes\/([^/]+)(?:\/(advance|card|replace-card|pack|collect|deliver|delivery|participants|recovery-link|erase))?$/);
  if (boxRoute?.[1]) {
    const boxNumber = decodeURIComponent(boxRoute[1]); const action = boxRoute[2];
    const back = `/admin/boxes/${encodeURIComponent(boxNumber)}`;
    if (request.method === "GET" && !action) {
      const overview = await orNull(() => staff.boxOverview(boxNumber));
      if (!overview) { html(response, 404, boxesHtml(identity, await staff.recentBoxes(), "", { error: `Box ${boxNumber} was not found.` })); return true; }
      const detail: BoxDetail = {
        overview,
        delivery: await orNull(() => staff.deliveryDetails(boxNumber)),
        intake: admin ? await orNull(() => staff.participantIntake(boxNumber)) : null,
        packing: await orNull(() => staff.packingRecord(boxNumber)),
        collection: await orNull(() => staff.collectionRecord(boxNumber)),
        deliveryRecord: await orNull(() => staff.deliveryRecord(boxNumber)),
        audit: await staff.auditHistory(boxNumber),
        availableCards: overview.fulfilmentStatus === "paid" ? await staff.inventory("available") : [],
        helpRequests: await deps.helpDesk.requestsForBox(boxNumber)
      };
      html(response, 200, boxDetailHtml(identity, detail, flash)); return true;
    }
    if (request.method === "POST" && action === "erase") {
      try {
        requireAdmin();
        if (!deps.retention) throw new Error("Erasure needs the database");
        const values = await formValues(request);
        if (values.get("confirm") !== "yes") throw new Error("Tick the box to confirm the erasure");
        await deps.retention.erase(boxNumber, values.get("subject") ?? "", identity.actor);
        redirect(response, back, { notice: `The ${values.get("subject")}'s personal details were erased from this box.` });
      } catch (error) { redirect(response, back, { error: message(error) }); }
      return true;
    }
    if (request.method === "POST" && action === "recovery-link") {
      try {
        requireAdmin();
        if ((await formValues(request)).get("verified") !== "yes") throw new Error("Confirm you have verified the recipient first");
        const base = deps.publicBaseUrl ?? (deps.production ? undefined : `http://${request.headers.host}`);
        if (!base) throw new Error("Set PUBLIC_BASE_URL before issuing recovery links");
        const { link, expiresAt } = await deps.recovery.issue(boxNumber, identity.actor, base);
        html(response, 201, recoveryLinkHtml(identity, boxNumber, link, expiresAt));
      } catch (error) { redirect(response, back, { error: message(error) }); }
      return true;
    }
    if (request.method === "POST" && action) {
      try {
        const v = await formValues(request, 20_000); const get = (name: string) => v.get(name) ?? "";
        let notice = "Saved.";
        switch (action) {
          case "advance": {
            const status = get("status");
            if (status === "paid") { await staff.advanceFulfilment(boxNumber, "paid"); notice = "Marked as paid. Next, bind a printed card."; break; }
            if (status !== "cancelled" && status !== "refunded") throw new Error("That status change is not available here");
            requireAdmin(); if (get("confirm") !== "yes") throw new Error("Tick the confirmation box to stop this box");
            await staff.advanceFulfilment(boxNumber, status); notice = `Box ${status}.`; break;
          }
          case "card": await staff.assignCard(boxNumber, get("cardCode")); notice = `Card ${get("cardCode")} bound to this box. Next, pack it.`; break;
          case "replace-card": requireAdmin(); await staff.replaceCard(boxNumber, get("cardCode")); notice = `Replaced with card ${get("cardCode")}; the old card is void.`; break;
          case "pack":
            await staff.recordPacking(boxNumber, { packedBy: get("packedBy"), checklistComplete: ["itemsChecked", "noteChecked", "cardChecked"].every((name) => get(name) === "yes"), notes: v.get("notes") ?? null });
            await staff.advanceFulfilment(boxNumber, "packed"); notice = "Packed. Next, hand it to the courier."; break;
          case "collect":
            await staff.recordCollection(boxNumber, { courier: get("courier"), handoffReference: v.get("handoffReference") ?? null });
            await staff.advanceFulfilment(boxNumber, "collected"); notice = "With the courier. Record delivery proof when it arrives."; break;
          case "deliver":
            await staff.recordDelivery(boxNumber, { deliveredBy: get("deliveredBy"), proofReference: get("proofReference") });
            await staff.advanceFulfilment(boxNumber, "delivered"); notice = "Delivered. The recipient can now open the box."; break;
          case "delivery":
            await staff.recordDeliveryDetails(boxNumber, { addressLine1: get("addressLine1"), addressLine2: v.get("addressLine2") ?? null, city: get("city"), region: v.get("region") ?? null, deliveryNotes: v.get("deliveryNotes") ?? null, contactName: v.get("contactName") ?? null, contactPhone: v.get("contactPhone") ?? null });
            notice = "Delivery details saved."; break;
          case "participants": {
            requireAdmin();
            const person = (prefix: string, recipient: boolean) => ({ firstName: v.get(`${prefix}FirstName`) ?? null, lastInitial: v.get(`${prefix}LastInitial`) ?? null, area: v.get(`${prefix}Area`) ?? null, email: v.get(`${prefix}Email`) ?? null, phone: v.get(`${prefix}Phone`) ?? null, displayConsent: !recipient && get(`${prefix}DisplayConsent`) === "yes" });
            await staff.recordParticipantIntake(boxNumber, { giver: person("giver", false), recipient: person("recipient", true), giverNote: v.get("giverNote") ?? null });
            notice = "Participant details saved."; break;
          }
        }
        redirect(response, back, { notice });
      } catch (error) { redirect(response, back, { error: message(error) }); }
      return true;
    }
  }

  if (path === "/admin/cards") {
    if (request.method === "GET") { html(response, 200, cardsHtml(identity, await staff.inventory(), flash)); return true; }
    if (request.method === "POST") {
      try {
        requireAdmin();
        const base = deps.publicBaseUrl ?? (deps.production ? undefined : `http://${request.headers.host}`);
        if (!base) throw new Error("Set PUBLIC_BASE_URL to the domain printed on cards before issuing them");
        const quantity = Number((await formValues(request)).get("quantity"));
        const issued = await staff.issueCards(quantity);
        const cards = await Promise.all(issued.map(async (card) => {
          const cardUrl = `${base.replace(/\/$/, "")}/b/${encodeURIComponent(card.cardToken)}`;
          return { cardCode: card.cardCode, url: cardUrl, qrSvg: await QRCode.toString(cardUrl, { type: "svg", errorCorrectionLevel: "M", margin: 1 }) };
        }));
        html(response, 201, printSheetHtml(identity, cards, !deps.production));
      } catch (error) { redirect(response, "/admin/cards", { error: message(error) }); }
      return true;
    }
  }

  if (path === "/admin/help" && request.method === "GET") {
    html(response, 200, helpQueueHtml(identity, await deps.helpDesk.openRequests(), await deps.helpDesk.resolvedRequests(), flash)); return true;
  }
  const resolveRoute = path.match(/^\/admin\/help\/([0-9a-f-]{36})\/resolve$/);
  if (resolveRoute?.[1] && request.method === "POST") {
    try { await deps.helpDesk.resolve(resolveRoute[1], identity.actor); redirect(response, "/admin/help", { notice: "Marked resolved." }); }
    catch (error) { redirect(response, "/admin/help", { error: message(error) }); }
    return true;
  }

  // Reminder destinations are contact details, so this page is administrator-only.
  if (path === "/admin/reminders" || path.startsWith("/admin/reminders/")) {
    if (!admin) { html(response, 403, boxesHtml(identity, [], "", { error: "Only an administrator can see reminder contact details." })); return true; }
    if (path === "/admin/reminders" && request.method === "GET") { html(response, 200, remindersPageHtml(identity, await deps.reminders.list(), new Date(), flash, null, deps.automaticEmail)); return true; }
    const reminderRoute = path.match(/^\/admin\/reminders\/([0-9a-f-]{36})\/(prepare|sent)$/);
    if (reminderRoute?.[1] && request.method === "POST") {
      const [, id, step] = reminderRoute;
      try {
        if (step === "sent") { await deps.reminders.markSent(id); redirect(response, "/admin/reminders", { notice: "Marked as sent. No further reminders will go to this recipient." }); return true; }
        const base = deps.publicBaseUrl ?? (deps.production ? undefined : `http://${request.headers.host}`);
        if (!base) throw new Error("Set PUBLIC_BASE_URL before sending reminders");
        const prepared = await deps.reminders.prepare(id, base);
        html(response, 200, remindersPageHtml(identity, await deps.reminders.list(), new Date(), { notice: "Message prepared. Copy it, send it, then mark it sent. Preparing again replaces the link." }, { id, ...prepared }, deps.automaticEmail));
      } catch (error) { redirect(response, "/admin/reminders", { error: message(error) }); }
      return true;
    }
  }


  /** Issues an invite or reset link, emails it when possible, and shows it once to the administrator. */
  const passwordLinkPage = async (email: string, purpose: "invite" | "reset") => {
    const origin = base();
    if (!origin) throw new Error("Set PUBLIC_BASE_URL before creating password links");
    const token = await accounts.issuePasswordLink(email, purpose, identity.actor);
    if (!token) throw new Error("Active staff account not found");
    const link = `${origin}/admin/password/${token}`;
    let emailed = false;
    if (deps.email) {
      try {
        await deps.email.send({ to: email, subject: purpose === "invite" ? "You're invited to the Gratitude Stories staff console" : "Reset your Gratitude Stories staff password", text: purpose === "invite"
          ? `${identity.actor} invited you to the Gratitude Stories staff console.\n\nChoose your password here (the link works once and expires in 3 days):\n${link}`
          : `${identity.actor} created a password reset link for your staff account.\n\nChoose a new password here (the link works once and expires in 24 hours):\n${link}` });
        emailed = true;
      } catch { console.error(JSON.stringify({ event: "staff.password_link_email.error" })); }
    }
    return staffPasswordLinkHtml(identity, email, link, purpose, emailed);
  };
  // Staff accounts: administrators only. Nobody can revoke or demote their own account from here.
  if (path === "/admin/staff" || path.startsWith("/admin/staff/")) {
    if (!admin) { html(response, 403, boxesHtml(identity, [], "", { error: "Only an administrator can manage staff accounts." })); return true; }
    if (path === "/admin/staff" && request.method === "GET") { html(response, 200, staffHtml(identity, await staff.staffUsers(), flash)); return true; }
    if (path === "/admin/staff" && request.method === "POST") {
      try {
        const values = await formValues(request); const role = values.get("role");
        if (role !== "admin" && role !== "operations") throw new Error("Choose a role");
        const created = await staff.provisionStaffUser(values.get("email") ?? "", role);
        html(response, 201, await passwordLinkPage(created.email, "invite"));
      } catch (error) { redirect(response, "/admin/staff", { error: /duplicate|unique/i.test(message(error)) ? "That email already has an account." : message(error) }); }
      return true;
    }
    const staffRoute = path.match(/^\/admin\/staff\/([^/]+)\/(password-link|role|revoke)$/);
    if (staffRoute?.[1] && request.method === "POST") {
      const email = decodeURIComponent(staffRoute[1]).trim().toLowerCase(); const step = staffRoute[2];
      try {
        if (email === identity.actor) throw new Error("You cannot change your own account here; ask another administrator.");
        const values = await formValues(request);
        if (step === "password-link") { const users = await staff.staffUsers(); const user = users.find((candidate) => candidate.email === email && candidate.active); if (!user) throw new Error("Active staff account not found"); html(response, 200, await passwordLinkPage(email, user.passwordSet ? "reset" : "invite")); return true; }
        if (step === "role") { const role = values.get("role"); if (role !== "admin" && role !== "operations") throw new Error("Choose a role"); await staff.changeStaffRole(email, role); redirect(response, "/admin/staff", { notice: `${email} is now ${role === "admin" ? "an administrator" : "operations staff"}.` }); return true; }
        if (values.get("confirm") !== "yes") throw new Error("Tick the box to confirm revoking access");
        await staff.revokeStaffUser(email); redirect(response, "/admin/staff", { notice: `Access revoked for ${email}.` });
      } catch (error) { redirect(response, "/admin/staff", { error: message(error) }); }
      return true;
    }
  }

  const voidRoute = path.match(/^\/admin\/cards\/(GS-CARD-[A-Z0-9]+)\/void$/);
  if (voidRoute?.[1] && request.method === "POST") {
    try { requireAdmin(); await staff.voidCard(voidRoute[1]); redirect(response, "/admin/cards", { notice: `Card ${voidRoute[1]} voided.` }); }
    catch (error) { redirect(response, "/admin/cards", { error: message(error) }); }
    return true;
  }

  html(response, 404, boxesHtml(identity, [], "", { error: "That staff page does not exist." }));
  return true;
}
