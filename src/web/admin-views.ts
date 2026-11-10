import type { FulfilmentStatus } from "../domain/box.js";
import type { StaffUserSummary } from "../application/staff-operations.js";
import type { AuditEvent, BoxParticipantIntake, CollectionRecord, DeliveryDetails, DeliveryRecord, PackingRecord, PrintedCard, StaffBoxOverview } from "../application/staff-operations.js";
import { escapeHtml } from "./views.js";
import { helpCategoryLabels, type HelpRequestSummary, type StaffReminder } from "../application/support.js";

// Staff console pages. Every value from users or the database must pass through escapeHtml (alias `e`).
const e = (value: string | number | null | undefined) => escapeHtml(String(value ?? ""));

export interface ConsoleIdentity { actor: string; role: "admin" | "operations"; }
export interface Flash { notice?: string | null; error?: string | null; }

const statusLabels: Record<FulfilmentStatus, string> = { created: "Awaiting payment", paid: "Paid · to pack", packed: "Packed · awaiting courier", collected: "With courier", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded" };
const recipientLabels: Record<StaffBoxOverview["recipientStatus"], string> = { unknown: "Not opened", scanned: "Scanned", confirmed: "Received", registered: "Received · named", decided: "Received · decided" };
const when = (date: Date | null | undefined) => date ? new Date(date).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" }) : "—";
const pill = (status: FulfilmentStatus) => `<span class="pill ${status}">${e(statusLabels[status])}</span>`;
const boxHref = (boxNumber: string) => `/admin/boxes/${encodeURIComponent(boxNumber)}`;

function consoleLayout(title: string, identity: ConsoleIdentity | null, flash: Flash, content: string): string {
  const nav = identity ? `<nav><a href="/admin/boxes">Boxes</a><a href="/admin/help">Help</a>${identity.role === "admin" ? `<a href="/admin/reminders">Reminders</a>` : ""}<a href="/admin/cards">Cards</a>${identity.role === "admin" ? `<a href="/admin/staff">Staff</a>` : ""}<span class="who">${e(identity.actor)} · ${identity.role === "admin" ? "Administrator" : "Operations"}</span><form method="post" action="/admin/logout"><button class="link">Sign out</button></form></nav>` : "";
  const messages = `${flash.notice ? `<p class="flash ok" role="status">${e(flash.notice)}</p>` : ""}${flash.error ? `<p class="flash bad" role="alert">${e(flash.error)}</p>` : ""}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>${e(title)} · Gratitude Stories staff</title><style>
:root{--ink:#211a3d;--muted:#6d6681;--line:#e6e1ef;--plum:#5c3f92;--bg:#f6f4fa;--ok:#1d6b45;--bad:#8a1f2d}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 "Avenir Next",Inter,"Helvetica Neue",Arial,sans-serif}
header{background:#1e1639;color:#fff}header .bar{display:flex;align-items:center;gap:24px;max-width:1100px;margin:auto;padding:14px 24px}header .brand{font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:12px}header nav{display:flex;align-items:center;gap:18px;flex:1}header nav a{color:#ddd3f5;text-decoration:none;font-weight:600}header nav a:hover{color:#fff}header .who{margin-left:auto;color:#a99cc8;font-size:13px}
main{max-width:1100px;margin:auto;padding:28px 24px 60px}h1{margin:0 0 6px;font-size:28px;letter-spacing:-.02em}h2{margin:0 0 12px;font-size:17px}.sub{margin:0 0 22px;color:var(--muted)}
.panel{margin-bottom:18px;padding:20px 22px;border:1px solid var(--line);border-radius:14px;background:#fff}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.grid>.panel{margin:0}
table{width:100%;border-collapse:collapse}th,td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}tr:last-child td{border-bottom:0}td a{color:var(--plum);font-weight:700}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:0}dt{color:var(--muted)}dd{margin:0;font-weight:600}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;background:#eee9f5;color:#4a3d61;font-size:12px;font-weight:700;white-space:nowrap}.pill.paid{background:#fff3d6;color:#7a5200}.pill.packed,.pill.collected{background:#e3edff;color:#1f4a99}.pill.delivered{background:#e1f4ea;color:var(--ok)}.pill.cancelled,.pill.refunded{background:#fbe5e7;color:var(--bad)}
label{display:block;margin:12px 0 4px;color:#514766;font-size:13px;font-weight:700}input,select,textarea{width:100%;padding:9px 11px;border:1px solid #d8d1e6;border-radius:9px;background:#fff;color:var(--ink);font:inherit}textarea{min-height:70px}input:focus,select:focus,textarea:focus{outline:2px solid #c9b8f2;border-color:var(--plum)}
.check{display:flex;gap:9px;align-items:flex-start;font-weight:600}.check input{width:auto;margin-top:4px}.row{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
button{margin-top:14px;padding:10px 16px;border:0;border-radius:10px;background:var(--plum);color:#fff;font:700 14px/1.2 "Avenir Next",Inter,"Helvetica Neue",Arial,sans-serif;cursor:pointer}button.secondary{background:#eee9f5;color:#4a3d61}button.danger{background:var(--bad)}button.link{margin:0;padding:0;background:none;color:#ddd3f5;font-weight:600}
.inline{display:flex;gap:10px;align-items:flex-end}.inline>*{margin-top:0}.inline input{max-width:320px}
.flash{margin:0 0 18px;padding:12px 16px;border-radius:10px;font-weight:600}.flash.ok{background:#e1f4ea;color:var(--ok)}.flash.bad{background:#fbe5e7;color:var(--bad)}
.muted{color:var(--muted)}.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px}.next{border-color:#c9b8f2;box-shadow:0 0 0 3px #efe8fd}.empty{padding:26px;color:var(--muted);text-align:center}
.stats{display:flex;gap:12px;margin-bottom:18px}.stat{flex:1;padding:14px 18px;border:1px solid var(--line);border-radius:12px;background:#fff}.stat b{display:block;font-size:24px}
:focus-visible{outline:3px solid #c9b8f2;outline-offset:2px}details summary{cursor:pointer;color:var(--plum);font-weight:700}
@media(max-width:800px){.grid,.row{grid-template-columns:1fr}header .bar{flex-wrap:wrap}}
</style></head><body><header><div class="bar"><span class="brand">✦ Gratitude Stories · Staff</span>${nav}</div></header><main>${messages}${content}</main></body></html>`;
}

export function loginHtml(flash: Flash): string {
  return consoleLayout("Sign in", null, flash, `<div class="panel" style="max-width:460px;margin:40px auto"><h1>Staff sign in</h1><p class="sub">Paste the staff access token you were given. It is stored only as a secure cookie on this browser for 12 hours.</p><form method="post" action="/admin/login"><label for="token">Access token</label><input id="token" name="token" type="password" required autocomplete="current-password"><button>Sign in</button></form></div>`);
}

export function boxesHtml(identity: ConsoleIdentity, boxes: StaffBoxOverview[], query: string, flash: Flash): string {
  const rows = boxes.map((box) => `<tr><td><a href="${boxHref(box.boxNumber)}">${e(box.boxNumber)}</a></td><td class="mono">${e(box.trailCode)}</td><td>${box.depth === 0 ? "Starter" : `Gen ${box.depth + 1}`}${box.parentBoxNumber ? ` <span class="muted">from ${e(box.parentBoxNumber)}</span>` : ""}</td><td>${pill(box.fulfilmentStatus)}</td><td>${e(recipientLabels[box.recipientStatus])}</td><td class="mono">${e(box.cardCode ?? "—")}</td><td>${e(when(box.createdAt))}</td></tr>`).join("");
  const toPack = boxes.filter((box) => box.fulfilmentStatus === "paid").length, inTransit = boxes.filter((box) => box.fulfilmentStatus === "packed" || box.fulfilmentStatus === "collected").length, delivered = boxes.filter((box) => box.fulfilmentStatus === "delivered").length;
  const start = identity.role === "admin" ? `<form method="post" action="/admin/boxes"><button>Start a new trail</button></form>` : "";
  return consoleLayout("Boxes", identity, flash, `<div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>Boxes</h1><p class="sub">${query ? `Results for “${e(query)}”.` : "Most recent 50 boxes."} Contact details never appear here.</p></div>${start}</div>
${query ? "" : `<div class="stats"><div class="stat"><b>${toPack}</b>To pack</div><div class="stat"><b>${inTransit}</b>Packed or with courier</div><div class="stat"><b>${delivered}</b>Delivered</div></div>`}
<div class="panel"><form method="get" action="/admin/boxes" class="inline"><input name="query" value="${e(query)}" placeholder="Box number or trail code, e.g. GS-00012" aria-label="Search boxes" minlength="2"><button class="secondary">Search</button>${query ? `<a href="/admin/boxes">Clear</a>` : ""}</form></div>
<div class="panel">${boxes.length ? `<table><thead><tr><th>Box</th><th>Trail</th><th>Place</th><th>Fulfilment</th><th>Recipient</th><th>Card</th><th>Created</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">No boxes yet.${identity.role === "admin" ? " Start a new trail to create the first one." : ""}</p>`}</div>`);
}

export interface BoxDetail {
  overview: StaffBoxOverview; delivery: DeliveryDetails | null; intake: BoxParticipantIntake | null; packing: PackingRecord | null;
  collection: CollectionRecord | null; deliveryRecord: DeliveryRecord | null; audit: AuditEvent[]; availableCards: PrintedCard[];
  helpRequests: HelpRequestSummary[];
}

function nextStep(identity: ConsoleIdentity, detail: BoxDetail): string {
  const box = detail.overview; const action = (path: string) => `${boxHref(box.boxNumber)}/${path}`;
  switch (box.fulfilmentStatus) {
    case "created": return `<h2>Next: confirm payment</h2><p class="muted">A starter box is created unpaid. Mark it paid once the starter's payment has been received.</p><form method="post" action="${action("advance")}"><input type="hidden" name="status" value="paid"><button>Mark as paid</button></form>`;
    case "paid": {
      if (!box.cardCode) {
        const options = detail.availableCards.map((card) => `<option value="${e(card.cardCode)}">${e(card.cardCode)}</option>`).join("");
        return `<h2>Next: bind a printed card</h2><p class="muted">Take a card from stock, put it in the box, and select its code. The recipient scans this card to open the box.</p>${options ? `<form method="post" action="${action("card")}" class="inline"><select name="cardCode" required aria-label="Card code">${options}</select><button>Assign card</button></form>` : `<p class="flash bad">No printed cards in stock. <a href="/admin/cards">Issue a batch</a> first.</p>`}`;
      }
      return `<h2>Next: pack the box</h2><p class="muted">Card <b class="mono">${e(box.cardCode)}</b> is bound to this box.</p><form method="post" action="${action("pack")}"><label for="packedBy">Packed by</label><input id="packedBy" name="packedBy" required maxlength="80" value="${e(detail.packing?.packedBy)}">
<label class="check"><input type="checkbox" name="itemsChecked" value="yes" required> Gift items are complete and undamaged</label><label class="check"><input type="checkbox" name="noteChecked" value="yes" required> The giver's note (if any) is printed and inside</label><label class="check"><input type="checkbox" name="cardChecked" value="yes" required> Card <span class="mono">${e(box.cardCode)}</span> is inside the box</label>
<label for="packNotes">Notes or exceptions (optional)</label><textarea id="packNotes" name="notes" maxlength="1000">${e(detail.packing?.notes)}</textarea><button>Record packing and mark packed</button></form>`;
    }
    case "packed": return `<h2>Next: hand over to the courier</h2><form method="post" action="${action("collect")}"><div class="row"><div><label for="courier">Courier</label><input id="courier" name="courier" required maxlength="80" placeholder="e.g. GIG Logistics"></div><div><label for="handoff">Waybill or handoff reference (optional)</label><input id="handoff" name="handoffReference" maxlength="120"></div></div><button>Record handoff and mark with courier</button></form>`;
    case "collected": return `<h2>Next: confirm delivery</h2><p class="muted">Record proof from the courier. The recipient can then open the box by scanning its card.</p><form method="post" action="${action("deliver")}"><div class="row"><div><label for="deliveredBy">Delivered by</label><input id="deliveredBy" name="deliveredBy" required maxlength="80"></div><div><label for="proof">Proof of delivery reference</label><input id="proof" name="proofReference" required maxlength="200" placeholder="POD number, photo reference…"></div></div><button>Record proof and mark delivered</button></form>`;
    case "delivered": return `<h2>Delivered</h2><p class="muted">Fulfilment is complete. Recipient status: <b>${e(recipientLabels[box.recipientStatus])}</b>.</p>`;
    default: return `<h2>${e(statusLabels[box.fulfilmentStatus])}</h2><p class="muted">No further fulfilment steps.</p>`;
  }
}

export function boxDetailHtml(identity: ConsoleIdentity, detail: BoxDetail, flash: Flash): string {
  const box = detail.overview; const action = (path: string) => `${boxHref(box.boxNumber)}/${path}`; const admin = identity.role === "admin";
  const editable = !["delivered", "cancelled", "refunded"].includes(box.fulfilmentStatus);
  const d = detail.delivery;
  const deliveryPanel = `<div class="panel"><h2>Delivery details <span class="muted" style="font-weight:500">· private</span></h2>${d ? `<dl><dt>Deliver to</dt><dd>${d.deliveryTo === "giver" ? "The giver (hands it over)" : d.deliveryTo === "recipient" ? "The recipient directly" : "—"}</dd><dt>Contact</dt><dd>${e(d.contactName ?? "—")} · ${e(d.contactPhone ?? "—")}</dd><dt>Address</dt><dd>${e(d.addressLine1)}${d.addressLine2 ? `, ${e(d.addressLine2)}` : ""}<br>${e(d.city)}${d.region ? `, ${e(d.region)}` : ""}</dd><dt>Instructions</dt><dd>${e(d.deliveryNotes ?? "—")}</dd></dl>` : `<p class="muted">No delivery details yet.</p>`}
${editable ? `<details${d ? "" : " open"}><summary>${d ? "Edit" : "Add"} delivery details</summary><form method="post" action="${action("delivery")}"><div class="row"><div><label>Contact name</label><input name="contactName" maxlength="80" value="${e(d?.contactName)}"></div><div><label>Contact phone</label><input name="contactPhone" maxlength="30" type="tel" value="${e(d?.contactPhone)}"></div></div><label>Address</label><input name="addressLine1" required maxlength="160" value="${e(d?.addressLine1)}"><label>Address line 2</label><input name="addressLine2" maxlength="160" value="${e(d?.addressLine2)}"><div class="row"><div><label>City</label><input name="city" required maxlength="80" value="${e(d?.city)}"></div><div><label>Area or state</label><input name="region" maxlength="80" value="${e(d?.region)}"></div></div><label>Instructions</label><textarea name="deliveryNotes" maxlength="500">${e(d?.deliveryNotes)}</textarea><button class="secondary">Save delivery details</button></form></details>` : ""}</div>`;
  const i = detail.intake;
  const person = (prefix: string, label: string, p: BoxParticipantIntake["giver"] | undefined, consent: boolean) => `<fieldset style="border:0;padding:0;margin:0"><legend><b>${label}</b></legend><div class="row"><div><label>First name</label><input name="${prefix}FirstName" maxlength="40" value="${e(p?.firstName)}"></div><div><label>Last initial</label><input name="${prefix}LastInitial" maxlength="1" value="${e(p?.lastInitial)}"></div></div><label>Area</label><input name="${prefix}Area" maxlength="80" value="${e(p?.area)}"><div class="row"><div><label>Email</label><input name="${prefix}Email" type="email" maxlength="254" value="${e(p?.email)}"></div><div><label>Phone</label><input name="${prefix}Phone" type="tel" maxlength="30" value="${e(p?.phone)}"></div></div>${consent ? `<label class="check"><input type="checkbox" name="${prefix}DisplayConsent" value="yes"${p?.displayConsent ? " checked" : ""}> They agreed to appear on the trail by first name, initial and area</label>` : `<p class="muted">The recipient chooses their own trail display after receiving the box.</p>`}</fieldset>`;
  const participantsPanel = admin ? `<div class="panel"><h2>Participants <span class="muted" style="font-weight:500">· administrators only</span></h2>${i ? `<dl><dt>Giver</dt><dd>${e([i.giver.firstName, i.giver.lastInitial].filter(Boolean).join(" ") || "—")} · ${e(i.giver.email ?? i.giver.phone ?? "no contact")}</dd><dt>Recipient</dt><dd>${e([i.recipient.firstName, i.recipient.lastInitial].filter(Boolean).join(" ") || "—")} · ${e(i.recipient.email ?? i.recipient.phone ?? "no contact")}</dd><dt>Giver note</dt><dd>${e(i.giverNote ?? "—")}</dd></dl>` : `<p class="muted">No participant details recorded. Pass-forward boxes carry the giver's name and note from checkout.</p>`}
${editable ? `<details><summary>${i ? "Edit" : "Record"} participant details</summary><form method="post" action="${action("participants")}">${person("giver", "Giver", i?.giver, true)}<hr style="border:0;border-top:1px solid var(--line);margin:16px 0">${person("recipient", "Recipient", i?.recipient, false)}<label>Note from the giver</label><textarea name="giverNote" maxlength="2000">${e(i?.giverNote)}</textarea><button class="secondary">Save participant details</button></form></details>` : ""}</div>` : "";
  const records = `<div class="panel"><h2>Fulfilment record</h2><dl><dt>Created</dt><dd>${e(when(box.createdAt))}</dd><dt>Packed</dt><dd>${e(when(box.packedAt))}${detail.packing ? ` · by ${e(detail.packing.packedBy)}${detail.packing.notes ? ` · “${e(detail.packing.notes)}”` : ""}` : ""}</dd><dt>With courier</dt><dd>${e(when(box.collectedAt))}${detail.collection ? ` · ${e(detail.collection.courier)}${detail.collection.handoffReference ? ` (${e(detail.collection.handoffReference)})` : ""}` : ""}</dd><dt>Delivered</dt><dd>${e(when(box.deliveredAt))}${detail.deliveryRecord ? ` · ${e(detail.deliveryRecord.deliveredBy)}, proof ${e(detail.deliveryRecord.proofReference)}` : ""}</dd></dl></div>`;
  const cardPanel = `<div class="panel"><h2>Card</h2><dl><dt>Code</dt><dd class="mono">${e(box.cardCode ?? "None assigned")}</dd><dt>Status</dt><dd>${e(box.cardStatus ?? "—")}</dd></dl>${admin && box.cardCode && box.fulfilmentStatus === "paid" && detail.availableCards.length ? `<details><summary>Replace a lost or damaged card</summary><form method="post" action="${action("replace-card")}" class="inline" style="margin-top:10px"><select name="cardCode" required aria-label="Replacement card">${detail.availableCards.map((card) => `<option value="${e(card.cardCode)}">${e(card.cardCode)}</option>`).join("")}</select><button class="secondary">Replace and void old card</button></form></details>` : ""}</div>`;
  const received = box.fulfilmentStatus === "delivered" && ["confirmed", "registered", "decided"].includes(box.recipientStatus);
  const recovery = admin && received ? `<div class="panel"><details><summary>Recipient changed phones? Issue a recovery link</summary><p class="muted">Makes a new phone the holder of this box and signs out every other device. Only do this after confirming the person is the recipient, for example by calling the delivery phone number. The link works once and expires in 48 hours.</p><form method="post" action="${action("recovery-link")}"><label class="check"><input type="checkbox" name="verified" value="yes" required> I have confirmed this person is the box's recipient</label><button class="secondary">Issue recovery link</button></form></details></div>` : "";
  const erase = admin && ["delivered", "cancelled", "refunded"].includes(box.fulfilmentStatus) ? `<div class="panel"><details><summary>Erase someone's personal details</summary><p class="muted">For a “delete my details” request. Removes that person's name, contacts and (for the recipient) the delivery address, reminder and help contacts from this box. The trail keeps its shape and shows them as “A friend”. Payment records are kept. This cannot be undone.</p><form method="post" action="${action("erase")}"><label for="subject">Whose details</label><select id="subject" name="subject"><option value="recipient">The recipient of this box</option><option value="giver">The giver of this box</option></select><label class="check"><input type="checkbox" name="confirm" value="yes" required> I have verified the request and understand this cannot be undone</label><button class="danger">Erase details</button></form></details></div>` : "";
  const stop = admin && ["created", "paid", "packed"].includes(box.fulfilmentStatus) ? `<div class="panel"><details><summary>Cancel or refund this box</summary><form method="post" action="${action("advance")}"><label for="stopStatus">Outcome</label><select id="stopStatus" name="status"><option value="cancelled">Cancelled</option>${box.fulfilmentStatus !== "created" ? `<option value="refunded">Refunded</option>` : ""}</select><label class="check"><input type="checkbox" name="confirm" value="yes" required> I understand this cannot be undone and the recipient will see the box as inactive</label><button class="danger">Stop this box</button></form></details></div>` : "";
  const audit = detail.audit.length ? `<table><thead><tr><th>When</th><th>Change</th><th>By</th></tr></thead><tbody>${detail.audit.map((event) => `<tr><td>${e(when(event.occurredAt))}</td><td class="mono">${e(event.action)}${Object.keys(event.metadata).length ? ` ${e(JSON.stringify(event.metadata))}` : ""}</td><td>${e(event.actor)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No history yet.</p>`;
  return consoleLayout(box.boxNumber, identity, flash, `<p class="muted"><a href="/admin/boxes">← All boxes</a></p><h1>${e(box.boxNumber)} ${pill(box.fulfilmentStatus)}</h1>
<p class="sub">Trail <span class="mono">${e(box.trailCode)}</span> · ${box.depth === 0 ? "Starter box" : `Generation ${box.depth + 1}, passed on from <a href="${boxHref(box.parentBoxNumber ?? "")}">${e(box.parentBoxNumber)}</a>`} · Recipient: ${e(recipientLabels[box.recipientStatus])}</p>
<div class="panel next">${nextStep(identity, detail)}</div>
<div class="grid">${records}${cardPanel}</div><div style="height:18px"></div>${deliveryPanel}${detail.helpRequests.length ? `<div class="panel"><h2>Help requests</h2>${helpTable(detail.helpRequests, false)}</div>` : ""}${participantsPanel}${recovery}${erase}${stop}<div class="panel"><h2>History</h2>${audit}</div>`);
}

export function cardsHtml(identity: ConsoleIdentity, cards: PrintedCard[], flash: Flash): string {
  const count = (status: PrintedCard["status"]) => cards.filter((card) => card.status === status).length;
  const rows = cards.map((card) => `<tr><td class="mono">${e(card.cardCode)}</td><td>${e(card.status)}</td><td>${card.assignedBoxNumber ? `<a href="${boxHref(card.assignedBoxNumber)}">${e(card.assignedBoxNumber)}</a>` : "—"}</td><td>${e(when(card.assignedAt))}</td><td>${identity.role === "admin" && card.status === "available" ? `<form method="post" action="/admin/cards/${encodeURIComponent(card.cardCode)}/void"><button class="secondary" style="margin:0">Void</button></form>` : ""}</td></tr>`).join("");
  const issue = identity.role === "admin" ? `<div class="panel"><h2>Print a new batch</h2><p class="muted">Each card's QR code opens its box once the card is bound to a box. The printable sheet is shown <b>once</b>: the QR secrets are not stored, so print or save it as PDF immediately.</p><form method="post" action="/admin/cards" class="inline"><div><label for="quantity">How many cards</label><input id="quantity" name="quantity" type="number" min="1" max="100" value="12" required style="max-width:140px"></div><button>Issue and print</button></form></div>` : "";
  return consoleLayout("Cards", identity, flash, `<h1>Printed cards</h1><p class="sub">Card stock is printed in advance and bound to a box at packing.</p><div class="stats"><div class="stat"><b>${count("available")}</b>In stock</div><div class="stat"><b>${count("assigned")}</b>Bound to boxes</div><div class="stat"><b>${count("voided")}</b>Voided</div></div>${issue}<div class="panel">${cards.length ? `<table><thead><tr><th>Card</th><th>Status</th><th>Box</th><th>Bound</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">No cards yet.</p>`}</div>`);
}

export interface PrintableCard { cardCode: string; url: string; qrSvg: string; }

/** Shown exactly once, straight after issuing. The SVGs embed the raw card URLs, so this page must never be cached. */
export function printSheetHtml(identity: ConsoleIdentity, cards: PrintableCard[]): string {
  const sheet = cards.map((card) => `<article class="printcard"><div class="pc-brand">✦ Gratitude Stories</div><div class="qr">${card.qrSvg}</div><p class="pc-cta">Scan when your box arrives</p><p class="pc-code">${e(card.cardCode)}</p></article>`).join("");
  return consoleLayout("Print cards", identity, {}, `<style>
.sheet{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.printcard{display:flex;flex-direction:column;align-items:center;justify-content:center;height:88mm;padding:6mm;border:1px dashed #cfc6e0;background:#fff;text-align:center;break-inside:avoid}.pc-brand{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#5c3f92}.qr{width:42mm;height:42mm;margin:5mm 0 3mm}.qr svg{width:100%;height:100%}.pc-cta{margin:0;font-weight:700}.pc-code{margin:4px 0 0;font:12px ui-monospace,Menlo,monospace;color:#6d6681}
@media print{header,.noprint,.flash{display:none!important}body{background:#fff}main{max-width:none;padding:0}@page{size:A4;margin:8mm}}
</style><div class="noprint"><h1>Print ${cards.length} card${cards.length === 1 ? "" : "s"}</h1><p class="flash bad">Print this page now (or save it as PDF). It will not be shown again, and refreshing it would issue another batch.</p><p class="sub">Cut along the dashed lines. Each card opens a box only after it is bound to that box at packing. <a href="/admin/cards">Back to cards</a></p><p><b>Print with ⌘P (Mac) or Ctrl+P (Windows).</b> Choose A4, 100% scale, and turn off headers and footers.</p></div><div class="sheet">${sheet}</div>`);
}

function helpTable(requests: HelpRequestSummary[], showBox: boolean): string {
  return `<table><thead><tr>${showBox ? "<th>Box</th>" : ""}<th>Need</th><th>Message</th><th>Reply to</th><th>Received</th><th></th></tr></thead><tbody>${requests.map((request) => `<tr>${showBox ? `<td><a href="${boxHref(request.boxNumber)}">${e(request.boxNumber)}</a></td>` : ""}<td>${e(helpCategoryLabels[request.category])}</td><td>${e(request.message ?? "—")}</td><td>${e(request.contact ?? "—")}</td><td>${e(when(request.createdAt))}</td><td>${request.status === "open" ? `<form method="post" action="/admin/help/${encodeURIComponent(request.id)}/resolve"><button class="secondary" style="margin:0">Mark resolved</button></form>` : `<span class="muted">Resolved ${e(when(request.resolvedAt))} by ${e(request.resolvedBy)}</span>`}</td></tr>`).join("")}</tbody></table>`;
}

export function helpQueueHtml(identity: ConsoleIdentity, open: HelpRequestSummary[], resolved: HelpRequestSummary[], flash: Flash): string {
  return consoleLayout("Help", identity, flash, `<h1>Help requests</h1><p class="sub">From the “Not yet / I need help” page. Oldest first. Contact details here were volunteered for this request only.</p>
<div class="panel"><h2>Open (${open.length})</h2>${open.length ? helpTable(open, true) : `<p class="empty">Nothing waiting. 🎉</p>`}</div>
<div class="panel"><details><summary>Recently resolved (${resolved.length})</summary>${resolved.length ? helpTable(resolved, true) : `<p class="muted">None yet.</p>`}</details></div>`);
}

export interface PreparedReminder { id: string; message: string; link: string; }
export function remindersPageHtml(identity: ConsoleIdentity, reminders: StaffReminder[], now: Date, flash: Flash, prepared: PreparedReminder | null = null, automaticEmail = false): string {
  const channel = (reminder: StaffReminder) => reminder.channel === "email" ? "Email" : "Text message";
  // With an email provider connected, email reminders are sent automatically; staff only see the ones that failed 3 times.
  const automatic = (reminder: StaffReminder) => automaticEmail && reminder.channel === "email" && reminder.attempts < 3;
  const due = reminders.filter((reminder) => reminder.status === "scheduled" && reminder.sendAt <= now && !reminder.passedOn && !automatic(reminder));
  const sending = reminders.filter((reminder) => reminder.status === "scheduled" && reminder.sendAt <= now && !reminder.passedOn && automatic(reminder));
  const upcoming = reminders.filter((reminder) => reminder.status === "scheduled" && reminder.sendAt > now && !reminder.passedOn);
  const notNeeded = reminders.filter((reminder) => reminder.status === "scheduled" && reminder.passedOn);
  const done = reminders.filter((reminder) => reminder.status !== "scheduled");
  const outcome: Record<StaffReminder["status"], string> = { scheduled: "Scheduled", sent: "Sent · awaiting answer", accepted: "Said yes", declined: "Said no thanks" };
  const dueRows = due.map((reminder) => {
    const isPrepared = prepared?.id === reminder.id;
    const action = isPrepared
      ? `<label>Message to send (the link works once and is not stored)</label><textarea readonly rows="4">${e(prepared.message)}</textarea><form method="post" action="/admin/reminders/${encodeURIComponent(reminder.id)}/sent"><button>I've sent it, mark as sent</button></form>`
      : `<form method="post" action="/admin/reminders/${encodeURIComponent(reminder.id)}/prepare"><button class="secondary" style="margin:0">Prepare message</button></form>`;
    return `<tr${isPrepared ? ` class="next"` : ""}><td><a href="${boxHref(reminder.boxNumber)}">${e(reminder.boxNumber)}</a></td><td>${channel(reminder)}${reminder.channel === "email" && reminder.attempts >= 3 ? `<br><span class="pill cancelled">Automatic sending failed</span>` : ""}</td><td class="mono">${e(reminder.destination)}</td><td>${e(when(reminder.sendAt))}</td><td style="min-width:320px">${action}</td></tr>`;
  }).join("");
  const simple = (list: StaffReminder[], column: (reminder: StaffReminder) => string) => list.map((reminder) => `<tr><td><a href="${boxHref(reminder.boxNumber)}">${e(reminder.boxNumber)}</a></td><td>${channel(reminder)}</td><td>${e(when(reminder.sendAt))}</td><td>${column(reminder)}</td></tr>`).join("");
  return consoleLayout("Reminders", identity, flash, `<h1>Pass-forward reminders</h1><p class="sub">Recipients who tapped “Remind me in 24 hours”. ${automaticEmail ? "Email reminders are sent automatically. Send text-message reminders (and any email the system could not deliver) by hand" : "Until an email/SMS provider is connected, send each one by hand"}: prepare the message, send it from the team's account, then mark it sent. Each recipient gets one reminder only.</p>${sending.length ? `<p class="flash ok">${sending.length} email reminder${sending.length === 1 ? " is" : "s are"} being sent automatically.</p>` : ""}
<div class="panel"><h2>Due now (${due.length})</h2>${due.length ? `<table><thead><tr><th>Box</th><th>Channel</th><th>Send to</th><th>Due</th><th></th></tr></thead><tbody>${dueRows}</tbody></table>` : `<p class="empty">Nothing due.</p>`}</div>
<div class="panel"><h2>Coming up (${upcoming.length})</h2>${upcoming.length ? `<table><thead><tr><th>Box</th><th>Channel</th><th>Due</th><th></th></tr></thead><tbody>${simple(upcoming, () => "")}</tbody></table>` : `<p class="muted">None scheduled.</p>`}</div>
${notNeeded.length ? `<div class="panel"><h2>No longer needed (${notNeeded.length})</h2><p class="muted">These boxes were passed forward after the reminder was requested. Do not send.</p><table><tbody>${simple(notNeeded, () => "Already passed on")}</tbody></table></div>` : ""}
<div class="panel"><details><summary>Sent and answered (${done.length})</summary>${done.length ? `<table><thead><tr><th>Box</th><th>Channel</th><th>Due</th><th>Outcome</th></tr></thead><tbody>${simple(done, (reminder) => `${e(outcome[reminder.status])}${reminder.respondedAt ? ` · ${e(when(reminder.respondedAt))}` : ""}`)}</tbody></table>` : `<p class="muted">None yet.</p>`}</details></div>`);
}

/** Shown once: the link is not stored. */
export function recoveryLinkHtml(identity: ConsoleIdentity, boxNumber: string, link: string, expiresAt: Date): string {
  return consoleLayout("Recovery link", identity, { notice: "Recovery link issued. Send it to the recipient now; it will not be shown again." }, `<p class="muted"><a href="${boxHref(boxNumber)}">← Back to ${e(boxNumber)}</a></p><h1>Recovery link for ${e(boxNumber)}</h1><div class="panel next"><label>Send this to the recipient (WhatsApp, SMS or email)</label><textarea readonly rows="3">Open this link on your new phone to get back to your Gratitude Stories box, then scan its card again: ${e(link)}</textarea><p class="muted">Works once, until ${e(when(expiresAt))}. Using it signs out any other phone.</p></div>`);
}

const staffHref = (email: string) => `/admin/staff/${encodeURIComponent(email)}`;
export function staffHtml(identity: ConsoleIdentity, users: StaffUserSummary[], flash: Flash): string {
  const rows = users.map((user) => {
    const self = user.email === identity.actor;
    const actions = !user.active ? `<span class="muted">Revoked ${e(when(user.revokedAt))}</span>` : self ? `<span class="muted">This is you</span>` : `
<form method="post" action="${staffHref(user.email)}/role" class="inline" style="margin-bottom:8px"><select name="role" aria-label="Role for ${e(user.email)}"><option value="operations"${user.role === "operations" ? " selected" : ""}>Operations</option><option value="admin"${user.role === "admin" ? " selected" : ""}>Administrator</option></select><button class="secondary" style="margin:0">Change role</button></form>
<form method="post" action="${staffHref(user.email)}/rotate" style="display:inline"><button class="secondary" style="margin:0">New token</button></form>
<details style="display:inline-block;margin-left:10px"><summary>Revoke</summary><form method="post" action="${staffHref(user.email)}/revoke"><label class="check"><input type="checkbox" name="confirm" value="yes" required> Revoke access now</label><button class="danger">Revoke</button></form></details>`;
    return `<tr><td>${e(user.email)}</td><td>${user.role === "admin" ? "Administrator" : "Operations"}</td><td>${user.active ? "Active" : "Revoked"}</td><td>${e(when(user.createdAt))}</td><td>${actions}</td></tr>`;
  }).join("");
  const bootstrap = identity.actor === "staff-admin" || identity.actor === "staff-legacy"
    ? `<p class="flash ok">You are signed in with the bootstrap token. Create a named administrator account for yourself, sign in with it, then remove STAFF_ADMIN_TOKEN from the server settings.</p>` : "";
  return consoleLayout("Staff", identity, flash, `<h1>Staff accounts</h1><p class="sub">Each person gets their own token, so the history shows who did what. Operations staff run fulfilment and help; administrators also see contact details, start trails, issue cards and manage staff.</p>${bootstrap}
<div class="panel"><h2>Add a person</h2><form method="post" action="/admin/staff" class="inline"><div style="flex:1"><label for="email">Work email</label><input id="email" name="email" type="email" required maxlength="254" style="max-width:none"></div><div><label for="role">Role</label><select id="role" name="role"><option value="operations">Operations</option><option value="admin">Administrator</option></select></div><button>Create account</button></form></div>
<div class="panel">${users.length ? `<table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Added</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">No named staff accounts yet.</p>`}</div>`);
}

/** Shown once: tokens are stored only as hashes. */
export function staffTokenHtml(identity: ConsoleIdentity, email: string, token: string, rotated: boolean): string {
  return consoleLayout("Staff token", identity, { notice: rotated ? `New token issued for ${email}. Their old token stopped working.` : `Account created for ${email}.` }, `<p class="muted"><a href="/admin/staff">← Staff accounts</a></p><h1>Token for ${e(email)}</h1><div class="panel next"><label>Give this to them privately (e.g. in person or through a password manager). It will not be shown again.</label><input readonly value="${e(token)}" class="mono" aria-label="Access token"><p class="muted">They sign in at /admin/login by pasting it. If it is lost, issue a new one.</p></div>`);
}
