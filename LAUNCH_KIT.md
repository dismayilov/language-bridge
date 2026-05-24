# MyNextLanguage — Launch Kit

Ready-to-paste copy for the first 30 days of public launch. Each section
is self-contained: pick the channel, copy the block, edit your handles in,
post. Targets, timing tips, and follow-up actions are in *italics*.

---

## 1. Show HN (Hacker News)

*Best time:* Tuesday or Wednesday, 8:30–10:00 a.m. US Eastern.
*Why HN:* free, data-rich, no-signup, technical tools always land well.
*Have ready:* a brief blog/README walkthrough of the scoring formula
(linked in your first reply, not the post itself).

**Title (use exactly):**
```
Show HN: MyNextLanguage – Calculates the easiest next language for you to learn
```

**Body:**
```
Hi HN,

I built MyNextLanguage.org — a free, no-signup, ad-free tool that ranks 96 world languages by how easy each one will be for you to learn next, based on the languages you already speak and your CEFR level in each.

The scoring combines five dimensions, each adjustable with sliders:

  • Lexical similarity   – curated cognate overlap, with heuristic fallback by family/branch/subbranch when no curated value exists
  • Grammatical distance – typological diff of case count, gender, articles, word order, morphology, vowel harmony
  • Phonological similarity – Jaccard over phoneme-feature sets
  • Writing-system match – exact / same-script-root / different
  • Genealogical kinship – same family / branch / subbranch

CEFR proficiency scales transfer benefit non-linearly (A1=0.10, C2=1.00), so the more advanced you are in a known language, the more weight that language gets when computing how much it helps you with each candidate.

Also includes:
  • An interactive D3 force-directed graph of all 96 languages, with view modes for Network / Tree (dendrogram) / Matrix (heatmap) / Geographic
  • Dijkstra shortest-path overlay ("how do I get from Spanish to Korean linguistically?")
  • Parallel sample sentences for 74 language combinations
  • Curated cognate exemplars
  • Full dataset published as a single open JSON file you can fork and reuse

Runs entirely client-side. No backend, no account, no tracking beyond a self-hosted Umami counter. Installable as a PWA.

Tech: vanilla HTML + Alpine.js + D3 v7, no build step, hosted on GitHub Pages. The full linguistic matrix is here: https://mynextlanguage.org/data/languages-matrix.json

I'd love feedback — particularly on the scoring weights, missing cognate pairs, or languages I should add next. Source is open: https://github.com/davudismailov/language-bridge

https://mynextlanguage.org/
```

**First reply you should post yourself (within 5 minutes of submission):**
```
A few caveats up front:

1. The lexical scores are a mix of ~40 hand-curated pair percentages and a heuristic fallback for the rest. PRs adding more curated data are very welcome.

2. The dataset doesn't include sign languages, dead languages, or constructed languages other than Esperanto.

3. FSI difficulty tiers are from the perspective of English speakers. If you're not coming from English, treat them as informational rather than predictive.

Happy to answer anything about the methodology.
```

*Follow-up tips:*
- Reply to every top-level comment in the first 4 hours, even one-line "thanks".
- If asked "what's the secret sauce?", link to the dataset and explain the composite() function (transparent, no ML, no LLM).
- Do *not* shill in other HN threads — HN will sniff it instantly.

---

## 2. Product Hunt

*Best time:* Tuesday or Wednesday, **12:01 a.m. Pacific** (the moment PH starts a new day). Have 10–15 friends/coworkers ready to upvote in the first 2 hours.
*Need:* one square logo (1240×1240), one screenshot (635×380 minimum), a short video/GIF (optional but ~3× engagement).

**Tagline (60 chars max):**
```
Find your easiest next language — math, not marketing
```

**Description:**
```
Tell us what you speak. We'll rank 96 world languages by how easy each one will be for you to learn next — scored across lexical overlap, grammatical distance, phonological similarity, writing system, and language family, with adjustable weights.

Free. No signup. No ads. Ad-blocker-friendly self-hosted analytics. Installable as a Progressive Web App. The full linguistic dataset is published openly as a single JSON file.

Built for polyglots, students, linguistically curious travellers, and anyone who's ever wondered "what should I learn next?".
```

**First-comment-from-maker:**
```
Hey Product Hunt 👋

I built this because every "easiest language to learn" article online is written for English speakers — and most of the world doesn't natively speak English.

MyNextLanguage takes your actual language profile (including CEFR levels) and scores 96 candidate target languages personally for you. You can adjust the dimension weights with sliders — if vocabulary recognition matters more to you than grammar, drag the lexical slider up.

Some things to try:
• Pick Spanish + French and see why Italian climbs to #1
• Add Polish (B2) to anyone's profile and watch Slavic languages reshuffle
• Switch to the Geographic view in the graph to see linguistic clusters by region
• Switch to Tree view for a dendrogram of all 96 languages

Open source, all in the browser, no tracking. Feedback very welcome — particularly on missing cognate pairs and which languages to add next.
```

*Follow-up tips:* reply to every comment within 30 minutes during the launch day. PH ranks heavily on engagement velocity. Post in the comments which feature you're most proud of.

---

## 3. Reddit — 8 high-leverage subreddits

*Critical rule:* be **a community member first**. Spend 24 hours commenting in the sub before you post a link. Mods auto-detect single-link accounts. Each sub gets a *different* framing — never copy-paste the same post across multiple subs.

### r/languagelearning (1.7M members) — the big one

**Title:**
```
I built a free tool that calculates your easiest next language based on every language you already speak
```

**Body:**
```
After years of going "should I learn Italian or Portuguese next?" and getting no satisfying answer from generic difficulty rankings (which all assume you only speak English), I built a tool that takes your full language profile — every language you speak and your CEFR level in each — and ranks 96 candidates by how easy each will be for you specifically.

It scores five dimensions: lexical overlap, grammar distance, phonology, writing system, and language family. You can adjust the weights — if you care most about reading quickly, push lexical up; if pronunciation matters most, push phonology.

Free, no signup, no ads, no tracking beyond a self-hosted counter. Works offline. The full dataset is open: https://mynextlanguage.org/data/languages-matrix.json

I'd love feedback from this sub. Particularly: which curated cognate pairs am I missing? Which language should I add next?

https://mynextlanguage.org/
```

### r/polyglot

**Title:**
```
A linguistic distance ranker for all 96 languages, scored personally for your existing language profile
```

**Body:**
```
For everyone here who's wrestled with the "what next?" question after 3+ languages — I built MyNextLanguage.org which takes every language you speak (with CEFR levels) and ranks 96 candidate target languages by personalised composite linguistic distance.

The interesting thing for polyglots specifically: the more languages you add, the more "obvious" picks fall down the list and surprising ones climb. Spanish + Portuguese + Italian pushes Catalan and Romanian to the top. Add German, and Dutch jumps but so does Yiddish.

There's also a graph view (Network, Tree, Matrix, Geographic) showing all 96 languages' similarities to each other, plus a Dijkstra shortest-learning-path utility.

Open source, no signup. Full dataset is public: https://mynextlanguage.org/data/languages-matrix.json

Curious what surprises you in your own ranking.
```

### r/duolingo

**Title:**
```
Built a tool to pick your next Duolingo course based on the languages you already know
```

**Body:**
```
Was trying to decide between Italian and Portuguese on Duo (I already speak Spanish + French) and got tired of generic "easiest languages for English speakers" lists. Built a tool that takes your full language profile (including CEFR level for each) and ranks 96 candidate targets by personal linguistic distance.

Not affiliated with Duolingo — just a free tool that helps with the picker. Free, no signup, runs entirely in your browser.

https://mynextlanguage.org/

Curious what comes up #1 for everyone here.
```

### r/Spanish

**Title:**
```
A data tool that ranks your easiest next language if you speak Spanish (Portuguese wins, but the runners-up surprised me)
```

**Body:**
```
I made a tool that calculates linguistic distance between Spanish and the other 95 languages in its dataset, scored across lexicon / grammar / phonology / script / family. You can layer in other languages you speak and watch the rankings shift.

For pure-Spanish speakers the top 5 ends up being Portuguese, Italian, Catalan, Galician, Romanian — no surprise. What surprised me: Tagalog and Cebuano show up in the top 25 because of 400 years of Spanish lexical loans.

Free, no signup, runs in your browser. https://mynextlanguage.org/

¿Cuál te sale a ti?
```

### r/German (and r/French, r/japanese — adapt the same template)

**Title pattern:**
```
What's the easiest language after [Sub's language]? I built a calculator that ranks all 95 alternatives.
```

**Body pattern:**
```
Built a free tool that ranks all 96 candidate languages by linguistic distance from [LANGUAGE], with breakdowns across lexical, grammar, phonology, writing system, and family. You can add other languages you speak (with CEFR levels) and see how the ranking shifts.

For native [LANGUAGE] speakers, the top results were [TOP 3 — paste from the tool]. The number I didn't expect was [SOMETHING SURPRISING].

https://mynextlanguage.org/

Free, no signup. Open dataset.
```

### r/linguistics (be technical, not promotional)

**Title:**
```
Open dataset: 96-language typological distance matrix with curated cognate exemplars, FSI tiers, and phoneme-feature sets
```

**Body:**
```
I'm releasing the dataset behind a hobby project as a single JSON file — could be useful for anyone teaching intro typology, comparative phonology, or computational linguistics:

https://mynextlanguage.org/data/languages-matrix.json

What's in it:
• 96 contemporary languages across 17 families
• Per-language: case count, gender count, article system, word order, morphology type, vowel harmony flag, phoneme-feature set, writing system, FSI difficulty tier, native name, country flags
• 42 curated cognate exemplar pair-sets (gloss + form in both languages)
• 24-entry glossary of linguistic terms
• Parallel sample sentences for 74 language combinations
• Country-centroid coordinates for geo visualisation

The matrix is computed live in the front-end (no precomputed N² matrix file), so the source of truth is the typological profiles themselves. Caveats: contemporary usage only, no sign languages, no dead languages, lexical coverage is mostly Indo-European.

Tool that consumes it: https://mynextlanguage.org/
Source: https://github.com/davudismailov/language-bridge

Bug reports and PRs adding curated data are very welcome.
```

### r/etymology

**Title:**
```
Browse 42 curated cognate-exemplar sets across Romance, Germanic, Slavic, Indo-Iranian, Sino, Semitic, and Turkic clusters
```

**Body:**
```
Side product of building a language-distance calculator: a small public dataset of curated cognate quartets you can browse pair-by-pair. Hover the edges in the graph view to see them in context:

https://mynextlanguage.org/

Examples (excerpted):
• English night / German Nacht / Dutch nacht / Yiddish nakht — Proto-Germanic *naht-
• Spanish noche / Italian notte / French nuit / Portuguese noite — Latin nox/noctis
• Russian ночь / Polish noc / Czech noc / Croatian noć — Proto-Slavic *noktь
• Persian shab / Hindi raat — divergent in Indo-Iranian; raat from Sanskrit rātri

Full raw cognate JSON: https://mynextlanguage.org/data/languages-matrix.json (key: `lsg_cognates`)

PRs adding more curated pairs are very welcome — particularly outside Indo-European where my data is thin.
```

### r/Korean / r/japanese (separately, week after the others)

**Title:**
```
Why Japanese might be easier than Korean (or vice versa) depending on what you already speak — built a calculator
```

**Body:**
```
Free tool that scores linguistic distance to either Japanese or Korean from any of 96 source languages. The score is composite: lexical / grammar / phonology / writing system / family, with adjustable weights.

The interesting result: even though Japanese and Korean are typologically very similar to each other, the *bridge* effect for a given learner can flip surprisingly. Speak Chinese + English → Japanese wins on lexicon (kanji), Korean wins on phonology. Speak Russian + English → Korean wins on grammar (cases).

https://mynextlanguage.org/
```

---

## 4. Twitter / X launch thread

*Best time:* Tuesday or Wednesday, 11 a.m.–1 p.m. US Eastern.
*Tip:* Pin the first tweet. Reply to your own tweet 24h later with "Day 1 results" thread for the algorithm.

**Tweet 1 (hook):**
```
What's the easiest language for *you* to learn next?

Every "easiest language" article on the internet assumes you only speak English.

I built a free tool that takes every language you already know — with CEFR levels — and ranks 96 candidates personally for you. 🧵
```

**Tweet 2 (visual):**
```
[Attach screenshot of the recommendation results for a multilingual user]

Five dimensions, all adjustable:
• Lexical overlap
• Grammar distance
• Phonology
• Writing system
• Family

Pick the weights that match how you actually learn.
```

**Tweet 3 (graph screenshot):**
```
[Attach screenshot of the D3 graph view]

There's also a graph of all 96 languages.

Network. Tree. Matrix. Geographic.

Click a language for its closest neighbours.
```

**Tweet 4 (open data flex):**
```
The full linguistic matrix is open as a single JSON file.

96 languages.
42 curated cognate pair-sets.
74 parallel-sentence combos.

Fork it, build with it: https://mynextlanguage.org/data/languages-matrix.json
```

**Tweet 5 (CTA):**
```
Free. No signup. No ads. Works offline (PWA).

Try yours → https://mynextlanguage.org/

If it picks something unexpected for you, reply with your top 3 — I'm collecting surprising results.
```

---

## 5. LinkedIn announcement

*Best time:* Tuesday morning, 8–10 a.m. local.

```
Most "easiest languages to learn" rankings online assume you only speak English. The world doesn't.

I spent the last few months building MyNextLanguage.org — a free tool that ranks 96 world languages by how easy each will be for you to learn next, scored personally against every language you already speak (with CEFR levels).

Five dimensions, all adjustable: lexical overlap, grammar distance, phonology, writing system, language family. There's also an interactive graph of all 96 languages and a Dijkstra shortest-learning-path utility ("how do I bridge from English to Korean linguistically?").

The full linguistic dataset is published openly as a single JSON file — perfect for educators, applied-linguistics courses, or anyone building related tools.

→ https://mynextlanguage.org/

It's free, no signup, runs entirely in the browser. Built as a research-preview side project. Feedback and contributions very welcome.

#LanguageLearning #Polyglot #Linguistics #EdTech #OpenData
```

---

## 6. YouTuber outreach email

Send to: Olly Richards (StoryLearning), Lindie Botes, Days of French 'n' Swedish, Steve Kaufmann (LingQ), Ikenna, Xiaomanyc, LangFocus (Paul Jorgensen), Polyglot Conference channel.

**Subject:** Free tool your audience would love + a video idea ready to go

**Body:**
```
Hi [first name],

Big fan of your channel — [specific recent video, 1 line]. The reason I'm reaching out:

I built a free tool called MyNextLanguage.org that ranks 96 world languages by how easy each will be for someone to learn next, given the languages they already speak and their CEFR levels. Five adjustable dimensions: lexical overlap, grammar distance, phonology, writing system, family.

I think there's a fun video idea here that your audience would eat up:

  "I let a math algorithm pick my next language and spent 30 days learning it"

You'd plug your real language profile into the tool on screen, react to the top-5 results live, pick whichever feels right (or whichever the algorithm picks), and document a month of learning it. The tool gives you a built-in narrative arc: prediction → reality check.

The tool is free, no signup, no affiliate trap. The full dataset is open (https://mynextlanguage.org/data/languages-matrix.json) so you can dig into the methodology if you want.

If a video doesn't fit your roadmap, no worries — even a short shout-out in a community-tab post would be hugely appreciated. I'm happy to be a guest on a stream too if that's easier.

Cheers,
[Your name]
https://mynextlanguage.org/
```

*Tip:* personalise the first line every time. Generic "love your content" emails go in the bin. Reference the most recent video by title.

---

## 7. Press / journalist pitch

For: tech-edu writers at The Verge / TechCrunch / Lifehacker / Mashable, language-learning bloggers, Education Week, etc.

**Subject:** Open-data tool ranks 96 world languages by personal learning difficulty

**Body:**
```
Hi [name],

Quick pitch — I just launched MyNextLanguage.org, a free open-data tool that scores 96 world languages by linguistic distance from any combination of languages a user already speaks. It addresses a gap nobody seems to be filling: every "easiest language to learn" list on the internet assumes the reader is monolingual English.

What makes it pitchable:

• 100% free, no signup, no ads, no tracking beyond a self-hosted counter
• Open dataset (single JSON, MIT-licensed) — usable by educators, linguists, devs
• Five adjustable scoring dimensions plus CEFR-aware weighting
• Interactive D3 graph with Network / Tree / Matrix / Geographic views
• Dijkstra shortest-learning-path utility
• Runs offline (PWA)

Angles you could take:

  1. "The free tool that makes the FSI's English-only difficulty rankings obsolete"
  2. "Open linguistic data goes mainstream — meet the polyglot's new toy"
  3. "Why the easiest language to learn after Spanish is Portuguese (and 95 other rankings)"

Happy to chat / send the dataset / give you an embargo if useful.

Live: https://mynextlanguage.org/
Dataset: https://mynextlanguage.org/data/languages-matrix.json
Source: https://github.com/davudismailov/language-bridge

Cheers,
[Your name]
```

---

## 8. Recurring weekly content (ongoing engine)

Run this every Monday at 9 a.m. local. Costs nothing. Compounds.

**Format:** "Language pair of the week"

**Twitter/X / LinkedIn / Reddit:**
```
🌍 Language pair of the week: Czech ↔ Slovak

Lexical overlap: 84%
Grammar distance: 91% match
Mutual intelligibility: near-complete in casual speech, mostly intelligible in formal

The easiest language jump in Europe, by a wide margin.

Full breakdown ↓
https://mynextlanguage.org/from/cs/to/sk/
```

**52 posts/year:**
- 52 indexable long-tail SEO entries (the /from/cs/to/sk/ link)
- 52 native shareable posts across socials
- 52 #langtwt community reshare opportunities
- 52 newsletter editions if you ship one

Suggested pair rotation (mix surprising and obvious):
1.  Czech ↔ Slovak (closest in Europe)
2.  Spanish ↔ Portuguese (obvious, easy SEO)
3.  Norwegian ↔ Swedish (mutual intelligibility classic)
4.  Hindi ↔ Urdu (politically charged, high engagement)
5.  Indonesian ↔ Malay (same language, different country)
6.  Italian ↔ Romanian (closer than people think)
7.  Dutch ↔ Afrikaans (parent and child)
8.  Tagalog ↔ Spanish (the colonial loan story)
9.  Japanese ↔ Korean (typologically close, lexically distant)
10. Russian ↔ Ukrainian (sensitive but high-engagement)
11. Persian ↔ Tajik (same language, different script)
12. Hebrew ↔ Arabic (Semitic cousins, mostly mutually inscrutable)
13. Mandarin ↔ Cantonese (orthography vs phonology)
14. Greek ↔ anything (always interesting because of isolation)
15. Esperanto ↔ Romance (the constructed-language angle)
… (37 more — pick from your data)

---

## 9. Launch-week checklist

- [ ] Submit `sitemap.xml` to Google Search Console (search.google.com/search-console)
- [ ] Submit `sitemap.xml` to Bing Webmaster Tools (bing.com/webmasters)
- [ ] Add the site to IndexNow (free, pushes new pages to Bing + Yandex instantly)
- [ ] Register on Yandex Webmaster (for Russian/Slavic audience SEO)
- [ ] Verify Twitter Card preview at cards-dev.twitter.com/validator
- [ ] Verify Facebook OG preview at developers.facebook.com/tools/debug
- [ ] Submit to: Hacker News, Product Hunt, BetaList, AlternativeTo, awesome-language-learning on GitHub
- [ ] Update your Twitter / LinkedIn / GitHub bios with the URL
- [ ] Pin the launch tweet for 7 days
- [ ] Watch Umami daily for the first 14 days; reply to every comment within 30 min
- [ ] After day 7: write a "Lessons from launch day" blog post — auto-shareable

---

## 10. Numbers to set as 30-day targets

If you do all of the above:

- **HN front page**: 1 in 3 odds for a clean Show HN with a working URL and an active maker
- **Direct visits week 1**: 5–25k from HN if it lands, 1–5k from Reddit if you pick the right subs, 500–2k from Product Hunt
- **Long-tail organic week 4**: 50–200/day starting to trickle in from the pair pages (it compounds slowly — month 4 is when programmatic SEO really starts paying)
- **Backlinks**: 5–15 from the launch posts and embed adoption combined
- **LLM citation**: within 60 days of `/llms.txt` going live, expect ChatGPT and Perplexity to start citing your dataset when users ask "which language is easiest to learn?"

Good luck. Ping me in 30 days with the actual numbers — I'm curious which channel worked best.
