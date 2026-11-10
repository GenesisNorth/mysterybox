import { escapeHtml } from "./views.js";

// The staff console shell: a sidebar for navigation, a top bar with box search, and the page content.
const e = (value: string | number | null | undefined) => escapeHtml(String(value ?? ""));

export interface ConsoleIdentity { actor: string; role: "admin" | "operations"; }
export interface Flash { notice?: string | null; error?: string | null; }

type Section = "overview" | "boxes" | "cards" | "help" | "reminders" | "staff";
const sectionByTitle: Record<string, Section> = { Overview: "overview", Cards: "cards", "Print cards": "cards", Help: "help", Reminders: "reminders", Staff: "staff", "Staff token": "staff" };
const sectionNames: Record<Section, string> = { overview: "Overview", boxes: "Boxes", cards: "Cards", help: "Help requests", reminders: "Reminders", staff: "Staff" };

// Small stroke icons on a 24px grid, inline so the console needs no extra requests.
const iconPaths = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  boxes: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  cards: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h4v4H7zM14 10h3M14 14h3"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5h.01"/>',
  reminders: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 20.5a2 2 0 0 0 4 0"/>',
  staff: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  alert: '<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16 10"/>'
} as const;
export type IconName = keyof typeof iconPaths;
export const icon = (name: IconName) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]}</svg>`;

const styles = `
:root{--ink:#211a3d;--muted:#6d6681;--line:#e8e4f0;--plum:#5c3f92;--plum-2:#7a5bb5;--plum-soft:#efe9fa;--bg:#f5f3f9;--ok:#1d6b45;--warn:#7a5200;--bad:#8a1f2d;--side:#1b1433;--side-2:#2a2050;--side-ink:#cfc4ea;--radius:14px;--font:"Avenir Next",Inter,"Helvetica Neue",Arial,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--font)}a{color:var(--plum)}
.ico{width:18px;height:18px;flex:none}
.shell{display:grid;grid-template-columns:248px minmax(0,1fr);min-height:100vh}
.side{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;padding:22px 14px;background:var(--side);color:var(--side-ink)}
.brand{display:flex;align-items:center;gap:10px;padding:0 10px 18px;color:#fff;text-decoration:none}.brand .mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#8a67d1,#5c3f92);color:#fff;font-size:16px}.brand b{display:block;font-size:14px}.brand small{display:block;color:#a99cc8;font-size:12px}
.nav{display:flex;flex-direction:column;gap:2px}.nav .group{margin:18px 12px 6px;color:#a99cc8;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}
.nav a{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:10px;color:var(--side-ink);font-weight:600;text-decoration:none}.nav a:hover{background:var(--side-2);color:#fff}.nav a[aria-current=page]{background:#fff;color:var(--side)}.nav a[aria-current=page] .ico{color:var(--plum)}
.me{display:flex;align-items:center;gap:10px;margin-top:auto;padding:14px 8px 0;border-top:1px solid #322858}.avatar{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--side-2);color:#fff;font-weight:700;flex:none}.me .who{flex:1;min-width:0}.me .who b{display:block;overflow:hidden;color:#fff;font-size:13px;text-overflow:ellipsis;white-space:nowrap}.me .who small{color:#a99cc8;font-size:12px}
.me button{display:grid;place-items:center;margin:0;padding:8px;border-radius:9px;background:transparent;color:var(--side-ink)}.me button:hover{background:var(--side-2);color:#fff}
.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:14px 32px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.94)}.topbar .crumb{font-weight:700}.topbar .crumb span{color:var(--muted);font-weight:500}
.search{position:relative;width:min(340px,42vw);margin-left:auto}.search .ico{position:absolute;top:50%;left:12px;color:var(--muted);transform:translateY(-50%)}.search input{padding-left:38px;border-color:transparent;border-radius:999px;background:var(--bg)}
main{max-width:1240px;padding:28px 32px 64px}h1{margin:0 0 4px;font-size:26px;letter-spacing:-.02em}h2{margin:0 0 12px;font-size:16px}.sub{margin:0 0 22px;color:var(--muted)}
.pagehead{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}.pagehead button{margin-top:0}
.panel{margin-bottom:18px;padding:20px 22px;border:1px solid var(--line);border-radius:var(--radius);background:#fff;box-shadow:0 1px 2px rgba(33,26,61,.04)}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.grid>.panel{margin:0}
table{width:100%;border-collapse:collapse}th,td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{color:var(--muted);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}tr:last-child td{border-bottom:0}td a{color:var(--plum);font-weight:700}tbody tr:hover{background:#faf9fc}
dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:0}dt{color:var(--muted)}dd{margin:0;font-weight:600}
.pill{display:inline-block;padding:2px 10px;border-radius:999px;background:#eee9f5;color:#4a3d61;font-size:12px;font-weight:700;white-space:nowrap;vertical-align:middle}.pill.paid{background:#fff3d6;color:var(--warn)}.pill.packed,.pill.collected{background:#e3edff;color:#1f4a99}.pill.delivered{background:#e1f4ea;color:var(--ok)}.pill.cancelled,.pill.refunded{background:#fbe5e7;color:var(--bad)}
label{display:block;margin:12px 0 4px;color:#514766;font-size:13px;font-weight:700}input,select,textarea{width:100%;padding:9px 11px;border:1px solid #d8d1e6;border-radius:9px;background:#fff;color:var(--ink);font:inherit}textarea{min-height:70px}input:focus,select:focus,textarea:focus{outline:2px solid #c9b8f2;border-color:var(--plum)}
.check{display:flex;gap:9px;align-items:flex-start;font-weight:600}.check input{width:auto;margin-top:4px}.row{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
button{margin-top:14px;padding:10px 16px;border:0;border-radius:10px;background:var(--plum);color:#fff;font:700 14px/1.2 var(--font);cursor:pointer}button:hover{background:#4d3480}button.secondary{background:var(--plum-soft);color:#4a3d61}button.secondary:hover{background:#e4daf7}button.danger{background:var(--bad)}
.inline{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}.inline>*{margin-top:0}.inline input{max-width:320px}
.flash{margin:0 0 18px;padding:12px 16px;border-radius:10px;font-weight:600}.flash.ok{background:#e1f4ea;color:var(--ok)}.flash.bad{background:#fbe5e7;color:var(--bad)}
.muted{color:var(--muted)}.mono{font-family:ui-monospace,Menlo,monospace;font-size:13px}.next{border-color:#c9b8f2;box-shadow:0 0 0 3px #efe8fd}.empty{padding:26px;color:var(--muted);text-align:center}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:18px}.stat{padding:16px 18px;border:1px solid var(--line);border-radius:var(--radius);background:#fff;color:var(--muted);font-size:13px;font-weight:600}.stat b{display:block;color:var(--ink);font-size:26px;letter-spacing:-.02em;line-height:1.25}.stat small{display:block;margin-top:2px;font-weight:500}
.attention{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:18px}.alert{display:flex;gap:12px;align-items:flex-start;padding:16px 18px;border:1px solid var(--line);border-radius:var(--radius);background:#fff;color:var(--ink);text-decoration:none}.alert:hover{border-color:#c9b8f2}.alert .badge{display:grid;place-items:center;width:36px;height:36px;border-radius:10px;flex:none}.alert b{display:block;font-size:22px;line-height:1.15}.alert span{color:var(--muted);font-size:13px;font-weight:600}.alert em{display:flex;gap:5px;align-items:center;margin-top:4px;font-size:12px;font-style:normal;font-weight:700}.alert em .ico{width:14px;height:14px}
.alert.good .badge{background:#e1f4ea;color:var(--ok)}.alert.good em{color:var(--ok)}.alert.warning .badge{background:#fff3d6;color:var(--warn)}.alert.warning em{color:var(--warn)}.alert.critical .badge{background:#fbe5e7;color:var(--bad)}.alert.critical em{color:var(--bad)}
.charts{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:18px;margin-bottom:18px}.charts>.panel{margin:0}.panel .head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:16px}.panel .head h2{margin:0}.panel .head small{color:var(--muted);font-size:12px}
.cols{display:flex;align-items:flex-end;gap:6px;height:190px;padding-top:24px;border-bottom:1px solid #cfc8dc;background:linear-gradient(to top,transparent calc(50% - 12px),#f0edf5 calc(50% - 12px),#f0edf5 calc(50% - 11px),transparent calc(50% - 11px))}
.col{position:relative;display:flex;flex:1;flex-direction:column;justify-content:flex-end;height:100%;outline:none}.col i{display:block;height:var(--h);min-height:2px;border-radius:4px 4px 0 0;background:var(--plum)}.col.zero i{background:#ddd6ea}.col:hover i,.col:focus i{background:var(--plum-2)}
.col .lbl{position:absolute;bottom:calc(var(--h) + 4px);left:50%;color:var(--ink);font-size:12px;font-weight:700;transform:translateX(-50%)}
.tip{position:absolute;bottom:calc(var(--h) + 8px);left:50%;z-index:2;display:none;padding:6px 9px;border-radius:8px;background:var(--side);color:#fff;font-size:12px;line-height:1.4;white-space:nowrap;transform:translateX(-50%)}.col:hover .tip,.col:focus .tip{display:block}.col:hover .lbl,.col:focus .lbl{visibility:hidden}
.xaxis{display:flex;gap:6px;margin-top:6px}.xaxis span{flex:1;color:var(--muted);font-size:11px;text-align:center;white-space:nowrap}
.hbars{display:grid;gap:11px}.hbar{display:grid;grid-template-columns:150px minmax(0,1fr) 64px;gap:12px;align-items:center;font-size:13px}.hbar .name{color:#514766;font-weight:600}.hbar .track{height:12px;background:#f2eff7;border-radius:0 4px 4px 0}.hbar .fill{width:var(--w);height:100%;min-width:2px;border-radius:0 4px 4px 0;background:var(--plum)}.hbar.quiet .fill{background:#b9b0c9}.hbar:hover .fill{background:var(--plum-2)}.hbar .val{font-weight:700;text-align:right}.hbar .val small{display:block;color:var(--muted);font-weight:500}
.feed{margin:0;padding:0;list-style:none}.feed li{display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)}.feed li:last-child{border:0}.feed .dot{width:8px;height:8px;margin-top:8px;border-radius:50%;background:var(--plum);flex:none}.feed .what{flex:1;min-width:0}.feed .what small{display:block;overflow:hidden;color:var(--muted);text-overflow:ellipsis;white-space:nowrap}.feed time{color:var(--muted);font-size:12px;white-space:nowrap}
details.table{margin-top:14px}details.table summary{font-size:13px}details.table table{margin-top:8px;font-size:13px}
.login{display:grid;place-items:center;max-width:none;min-height:100vh;padding:24px;background:radial-gradient(1000px 520px at 15% -10%,#3a2a6b,transparent),var(--side)}.login .panel{width:100%;max-width:440px;padding:30px;margin:0}.login .brand{padding:0 0 22px;color:var(--ink)}.login .brand small{color:var(--muted)}
:focus-visible{outline:3px solid #c9b8f2;outline-offset:2px}details summary{cursor:pointer;color:var(--plum);font-weight:700}
@media(max-width:1100px){.charts{grid-template-columns:minmax(0,1fr)}}
@media(max-width:900px){.shell{display:block}.side{position:static;height:auto;padding:14px}.brand{padding:0 6px 12px}.nav{flex-direction:row;gap:4px;overflow-x:auto}.nav .group{display:none}.nav a{white-space:nowrap}.me{margin-top:12px;padding-top:12px}.topbar{position:static;padding:12px 18px}.search{width:auto;flex:1}main{padding:22px 18px 48px}.grid,.row{grid-template-columns:1fr}.hbar{grid-template-columns:104px minmax(0,1fr) 52px}}
@media print{.side,.topbar,.noprint,.flash{display:none!important}.shell{display:block}body{background:#fff}main{max-width:none;padding:0}@page{size:A4;margin:8mm}}
`;

export function consoleLayout(title: string, identity: ConsoleIdentity | null, flash: Flash, content: string): string {
  const messages = `${flash.notice ? `<p class="flash ok" role="status">${e(flash.notice)}</p>` : ""}${flash.error ? `<p class="flash bad" role="alert">${e(flash.error)}</p>` : ""}`;
  const head = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>${e(title)} · Gratitude Stories staff</title><style>${styles}</style></head>`;
  const brand = `<span class="mark" aria-hidden="true">✦</span><span><b>Gratitude Stories</b><small>Staff console</small></span>`;
  if (!identity) return `${head}<body><main class="login"><div class="panel"><div class="brand">${brand}</div>${messages}${content}</div></main></body></html>`;

  const admin = identity.role === "admin";
  const section = sectionByTitle[title] ?? "boxes";
  const link = (key: Section, href: string) => `<a href="${href}"${key === section ? ` aria-current="page"` : ""}>${icon(key)}${sectionNames[key]}</a>`;
  const nav = `<nav class="nav" aria-label="Staff console">${link("overview", "/admin")}<span class="group">Fulfilment</span>${link("boxes", "/admin/boxes")}${link("cards", "/admin/cards")}<span class="group">Support</span>${link("help", "/admin/help")}${admin ? link("reminders", "/admin/reminders") : ""}${admin ? `<span class="group">Settings</span>${link("staff", "/admin/staff")}` : ""}</nav>`;
  const initial = (identity.actor.match(/[a-z0-9]/i)?.[0] ?? "?").toUpperCase();
  const me = `<div class="me"><span class="avatar" aria-hidden="true">${e(initial)}</span><div class="who"><b title="${e(identity.actor)}">${e(identity.actor)}</b><small>${admin ? "Administrator" : "Operations"}</small></div><form method="post" action="/admin/logout"><button title="Sign out" aria-label="Sign out">${icon("logout")}</button></form></div>`;
  const crumb = sectionNames[section] === title || title === "Help" || title === "Staff" ? e(sectionNames[section]) : `${e(sectionNames[section])} <span>/ ${e(title)}</span>`;
  const topbar = `<div class="topbar"><div class="crumb">${crumb}</div><form class="search" method="get" action="/admin/boxes" role="search">${icon("search")}<input name="query" placeholder="Find a box or trail…" aria-label="Find a box or trail" minlength="2"></form></div>`;
  return `${head}<body><div class="shell"><aside class="side"><a class="brand" href="/admin">${brand}</a>${nav}${me}</aside><div class="content">${topbar}<main>${messages}${content}</main></div></div></body></html>`;
}
