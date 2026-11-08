import { createServer, type IncomingMessage } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { RecipientJourney, type BoxPage, type RecipientJourneyRepository } from "./application/recipient-journey.js";
import { MyStories, type MyStoriesRepository, type StorySummary } from "./application/my-stories.js";
import { PassItForward, type PassItForwardRepository } from "./application/pass-it-forward.js";
import { PaymentConfirmation } from "./application/payment-confirmation.js";
import { GiverTracker, type GiverTrackerRepository, type GiverTrackerPage } from "./application/giver-tracker.js";
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
const repository: RecipientJourneyRepository & PassItForwardRepository & GiverTrackerRepository & MyStoriesRepository = postgresRepository ?? new InMemoryRecipientJourneyRepository(demoRecipientBoxes);
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
async function formValues(request: IncomingMessage): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of request) { body += chunk; if (body.length > 10_000) throw new Error("Request body is too large"); }
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
function layout(content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#1e1639"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>Gratitude Stories</title><style>
  :root{--ink:#211a3d;--muted:#6d6681;--plum:#5c3f92;--violet:#7e5dcc;--gold:#edb64d;--paper:#fffdf9;--line:#e9e3f3;--shadow:0 24px 64px #211a3d1c;--display:"Avenir Next","Avenir",Montserrat,"Helvetica Neue",Arial,sans-serif;--body:"Avenir Next","Avenir",Inter,"Helvetica Neue",Arial,sans-serif}*{box-sizing:border-box}body{min-height:100vh;margin:0;color:var(--ink);font-family:var(--body);background:radial-gradient(circle at 8% 5%,#f7dba6 0,transparent 24rem),radial-gradient(circle at 95% 20%,#d8caf9 0,transparent 29rem),#f7f4fb}.ambient{position:fixed;z-index:-1;width:22rem;height:22rem;border-radius:50%;filter:blur(22px);opacity:.48;animation:drift 14s ease-in-out infinite}.ambient.one{background:#f5c76e;top:45%;left:-12rem}.ambient.two{background:#c7a9fa;right:-13rem;top:55%;animation-delay:-7s}.page{width:min(100%,640px);margin:0 auto;padding:28px 20px 56px}.brand{display:flex;align-items:center;gap:10px;margin:0 0 44px;font-size:12px;font-weight:800;letter-spacing:.14em;color:#453667;text-transform:uppercase}.brand-mark{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;color:#fff;background:linear-gradient(135deg,var(--gold),#d78750);box-shadow:0 8px 18px #d8914f55;font-size:16px}.eyebrow{margin:0 0 12px;color:var(--violet);font-size:11px;font-weight:800;letter-spacing:.14em;line-height:1.3}h1{max-width:12ch;margin:0;font-family:var(--display);font-size:clamp(40px,10vw,62px);font-weight:650;letter-spacing:-.06em;line-height:.98}h2{margin:0 0 10px;font-family:var(--display);font-size:20px;font-weight:650;letter-spacing:-.03em}.card{position:relative;overflow:hidden;margin-top:24px;padding:25px;border:1px solid #fff;background:linear-gradient(145deg,#ffffffec,#fbf9ffcf);border-radius:24px;box-shadow:var(--shadow);animation:rise .65s both}.card:before{position:absolute;top:0;left:25px;width:64px;height:3px;border-radius:999px;background:linear-gradient(90deg,var(--gold),#ffda80);content:""}.card:nth-of-type(2){animation-delay:.1s}.card:nth-of-type(3){animation-delay:.18s}.muted{color:var(--muted);font-size:15px;line-height:1.65}.trail{position:relative;margin:20px 0 4px;padding-left:24px;color:#4d4265;line-height:2.1}.trail:before{position:absolute;top:7px;bottom:7px;left:5px;width:2px;background:linear-gradient(var(--gold),var(--violet));content:""}.trail div{position:relative}.trail div:before{position:absolute;top:13px;left:-23px;width:8px;height:8px;border:2px solid #fff;border-radius:50%;background:var(--gold);box-shadow:0 0 0 2px #f5dfa5;content:""}.trail div:last-child:before{background:var(--violet);box-shadow:0 0 0 3px #e5dafb}button{width:100%;min-height:54px;margin-top:12px;padding:14px 18px;border:0;border-radius:16px;color:#fff;background:linear-gradient(135deg,var(--plum),var(--violet));box-shadow:0 12px 23px #60439544;font:700 15px inherit;letter-spacing:.01em;cursor:pointer;transition:transform .2s ease,box-shadow .2s ease}button:hover{transform:translateY(-2px);box-shadow:0 16px 28px #60439555}button:active{transform:translateY(0)}form+form button{background:#eee9f5;color:#4a3d61;box-shadow:none}a{color:var(--plum);font-weight:700;text-decoration-color:#cfc0ef;text-underline-offset:3px}label{display:block;margin-top:15px;color:#514766;font-size:13px;font-weight:700}input{width:100%;margin-top:7px;padding:14px 13px;border:1px solid var(--line);border-radius:13px;outline:none;background:#fff;color:var(--ink);font:16px inherit;transition:border-color .2s,box-shadow .2s}input:focus{border-color:var(--violet);box-shadow:0 0 0 4px #dcd0f840}input[type=checkbox]{width:auto;margin-right:8px;accent-color:var(--plum)}label:has(input[type=checkbox]){display:flex;align-items:center;line-height:1.4}.card>p:first-child:not(.eyebrow){margin-top:0}@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes drift{50%{transform:translate(20px,-25px) scale(1.08)}}@media (max-width:440px){.page{padding:22px 16px 42px}.brand{margin-bottom:34px}.card{padding:21px;border-radius:21px}h1{font-size:45px}}@media (prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  </style></head><body><span class="ambient one"></span><span class="ambient two"></span><main class="page"><div class="brand"><span class="brand-mark">✦</span> Gratitude Stories</div>${content}</main></body></html>`;
}
function homeHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#120d25"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>Gratitude Stories — Gifts that keep moving</title><style>
  :root{--ink:#171324;--night:#120d25;--lav:#8666d8;--gold:#f4bf58;--paper:#faf9ff;--muted:#716b80}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--ink);font-family:"Avenir Next","Avenir",Inter,"Helvetica Neue",Arial,sans-serif}.nav{position:absolute;z-index:3;top:0;left:50%;display:flex;align-items:center;justify-content:space-between;width:min(1180px,calc(100% - 40px));padding:25px 0;transform:translateX(-50%);color:#fff}.logo{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}.logo i{display:grid;place-items:center;width:31px;height:31px;border-radius:10px;background:linear-gradient(135deg,#f7cf76,#dc9364);font-style:normal}.nav a{color:#fff;text-decoration:none;font-size:14px;font-weight:650}.nav .pill{padding:10px 15px;border:1px solid #ffffff44;border-radius:999px;background:#ffffff18;backdrop-filter:blur(14px)}.hero{position:relative;isolation:isolate;min-height:760px;overflow:hidden;background:radial-gradient(circle at 72% 65%,#56336f 0,transparent 34%),radial-gradient(circle at 3% 10%,#28204c 0,transparent 40%),var(--night)}.hero-inner{display:grid;grid-template-columns:1.04fr .96fr;align-items:center;width:min(1180px,calc(100% - 40px));min-height:760px;margin:auto;padding:110px 0 50px}.hero-copy{position:relative;z-index:2;color:#fff}.kicker{margin-bottom:20px;color:#f5c86d;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.hero h1{max-width:680px;margin:0;font-size:clamp(55px,7.1vw,101px);font-weight:650;letter-spacing:-.075em;line-height:.91}.hero h1 em{font-family:ui-serif,Georgia,serif;font-weight:400}.hero p{max-width:490px;margin:28px 0;color:#d9d1ea;font-size:18px;line-height:1.6}.actions{display:flex;flex-wrap:wrap;gap:12px}.cta{display:inline-flex;align-items:center;justify-content:center;min-height:52px;padding:0 21px;border-radius:16px;background:#fff;color:#241a42;font-size:15px;font-weight:750;text-decoration:none;box-shadow:0 14px 34px #0005;transition:.25s}.cta:hover{transform:translateY(-3px)}.cta.alt{border:1px solid #ffffff3d;background:#ffffff14;color:#fff;backdrop-filter:blur(12px)}.product{position:relative;align-self:end;height:620px;animation:float 7s ease-in-out infinite}.product:after{position:absolute;right:-10%;bottom:-3%;z-index:-1;width:90%;height:45%;border-radius:50%;background:#c286ff55;filter:blur(50px);content:""}.product img{position:absolute;right:-8%;bottom:-70px;width:min(560px,58vw);filter:drop-shadow(0 45px 35px #0008);transform:rotate(2deg)}.section{width:min(1120px,calc(100% - 40px));margin:0 auto;padding:120px 0}.eyebrow{color:#7654c1;font-size:12px;font-weight:800;letter-spacing:.15em;text-transform:uppercase}.section h2{max-width:680px;margin:14px 0 0;font-size:clamp(39px,5vw,67px);letter-spacing:-.065em;line-height:.96}.section h2 em{font-family:ui-serif,Georgia,serif;font-weight:400}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:52px}.step{min-height:245px;padding:28px;border:1px solid #ebe7f4;border-radius:28px;background:#fff;box-shadow:0 14px 36px #26184b0a}.step b{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:#f2ebff;color:#6f4ac3;font-size:14px}.step h3{margin:38px 0 9px;font-size:21px;letter-spacing:-.03em}.step p{margin:0;color:var(--muted);line-height:1.55}.quote{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;padding:84px;border-radius:38px;color:#fff;background:linear-gradient(135deg,#2b2050,#513a7a)}.quote h2{margin:0;font-size:clamp(39px,5vw,64px);letter-spacing:-.065em;line-height:.95}.quote p{margin:0;color:#d9cfed;font-size:17px;line-height:1.65}.footer{padding:40px 20px;color:#837d90;font-size:13px;text-align:center}@keyframes float{50%{transform:translateY(-14px)}}@media(max-width:760px){.nav{width:calc(100% - 32px)}.nav>a:not(.pill){display:none}.hero,.hero-inner{min-height:790px}.hero-inner{display:block;padding-top:150px}.hero h1{font-size:62px}.product{position:absolute;right:0;bottom:0;width:100%;height:390px;opacity:.82}.product img{right:-22%;bottom:-70px;width:470px}.steps{grid-template-columns:1fr}.quote{grid-template-columns:1fr;gap:28px;padding:34px 27px}.section{padding:80px 0}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style></head><body><nav class="nav"><div class="logo"><i>✦</i> Gratitude Stories</div><a href="#how">How it works</a><a class="pill" href="/b/demo-card-token">Open a box</a></nav><section class="hero"><div class="hero-inner"><div class="hero-copy"><div class="kicker">A gift with a second chapter</div><h1>Kindness was made to <em>move.</em></h1><p>Gratitude Stories turns one thoughtful gift into a private trail of people choosing to keep it going.</p><div class="actions"><a class="cta" href="/b/demo-card-token">Experience a box <span>&nbsp;→</span></a><a class="cta alt" href="#how">Discover the idea</a></div></div><div class="product"><img src="/assets/gratitude-gift-hero.png" alt="An elegant gift box glowing from within"></div></div></section><section class="section" id="how"><div class="eyebrow">Designed for the feeling</div><h2>One box. Many <em>beautiful</em> moments.</h2><div class="steps"><article class="step"><b>01</b><h3>Give with intention</h3><p>A considered physical gift arrives with a private story waiting inside.</p></article><article class="step"><b>02</b><h3>Reveal the warmth</h3><p>The recipient opens a consent-safe trail and sees the thought behind it.</p></article><article class="step"><b>03</b><h3>Keep it moving</h3><p>When the moment is right, they can send the feeling forward on the same trail.</p></article></div></section><section class="section"><div class="quote"><h2>Small gestures become <em>shared history.</em></h2><p>No public pressure. No personal details on display. Just a quiet, beautiful way to remember that someone chose you—and perhaps choose someone else in return.</p></div></section><footer class="footer">Made for meaningful moments · Gratitude Stories</footer></body></html>`;
}
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
function pageHtml(page: BoxPage, token: string): string {
  if (page.kind === "not-found") return layout("<h1>We could not find that box.</h1><p class=\"muted\">Please check the card or ask the Gratitude Stories team for help.</p>");
  if (page.kind === "inactive") return layout("<h1>This box is no longer active.</h1><p class=\"muted\">Please contact the Gratitude Stories team if you need help.</p>");
  if (page.kind === "in-transit") return layout(`<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(page.boxNumber)}</p><h1>Your box is on its way.</h1><p class="muted">Someone thought of you. The story opens once it is safely in your hands.</p>`);
  if (page.kind === "read-only") return layout(`<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(page.boxNumber)}</p><h1>This box has found its person.</h1><p class="muted">It has already been received. If it was meant for you, please contact the Gratitude Stories team.</p><section class="card"><p class="eyebrow">THE TRAIL SO FAR</p><div class="trail">${page.trail.map(escapeHtml).map((label) => `<div>${label}</div>`).join("")}</div></section>`);
  if (page.kind === "confirm-receipt") return layout(`<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(page.boxNumber)}</p><h1>Your box has been delivered.</h1><section class="card"><h2>Have you received it?</h2><p class="muted">Tap yes to open its story: who it is from and the trail it belongs to.</p><form method="post" action="/b/${encodeURIComponent(token)}/confirm"><button>Yes, I have it</button></form><p class="muted">Not yet or need help? Contact us.</p></section>`);
  return layout(`<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(page.boxNumber)}</p><h1>Someone thought of you.</h1><p class="muted">This box was passed to you by ${escapeHtml(page.giver)}.</p><section class="card"><p class="eyebrow">A NOTE FOR YOU</p><p>${page.note ? escapeHtml(page.note) : "A gift was chosen for you."}</p></section><section class="card"><p class="eyebrow">THE TRAIL SO FAR</p><h2>You are person ${page.position} on this trail.</h2><div class="trail">${page.trail.map(escapeHtml).map((label) => `<div>${label}</div>`).join("")}<div><strong>You</strong></div></div><p class="muted"><a href="/b/${encodeURIComponent(token)}/profile">Choose how you appear on the trail</a> · <a href="/b/${encodeURIComponent(token)}/reminders">Reminder preferences</a> · <a href="/b/${encodeURIComponent(token)}/save-story">Save my story</a></p></section><section class="card"><h2>Will you pass it forward?</h2><p class="muted">Choosing is always yours. Your next box will stay on this same trail.</p><form method="post" action="/b/${encodeURIComponent(token)}/pass"><button>Yes, I’ll pass it forward</button></form><form method="post" action="/b/${encodeURIComponent(token)}/decline" style="margin-top:12px"><button style="background:#6d5b60">Not now</button></form></section>`);
}
function profileHtml(): string {
  return layout(`<p class="eyebrow">YOUR TRAIL PROFILE</p><h1>How should the trail remember you?</h1><section class="card"><p class="muted">This is optional. If you consent, only your first name, last initial, and area will appear to future recipients. Contact details are never shown.</p><form method="post"><label><input type="checkbox" name="displayConsent" value="yes"> I’m happy to appear on the private trail</label><label for="firstName">First name</label><input id="firstName" name="firstName" maxlength="40" autocomplete="given-name" style="box-sizing:border-box;width:100%;margin:8px 0 16px;padding:12px;border:1px solid #eadac4;border-radius:8px"><label for="lastInitial">Last initial</label><input id="lastInitial" name="lastInitial" maxlength="1" style="box-sizing:border-box;width:100%;margin:8px 0 16px;padding:12px;border:1px solid #eadac4;border-radius:8px"><label for="area">Area</label><input id="area" name="area" maxlength="80" style="box-sizing:border-box;width:100%;margin:8px 0 16px;padding:12px;border:1px solid #eadac4;border-radius:8px"><button>Save my choice</button></form></section>`);
}
function saveStoryHtml(message?: string): string { return layout(`<p class="eyebrow">MY STORIES</p><h1>Keep this story close.</h1><section class="card"><p class="muted">Save this box to a private, passwordless profile. We’ll send a secure sign-in link—no password required.</p>${message ?? ""}<form method="post"><label for="email">Your email</label><input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"><button>Save my story</button></form></section>`); }
function storiesHtml(stories: StorySummary[]): string { const cards=stories.length?stories.map(s=>`<section class="card"><p class="eyebrow">${escapeHtml(s.fulfilmentStatus)}</p><h2>${escapeHtml(s.boxNumber)}</h2><p class="muted">Your place in this story is safely saved.</p></section>`).join(""):"<section class=\"card\"><p class=\"muted\">No saved stories yet.</p></section>"; return layout(`<p class="eyebrow">MY STORIES</p><h1>Your moments, kept private.</h1>${cards}`); }
function remindersHtml(emailOptIn: boolean): string { return layout(`<p class="eyebrow">REMINDERS</p><h1>Keep in touch?</h1><section class="card"><p class="muted">Choose whether we may email a one-time reminder about this box. You can change this choice anytime.</p><form method="post"><label><input type="checkbox" name="emailOptIn" value="yes"${emailOptIn ? " checked" : ""}> Email me a reminder</label><button>Save my choice</button></form></section>`); }
function checkoutHtml(state: "ready" | "invalid" | "pending", reference?: string, trackerToken?: string | null): string {
  if (state === "invalid") return layout("<h1>This checkout link has expired.</h1><p class=\"muted\">Return to your box page to start again.</p>");
  if (state === "pending") return layout(`<p class="eyebrow">GRATITUDE STORIES</p><h1>Your next box is reserved.</h1><section class="card"><p class="muted">Order ${escapeHtml(reference ?? "")}</p><p>Payment connection is the next step. This order is safely tied to the trail; a new box does not exist until payment is verified.</p>${trackerToken ? `<p><a href="/t/${encodeURIComponent(trackerToken)}">Track this box privately</a></p>` : ""}</section>`);
  return layout("<p class=\"eyebrow\">GRATITUDE STORIES</p><h1>Keep the kindness moving.</h1><section class=\"card\"><p class=\"muted\">Your next box will be connected to the same private trail. We will use this email only for this order.</p><form method=\"post\" action=\"/checkout\"><label for=\"email\">Email</label><input id=\"email\" name=\"email\" type=\"email\" required autocomplete=\"email\" style=\"box-sizing:border-box;width:100%;margin:8px 0 16px;padding:12px;border:1px solid #eadac4;border-radius:8px\"><button>Reserve my next box</button></form></section>");
}
function paymentCompleteHtml(trackerToken: string | undefined): string {
  const tracker = trackerToken ? `<p><a href="/t/${encodeURIComponent(trackerToken)}">Track this box privately</a></p>` : "";
  return layout(`<p class="eyebrow">GRATITUDE STORIES</p><h1>Thank you.</h1><section class="card"><p class="muted">Your payment is being confirmed. Your box is created only after secure payment verification.</p>${tracker}</section>`);
}
function trackerHtml(page: GiverTrackerPage): string {
  if (page.kind === "not-found") return layout("<h1>We could not find that tracker.</h1><p class=\"muted\">Please check your private tracking link.</p>");
  const steps = page.steps.map((step) => `<li><strong>${escapeHtml(step.label)}</strong> — ${step.complete ? "Done" : step.current ? "In progress" : "Not yet"}</li>`).join("");
  return layout(`<p class="eyebrow">PRIVATE BOX TRACKER</p><h1>You kept it moving.</h1><section class="card"><p class="muted">Order ${escapeHtml(page.orderReference)}</p><ol class="muted">${steps}</ol><p>${page.complete ? "Delivered. Your part is complete." : "This tracker ends at delivery to protect the recipient’s privacy."}</p></section>`);
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
      response.end(checkoutHtml(page.kind === "ready" ? "ready" : "invalid"));
      return;
    }
    if (request.method === "POST") {
      try {
        const email = await formValue(request, "email");
        const order = await passItForward.createOrder(referralToken, email);
        if (paystack && postgresRepository && paystackCallbackUrl) {
          const checkout = await paystack.initialize({ reference: order.paymentReference, email: email.trim().toLowerCase(), amountKobo: passOnAmountKobo, callbackUrl: paystackCallbackUrl });
          response.writeHead(303, { location: checkout.authorizationUrl, "set-cookie": order.trackerToken ? `giver_tracker=${order.trackerToken}; HttpOnly${secureCookie}; SameSite=Lax; Path=/checkout; Max-Age=2592000` : undefined }); response.end(); return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" }); response.end(checkoutHtml("pending", order.reference, order.trackerToken));
      } catch { response.writeHead(404, { "content-type": "text/html; charset=utf-8" }); response.end(checkoutHtml("invalid")); }
      return;
    }
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
