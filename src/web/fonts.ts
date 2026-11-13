/**
 * Brand fonts, self-hosted (the CSP allows only same-origin resources): Bricolage Grotesque for headings and
 * Nunito for text. Both are SIL Open Font License; see public/fonts/OFL-*.txt. Subset to Latin, Latin Extended
 * (Yoruba, Igbo and Hausa diacritics), punctuation, arrows and the naira sign.
 */
export const fontFiles = { "nunito.woff2": "nunito.woff2", "bricolage.woff2": "bricolage.woff2" } as const;
export const fontFaces = `@font-face{font-family:"Nunito";src:url(/assets/fonts/nunito.woff2) format("woff2");font-weight:400 900;font-style:normal;font-display:swap}@font-face{font-family:"Bricolage Grotesque";src:url(/assets/fonts/bricolage.woff2) format("woff2");font-weight:600 800;font-style:normal;font-display:swap}`;
/** Preload both so headings and text render in the brand fonts without a visible swap on fast connections. */
export const fontPreloads = `<link rel="preload" href="/assets/fonts/bricolage.woff2" as="font" type="font/woff2" crossorigin><link rel="preload" href="/assets/fonts/nunito.woff2" as="font" type="font/woff2" crossorigin>`;
export const displayStack = `"Bricolage Grotesque",ui-rounded,"SF Pro Rounded","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif`;
export const textStack = `"Nunito",ui-rounded,"SF Pro Rounded","Segoe UI",system-ui,-apple-system,Roboto,"Helvetica Neue",Arial,sans-serif`;
