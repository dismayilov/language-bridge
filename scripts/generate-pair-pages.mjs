#!/usr/bin/env node
/*
 * MyNextLanguage — Programmatic SEO page generator
 * --------------------------------------------------
 * Reads /data/languages-matrix.json and emits one static HTML page per
 * (source, target) language pair under /from/<src>/to/<tgt>/index.html.
 * Also rebuilds /sitemap.xml to list every pair page.
 *
 * Each page is hand-tunable but is small (~3-5 KB) and contains:
 *   • Unique <title>, meta description, canonical, OG/Twitter tags
 *   • <h1> "How easy is <target> for <source> speakers?"
 *   • 5-dimension score breakdown (lexical, grammar, phonology, script, family)
 *   • FSI difficulty tier badge
 *   • Up to 3 parallel sample sentences (when available)
 *   • Optional curated cognate exemplars (when available)
 *   • Link to the interactive tool with the pair preselected
 *   • Cross-links to the 5 closest alternative target languages
 *   • JSON-LD: Article, BreadcrumbList
 *
 * Run from repo root:
 *     node scripts/generate-pair-pages.mjs
 *
 * Zero dependencies (pure Node ≥ 18). No build step, no bundler.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const DATA_PATH = resolve(ROOT, 'data/languages-matrix.json');
const OUT_DIR   = resolve(ROOT, 'from');
const SITEMAP   = resolve(ROOT, 'sitemap.xml');
const SITE      = 'https://mynextlanguage.org';
const TODAY     = new Date().toISOString().slice(0, 10);

/* ── 1. Load the matrix ────────────────────────────────────────────────── */
const D = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const LANGS         = Object.keys(D.data.languages);
const LANG_NAMES_EN = D.lang_names.en;
const LANG_FLAG     = D.lang_flag;
const FSI           = D.fsi_tier;
const PARALLELS     = D.parallel_sentences;
const COGNATES      = D.lsg_cognates;
const DEFAULT_W     = D.default_weights;

const FSI_LABEL = { 1: 'Cat I (Easiest)', 2: 'Cat II', 3: 'Cat III', 4: 'Cat IV (Hardest)' };
const FSI_HOURS = { 1: '600–750', 2: '~900', 3: '~1,100', 4: '~2,200' };

/* ── 2. Scoring helpers — mirror /js/graph-engine.js so pages and tool agree */
function pairKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

function simLexical(a, b) {
  if (a === b) return 1;
  const k = pairKey(a, b);
  if (D.data.lexical[k] !== undefined) return D.data.lexical[k];
  const la = D.data.languages[a], lb = D.data.languages[b];
  if (la.family    !== lb.family)    return 0.03;
  if (la.branch    !== lb.branch)    return 0.10;
  if (la.subbranch !== lb.subbranch) return 0.30;
  return 0.55;
}
function simGenealogical(a, b) {
  const la = D.data.languages[a], lb = D.data.languages[b];
  if (la.family    !== lb.family)    return 0;
  if (la.branch    !== lb.branch)    return 0.4;
  if (la.subbranch !== lb.subbranch) return 0.7;
  return 1;
}
function simWordOrder(la, lb) {
  const fam = { 'SVO':['SVO'], 'V2':['V2','SVO'], 'SOV':['SOV'], 'VSO':['VSO'],
                'SVO(free)':['SVO(free)','SVO'], 'SOV(free)':['SOV(free)','SOV'],
                'topic-focus(free)':['topic-focus(free)','SVO(free)','SVO'] };
  if (la.word_order === lb.word_order) return 1;
  if ((fam[la.word_order] || []).indexOf(lb.word_order) > -1) return 0.7;
  if ((fam[lb.word_order] || []).indexOf(la.word_order) > -1) return 0.7;
  return 0;
}
function simMorph(la, lb) {
  if (la.morphology === lb.morphology) return 1;
  const p = { 'analytic|analytic-fusional':0.8, 'fusional|analytic-fusional':0.8,
              'analytic|fusional':0.3, 'fusional|agglutinative':0.2,
              'analytic|agglutinative':0.1, 'analytic-fusional|agglutinative':0.15,
              'analytic|analytic-agglutinative':0.4, 'agglutinative|analytic-agglutinative':0.6 };
  return p[[la.morphology, lb.morphology].sort().join('|')] || 0;
}
function simGrammatical(a, b) {
  const la = D.data.languages[a], lb = D.data.languages[b];
  const cs = Math.max(0, 1 - Math.abs((la.case_count   || 0) - (lb.case_count   || 0)) / 8);
  const gs = Math.max(0, 1 - Math.abs((la.gender_count || 0) - (lb.gender_count || 0)) / 3);
  const as = (la.articles === lb.articles) ? 1
           : (la.articles !== 'none' && lb.articles !== 'none' ? 0.5 : 0.2);
  return (cs + gs + as + simWordOrder(la, lb) + simMorph(la, lb) +
          (la.vowel_harmony === lb.vowel_harmony ? 1 : 0)) / 6;
}
function simPhonological(a, b) {
  const pa = new Set(D.data.languages[a].phoneme_features || []);
  const pb = new Set(D.data.languages[b].phoneme_features || []);
  if (pa.size === 0 && pb.size === 0) return 1;
  let inter = 0; pa.forEach(x => { if (pb.has(x)) inter++; });
  const u = pa.size + pb.size - inter;
  return u === 0 ? 0 : inter / u;
}
function scriptRoot(ws) {
  if (!ws) return '';
  const roots = ['Latin','Cyrillic','Arabic','Hebrew','Devanagari'];
  for (const r of roots) if (ws.indexOf(r) > -1) return r;
  return ws;
}
function simWritingSystem(a, b) {
  const sa = D.data.languages[a].writing_system, sb = D.data.languages[b].writing_system;
  if (sa === sb) return 1;
  return scriptRoot(sa) === scriptRoot(sb) ? 0.4 : 0;
}
function composite(a, b) {
  const w = DEFAULT_W;
  const T = w.lexical + w.grammatical + w.phonological + w.writing_system + w.genealogical;
  return simLexical(a, b)        * (w.lexical        / T) +
         simGenealogical(a, b)   * (w.genealogical   / T) +
         simGrammatical(a, b)    * (w.grammatical    / T) +
         simPhonological(a, b)   * (w.phonological   / T) +
         simWritingSystem(a, b)  * (w.writing_system / T);
}
function distancePct(a, b) { return Math.round(100 * (1 - composite(a, b))); }

/* ── 3. HTML helpers ──────────────────────────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function bar(value01, color = '#059669') {
  const pct = Math.round(value01 * 100);
  return `<div style="background:#1c1917;border-radius:4px;height:8px;overflow:hidden">
    <div style="background:${color};width:${pct}%;height:100%"></div>
  </div>`;
}

function pageHtml(src, tgt) {
  const srcName  = LANG_NAMES_EN[src] || D.data.languages[src].name;
  const tgtName  = LANG_NAMES_EN[tgt] || D.data.languages[tgt].name;
  const srcFlag  = LANG_FLAG[src] || '🌐';
  const tgtFlag  = LANG_FLAG[tgt] || '🌐';
  const tgtNative = D.lang_native[tgt] || '';
  const tier     = FSI[tgt] || 0;
  const dist     = distancePct(src, tgt);
  const lex      = simLexical(src, tgt);
  const gram     = simGrammatical(src, tgt);
  const phon     = simPhonological(src, tgt);
  const scrSim   = simWritingSystem(src, tgt);
  const gen      = simGenealogical(src, tgt);
  const isCurated = D.data.lexical[pairKey(src, tgt)] !== undefined;

  // 5 closest alternative targets (excluding src and tgt)
  const others = LANGS.filter(c => c !== src && c !== tgt)
    .map(c => ({ c, d: distancePct(src, c) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 5);

  // Parallel sentences (try both key orders)
  const psKey1 = src + '|' + tgt;
  const psKey2 = tgt + '|' + src;
  const ps = PARALLELS[psKey1] || PARALLELS[psKey2] || null;

  // Curated cognate examples
  const cognates = COGNATES[pairKey(src, tgt)] || null;

  const title    = `How easy is ${tgtName} for ${srcName} speakers? — MyNextLanguage`;
  const metaDesc = `Linguistic similarity score between ${srcName} (${srcFlag}) and ${tgtName} (${tgtFlag}): ${dist}% distance. Detailed breakdown of lexical overlap, grammar, phonology, writing system, and language family. Free interactive comparison tool.`;
  const canonical = `${SITE}/from/${src}/to/${tgt}/`;
  const toolUrl   = `${SITE}/?langs=${src}&prof=B2&target=${tgt}`;

  const tierBadge = tier ? `<span style="display:inline-block;padding:2px 10px;border-radius:999px;background:${tier===1?'#065f46':tier===2?'#a16207':tier===3?'#9a3412':'#7f1d1d'};color:#fff;font-size:.78rem;font-weight:600">FSI ${FSI_LABEL[tier]} — ${FSI_HOURS[tier]} hours</span>` : '';

  const cognatesHtml = cognates ? `
      <section style="margin-top:2rem">
        <h2 style="font-size:1.05rem;font-weight:600;margin-bottom:.75rem">Curated cognates between ${srcName} and ${tgtName}</h2>
        <p style="opacity:.7;font-size:.88rem;margin-bottom:.75rem">Word pairs that share a common etymological root — instantly recognisable across both languages:</p>
        <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.5rem">
          ${cognates.map(({gloss, a, b}) => `
            <li style="background:#1c1917;border-radius:8px;padding:.65rem .8rem">
              <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.05em;opacity:.5">${esc(gloss)}</div>
              <div style="margin-top:.15rem;font-size:.95rem"><b style="color:#34d399">${esc(a)}</b> &nbsp;↔&nbsp; <b style="color:#fbbf24">${esc(b)}</b></div>
            </li>
          `).join('')}
        </ul>
      </section>` : '';

  const parallelsHtml = ps && ps.length ? `
      <section style="margin-top:2rem">
        <h2 style="font-size:1.05rem;font-weight:600;margin-bottom:.75rem">Sample sentences side-by-side</h2>
        <p style="opacity:.7;font-size:.88rem;margin-bottom:.75rem">How everyday sentences look in both languages:</p>
        ${ps.slice(0, 3).map(p => `
          <div style="background:#1c1917;border-radius:8px;padding:.85rem 1rem;margin-bottom:.5rem">
            <div style="font-size:.7rem;text-transform:uppercase;opacity:.5;margin-bottom:.35rem">${srcFlag} ${esc(srcName)}</div>
            <div style="font-size:.95rem;margin-bottom:.5rem">${esc(p.b || p.s || '')}</div>
            <div style="font-size:.7rem;text-transform:uppercase;opacity:.5;margin-bottom:.35rem">${tgtFlag} ${esc(tgtName)}</div>
            <div style="font-size:.95rem;color:#a7f3d0">${esc(p.t || p.target || '')}</div>
          </div>
        `).join('')}
      </section>` : '';

  const othersHtml = `
      <section style="margin-top:2rem">
        <h2 style="font-size:1.05rem;font-weight:600;margin-bottom:.75rem">Other easy languages for ${srcName} speakers</h2>
        <p style="opacity:.7;font-size:.88rem;margin-bottom:.75rem">The 5 languages with the lowest linguistic distance from ${srcName}:</p>
        <ul style="list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:.5rem">
          ${others.map(o => {
            const oName = LANG_NAMES_EN[o.c] || D.data.languages[o.c].name;
            const oFlag = LANG_FLAG[o.c] || '🌐';
            return `<li><a href="/from/${src}/to/${o.c}/" style="display:block;background:#1c1917;border-radius:8px;padding:.65rem .8rem;text-decoration:none;color:#e7e5e4">
              <div style="font-size:1.3rem">${oFlag}</div>
              <div style="font-size:.9rem;font-weight:600">${esc(oName)}</div>
              <div style="font-size:.78rem;color:#34d399;margin-top:.15rem">${o.d}% distance</div>
            </a></li>`;
          }).join('')}
        </ul>
      </section>`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "headline": `How easy is ${tgtName} for ${srcName} speakers?`,
        "description": metaDesc,
        "datePublished": TODAY,
        "dateModified": TODAY,
        "author": { "@type": "Organization", "name": "MyNextLanguage", "url": SITE },
        "publisher": { "@type": "Organization", "name": "MyNextLanguage", "url": SITE,
          "logo": { "@type": "ImageObject", "url": `${SITE}/icon_test_2.1.jpeg` } },
        "mainEntityOfPage": canonical,
        "image": `${SITE}/icon_test_2.1.jpeg`,
        "inLanguage": "en",
        "about": [
          { "@type": "Language", "name": srcName },
          { "@type": "Language", "name": tgtName }
        ]
      },
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "MyNextLanguage", "item": SITE + '/' },
          { "@type": "ListItem", "position": 2, "name": `From ${srcName}`, "item": `${SITE}/from/${src}/` },
          { "@type": "ListItem", "position": 3, "name": `to ${tgtName}`, "item": canonical }
        ]
      }
    ]
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(metaDesc)}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index, follow, max-snippet:-1">

<!-- Open Graph -->
<meta property="og:type" content="article">
<meta property="og:site_name" content="MyNextLanguage">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:image" content="${SITE}/icon_test_2.1.jpeg">
<meta property="og:locale" content="en_US">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${SITE}/icon_test_2.1.jpeg">

<!-- Theme bootstrap (no flash) -->
<script>document.documentElement.classList.add('dark');</script>

<style>
  :root { color-scheme: dark; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Helvetica,Arial,sans-serif; background:#0c0a09; color:#e7e5e4; line-height:1.55; }
  a { color:#34d399; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; }
  .nav { display:flex; align-items:center; justify-content:space-between; padding-bottom:1rem; border-bottom:1px solid #292524; margin-bottom:2rem; font-size:.88rem; opacity:.85 }
  .nav a { text-decoration:none; font-weight:600 }
  .breadcrumb { color:#78716c; font-size:.78rem; margin-bottom:.5rem }
  .breadcrumb a { color:#78716c; text-decoration:none }
  .breadcrumb a:hover { color:#a8a29e }
  h1 { font-size:1.75rem; line-height:1.25; margin:.25rem 0 1rem; font-weight:700 }
  .lead { font-size:1.02rem; opacity:.85; margin-bottom:1.5rem }
  .flags { font-size:2.5rem; line-height:1; margin-bottom:.5rem }
  .dist-pill { display:inline-block; padding:6px 14px; border-radius:999px; background:#052e16; color:#34d399; font-weight:700; font-size:1rem; margin-right:.5rem; border:1px solid #34d399 }
  .scores { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:.75rem; margin:1.5rem 0 }
  .score-card { background:#1c1917; border-radius:10px; padding:1rem }
  .score-label { font-size:.7rem; text-transform:uppercase; letter-spacing:.05em; opacity:.55; margin-bottom:.35rem }
  .score-value { font-size:1.25rem; font-weight:700; margin-bottom:.5rem }
  .cta { display:inline-block; margin-top:1.5rem; padding:.85rem 1.4rem; background:#0F6E56; color:#fff; border-radius:10px; text-decoration:none; font-weight:600; font-size:.95rem }
  .cta:hover { background:#0a5946 }
  .badge-row { margin: 0 0 1rem; display:flex; gap:.5rem; flex-wrap:wrap; align-items:center }
  footer { margin-top:3rem; padding-top:1.5rem; border-top:1px solid #292524; font-size:.78rem; opacity:.6 }
</style>

<script type="application/ld+json">${jsonLd}</script>
</head>
<body>
<div class="wrap">

  <nav class="nav">
    <a href="/">← MyNextLanguage</a>
    <a href="${toolUrl}">Open interactive tool →</a>
  </nav>

  <div class="breadcrumb">
    <a href="/">Home</a> &nbsp;›&nbsp;
    <a href="/from/${src}/">From ${esc(srcName)}</a> &nbsp;›&nbsp;
    to ${esc(tgtName)}
  </div>

  <div class="flags">${srcFlag} → ${tgtFlag}</div>
  <h1>How easy is ${esc(tgtName)} for ${esc(srcName)} speakers?</h1>
  <p class="lead">
    Going from <b>${esc(srcName)}</b> to <b>${esc(tgtName)}</b>${tgtNative ? ` <span style="opacity:.55">(${esc(tgtNative)})</span>` : ''} has a composite linguistic distance of <b style="color:#34d399">${dist}%</b>${isCurated ? ' (curated lexical data)' : ' (heuristic estimate)'}. Below is the dimension-by-dimension breakdown.
  </p>

  <div class="badge-row">
    <span class="dist-pill">${dist}% distance</span>
    ${tierBadge}
  </div>

  <section class="scores">
    <div class="score-card">
      <div class="score-label">Lexical similarity</div>
      <div class="score-value">${Math.round(lex * 100)}%</div>
      ${bar(lex, '#34d399')}
      <p style="font-size:.8rem;opacity:.65;margin:.6rem 0 0">Shared vocabulary, cognates, and loanwords.</p>
    </div>
    <div class="score-card">
      <div class="score-label">Grammatical distance</div>
      <div class="score-value">${Math.round(gram * 100)}%</div>
      ${bar(gram, '#60a5fa')}
      <p style="font-size:.8rem;opacity:.65;margin:.6rem 0 0">Morphology, syntax, word order, cases.</p>
    </div>
    <div class="score-card">
      <div class="score-label">Phonological similarity</div>
      <div class="score-value">${Math.round(phon * 100)}%</div>
      ${bar(phon, '#a78bfa')}
      <p style="font-size:.8rem;opacity:.65;margin:.6rem 0 0">Shared sounds and phoneme inventory.</p>
    </div>
    <div class="score-card">
      <div class="score-label">Writing-system match</div>
      <div class="score-value">${Math.round(scrSim * 100)}%</div>
      ${bar(scrSim, '#fbbf24')}
      <p style="font-size:.8rem;opacity:.65;margin:.6rem 0 0">${esc(D.data.languages[src].writing_system)} → ${esc(D.data.languages[tgt].writing_system)}</p>
    </div>
    <div class="score-card">
      <div class="score-label">Genealogical kinship</div>
      <div class="score-value">${Math.round(gen * 100)}%</div>
      ${bar(gen, '#f472b6')}
      <p style="font-size:.8rem;opacity:.65;margin:.6rem 0 0">${esc(D.data.languages[src].family)} ↔ ${esc(D.data.languages[tgt].family)}</p>
    </div>
  </section>

  <a class="cta" href="${toolUrl}">Open the interactive comparison →</a>

  ${parallelsHtml}
  ${cognatesHtml}
  ${othersHtml}

  <footer>
    Scores combine lexical overlap, typological grammar comparison, phonological feature overlap, writing-system kinship, and genealogical distance. CEFR proficiency adjustments are available in the <a href="${toolUrl}">interactive tool</a>.
    <br><br>
    <a href="/">← Back to MyNextLanguage</a>
  </footer>

</div>
</body>
</html>
`;
}

/* ── 4. Generate (resumable, parallel batched writes) ─────────────────── */
const RESUME = process.argv.includes('--resume');
const FRESH  = process.argv.includes('--fresh');

console.log(`[gen] Source dataset: ${LANGS.length} languages`);
console.log(`[gen] Pages to emit:  ${LANGS.length * (LANGS.length - 1)} pair pages`);
console.log(`[gen] Mode: ${FRESH ? 'fresh (rebuild all)' : RESUME ? 'resume (skip existing)' : 'fresh'}`);

if (FRESH && existsSync(OUT_DIR)) {
  console.log(`[gen] Clearing existing ${OUT_DIR}/ …`);
  rmSync(OUT_DIR, { recursive: true, force: true });
} else if (existsSync(OUT_DIR) && !RESUME) {
  console.log(`[gen] Note: ${OUT_DIR}/ already exists. Use --resume to skip existing files, or --fresh to rebuild from scratch.`);
  console.log(`[gen] Defaulting to --resume behaviour.`);
}

let written = 0, skipped = 0;
const total = LANGS.length * (LANGS.length - 1);
const sitemapEntries = [
  `<url><loc>${SITE}/</loc><lastmod>${TODAY}</lastmod><priority>1.0</priority></url>`,
  `<url><loc>${SITE}/compare.html</loc><lastmod>${TODAY}</lastmod><priority>0.7</priority></url>`,
  `<url><loc>${SITE}/difficulty.html</loc><lastmod>${TODAY}</lastmod><priority>0.7</priority></url>`,
  `<url><loc>${SITE}/static.html</loc><lastmod>${TODAY}</lastmod><priority>0.5</priority></url>`,
];

// Async batched writes — much faster than synchronous I/O over the mount.
const BATCH = 32;
const tasks = [];
for (const src of LANGS) {
  for (const tgt of LANGS) {
    if (src === tgt) continue;
    tasks.push({ src, tgt });
    sitemapEntries.push(`<url><loc>${SITE}/from/${src}/to/${tgt}/</loc><lastmod>${TODAY}</lastmod><priority>0.6</priority></url>`);
  }
}

async function processOne({ src, tgt }) {
  const dir  = resolve(OUT_DIR, src, 'to', tgt);
  const file = resolve(dir, 'index.html');
  if (existsSync(file)) { skipped++; return; }
  await mkdir(dir, { recursive: true });
  await writeFile(file, pageHtml(src, tgt), 'utf8');
  written++;
}

console.log(`[gen] Writing ${tasks.length} pages in batches of ${BATCH}…`);
const t0 = Date.now();
for (let i = 0; i < tasks.length; i += BATCH) {
  const slice = tasks.slice(i, i + BATCH);
  await Promise.all(slice.map(processOne));
  if ((i + BATCH) % 1000 < BATCH) {
    const done = i + BATCH;
    const pct  = Math.round(100 * done / tasks.length);
    const sec  = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[gen]   ${done.toString().padStart(5)} / ${tasks.length}  (${pct}%)  written=${written} skipped=${skipped}  ${sec}s`);
  }
}

/* ── 5. Source-language hub pages (/from/<src>/) ──────────────────────── */
//    Brief landing pages that index the 95 outgoing targets — improves
//    crawl depth and gives "From English" / "From Spanish" SEO surface.
for (const src of LANGS) {
  const srcName = LANG_NAMES_EN[src] || D.data.languages[src].name;
  const srcFlag = LANG_FLAG[src] || '🌐';
  const ranked = LANGS.filter(c => c !== src)
    .map(c => ({ c, d: distancePct(src, c) }))
    .sort((a, b) => a.d - b.d);

  const title = `Languages to learn if you speak ${srcName} — MyNextLanguage`;
  const desc  = `All 95 world languages ranked by how easy each is to learn for ${srcName} speakers, with linguistic distance, FSI difficulty tier, and lexical / grammar / phonology / script / family breakdowns.`;
  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/from/${src}/">
<script>document.documentElement.classList.add('dark');</script>
<style>
:root{color-scheme:dark}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;background:#0c0a09;color:#e7e5e4;line-height:1.55}
a{color:#34d399}.wrap{max-width:760px;margin:0 auto;padding:32px 20px}
.flags{font-size:2.5rem}h1{margin:.5rem 0 1rem;font-size:1.6rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.5rem;margin-top:1.5rem}
.card{display:block;background:#1c1917;border-radius:8px;padding:.7rem .9rem;text-decoration:none;color:#e7e5e4}
.card:hover{background:#292524}.d{font-size:.78rem;color:#34d399;margin-top:.15rem}
</style></head><body><div class="wrap">
<a href="/" style="text-decoration:none;color:#34d399;font-weight:600">← MyNextLanguage</a>
<div class="flags" style="margin-top:1.5rem">${srcFlag}</div>
<h1>Languages to learn if you speak ${esc(srcName)}</h1>
<p style="opacity:.8">All 95 candidate languages ranked from linguistically closest to most distant for native or fluent ${esc(srcName)} speakers.</p>
<div class="grid">
${ranked.map((o, i) => {
  const n = LANG_NAMES_EN[o.c] || D.data.languages[o.c].name;
  const f = LANG_FLAG[o.c] || '🌐';
  return `<a class="card" href="/from/${src}/to/${o.c}/"><b>#${i+1}</b> ${f} ${esc(n)}<div class="d">${o.d}% distance</div></a>`;
}).join('')}
</div>
<p style="margin-top:2rem;font-size:.85rem;opacity:.6"><a href="/">Try the interactive recommendation tool →</a></p>
</div></body></html>`;
  mkdirSync(resolve(OUT_DIR, src), { recursive: true });
  writeFileSync(resolve(OUT_DIR, src, 'index.html'), html, 'utf8');
  sitemapEntries.push(`<url><loc>${SITE}/from/${src}/</loc><lastmod>${TODAY}</lastmod><priority>0.7</priority></url>`);
}

/* ── 6. Rewrite sitemap.xml ───────────────────────────────────────────── */
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries.join('\n')}
</urlset>
`;
writeFileSync(SITEMAP, sitemap, 'utf8');

console.log(`[gen] ✅ Wrote ${written} pair pages + ${LANGS.length} source-hub pages`);
console.log(`[gen] ✅ Updated sitemap.xml with ${sitemapEntries.length} URLs`);
