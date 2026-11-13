import type { BoxPage } from "../application/recipient-journey.js";
import type { StorySummary } from "../application/my-stories.js";
import type { GiverTrackerPage, TrackerStage } from "../application/giver-tracker.js";
import { displayStack, fontFaces, fontPreloads, textStack } from "./fonts.js";

// Server-rendered pages. Every value from users or the database must pass through escapeHtml.

export function layout(content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f7faf6"><link rel="icon" href="/favicon.svg" type="image/svg+xml">${fontPreloads}<title>Gratitude Stories</title><style>  :root{--ink:#10231a;--muted:#5c6b63;--green:#0f7b4f;--green-dark:#0b5e3c;--green-soft:#dcf6e8;--lime:#cdf26d;--sun:#ffd166;--forest:#0c2b20;--bg:#f7faf6;--line:#d6e2db;--display:${displayStack};--body:${textStack}}${fontFaces}
  *{box-sizing:border-box}body{min-height:100vh;margin:0;overflow-x:clip;color:var(--ink);font-family:var(--body);background:var(--bg);-webkit-font-smoothing:antialiased}
  .confetti{position:fixed;z-index:-1;border-radius:50%;animation:bob 7s ease-in-out infinite}.confetti.c1{top:9%;right:-40px;width:150px;height:150px;background:var(--green-soft)}.confetti.c2{bottom:12%;left:-56px;width:170px;height:170px;background:#eefac9;animation-delay:-2.5s}.confetti.c3{top:46%;right:7%;width:16px;height:16px;background:var(--sun);animation-delay:-4s}.confetti.c4{bottom:22%;right:5%;width:11px;height:11px;background:var(--green);opacity:.5;animation-delay:-1s}
  .page{width:min(100%,640px);margin:0 auto;padding:26px 20px 64px}
  .brand{display:flex;width:fit-content;align-items:center;gap:10px;margin:0 0 40px;color:var(--ink);font-family:var(--display);font-size:17px;font-weight:700;letter-spacing:-.01em;text-decoration:none}.brand-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:12px;color:var(--forest);background:var(--lime);font-size:16px;transition:transform .4s cubic-bezier(.3,1.8,.5,1)}.brand:hover .brand-mark{transform:rotate(-14deg) scale(1.12)}
  .eyebrow{display:inline-block;margin:0 0 14px;padding:6px 13px;border-radius:999px;background:var(--green-soft);color:var(--green-dark);font-size:12px;font-weight:800;letter-spacing:.06em;line-height:1.3;animation:pop .5s cubic-bezier(.3,1.6,.5,1) both}
  h1{max-width:15ch;margin:0;font-family:var(--display);font-size:clamp(36px,9vw,54px);font-weight:800;letter-spacing:-.03em;line-height:1.02;animation:rise .6s .05s cubic-bezier(.2,.8,.2,1) both}
  h2{margin:0 0 10px;font-family:var(--display);font-size:22px;font-weight:700;letter-spacing:-.02em}
  .card{position:relative;margin-top:20px;padding:26px;border:2px solid #10231a0d;border-radius:28px;background:#fff;box-shadow:0 10px 30px #0c2b200a;animation:rise .6s cubic-bezier(.2,.8,.2,1) both}.card:nth-of-type(1){animation-delay:.12s}.card:nth-of-type(2){animation-delay:.2s}.card:nth-of-type(3){animation-delay:.28s}.card:nth-of-type(4){animation-delay:.36s}
  .muted{color:var(--muted);font-size:16px;line-height:1.6}
  .trail{position:relative;margin:20px 0 4px;padding-left:26px;color:#2f4238;font-weight:600;line-height:2.2}.trail:before{position:absolute;top:8px;bottom:8px;left:6px;width:3px;border-radius:3px;background:var(--green-soft);content:""}.trail div{position:relative;animation:rise .5s cubic-bezier(.2,.8,.2,1) both}.trail div:nth-child(2){animation-delay:.1s}.trail div:nth-child(3){animation-delay:.2s}.trail div:nth-child(4){animation-delay:.3s}.trail div:nth-child(5){animation-delay:.4s}.trail div:before{position:absolute;top:14px;left:-25px;width:11px;height:11px;border:2px solid #fff;border-radius:50%;background:#9fd8bb;content:""}.trail div:last-child:before{background:var(--green);box-shadow:0 0 0 4px var(--green-soft);animation:ring 2s infinite}
  button{position:relative;overflow:hidden;isolation:isolate;width:100%;min-height:54px;margin-top:14px;padding:14px 22px;border:0;border-radius:999px;color:#fff;background:var(--green);box-shadow:0 10px 24px #0f7b4f33;font:800 17px var(--body);letter-spacing:-.01em;cursor:pointer;transition:transform .25s cubic-bezier(.3,1.6,.5,1),box-shadow .25s,background-color .2s}
  button:after,.button-link:after{position:absolute;inset:0;z-index:-1;background:linear-gradient(110deg,transparent 30%,#ffffff40 50%,transparent 70%);transform:translateX(-120%);transition:transform .7s ease;content:""}button:hover:after,.button-link:hover:after{transform:translateX(120%)}
  button:hover{background:var(--green-dark);box-shadow:0 14px 30px #0f7b4f44;transform:translateY(-2px)}button:active{transform:scale(.97)}
  form+form button{background:#eef3ef;color:var(--ink);box-shadow:none}form+form button:hover{background:#e2ebe5}
  a{color:var(--green);font-weight:700;text-decoration:none;background-image:linear-gradient(var(--lime),var(--lime));background-position:0 100%;background-repeat:no-repeat;background-size:0 35%;transition:background-size .3s}a:hover{background-size:100% 35%}
  label{display:block;margin-top:16px;color:var(--ink);font-size:14px;font-weight:700}
  input{width:100%;margin-top:7px;padding:14px 15px;border:2px solid var(--line);border-radius:16px;outline:none;background:#fff;color:var(--ink);font:17px var(--body);transition:border-color .2s,box-shadow .2s,transform .2s}input:focus{border-color:var(--green);box-shadow:0 0 0 5px #0f7b4f1f}
  input[type=checkbox],input[type=radio]{width:auto;margin:0 10px 0 0;accent-color:var(--green)}
  textarea{width:100%;min-height:110px;margin-top:7px;padding:14px 15px;border:2px solid var(--line);border-radius:16px;outline:none;background:#fff;color:var(--ink);font:17px/1.5 var(--body);resize:vertical;transition:border-color .2s,box-shadow .2s}textarea:focus{border-color:var(--green);box-shadow:0 0 0 5px #0f7b4f1f}
  fieldset{margin:18px 0 0;padding:0;border:0}legend{color:var(--ink);font-size:14px;font-weight:700}
  .choice{display:flex;align-items:flex-start;margin-top:10px;padding:15px 16px;border:2px solid var(--line);border-radius:18px;background:#fff;font-weight:700;line-height:1.4;cursor:pointer;transition:border-color .2s,background-color .2s,transform .25s cubic-bezier(.3,1.6,.5,1)}.choice:hover{transform:translateY(-2px)}.choice:has(input:checked){border-color:var(--green);background:#f1fbf5;animation:pop .35s cubic-bezier(.3,1.6,.5,1)}
  .choice small{display:block;margin-top:3px;color:var(--muted);font-size:14px;font-weight:500}
  .hint{margin:6px 0 0;color:var(--muted);font-size:14px;font-weight:500}
  .error{margin:0 0 6px;padding:12px 14px;border-radius:14px;background:#fdecec;color:#a1192b;font-size:14px;font-weight:700;animation:shake .4s}
  .divider{margin:26px 0 4px;padding-top:20px;border-top:2px dashed #e1e9e4}
  .demo{background:var(--forest)}.demo:hover{background:#163d2e}
  :focus-visible{outline:3px solid var(--green);outline-offset:3px}.choice:has(input:focus-visible){outline:3px solid var(--green);outline-offset:2px}
  button.quiet{background:#eef3ef;color:var(--ink);box-shadow:none}button.quiet:hover{background:#e2ebe5}
  .help-link{margin-top:22px;text-align:center}
  .wa{display:flex;align-items:center;justify-content:center;min-height:54px;margin-top:12px;border-radius:999px;background:#eef3ef;color:var(--ink);font-weight:800;text-decoration:none}.wa:hover{background:#e2ebe5}
  label:has(input[type=checkbox]){display:flex;align-items:center;line-height:1.4}.card>p:first-child:not(.eyebrow){margin-top:0}
  @keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
  @keyframes pop{0%{transform:scale(.92)}60%{transform:scale(1.03)}100%{transform:scale(1)}}
  @keyframes bob{50%{transform:translateY(-18px)}}
  @keyframes ring{50%{box-shadow:0 0 0 8px #dcf6e800}}
  @keyframes shake{20%,60%{transform:translateX(-5px)}40%,80%{transform:translateX(5px)}}
  @media (max-width:440px){.page{padding:20px 16px 48px}.brand{margin-bottom:30px}.card{padding:22px;border-radius:24px}h1{font-size:40px}}
  @media (prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
  </style></head><body><span class="confetti c1" aria-hidden="true"></span><span class="confetti c2" aria-hidden="true"></span><span class="confetti c3" aria-hidden="true"></span><span class="confetti c4" aria-hidden="true"></span><main class="page"><a class="brand" href="/"><span class="brand-mark">✦</span> Gratitude Stories</a>${content}</main></body></html>`;
}
/** `demoBox` is true only in the in-memory demo, where a sample box exists to open. */
export function homeHtml(demoBox = false): string {
  const open = `<a class="pill shine" href="/start">Start a gift box</a>`;
  const actions = demoBox
    ? `<a class="cta shine" href="/start">Start a gift box <span class="arrow">→</span></a><a class="cta alt" href="/b/demo-card-token">Open the sample box</a>`
    : `<a class="cta shine" href="/start">Start a gift box <span class="arrow">→</span></a><a class="cta alt" href="#how">How it works</a>`;
  const scan = demoBox ? "" : `<p class="scan"><span aria-hidden="true">📱</span> Received a box? Scan the card inside it with your phone camera.</p>`;
  const sparkles = [[6, 9, 0], [40, 7, 1.2], [88, 16, .6], [60, 78, 1.8], [95, 58, 2.4], [70, 26, .9], [56, 92, 3]]
    .map(([x, y, d]) => `<i class="sparkle" style="left:${x}%;top:${y}%;animation-delay:${d}s" aria-hidden="true">✦</i>`).join("");
  const words = ["Thank you", "You made my day", "Pass it on", "Someone chose you", "Keep it moving", "Kindness counts", "For the ones who show up"];
  const ribbon = [...words, ...words].map((word) => `<span>${word}</span><b aria-hidden="true">✦</b>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0c2b20"><link rel="icon" href="/favicon.svg" type="image/svg+xml">${fontPreloads}<title>Gratitude Stories — Gifts that keep moving</title><style>
  :root{--ink:#10231a;--muted:#5c6b63;--forest:#0c2b20;--green:#0f7b4f;--green-dark:#0b5e3c;--bright:#3ddc97;--mint:#dcf6e8;--lime:#cdf26d;--sun:#ffd166;--cream:#f7faf6;--font:${textStack};--display:${displayStack}}${fontFaces}
  *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;overflow-x:clip;background:var(--cream);color:var(--ink);font-family:var(--font);-webkit-font-smoothing:antialiased}
  .nav{position:fixed;z-index:10;top:14px;left:50%;display:flex;align-items:center;gap:18px;width:min(1120px,calc(100% - 28px));padding:10px 10px 10px 18px;border:1px solid #ffffff1f;border-radius:999px;background:#0c2b20b3;-webkit-backdrop-filter:blur(16px) saturate(1.4);backdrop-filter:blur(16px) saturate(1.4);transform:translateX(-50%);color:#fff;animation:drop .7s cubic-bezier(.2,.8,.2,1) both}
  .logo{display:flex;align-items:center;gap:10px;margin-right:auto;font-family:var(--display);font-size:17px;font-weight:700;letter-spacing:-.01em}.logo i{display:grid;place-items:center;width:32px;height:32px;border-radius:11px;background:var(--lime);color:var(--forest);font-style:normal;font-size:15px;transition:transform .4s cubic-bezier(.3,1.6,.5,1)}.logo:hover i{transform:rotate(-12deg) scale(1.12)}
  .nav a{color:#e7f5ee;text-decoration:none;font-size:15px;font-weight:600}.nav a:hover{color:#fff}
  .shine{position:relative;overflow:hidden;isolation:isolate}.shine:after{position:absolute;inset:0;z-index:-1;background:linear-gradient(110deg,transparent 30%,#ffffff55 50%,transparent 70%);transform:translateX(-120%);transition:transform .7s ease;content:""}.shine:hover:after{transform:translateX(120%)}
  .nav .pill{padding:10px 18px;border-radius:999px;background:var(--lime);color:var(--forest);font-weight:800;transition:transform .25s cubic-bezier(.3,1.6,.5,1)}.nav .pill:hover{color:var(--forest);transform:translateY(-2px) scale(1.03)}
  .hero{position:relative;isolation:isolate;min-height:800px;overflow:hidden;background:var(--forest)}
  .halo{position:absolute;z-index:-1;right:6%;bottom:6%;width:560px;height:560px;border-radius:50%;background:#3ddc9733;filter:blur(90px);animation:breathe 6s ease-in-out infinite}
  .sparkle{position:absolute;z-index:1;color:var(--lime);font-style:normal;font-size:18px;opacity:0;animation:twinkle 3.6s ease-in-out infinite}.sparkle:nth-child(3n){color:var(--sun);font-size:13px}.sparkle:nth-child(4n){color:#fff;font-size:10px}
  .hero-inner{display:grid;grid-template-columns:1.05fr .95fr;align-items:center;width:min(1120px,calc(100% - 40px));min-height:800px;margin:auto;padding:120px 0 40px}
  .hero-copy{position:relative;z-index:2;color:#fff}
  .kicker{display:inline-flex;align-items:center;gap:9px;margin-bottom:22px;padding:7px 14px 7px 10px;border:1px solid #ffffff26;border-radius:999px;background:#ffffff12;color:var(--lime);font-size:14px;font-weight:700;animation:rise .7s .1s cubic-bezier(.2,.8,.2,1) both}.kicker:before{width:9px;height:9px;border-radius:50%;background:var(--lime);box-shadow:0 0 0 0 #cdf26d88;animation:ping 2s infinite;content:""}
  .hero h1{max-width:720px;margin:0;font-family:var(--display);font-size:clamp(52px,6.4vw,90px);font-weight:800;letter-spacing:-.035em;line-height:.95;animation:rise .8s .2s cubic-bezier(.2,.8,.2,1) both}
  .hero h1 em{position:relative;display:inline-block;font-style:normal;color:var(--lime)}.squiggle{position:absolute;left:-2%;bottom:-.22em;width:104%;height:.36em;overflow:visible}.squiggle path{fill:none;stroke:var(--sun);stroke-width:7;stroke-linecap:round;stroke-dasharray:420;stroke-dashoffset:420;animation:draw 1.2s 1s cubic-bezier(.6,0,.2,1) forwards}
  .hero p{max-width:480px;margin:30px 0;color:#c4ddd1;font-size:20px;line-height:1.55;animation:rise .8s .35s cubic-bezier(.2,.8,.2,1) both}
  .actions{display:flex;flex-wrap:wrap;gap:12px;animation:rise .8s .5s cubic-bezier(.2,.8,.2,1) both}
  .cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:56px;padding:0 26px;border-radius:999px;background:var(--lime);color:var(--forest);font-size:17px;font-weight:800;text-decoration:none;box-shadow:0 10px 30px #cdf26d40;transition:transform .25s cubic-bezier(.3,1.6,.5,1),box-shadow .25s}.cta:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 16px 40px #cdf26d5c}.cta:active{transform:scale(.97)}.cta .arrow{transition:transform .25s}.cta:hover .arrow{transform:translateX(4px)}
  .cta.alt{border:2px solid #ffffff40;background:transparent;color:#fff;box-shadow:none}.cta.alt:hover{border-color:#fff;background:#ffffff14}
  .scan{margin:22px 0 0;color:#9fc2b2;font-size:15px;animation:rise .8s .65s cubic-bezier(.2,.8,.2,1) both}
  .product{position:relative;align-self:end;height:640px;animation:rise 1s .3s cubic-bezier(.2,.8,.2,1) both}
  .product img{position:absolute;right:-6%;bottom:-60px;width:min(560px,58vw);height:auto;filter:hue-rotate(-155deg) saturate(.9) drop-shadow(0 30px 40px #0007);-webkit-mask-image:radial-gradient(ellipse 52% 56% at 55% 60%,#000 58%,transparent 100%);mask-image:radial-gradient(ellipse 52% 56% at 55% 60%,#000 58%,transparent 100%);animation:float 6s ease-in-out infinite}
  .ribbon-wrap{position:relative;z-index:2;overflow:hidden;margin-top:-34px;padding:16px 0 24px}.ribbon{overflow:hidden;margin:0 -20px;padding:18px 0;background:var(--lime);color:var(--forest);transform:rotate(-1.4deg);box-shadow:0 10px 30px #0c2b2022}
  .ribbon div{display:flex;gap:26px;width:max-content;font-family:var(--display);font-size:22px;font-weight:700;letter-spacing:-.01em;white-space:nowrap;animation:marquee 32s linear infinite}.ribbon b{color:var(--green)}.ribbon:hover div{animation-play-state:paused}
  .section{width:min(1120px,calc(100% - 40px));margin:0 auto;padding:120px 0}
  .eyebrow{display:inline-block;padding:6px 14px;border-radius:999px;background:var(--mint);color:var(--green-dark);font-size:14px;font-weight:800}
  .section h2{max-width:700px;margin:16px 0 0;font-family:var(--display);font-size:clamp(40px,5vw,64px);font-weight:800;letter-spacing:-.035em;line-height:1}.section h2 em{font-style:normal;color:var(--green)}
  .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:56px}
  .step{position:relative;min-height:270px;padding:30px;border:2px solid #10231a0f;border-radius:30px;background:#fff;transition:transform .35s cubic-bezier(.3,1.5,.5,1),box-shadow .35s,border-color .35s}.step:hover{border-color:#0f7b4f33;box-shadow:0 24px 50px #0c2b2018;transform:translateY(-8px) rotate(-1.2deg)}.step:nth-child(2):hover{transform:translateY(-8px) rotate(1.2deg)}
  .step .emoji{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;font-size:32px;transition:transform .4s cubic-bezier(.3,1.8,.5,1)}.step:hover .emoji{transform:scale(1.15) rotate(-8deg)}.step:nth-child(1) .emoji{background:var(--mint)}.step:nth-child(2) .emoji{background:#fff1c7}.step:nth-child(3) .emoji{background:#ecfbc4}
  .step small{position:absolute;top:30px;right:30px;color:#10231a40;font-size:15px;font-weight:800}
  .step h3{margin:34px 0 10px;font-family:var(--display);font-size:24px;font-weight:700;letter-spacing:-.02em}.step p{margin:0;color:var(--muted);font-size:17px;line-height:1.55}
  .quote{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center;overflow:hidden;padding:84px;border-radius:40px;color:#fff;background:var(--green)}
  .quote:before{position:absolute;top:-80px;right:-60px;width:260px;height:260px;border-radius:50%;background:#ffffff14;content:""}.quote:after{position:absolute;bottom:-110px;left:38%;width:220px;height:220px;border-radius:50%;background:#cdf26d22;content:""}
  .quote h2{position:relative;margin:0;font-family:var(--display);font-size:clamp(40px,5vw,62px);font-weight:800;letter-spacing:-.035em;line-height:1}.quote h2 em{color:var(--lime)}
  .quote p{position:relative;margin:0;color:#d7f0e3;font-size:19px;line-height:1.6}.heart{display:inline-block;margin-bottom:14px;font-size:44px;animation:beat 1.6s ease-in-out infinite}
  .closing{padding:0 0 120px;text-align:center}.closing h2{margin:0 auto 26px}.closing .cta{box-shadow:0 10px 30px #0f7b4f33;background:var(--green);color:#fff}.closing .cta:hover{box-shadow:0 16px 40px #0f7b4f4d}
  .footer{padding:36px 20px;color:#7d8c84;font-size:14px;text-align:center}
  @supports (animation-timeline: view()){.reveal{animation:reveal linear both;animation-timeline:view();animation-range:entry 5% cover 28%}}
  @keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}
  @keyframes drop{from{opacity:0;transform:translate(-50%,-20px)}to{opacity:1;transform:translate(-50%,0)}}
  @keyframes reveal{from{opacity:0;transform:translateY(40px) scale(.97)}to{opacity:1;transform:none}}
  @keyframes float{50%{transform:translateY(-16px) rotate(-1deg)}}
  @keyframes breathe{50%{opacity:.6;transform:scale(1.12)}}
  @keyframes twinkle{0%,100%{opacity:0;transform:scale(.4) rotate(0)}50%{opacity:1;transform:scale(1) rotate(90deg)}}
  @keyframes ping{70%{box-shadow:0 0 0 10px #cdf26d00}100%{box-shadow:0 0 0 0 #cdf26d00}}
  @keyframes draw{to{stroke-dashoffset:0}}
  @keyframes marquee{to{transform:translateX(-50%)}}
  @keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.18)}30%{transform:scale(.96)}45%{transform:scale(1.1)}}
  @media(max-width:760px){.nav>a:not(.pill){display:none}.nav{gap:10px}.hero,.hero-inner{min-height:0}.hero-inner{display:block;padding:120px 0 50px}.hero h1{font-size:54px}.hero p{font-size:18px}.product{height:330px;margin-top:8px}.product img{right:-6%;bottom:-40px;width:400px}.halo{width:340px;height:340px}.steps{grid-template-columns:1fr}.quote{grid-template-columns:1fr;gap:24px;padding:40px 28px;border-radius:30px}.section{padding:84px 0}.ribbon div{font-size:18px}}
  @media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}.squiggle path{stroke-dashoffset:0}.sparkle{opacity:.7}}
  </style></head><body><nav class="nav"><div class="logo"><i>✦</i> Gratitude Stories</div><a href="#how">How it works</a>${open}</nav>
<section class="hero"><span class="halo" aria-hidden="true"></span>${sparkles}<div class="hero-inner"><div class="hero-copy"><div class="kicker">A gift with a second chapter</div><h1>Kindness was made to <em>move.<svg class="squiggle" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true"><path d="M3 12 C 30 2, 50 20, 80 10 S 130 2, 160 11 S 190 14, 197 8"/></svg></em></h1><p>Gratitude Stories turns one thoughtful gift into a private trail of people choosing to keep it going.</p><div class="actions">${actions}</div>${scan}</div><div class="product"><img src="/assets/gratitude-gift-hero.jpg" width="1024" height="1536" alt="A gift box with a green ribbon, glowing from within"></div></div></section>
<div class="ribbon-wrap" aria-hidden="true"><div class="ribbon"><div>${ribbon}</div></div></div>
<section class="section" id="how"><div class="reveal"><span class="eyebrow">Designed for the feeling</span><h2>One box. Many <em>beautiful</em> moments.</h2></div><div class="steps"><article class="step reveal"><span class="emoji" aria-hidden="true">🎁</span><small>01</small><h3>Give with intention</h3><p>A considered physical gift arrives with a private story waiting inside.</p></article><article class="step reveal"><span class="emoji" aria-hidden="true">💌</span><small>02</small><h3>Reveal the warmth</h3><p>The recipient opens a consent-safe trail and sees the thought behind it.</p></article><article class="step reveal"><span class="emoji" aria-hidden="true">🔁</span><small>03</small><h3>Keep it moving</h3><p>When the moment is right, they can send the feeling forward on the same trail.</p></article></div></section>
<section class="section"><div class="quote reveal"><div><span class="heart" aria-hidden="true">💚</span><h2>Small gestures become <em>shared history.</em></h2></div><p>No public pressure. No personal details on display. Just a quiet, beautiful way to remember that someone chose you—and perhaps choose someone else in return.</p></div></section>
<section class="section closing reveal"><span class="eyebrow">Your turn</span><h2>Who made your year better?</h2><a class="cta shine" href="/start">Start a gift box <span class="arrow">→</span></a></section>
<footer class="footer">Made with 💚 for meaningful moments · Gratitude Stories</footer></body></html>`;
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
const lagosDate = (date: Date) => date.toLocaleString("en-NG", { timeZone: "Africa/Lagos", weekday: "long", hour: "numeric", minute: "2-digit" });
const helpLink = (token: string, reason?: string, text = "Not yet, or need help?") => `<p class="muted help-link"><a href="/b/${encodeURIComponent(token)}/help${reason ? `?reason=${reason}` : ""}">${text}</a></p>`;
export interface ReminderState { status: "scheduled" | "sent" | "accepted" | "declined"; sendAt: Date; }

export function pageHtml(page: BoxPage, token: string, reminder: ReminderState | null = null): string {
  const t = encodeURIComponent(token);
  if (page.kind === "not-found") return layout("<h1>We could not find that box.</h1><p class=\"muted\">Please check the card or ask the Gratitude Stories team for help.</p>");
  if (page.kind === "inactive") return layout(`<h1>This box is no longer active.</h1><p class="muted">Please contact the Gratitude Stories team if you need help.</p>${helpLink(token, undefined, "Contact the team")}`);
  if (page.kind === "in-transit") return layout(`<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(page.boxNumber)}</p><h1>Your box is on its way.</h1><p class="muted">Someone thought of you. The story opens once it is safely in your hands.</p>${helpLink(token, "not_arrived", "Questions about your delivery?")}`);
  if (page.kind === "read-only") return layout(`<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(page.boxNumber)}</p><h1>This box has found its person.</h1><p class="muted">It has already been received.</p>${helpLink(token, "lost_access", "Was it meant for you, or did you change phones? Get help")}<section class="card"><p class="eyebrow">THE TRAIL SO FAR</p><div class="trail">${page.trail.map(escapeHtml).map((label) => `<div>${label}</div>`).join("")}</div></section>`);
  if (page.kind === "confirm-receipt") return layout(`<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(page.boxNumber)}</p><h1>Your box has been delivered.</h1><section class="card"><h2>Have you received it?</h2><p class="muted">Tap yes to open its story: who it is from and the trail it belongs to.</p><form method="post" action="/b/${t}/confirm"><button>Yes, I have it</button></form><form method="get" action="/b/${t}/help" style="margin-top:12px"><button class="quiet">Not yet, or I need help</button></form></section>`);
  const passButton = `<form method="post" action="/b/${t}/pass"><button>Yes, I’ll pass it forward${page.decided ? " after all" : ""}</button></form>`;
  const reminderLine = reminder && (reminder.status === "scheduled" || reminder.status === "sent")
    ? `<p class="muted">We’ll send you one gentle reminder${reminder.status === "scheduled" ? ` on ${escapeHtml(lagosDate(reminder.sendAt))}` : ""}. Nothing else.</p>` : "";
  const remindButton = reminder ? "" : `<form method="get" action="/b/${t}/remind" style="margin-top:12px"><button class="quiet">Remind me in 24 hours</button></form>`;
  const decision = page.decided
    ? `<section class="card"><h2>Thank you.</h2><p class="muted">Your place on this trail stays part of its story. If you change your mind, the trail will still be here.</p>${passButton}</section>`
    : `<section class="card"><h2>Will you pass it forward?</h2><p class="muted">Choosing is always yours. Your next box will stay on this same trail.</p>${reminderLine}${passButton}${remindButton}<form method="post" action="/b/${t}/decline" style="margin-top:12px"><button class="quiet">Not this time</button></form></section>`;
  return layout(`<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(page.boxNumber)}</p><h1>Someone thought of you.</h1><p class="muted">This box was passed to you by ${escapeHtml(page.giver)}.</p><section class="card"><p class="eyebrow">A NOTE FOR YOU</p><p>${page.note ? escapeHtml(page.note) : "A gift was chosen for you."}</p></section><section class="card"><p class="eyebrow">THE TRAIL SO FAR</p><h2>You are person ${page.position} on this trail.</h2><div class="trail">${page.trail.map(escapeHtml).map((label) => `<div>${label}</div>`).join("")}<div><strong>You</strong></div></div><p class="muted"><a href="/b/${t}/profile">Choose how you appear on the trail</a> · <a href="/b/${t}/save-story">Save my story</a></p></section>${decision}${helpLink(token, undefined, "Need help with this box?")}`);
}

export type HelpView = { boxNumber: string; token: string; whatsappNumber: string | null; reason: string; sent: boolean; error?: string; values?: Partial<Record<string, string>> };
const helpReasons: Array<[string, string]> = [["not_arrived", "My box hasn't arrived"], ["damaged", "It arrived damaged or something is wrong"], ["lost_access", "I lost my card or changed phones"], ["other", "Something else"]];
export function helpHtml(view: HelpView): string {
  const whatsapp = view.whatsappNumber ? `<a class="wa" href="https://wa.me/${encodeURIComponent(view.whatsappNumber)}?text=${encodeURIComponent(`Hello Gratitude Stories, I need help with box ${view.boxNumber}.`)}" rel="noopener">Message us on WhatsApp</a>` : "";
  const header = `<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(view.boxNumber)}</p>`;
  if (view.sent) return layout(`${header}<h1>We’ve got your message.</h1><section class="card"><p>A member of the Gratitude Stories team will look into it${view.values?.contact ? " and contact you" : ""}. You don’t need to do anything else.</p>${whatsapp ? `<p class="muted">Need us sooner?</p>${whatsapp}` : ""}<p class="muted"><a href="/b/${encodeURIComponent(view.token)}">Back to your box</a></p></section>`);
  const selected = view.values?.category ?? view.reason;
  return layout(`${header}<h1>How can we help?</h1>${whatsapp ? `<section class="card"><p class="muted">The quickest way to reach us:</p>${whatsapp}</section>` : ""}<form method="post"><section class="card">${view.error ? `<p class="error" role="alert">${escapeHtml(view.error)}</p>` : ""}<fieldset style="margin-top:0"><legend>What do you need help with?</legend>${helpReasons.map(([value, label]) => `<label class="choice"><input type="radio" name="category" value="${value}"${selected === value ? " checked" : ""} required><span>${label}</span></label>`).join("")}</fieldset>
<label for="message">Tell us a little more <span class="hint">(optional)</span></label><textarea id="message" name="message" maxlength="1000">${escapeHtml(view.values?.message ?? "")}</textarea>
<label for="contact">Email or phone so we can reply <span class="hint">(optional)</span></label><input id="contact" name="contact" maxlength="120" autocomplete="email" value="${escapeHtml(view.values?.contact ?? "")}"><p class="hint">Used only to answer this request. Never shown to anyone on the trail.</p>
<button>Send to the team</button></section></form><p class="muted"><a href="/b/${encodeURIComponent(view.token)}">Back to your box</a></p>`);
}

export type RemindView = { token: string; error?: string; values?: Partial<Record<string, string>> };
export function remindHtml(view: RemindView): string {
  const channel = view.values?.channel ?? "email";
  return layout(`<p class="eyebrow">A GENTLE REMINDER</p><h1>Busy right now?</h1><form method="post"><section class="card">${view.error ? `<p class="error" role="alert">${escapeHtml(view.error)}</p>` : ""}<p class="muted">We’ll send you one message in 24 hours. Its link brings you straight back to this choice, on any phone.</p>
<fieldset><legend>How should we remind you?</legend><label class="choice"><input type="radio" name="channel" value="email"${channel === "email" ? " checked" : ""}><span>Email</span></label><label class="choice"><input type="radio" name="channel" value="sms"${channel === "sms" ? " checked" : ""}><span>Text message</span></label></fieldset>
<label for="destination">Your email address or phone number</label><input id="destination" name="destination" required maxlength="254" value="${escapeHtml(view.values?.destination ?? "")}">
<label class="choice" style="margin-top:18px"><input type="checkbox" name="consent" value="yes" required><span>${escapeHtml("Send me one reminder about this box. Nothing else.")}</span></label>
<button>Remind me tomorrow</button></section></form><p class="muted"><a href="/b/${encodeURIComponent(view.token)}">Back to your box</a></p>`);
}
export function remindDoneHtml(token: string, sendAt: Date, previewLink: string | null): string {
  const preview = previewLink ? `<p class="hint">Local preview (development only): <a href="${escapeHtml(previewLink)}">open the reminder link</a></p>` : "";
  return layout(`<p class="eyebrow">A GENTLE REMINDER</p><h1>We’ll remind you once.</h1><section class="card"><p>Expect one message on ${escapeHtml(lagosDate(sendAt))}. That’s all we’ll send.</p>${preview}<p class="muted"><a href="/b/${encodeURIComponent(token)}">Back to your box</a></p></section>`);
}

export type RecoveryView = { kind: "ready" } | { kind: "done" } | { kind: "invalid" };
export function recoveryHtml(view: RecoveryView, token: string): string {
  if (view.kind === "invalid") return layout("<h1>This link is no longer valid.</h1><p class=\"muted\">It may have been used already or expired. Please ask the Gratitude Stories team for a new one.</p>");
  if (view.kind === "done") return layout(`<p class="eyebrow">GRATITUDE STORIES</p><h1>You’re back in.</h1><section class="card"><p>This phone now holds your box. Scan the card from your box again to open its story.</p><p class="muted">Any other phone that had your box open has been signed out.</p></section>`);
  return layout(`<p class="eyebrow">GRATITUDE STORIES</p><h1>Use this phone for your box?</h1><section class="card"><p>The Gratitude Stories team sent you this link because you changed phones. This phone will become the only one that can open your box.</p><form method="post" action="/h/${encodeURIComponent(token)}"><button>Yes, use this phone</button></form><p class="hint">This link works once.</p></section>`);
}

export type ReminderLinkView = { kind: "ready"; boxNumber: string } | { kind: "answered"; response: "accepted" | "declined" } | { kind: "invalid" } | { kind: "thanks" };
export function reminderLinkHtml(view: ReminderLinkView, token: string): string {
  const r = encodeURIComponent(token);
  if (view.kind === "invalid") return layout("<h1>This link is no longer valid.</h1><p class=\"muted\">If you still want to pass your box forward, scan its card again.</p>");
  if (view.kind === "thanks" || (view.kind === "answered" && view.response === "declined")) return layout(`<p class="eyebrow">GRATITUDE STORIES</p><h1>Thank you.</h1><section class="card"><p>We won’t send any more reminders. Your place on the trail stays part of its story.</p></section>`);
  if (view.kind === "answered") return layout(`<p class="eyebrow">GRATITUDE STORIES</p><h1>Pick up where you left off.</h1><section class="card"><form method="post" action="/r/${r}/yes"><button>Continue passing it forward</button></form></section>`);
  return layout(`<p class="eyebrow">GRATITUDE STORIES BOX · ${escapeHtml(view.boxNumber)}</p><h1>You wanted to pass this forward.</h1><section class="card"><p>Would you like to continue your trail? Your next box stays on the same trail, one step further.</p><form method="post" action="/r/${r}/yes"><button>Yes, pass it forward now</button></form><form method="post" action="/r/${r}/no" style="margin-top:12px"><button class="quiet">No thanks</button></form><p class="hint">This is the only reminder we will send.</p></section>`);
}
export function profileHtml(): string {
  return layout(`<p class="eyebrow">YOUR TRAIL PROFILE</p><h1>How should the trail remember you?</h1><section class="card"><p class="muted">This is optional. If you consent, only your first name, last initial, and area will appear to future recipients. Contact details are never shown.</p><form method="post"><label><input type="checkbox" name="displayConsent" value="yes"> I’m happy to appear on the private trail</label><label for="firstName">First name</label><input id="firstName" name="firstName" maxlength="40" autocomplete="given-name" style="box-sizing:border-box;width:100%;margin:8px 0 16px;padding:12px;border:1px solid #d2d2d7;border-radius:8px"><label for="lastInitial">Last initial</label><input id="lastInitial" name="lastInitial" maxlength="1" style="box-sizing:border-box;width:100%;margin:8px 0 16px;padding:12px;border:1px solid #d2d2d7;border-radius:8px"><label for="area">Area</label><input id="area" name="area" maxlength="80" style="box-sizing:border-box;width:100%;margin:8px 0 16px;padding:12px;border:1px solid #d2d2d7;border-radius:8px"><button>Save my choice</button></form></section>`);
}
export function saveStoryHtml(message?: string): string { return layout(`<p class="eyebrow">MY STORIES</p><h1>Keep this story close.</h1><section class="card"><p class="muted">Save this box to a private, passwordless profile. We’ll send a secure sign-in link—no password required.</p>${message ?? ""}<form method="post"><label for="email">Your email</label><input id="email" name="email" type="email" required autocomplete="email" placeholder="you@example.com"><button>Save my story</button></form></section>`); }
export function storiesHtml(stories: StorySummary[]): string { const cards=stories.length?stories.map(s=>`<section class="card"><p class="eyebrow">${escapeHtml(s.fulfilmentStatus)}</p><h2>${escapeHtml(s.boxNumber)}</h2><p class="muted">Your place in this story is safely saved.</p></section>`).join(""):"<section class=\"card\"><p class=\"muted\">No saved stories yet.</p></section>"; return layout(`<p class="eyebrow">MY STORIES</p><h1>Your moments, kept private.</h1>${cards}`); }
export function remindersHtml(emailOptIn: boolean): string { return layout(`<p class="eyebrow">REMINDERS</p><h1>Keep in touch?</h1><section class="card"><p class="muted">Choose whether we may email a one-time reminder about this box. You can change this choice anytime.</p><form method="post"><label><input type="checkbox" name="emailOptIn" value="yes"${emailOptIn ? " checked" : ""}> Email me a reminder</label><button>Save my choice</button></form></section>`); }
export type CheckoutView =
  | { kind: "invalid" }
  /** `start` is the public "Start a gift box" form, which begins a new trail; otherwise the form passes a received box on. */
  | { kind: "ready"; error?: string; values?: Partial<Record<string, string>>; start?: boolean }
  /** `demoPayment` is set only in the in-memory demo; `localPaymentReference` only with a local (non-production) database. Both offer a payment simulator. */
  | { kind: "pending"; reference: string; trackerToken: string | null; demoPayment: boolean; localPaymentReference?: string | null; start?: boolean };

export function checkoutHtml(view: CheckoutView): string {
  if (view.kind === "invalid") return layout("<h1>This checkout link has expired.</h1><p class=\"muted\">Return to your box page to start again.</p>");
  if (view.kind === "pending") {
    const tracker = view.trackerToken ? `<p><a href="/t/${encodeURIComponent(view.trackerToken)}">Track this box privately</a></p>` : "";
    const demo = view.demoPayment ? `<form method="post" action="/demo/pay"><input type="hidden" name="reference" value="${escapeHtml(view.reference)}"><button class="demo">Simulate payment and delivery (demo only)</button></form><p class="hint">Local demo: skips Paystack and fulfilment so you can open ${view.start ? "the box" : "the next box"} as its recipient.</p>`
      : view.localPaymentReference ? `<form method="post" action="/demo/pay"><input type="hidden" name="reference" value="${escapeHtml(view.localPaymentReference)}">${view.trackerToken ? `<input type="hidden" name="trackerToken" value="${escapeHtml(view.trackerToken)}">` : ""}<button class="demo">Simulate a successful payment (local testing only)</button></form><p class="hint">Stands in for Paystack. The ${view.start ? "first box of the new trail" : "new box"} appears in the staff console as Paid, ready to pack and deliver.</p>` : "";
    return layout(`<p class="eyebrow">GRATITUDE STORIES</p><h1>${view.start ? "Your gift box is reserved." : "Your next box is reserved."}</h1><section class="card"><p class="muted">Order ${escapeHtml(view.reference)}</p><p>Your note and delivery details are saved. ${view.start ? "Your trail begins" : "A new box exists"} only once payment is verified.</p>${tracker}${demo}</section>`);
  }
  const value = (name: string) => escapeHtml(view.values?.[name] ?? "");
  const checked = (option: string) => (view.values?.deliveryTo ?? "recipient") === option ? " checked" : "";
  const field = (name: string, label: string, attributes: string, hint = "") => `<label for="${name}">${label}</label><input id="${name}" name="${name}" value="${value(name)}" ${attributes}>${hint ? `<p class="hint">${hint}</p>` : ""}`;
  const intro = view.start
    ? `<h1>Start a gift box.</h1><p class="muted">Send a beautiful box to someone you appreciate. When they open it, they can choose to pass the feeling on, and your gift becomes the first chapter of a new trail.</p>
<form method="post" action="/start">
<section class="card">${view.error ? `<p class="error" role="alert">${escapeHtml(view.error)}</p>` : ""}
<h2>Your message</h2><p class="muted">They see your name and note when they open the box. Your note stays between the two of you.</p>`
    : `<h1>Keep the kindness moving.</h1>
<form method="post" action="/checkout">
<section class="card">${view.error ? `<p class="error" role="alert">${escapeHtml(view.error)}</p>` : ""}
<h2>Your message</h2><p class="muted">The next person sees your name and note when they open the box. Your note stays between the two of you.</p>`;
  return layout(`<p class="eyebrow">GRATITUDE STORIES</p>${intro}
${field("giverName", "Your first name, as they will see it", `required maxlength="40" autocomplete="given-name"`)}
<label for="note">A note for them <span class="hint">(optional)</span></label><textarea id="note" name="note" maxlength="500" placeholder="Why you thought of them…">${value("note")}</textarea>
</section>
<section class="card"><h2>Delivery</h2>
<fieldset><legend>Where should we deliver the box?</legend>
<label class="choice"><input type="radio" name="deliveryTo" value="recipient"${checked("recipient")}><span>Straight to them<small>We deliver it to the person you chose.</small></span></label>
<label class="choice"><input type="radio" name="deliveryTo" value="giver"${checked("giver")}><span>To me, I'll hand it over<small>We deliver it to you to give in person.</small></span></label>
</fieldset>
${field("deliveryName", "Name of the person receiving the delivery", `required maxlength="80" autocomplete="name"`)}
${field("deliveryPhone", "Their phone number", `required type="tel" maxlength="30" autocomplete="tel" inputmode="tel"`, "The courier calls this number. It is never shown on the trail.")}
${field("addressLine1", "Address", `required maxlength="160" autocomplete="address-line1"`)}
${field("addressLine2", "Apartment, landmark (optional)", `maxlength="160" autocomplete="address-line2"`)}
${field("city", "City", `required maxlength="80" autocomplete="address-level2"`)}
${field("region", "Area or state (optional)", `maxlength="80" autocomplete="address-level1"`)}
<label for="deliveryNotes">Delivery instructions <span class="hint">(optional)</span></label><textarea id="deliveryNotes" name="deliveryNotes" maxlength="500" style="min-height:80px">${value("deliveryNotes")}</textarea>
</section>
<section class="card"><h2>Your email</h2>
${field("email", "Email for your receipt and private tracker", `required type="email" maxlength="254" autocomplete="email"`, "Used only for this order.")}
<button>Continue to payment</button></section>
</form>`);
}
/** Local testing only: shown after the payment simulator marks an order paid against a local database. */
export function localPaymentDoneHtml(trackerToken: string | null): string {
  const tracker = trackerToken ? `<p><a href="/t/${encodeURIComponent(trackerToken)}">Track this box privately</a></p>` : "";
  return layout(`<p class="eyebrow">LOCAL TESTING</p><h1>Payment simulated.</h1><section class="card"><p class="muted">The next box now exists on the same trail. Open the staff console, find it under <b>Boxes</b> as “Paid · to pack”, then bind a card, pack, hand to the courier and confirm delivery. Its card opens it once it is delivered.</p><p><a href="/admin/boxes">Open the staff console</a></p>${tracker}</section>${giftAgainStyles}${giftAnother("Gift another box?", "Start another trail for someone else.")}`);
}
export function paymentCompleteHtml(trackerToken: string | undefined): string {
  const tracker = trackerToken ? `<p><a href="/t/${encodeURIComponent(trackerToken)}">Track this box privately</a></p>` : "";
  return layout(`<p class="eyebrow">GRATITUDE STORIES</p><h1>Thank you.</h1><section class="card"><p class="muted">Your payment is being confirmed. Your box is created only after secure payment verification.</p>${tracker}</section>${giftAgainStyles}${giftAnother("Thinking of someone else too?", "You can send another box to someone new.")}`);
}
/** The "Gift another box" invitation shown once a gift has gone through. */
function giftAnother(heading: string, text: string): string {
  return `<section class="card gift-again"><h2>${heading}</h2><p class="muted">${text}</p><a class="button-link" href="/start">Gift another box <span aria-hidden="true">→</span></a></section>`;
}
const giftAgainStyles = `<style>.gift-again{text-align:center}.gift-again h2{margin-bottom:6px}.button-link{position:relative;overflow:hidden;isolation:isolate;display:flex;align-items:center;justify-content:center;gap:6px;min-height:54px;margin-top:14px;border-radius:999px;color:#fff;background:var(--green);box-shadow:0 10px 24px #0f7b4f33;font-weight:800;text-decoration:none;transition:transform .25s cubic-bezier(.3,1.6,.5,1),background-color .2s}.button-link:hover{background:var(--green-dark);transform:translateY(-2px)}.button-link.quiet{color:var(--ink);background:#eef3ef;box-shadow:none}.gift-again{border-style:dashed;border-color:#0f7b4f33;background:#fbfef9}.gift-again h2:before{display:block;margin-bottom:6px;font-size:36px;content:"🎁";animation:wiggle 2.4s ease-in-out infinite}@keyframes wiggle{0%,60%,100%{transform:rotate(0)}70%{transform:rotate(-12deg)}80%{transform:rotate(10deg)}90%{transform:rotate(-6deg)}}</style>`;

const trackerStyles = `<style>
.progress-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin:0 0 10px;font-size:15px;font-weight:800}.progress-head span{color:var(--muted);font-weight:700}
.segments{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:6px}.segments i{height:10px;border-radius:999px;background:#e6efe9;transform-origin:left;animation:fill .6s cubic-bezier(.2,.8,.2,1) both}.segments i:nth-child(2){animation-delay:.1s}.segments i:nth-child(3){animation-delay:.2s}.segments i:nth-child(4){animation-delay:.3s}.segments i:nth-child(5){animation-delay:.4s}.segments i.done{background:var(--green)}.segments i.current{background:var(--lime)}.segments i.stopped{background:#f1b5bd}
.road{position:relative;margin:22px 0 0;padding:0;list-style:none}
.stage{position:relative;display:grid;grid-template-columns:44px 1fr;gap:14px;padding-bottom:26px;animation:rise .5s cubic-bezier(.2,.8,.2,1) both}.stage:nth-child(2){animation-delay:.08s}.stage:nth-child(3){animation-delay:.16s}.stage:nth-child(4){animation-delay:.24s}.stage:nth-child(5){animation-delay:.32s}.stage:last-child{padding-bottom:0}
.stage:not(:last-child):after{position:absolute;top:44px;bottom:2px;left:21px;width:3px;border-radius:3px;background:#e6efe9;content:""}.stage.done:not(:last-child):after{background:var(--green)}
.node{position:relative;z-index:1;display:grid;place-items:center;width:44px;height:44px;border:2px solid #d6e2db;border-radius:16px;background:#fff;color:#8a9a91;font-weight:800;font-size:15px}
.stage.done .node{--tilt:-6deg;border-color:transparent;background:var(--green);color:#fff;animation:nodepop .5s cubic-bezier(.3,1.6,.5,1) both}.stage.done:nth-child(even) .node{--tilt:6deg}
.stage.current .node{border-color:var(--forest);background:var(--lime);color:var(--forest);box-shadow:0 0 0 6px #cdf26d55}
.stage.current .node:after{position:absolute;inset:-8px;border:2px solid var(--lime);border-radius:20px;animation:pulse 2s ease-out infinite;content:""}
.stage.stopped .node{border-radius:16px;border-color:#f1b5bd;color:#a1192b;background:#fdecee}
.stage h3{margin:9px 0 2px;font-family:var(--display);font-size:18px;font-weight:700;letter-spacing:-.015em}.stage.upcoming h3{color:#8a9a91}
.stage p{margin:0;color:var(--muted);font-size:14px;line-height:1.5}.stage.upcoming p{color:#8a9a91}
.when{display:inline-block;margin-top:8px;padding:4px 11px;border-radius:999px;background:#eef3ef;color:#5c6b63;font-size:12px;font-weight:800}.stage.done .when{background:var(--green-soft);color:var(--green-dark)}.stage.current .when{background:var(--forest);color:var(--lime)}.stage.stopped .when{background:#fdecee;color:#a1192b}
.tracker-foot{margin:18px 0 0;padding-top:16px;border-top:2px dashed #e1e9e4;color:var(--muted);font-size:13px}
@keyframes nodepop{from{transform:scale(.5) rotate(0)}to{transform:scale(1) rotate(var(--tilt))}}@keyframes fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes pulse{from{opacity:.9;transform:scale(.85)}to{opacity:0;transform:scale(1.25)}}
@media (prefers-reduced-motion:reduce){.stage.current .node:after{animation:none;opacity:.6}}
</style>`;

const trackerTime = (date: Date) => new Date(date).toLocaleString("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function trackerHtml(page: GiverTrackerPage): string {
  if (page.kind === "not-found") return layout("<h1>We could not find that tracker.</h1><p class=\"muted\">Please check your private tracking link.</p>");
  const current = page.stages.find((stage) => stage.state === "current" || stage.state === "stopped");
  const heading = page.stopped ? "This gift was stopped." : page.complete ? "Delivered. Your part is complete." : !page.paymentConfirmed ? "Your gift is reserved." : page.startedTrail ? "Your gift is on its way." : "You kept it moving.";
  const summary = page.stopped
    ? `Order ${page.stopped}`
    : page.complete ? "All stages complete" : `Stage ${page.progress.done + 1} of ${page.progress.total}: ${current?.title ?? ""}`;
  const segments = page.stages.map((stage) => `<i class="${stage.state}"></i>`).join("");
  const label = ({ state, at, key }: TrackerStage) =>
    state === "done" && at ? `Done · ${escapeHtml(trackerTime(at))}` : state === "current" ? (key === "paid" ? "Waiting for payment" : "In progress") : state === "stopped" ? (page.stopped === "refunded" ? "Refunded" : "Cancelled") : "Up next";
  const road = page.stages.map((stage, index) => `<li class="stage ${stage.state}"${stage.state === "current" ? ` aria-current="step"` : ""}><span class="node" aria-hidden="true">${stage.state === "done" ? "✓" : stage.state === "stopped" ? "✕" : index + 1}</span><div><h3>${escapeHtml(stage.title)}</h3><p>${escapeHtml(stage.description)}</p><span class="when">${label(stage)}</span></div></li>`).join("");
  const another = page.stopped
    ? giftAnother("Still want to send something?", "Start a new gift box any time.")
    : page.complete
      ? giftAnother("Make someone else’s day", "That feeling of giving? You can start it again for someone new.")
      : page.paymentConfirmed ? giftAnother("Thinking of someone else too?", "Your gift is confirmed. You can send another box while this one is on its way.") : "";
  return layout(`${trackerStyles}${giftAgainStyles}<p class="eyebrow">PRIVATE BOX TRACKER</p><h1>${heading}</h1>
<section class="card"><p class="progress-head">${escapeHtml(summary)}<span>${page.progress.done}/${page.progress.total} done</span></p><div class="segments" role="img" aria-label="${page.progress.done} of ${page.progress.total} stages done">${segments}</div>
<ol class="road" aria-label="Delivery road map">${road}</ol>
<p class="tracker-foot">Order ${escapeHtml(page.orderReference)} · This tracker ends at delivery to protect their privacy. Keep this link private; anyone with it can see this page.</p></section>${another}`);
}
