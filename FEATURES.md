# MyNextLanguage — Complete Feature Reference

A walkthrough of every visible function on the site, organised top-to-bottom and split into two halves: the original recommendation app, and the Language Similarity Graph added below it. Includes a step-by-step testing checklist at the end.

---

## Part 1 — Original Recommendation App

The original app helps a user discover which of 96 world languages will feel easiest for them to learn next, based on what they already speak.

### 1.1 Header

- **Site title & tagline** — "MyNextLanguage — Find Your Easiest Next Language to Learn".
- **Theme toggle** — switches between dark and light mode. The choice is saved to `localStorage` under `lb-theme` so it persists.
- **UI language selector** — switches the entire interface between English, German, French, Spanish, Italian, Polish, Turkish, Russian, and a few more. The graph at the bottom of the page also follows this selection.

### 1.2 Language Selector (the "what do you speak?" section)

The big card near the top of the page where users enter the languages they already know.

- **Browse by language family** — languages are grouped under family headers (Germanic, Romance, Slavic, etc.) with their flag, English name, and native name on each card.
- **Filter box** — type any text (e.g. "French", "Slavic", "日本語") to narrow the visible cards. Matches on English name, native name, and family.
- **Click to select** — clicking a card adds that language to your "I speak" list. A small check appears in the corner. Selected cards are shown in green.
- **Selected pills strip** — a horizontal strip above the grid showing the languages you've picked, each with a CEFR proficiency drop-down (A1, A2, B1, B2, C1, C2) and a small × button to remove.
- **CEFR proficiency** — the level you pick scales how heavily that language contributes to recommendations. C2 contributes the maximum, A1 contributes less.
- **Profile save** — the app automatically persists your selection and proficiency to `localStorage` so reloading keeps your choices. A small "Profile saved" toast appears briefly.

### 1.3 Weights & Settings Card

A second card lets the user customise *how* recommendations are scored.

- **Dimension weight sliders** — five sliders controlling how much each of the five linguistic dimensions counts:
  - **Lexical** — shared vocabulary (cognates / loanwords)
  - **Grammatical** — morphology, case system, word order, gender
  - **Phonological** — shared phoneme features (tones, vowel harmony, etc.)
  - **Writing system** — orthographic similarity
  - **Genealogical** — distance on the family tree
- **Preset buttons** — quick-apply weight presets (e.g. defaults).
- **Top N selector** — controls how many recommendations are shown (e.g. top 5, top 10, top 20).
- **FSI tier filter** — restrict recommendations to languages of a certain US Foreign Service Institute difficulty (Cat I, II, III, IV).
- **Pinned-only toggle** — once you've pinned a few languages (♥ icon on cards), this restricts the list to only those.
- **Recommendation search box** — text filter that narrows the recommendation list by name/family/native name.

### 1.4 Recommendation Cards (the main result)

Each recommended language gets a detailed card.

- **Rank, flag, English & native name** — top line.
- **Family · branch** — under the name.
- **Score badge** — the composite score (0-100) plus a coloured tier label (excellent / very high / high / medium / etc.).
- **Five sub-score chips** — Lexical · Grammar · Phonology · Script · Genealogy — each with its own value and a hover tip explaining the tier.
- **Helper-language attribution** — the card explains *which* of your known languages contributed each sub-score (e.g. "via Spanish for Lexical").
- **Contact-bonus note** — when there's documented historical contact (loanword influence) between one of your known languages and the target, it appears as a small note (e.g. "Polish has hundreds of German loanwords").
- **Speakers card** — native speakers and total speakers in millions, plus the official-country count.
- **Pin button (♥)** — adds the language to your pinned list.
- **Compare button** — adds the language to the comparison panel (see 1.5).
- **Permalink (→)** — sets the URL hash to a deep-link for this exact recommendation card.
- **Parallel sentence example** — when relevant, shows a sample sentence in the target language alongside its translation in one of your known languages, with shared cognates highlighted in green dotted underline.
- **Distance map** — a world map preview showing where this language is spoken (recommended in emerald, your known languages in blue, overlap regions in violet, regional/sub-national speakers with a hatched fill).
- **FSI estimate** — approximate classroom-hour estimate to reach professional proficiency.
- **Genealogy explanation** — when the target shares deep family/branch roots with one of your known languages, a sentence explaining the relationship.

### 1.5 Comparison Panel

When the user picks up to two languages with "Compare", a side-by-side panel opens above the recommendations.

- **Two recommendation cards** rendered side-by-side, showing every sub-score for each.
- **Winner highlighting** — for each dimension, a small marker shows which language wins on that dimension (or "tie").
- **Total score comparison** — composite scores side-by-side.

### 1.6 Reverse-Direction View

A "what could *this* language help me learn next?" panel. Pick any language you'd consider studying, and the app ranks what *that* language would unlock for you.

- **Reverse target selector** — drop-down or button group to pick the hypothetical target.
- **Recommendation list from the reverse perspective** — same five sub-scores per helper language.

### 1.7 Sharing & Export (existing app)

- **Copy permalink (button)** — copies a URL hash that encodes your speakers, weights, top-N, target, and compare slots so you can share your exact configuration.
- **Share to social** — generates a PNG share image (composed on a `<canvas>`) for any recommended language.

### 1.8 Newsletter Signup

A simple card below the recommendations.

- **Email input + Subscribe button** — handles loading / success / error states with a status message.

### 1.9 FAQ

Six accordion items covering common questions about the scoring methodology, how to use the tool, what "easiest" means, etc. Clicking any question expands its answer.

### 1.10 Footer

- Copyright / methodology blurb.
- Link to a data-improvement Google Doc ("Notice a data gap?").

### 1.11 Other UI Elements (existing app)

- **Buy Me a Coffee floating widget** — bottom-right floating button.
- **iTalki affiliate CTA** — appears periodically on recommendation cards.
- **PWA support** — service worker registration for offline / install-to-home behaviour.
- **SEO** — extensive Open Graph / Twitter cards / JSON-LD structured data for SEO and link previews.

---

## Part 2 — Language Similarity Graph

A brand-new interactive section added below the existing recommendations. The graph visualises how all 96 languages cluster together based on their composite linguistic distance. Lives in a card with a dark theme, located between the recommendations and the newsletter signup.

### 2.1 Section Header

- **Title** — "Language Similarity Graph" with a small green dot indicator.
- **Subtitle** — one-paragraph explanation of how to read the graph.
- **? Help button** — launches the guided tour (see 2.16). Also remembered the first time the page loads to auto-show.
- **Node counter** — pill showing the current number of visible nodes (e.g. "96 nodes"). Hides/changes count when families are toggled off.
- **Link counter** — pill showing the current number of visible links given the threshold (e.g. "159 links").
- **Copy link button** — encodes the current view state (threshold, metric, focused node, learning-view flag, zoom transform, view mode) into the URL hash and copies the full URL to the clipboard. A small "Link copied" toast appears.
- **Reset view button** — re-centres the view, restores zoom to 1×, un-pins any dragged nodes, restarts the simulation, closes any open tooltip.

### 2.2 View-Mode Bar

A row of chips letting the user switch between four ways of rendering the same data.

- **Network** (default) — d3 force-directed graph. Languages float; lines connect linguistically close pairs.
- **Tree** — single-linkage hierarchical clustering dendrogram. A horizontal tree where every leaf is a language. Closely-related languages share short branches.
- **Matrix** — 96 × 96 heatmap. Rows and columns reordered by the same clustering as the tree so blocks of related languages appear as bright clusters along the diagonal. Cell colour is the distance (warm = close, cool = far).
- **Geographic** — nodes pinned to their primary country's centroid on an equirectangular lat/lng grid. Same links drawn over geographic positions; reveals contact effects between geographic neighbours.

Switching views preserves the threshold, metric, hidden families, and selected node where possible.

### 2.3 Export Menu

Top-right "Export ▾" button opens a small menu.

- **Export PNG** — renders the current view at 2× resolution into a `<canvas>` and downloads it as `language-graph-network.png` (or `-tree`, `-matrix`, `-geo` depending on view).
- **Export SVG** — serialises the current SVG (with an inline dark background) and downloads as `.svg`.
- **Copy embed code** — copies an `<iframe>` snippet with the current view's URL to the clipboard, ready to paste into a blog post or external site.

### 2.4 Controls Row

Below the view-mode bar.

- **Distance ≤ slider** (range 10–95, default 45) — drag to widen or narrow which pairs count as connected. The number to the right of the slider shows the current threshold value live. Re-renders the link selection without rebuilding the simulation.
- **Repulsion slider** (range −400 to −50, default −150) — controls d3's force-directed `forceManyBody` strength. Lower (more negative) = nodes push each other harder, network spreads out more. Higher = nodes cluster tighter. Only takes effect in the Network view.
- **Metric chips** — six chips: **Composite · Lexical · Grammar · Phonology · Script · Genealogy**. Clicking one recomputes all pairwise distances using only that dimension. The graph re-clusters. This is the single best feature for understanding *why* languages are similar.
  - For example: switch to **Grammar** → English clusters with Haitian Creole and Mandarin (all analytic, even though different families).
  - Switch to **Script** → every Latin-script language ties at distance 0.
  - Switch to **Genealogy** → only direct family ties show.
- **Find** — search box with autocomplete dropdown. Type any language name, family, or branch (matches English name, family, branch). Use ↑↓ arrow keys + Enter to pick. Selecting a match flies the network to that node, zooms in, and opens its detail tooltip.
- **Learning view** toggle — disabled by default. Enabled only when you've picked languages in the recommendation app above. When ON: the graph switches to a *directed* view where edges run from each of your known languages → every other language. Arrowheads point from speaker to target. Distance is calculated *asymmetrically* using the directional contact-bonus (knowing German → Polish gets the German→Polish bonus; the reverse direction doesn't).

### 2.5 The Canvas

The main rectangle where the graph is rendered.

- **Pan** — drag the empty background to pan the view.
- **Zoom** — scroll wheel (or pinch on touch) to zoom in/out. Range 0.25× to 6×.
- **Drag a node** — click and drag any node to pull it; release and the simulation re-balances.
- **Hover a node** — that node and all its connected neighbours stay bright; everything else dims to ~18%. The hovered node's connections highlight in green.
- **Click a node** — opens a detail tooltip (see 2.6) and pins the node.
- **Hover a link** — opens the edge sub-score tooltip (see 2.7).
- **Hint pill** (bottom-left of canvas) — reminds users of the basic controls.

### 2.6 Node Detail Tooltip

Opens when a node is clicked.

- **Language name** — the English name in bold.
- **× close button** — closes the tooltip.
- **Family · branch · subbranch** — line under the name.
- **"Closest neighbours" list** — top-5 closest languages by the *current metric*, with each language's distance score.
- **"Add to compare panel" button** — only shown if Alpine is reachable and the language is not already one of your speakers. Clicking calls the existing app's `toggleCompare()` method so the language appears in the comparison panel up the page. Label flips to "Remove from compare panel" if already in slots.

Click anywhere on the empty background to close. Press Esc to close.

### 2.7 Edge Hover Tooltip

Appears when you hover over any link line.

- **Pair header** — "German → English" (with a `·` for symmetric or a `→` for directed/learning-view links) and the overall distance score (e.g. "d 34").
- **Five sub-score rows** — one row per dimension (Lexical, Grammar, Phonology, Script, Genealogy) with each dimension's 0.00–1.00 score.
- **Glossary terms** — words like "lexical", "phonology", "vowel harmony", "fusional" inside the tooltip are underlined with a dotted line. Click any to open a small popover with a one-sentence definition.
- **Cognate examples** — if the pair has curated cognate data (42 pairs across major families), 2–4 example word pairs are listed at the bottom (e.g. `night: noche ↔ noite`).
- **Data-quality flag** — if the lexical score came from a family-fallback heuristic (no curated `DATA.lexical` entry), a small yellow "Lexical: estimated (no direct data)" badge appears so the user knows the score is approximate.
- **Contact bonus** — in learning view only, if the directed pair has a contact entry, the bonus value (e.g. "+0.15") and the explanatory note ("Polish has hundreds of German loanwords") are shown.

### 2.8 Family Legend

Below the canvas — a strip of clickable chips, one per language family. The 17 families: Afro-Asiatic, Austroasiatic, Austronesian, Dravidian, Indo-European, Isolate, Japonic, Kartvelian, Koreanic, Mongolic, Niger-Congo, Quechuan, Sino-Tibetan, Tai-Kadai, Tupian, Turkic, Uralic.

- **Coloured swatch + family name** for each.
- **Click a chip** — hides every language in that family from the graph (and dims the legend chip). Click again to show.

### 2.9 Family Hulls (Network view only)

In the Network view, a translucent coloured polygon is drawn behind each family with 3+ visible nodes. The hulls update on every simulation tick. When you hover a node, hulls of other families dim.

### 2.10 Hub-Only Labels at Low Zoom

To keep the network readable when zoomed out, only the top-12 most connected languages have their name labels visible at zoom ≤ 1.4×. Zoom in further and all 96 labels appear. Hovered, focused (keyboard), and pinned nodes always show their labels regardless.

### 2.11 Known-Language & Recommendation Decoration

Once you've picked languages in the app above:

- Your **known languages** get a thick **yellow ring** around the node circle (also yellow text in Tree/Matrix views).
- Your current **top-5 recommendations** get a soft **emerald drop-shadow halo**.

The graph polls the Alpine app every 1.2 seconds and updates these decorations live as you change your selection above.

### 2.12 Shortest Learning Path Widget

A card below the legend.

- **From dropdown** — pick any of the 96 languages.
- **To dropdown** — pick any other.
- **Find path button** — runs Dijkstra over the full pairwise distance matrix (using the current metric) and returns the chain of languages with the smallest total cumulative distance.
- **Clear button** — clears the path and the selections.
- **Result display** — each step in the chain is a green pill with the step distance between them (e.g. `Russian → 35 → Azerbaijani → 9 → Turkish`). Total accumulated distance and number of hops shown below.
- **Path overlay on the network** — when a path is found and you're in Network/Geographic view, the path is drawn as a thick green glowing line on top of the graph, with each path node circled in green.

### 2.13 Surprising Cross-Family Connections Panel

A second card next to the path widget.

- **Auto-computed at load** — finds the lowest-distance pairs (composite metric) where the two languages belong to *different families* (and excluding language isolates). Top 6 are displayed.
- **Example results** — Italian ↔ Maltese (Romance ↔ Semitic, but Maltese has heavy Italian/Sicilian influence), Mandarin ↔ Vietnamese (different families but both tonal/analytic), Persian ↔ Uzbek (Central Asian sprachbund), Yiddish ↔ Hebrew, etc.
- **Click any row** — switches to Network view (if needed) and flies to one of the pair's languages with its tooltip open.

### 2.14 First-Time Guided Tour

- **Auto-runs once** on the user's first visit (uses `localStorage` flag `lsg-tour-seen` to remember).
- **Re-launch anytime** via the **?** button in the header.
- **8 steps** spotlighting each major control: Welcome → View modes → Distance threshold → Metric switcher → Find box → Learning view → Shortest path → Surprising connections.
- Each step shows a green spotlight ring on the target element and a popover with a title and explanation.
- **Previous / Next / Skip** buttons; ESC also closes. Step counter ("3 / 8") in the popover.

### 2.15 Glossary Popovers

Click any underlined linguistic term (e.g. "fusional", "vowel harmony", "sprachbund") inside an edge tooltip → a small popover appears with a one-sentence definition. 25 terms covered: fusional, agglutinative, analytic, V2, SOV, SVO, vowel harmony, pitch accent, tone, cognate, loanword, sprachbund, sub-branch, branch, family, phoneme, morphology, orthography, lexical similarity, genealogical distance, Latin script, Cyrillic script, creole, isolate.

### 2.16 Keyboard Navigation

When the canvas is focused (click into it, or tab to it):

- **Arrow keys** — move focus to the nearest visible node in that direction (within a ±66° cone).
- **Enter** — open the detail tooltip for the focused node.
- **Esc** — close the tooltip and clear focus.
- Focus is indicated by a dashed purple ring around the focused node.

### 2.17 Reduced-Motion Mode

If the user's OS prefers reduced motion (System Preferences → Accessibility → Reduce Motion), the graph automatically:

- Replaces the force simulation with a **stable family-grouped concentric ring layout** — each family gets a slice of the canvas, nodes within the family arranged in a small ring inside the slice.
- Disables CSS transitions.
- Disables node dragging (positions are fixed).

All other features (hover, click, search, view switching) continue to work.

### 2.18 Permalink / URL Hash

The graph reads and writes a `#lsg=…` segment in the URL hash, encoding:

- `v` — view mode (network / tree / matrix / geo)
- `t` — distance threshold
- `m` — metric (composite / lexical / grammatical / phonological / writing_system / genealogical)
- `n` — focused node (language code)
- `L` — learning-view flag (1 / 0)
- `k` — zoom scale
- `x`, `y` — zoom translate

The URL updates as you interact (debounced 250ms). Reloading the page restores every setting. The graph's hash key (`lsg`) does not collide with the original app's keys (`langs`, `prof`, `w`, `target`, `cmp`).

### 2.19 Internationalisation

The graph UI labels (Distance, Repulsion, Metric, Find, Composite, Lexical, Grammar, etc.) automatically follow the page-wide language selector. Eight languages supported: **English, German, French, Spanish, Italian, Polish, Turkish, Russian**. The graph polls Alpine for `currentLang` and re-labels its controls when the user changes the page language.

---

## Part 3 — Testing Checklist

Walk through these in order. Each should take under a minute.

### 3.1 Existing app — quick smoke test

1. Open the page. Confirm the dark/light theme matches your `localStorage` (or system).
2. Switch the **UI language** drop-down to German. Most text in both halves of the page should translate.
3. Pick **English** as your speaker. Set its CEFR to **C2**.
4. Add **Spanish** as a second speaker, set its CEFR to **B1**.
5. Scroll to the recommendation cards. The top recommendations should be Germanic and Romance languages (Dutch, German, Portuguese, Italian, French, Catalan).
6. Hover the sub-score chips on the top card — tooltips should show similarity tier labels.
7. Click "Compare" on two different cards. The comparison panel appears above the recommendations with side-by-side details.
8. Pin a language with ♥, toggle "Pinned only" — list narrows.
9. Try the FSI tier filter (e.g. "Cat I") — list narrows further.
10. Open the FAQ and expand a couple of entries.

### 3.2 Language Similarity Graph — first run

Find the dark "Language Similarity Graph" card below the recommendations and above the newsletter.

11. The **guided tour** auto-launches on first visit. Walk through all 8 steps using Next/Previous. End the tour with "Done".
12. Confirm the counter at top right reads **96 nodes**, **159 links** (default threshold 45).

### 3.3 View modes (test each)

13. Click **Tree** in the view bar. A horizontal dendrogram should appear. Isolate / small-family languages cluster on the periphery; Slavic / Romance / Germanic blocks should be visually contiguous. Click any leaf name — the view should switch back to Network and zoom to that node.
14. Click **Matrix**. A 96 × 96 heatmap should appear with bright family-block diagonals. Hover any cell — a native browser tooltip shows the pair and distance. Click any non-diagonal cell — view switches to Network and flies to one of the pair.
15. Click **Geographic**. Nodes should pin to their primary country positions over a faint lat/lng grid. Equator and prime meridian highlighted with dashed lines. Hover and click still work; family hulls do NOT appear in this view.
16. Click **Network** to return to the default view.

### 3.4 Threshold & repulsion

17. Drag the **Distance ≤** slider all the way left (10) — most links disappear (only the closest pairs remain). Drag right (95) — far more lines appear. Return to ~45.
18. Drag the **Repulsion** slider all the way right (−50) — nodes pull tighter. Drag left (−400) — nodes spread out aggressively. Return to ~−150.

### 3.5 Metric switcher

19. Click **Lexical** — fewer links, sharper Romance/Slavic clusters.
20. Click **Grammar** — *very* different topology. English now neighbours Haitian Creole, Mandarin, Vietnamese (all analytic) regardless of family.
21. Click **Phonology** — different again. Click **Script** — every Latin-script language collapses together.
22. Click **Genealogy** — only family-tree relationships remain.
23. Return to **Composite**.

### 3.6 Node interactions

24. **Hover** any node (e.g. Spanish). It and its neighbours stay bright; the rest of the graph dims. Connected links highlight green.
25. **Click** the same node. A tooltip opens with its family/branch/subbranch and top-5 closest neighbours.
26. If you've selected a different language as speaker above, the tooltip shows an "**Add to compare panel**" button. Click it. Scroll up — the language now appears in the comparison panel.
27. **Click empty canvas** — tooltip closes.
28. **Drag** a node by clicking and holding — pull it across the screen, then release. Simulation re-balances.
29. **Double-click** anywhere — confirm zoom is not triggered (we disabled dblclick.zoom).

### 3.7 Edge interactions

30. Hover any **link line** (the curved arc between two nodes). A small tooltip appears showing the pair, total distance, all five sub-scores, and (when available) curated cognate examples like `night: noche ↔ noite`.
31. If the edge has heuristic lexical data (no curated entry), a yellow "estimated" badge appears in the tooltip.
32. Inside the tooltip, click on an underlined linguistic term ("lexical", "phonology", etc.). A glossary popover should open with a one-sentence definition. Click elsewhere to close it.

### 3.8 Search

33. Click into the **Find** box. Type "polish". A dropdown lists matches. Use ↓↓ arrow keys, press **Enter**.
34. The view should zoom in on Polish and open its tooltip automatically.

### 3.9 Family legend

35. Click "Sino-Tibetan" in the family legend — all Chinese-family nodes disappear. Click again to bring them back.
36. Toggle off three families at once — node and link counters update live.

### 3.10 Personalisation (requires speakers selected in the app above)

37. Make sure you've added languages in the recommendation card above (e.g. English + Spanish). Within ~1.5 seconds the graph should update:
    - Your known languages get a **yellow ring**.
    - Your top-5 recommendations get an **emerald glow halo**.
38. Toggle the **Learning view** checkbox (it should now be enabled). Edges switch to directed arrows pointing FROM your known languages TO others. Distance is now asymmetric (the German→Polish direction includes the German-to-Polish contact bonus).
39. Hover any directed edge — the tooltip header now reads "Speaker → Target", and the "Contact bonus" note appears at the bottom if relevant.
40. Toggle Learning view off — symmetric edges return.

### 3.11 Shortest path

41. Below the legend, find the **Shortest learning path** card.
42. Pick **Russian** in the From dropdown, **Turkish** in the To dropdown. Click **Find path**.
43. The result should display a chain (e.g. `Russian → Azerbaijani → Turkish`) with step distances and a total. In the Network view, a thick green glowing line appears over the path.
44. Try another pair (e.g. **English → Japanese**). For very distant pairs the direct edge often wins (1-hop).
45. Click **Clear** — the result and the on-graph highlight disappear.

### 3.12 Surprising connections

46. Next to the shortest-path card, the **Surprising cross-family connections** panel lists 6 auto-found pairs.
47. Click "Italian ↔ Maltese" (or any other). The view flies to one of the languages with its tooltip open.

### 3.13 Export

48. Click **Export ▾** in the header. Three options appear.
49. Click **Export PNG**. A `language-graph-network.png` file downloads (2× resolution).
50. Click **Export SVG**. A `.svg` file downloads.
51. Click **Copy embed code**. An `<iframe>` snippet is in your clipboard — paste anywhere to verify.

### 3.14 Permalink

52. Click **Copy link**. The full URL (with `#lsg=…` hash) is in your clipboard. A "Link copied" toast appears.
53. Open a new browser tab and paste the URL. The graph should restore to the *exact* view: same threshold, metric, focused node, learning view, zoom level, view mode.

### 3.15 Reset view

54. Pan, zoom, drag a couple of nodes around. Click **Reset view**. The graph re-centres, zoom returns to 1×, dragged nodes release, simulation restarts.

### 3.16 Keyboard navigation

55. Click into the canvas to focus it (you should see a subtle inset border).
56. Press the **right arrow**. Focus jumps to the nearest node to the right. A dashed purple ring appears on the focused node.
57. Step around with the arrow keys.
58. Press **Enter** — focused node's detail tooltip opens.
59. Press **Esc** — tooltip closes, focus ring disappears.

### 3.17 Internationalisation

60. Change the page-wide UI language to **French** or **Spanish**. Within ~1.5 seconds the graph's labels (Distance, Repulsion, Metric, Find, Composite, Lexical, Network, Tree, etc.) should translate.

### 3.18 Reduced motion (optional)

61. Enable "Reduce Motion" in your OS accessibility settings, then reload the page. The Network view should render as a stable concentric layout (one ring per family) with no animation. Hover, click, search, view switching all still work.

### 3.19 Tour re-launch

62. Click the **?** button in the graph header. The tour starts over.

### 3.20 Theme

63. Toggle the page theme between dark and light. The graph card adapts: in light mode it uses a white panel with the emerald accent; in dark mode it uses near-black with bright emerald.

---

## Reference — Where Things Live in the Code

Everything for the graph lives inside the single `index.html` file. Key landmarks:

- **CSS** — appended to the main `<style>` block. All graph styles are scoped under `#graph-container`.
- **D3 v7 CDN tag** — in `<head>`, right after Alpine.js.
- **Datasets** (`LSG_COGNATES`, `LSG_GLOSSARY`, `LSG_CENTROIDS`, `LSG_T`) — defined in a `<script>` block just before the engine.
- **Tour overlay** (`#lsg-tour-backdrop`, `#lsg-tour-spotlight`, `#lsg-tour-popover`) and **glossary popover** (`#lsg-gloss-popover`) — DOM-attached to the body so they can spotlight any element.
- **Graph engine** (`v3`) — a single self-contained IIFE in the last `<script>` block before the Buy-Me-a-Coffee widget.
- **Main HTML section** — `<section id="graph-container">…</section>`, placed between the existing recommendations area and the newsletter signup.

The graph never mutates the Alpine app's state except through the explicit "Add to compare panel" button that calls `Alpine.$data(el).toggleCompare(code)`.
