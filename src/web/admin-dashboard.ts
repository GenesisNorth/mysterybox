import type { DashboardAnalytics } from "../application/analytics.js";
import type { FulfilmentStatus } from "../domain/box.js";
import { escapeHtml } from "./views.js";
import { consoleLayout, icon, type ConsoleIdentity, type Flash, type IconName } from "./admin-layout.js";

// The Overview page. Every chart is plain HTML/CSS (no client scripts under the console's CSP);
// hover or keyboard focus on a bar shows its exact value, and each chart has a table view.
const e = (value: string | number | null | undefined) => escapeHtml(String(value ?? ""));
const lagos = { timeZone: "Africa/Lagos" } as const;
const count = (value: number) => value.toLocaleString("en-NG");
const percent = (part: number, whole: number) => whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
const naira = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
const duration = (hours: number | null) => hours === null ? "—" : hours < 48 ? `${Math.round(hours)} h` : `${(hours / 24).toFixed(1)} days`;
const shortDate = (date: Date) => new Date(date).toLocaleDateString("en-NG", { ...lagos, day: "numeric", month: "short" });
const ago = (date: Date, now: Date) => {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(date).getTime()) / 60000));
  if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60); if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
};

const pipelineLabels: [FulfilmentStatus, string][] = [["created", "Awaiting payment"], ["paid", "To pack"], ["packed", "Awaiting courier"], ["collected", "With courier"], ["delivered", "Delivered"], ["cancelled", "Cancelled"], ["refunded", "Refunded"]];

const activityLabels: Record<string, string> = {
  "boxes.insert": "Started a box", "boxes.update": "Updated a box", "box_cards.insert": "Issued a card", "box_cards.update": "Changed a card",
  "packing_records.insert": "Recorded packing", "packing_records.update": "Updated packing", "collection_records.insert": "Handed to courier", "collection_records.update": "Updated courier handoff",
  "delivery_records.insert": "Confirmed delivery", "delivery_records.update": "Updated delivery proof", "delivery_details.insert": "Added delivery details", "delivery_details.update": "Edited delivery details",
  "participants.insert": "Recorded participants", "participants.update": "Edited participants", "help_requests.update": "Resolved a help request", "pass_forward_reminders.update": "Sent a reminder",
  "holder_recovery_links.insert": "Issued a recovery link", "personal_data.erase": "Erased personal details", "staff_users.insert": "Added a staff member", "staff_users.update": "Changed a staff account"
};
const activityLabel = (action: string) => activityLabels[action] ?? action.replace(/[._]/g, " ");

type Tone = "good" | "warning" | "critical";
function alertCard(href: string, value: number, label: string, tone: Tone, note: string, glyph: IconName): string {
  return `<a class="alert ${tone}" href="${href}"><span class="badge">${icon(glyph)}</span><span><b>${count(value)}</b><span>${e(label)}</span><em>${icon(tone === "good" ? "check" : "alert")}${e(note)}</em></span></a>`;
}

function columnChart(points: { label: string; value: number; tip: string }[]): string {
  const max = Math.max(1, ...points.map((point) => point.value));
  const peak = points.reduce((best, point, index) => point.value > (points[best]?.value ?? -1) ? index : best, 0);
  const cols = points.map((point, index) => {
    const height = `${(point.value / max) * 100}%`;
    // Direct labels only on the peak and the latest week; every bar reveals its value on hover or focus.
    const label = point.value > 0 && (index === peak || index === points.length - 1) ? `<span class="lbl">${count(point.value)}</span>` : "";
    return `<div class="col${point.value === 0 ? " zero" : ""}" style="--h:${height}" tabindex="0" aria-label="${e(point.tip)}">${label}<span class="tip" aria-hidden="true">${e(point.tip)}</span><i></i></div>`;
  }).join("");
  const axis = points.map((point, index) => `<span>${index % 2 === points.length % 2 ? "" : e(point.label)}</span>`).join("");
  return `<div class="cols" role="img" aria-label="Column chart; values are in the table below">${cols}</div><div class="xaxis" aria-hidden="true">${axis}</div>`;
}

function barList(rows: { name: string; value: number; note?: string; quiet?: boolean }[], scaleTo?: number): string {
  const max = Math.max(1, scaleTo ?? Math.max(...rows.map((row) => row.value)));
  return `<div class="hbars">${rows.map((row) => `<div class="hbar${row.quiet ? " quiet" : ""}" title="${e(`${row.name}: ${count(row.value)}${row.note ? ` (${row.note})` : ""}`)}"><span class="name">${e(row.name)}</span><span class="track"><span class="fill" style="--w:${(row.value / max) * 100}%;display:block"></span></span><span class="val">${count(row.value)}${row.note ? `<small>${e(row.note)}</small>` : ""}</span></div>`).join("")}</div>`;
}

const tableView = (headers: string[], rows: (string | number)[][]) =>
  `<details class="table"><summary>Show as table</summary><table><thead><tr>${headers.map((header) => `<th>${e(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${e(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;

export function dashboardHtml(identity: ConsoleIdentity, data: DashboardAnalytics | null, flash: Flash): string {
  if (!data) return consoleLayout("Overview", identity, flash, `<h1>Overview</h1><div class="panel"><p class="empty">The numbers could not be loaded right now. The rest of the console still works; try again in a minute.</p></div>`);
  const now = data.generatedAt; const admin = identity.role === "admin";
  const { totals, attention, journey } = data;

  const helpNote = attention.openHelp === 0 ? "All clear" : attention.oldestHelpAt ? `Oldest waiting ${ago(attention.oldestHelpAt, now)}` : "Needs a reply";
  const alerts = [
    alertCard("/admin/boxes", attention.overdueToPack, "Paid boxes waiting over a day", attention.overdueToPack ? "critical" : "good", attention.overdueToPack ? "Pack these today" : "All clear", "boxes"),
    alertCard("/admin/help", attention.openHelp, "Open help requests", attention.openHelp ? (attention.oldestHelpAt && now.getTime() - new Date(attention.oldestHelpAt).getTime() > 86_400_000 ? "critical" : "warning") : "good", helpNote, "help"),
    admin ? alertCard("/admin/reminders", attention.remindersDue, "Reminders due to send", attention.remindersDue ? "warning" : "good", attention.remindersDue ? "Send from the team phone" : "All clear", "reminders") : "",
    alertCard("/admin/cards", attention.cardsInStock, "Printed cards in stock", attention.cardsInStock < 5 ? "critical" : attention.cardsInStock < 15 ? "warning" : "good", attention.cardsInStock < 15 ? "Print a new batch soon" : "Stock is healthy", "cards")
  ].join("");

  const stats = [
    [count(totals.boxes), "Boxes", `${count(totals.delivered)} delivered`],
    [percent(totals.passedOn, totals.delivered), "Pass-forward rate", `${count(totals.passedOn)} boxes passed on`],
    [count(totals.activeTrails), "Active trails", `of ${count(totals.trails)} · new box in 30 days`],
    [count(totals.longestTrail), "Longest trail", "generations so far"],
    [duration(totals.medianFulfilmentHours), "Paid → delivered", "median, last 90 days"],
    [naira(totals.revenueKobo), "Pass-forward sales", "paid online checkouts"]
  ].map(([value, label, note]) => `<div class="stat"><b>${value}</b>${label}<small>${note}</small></div>`).join("");

  const weeklyTotal = data.weekly.reduce((sum, week) => sum + week.created, 0);
  const weekly = data.weekly.map((week) => ({ label: shortDate(week.weekStart), value: week.created, tip: `Week of ${shortDate(week.weekStart)}: ${count(week.created)} created, ${count(week.delivered)} delivered` }));
  const weeklyPanel = `<div class="panel"><div class="head"><h2>New boxes per week</h2><small>${count(weeklyTotal)} in the last 12 weeks</small></div>${columnChart(weekly)}${tableView(["Week of", "Created", "Delivered"], data.weekly.map((week) => [shortDate(week.weekStart), week.created, week.delivered]))}</div>`;

  const pipelineRows = pipelineLabels.map(([status, name]) => ({ name, value: data.pipeline[status], quiet: status === "cancelled" || status === "refunded" }));
  const pipelinePanel = `<div class="panel"><div class="head"><h2>Where every box is</h2><small>${count(totals.boxes)} boxes</small></div>${barList(pipelineRows)}</div>`;

  const journeyRows = [
    { name: "Delivered", value: journey.delivered, note: "100%" },
    { name: "Card scanned", value: journey.opened, note: percent(journey.opened, journey.delivered) },
    { name: "Said “I have it”", value: journey.received, note: percent(journey.received, journey.delivered) },
    { name: "Made a choice", value: journey.decided, note: percent(journey.decided, journey.delivered) },
    { name: "Passed it on", value: journey.passedOn, note: percent(journey.passedOn, journey.delivered) }
  ];
  const journeyPanel = `<div class="panel"><div class="head"><h2>Recipient journey</h2><small>delivered boxes</small></div>${journey.delivered ? barList(journeyRows, journey.delivered) : `<p class="empty">No delivered boxes yet.</p>`}</div>`;

  const generationRows = data.generations.map((row) => ({ name: row.generation === 1 ? "Starter boxes" : `Generation ${row.generation}`, value: row.boxes }));
  const generationPanel = `<div class="panel"><div class="head"><h2>How far trails reach</h2><small>boxes per generation</small></div>${generationRows.length ? barList(generationRows) : `<p class="empty">No boxes yet.</p>`}</div>`;

  const feed = data.recentActivity.length
    ? `<ul class="feed">${data.recentActivity.map((event) => `<li><span class="dot" aria-hidden="true"></span><span class="what"><b>${e(activityLabel(event.action))}</b>${event.boxNumber ? ` · <a href="/admin/boxes/${encodeURIComponent(event.boxNumber)}">${e(event.boxNumber)}</a>` : ""}<small>${e(event.actor)}</small></span><time datetime="${new Date(event.occurredAt).toISOString()}">${e(ago(event.occurredAt, now))}</time></li>`).join("")}</ul>`
    : `<p class="empty">No staff activity yet.</p>`;
  const activityPanel = `<div class="panel"><div class="head"><h2>Recent staff activity</h2><small>latest 10</small></div>${feed}</div>`;

  const start = admin ? `<form method="post" action="/admin/boxes"><button>Start a new trail</button></form>` : "";
  const updated = now.toLocaleTimeString("en-NG", { ...lagos, hour: "numeric", minute: "2-digit" });
  return consoleLayout("Overview", identity, flash, `<div class="pagehead"><div><h1>Overview</h1><p class="sub">Live from the database · updated ${e(updated)} Lagos time · no personal details on this page</p></div>${start}</div>
<div class="attention">${alerts}</div>
<div class="stats">${stats}</div>
<div class="charts">${weeklyPanel}${pipelinePanel}</div>
<div class="charts">${journeyPanel}${generationPanel}</div>
${activityPanel}`);
}
