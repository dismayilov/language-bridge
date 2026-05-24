#!/usr/bin/env python3
"""
patch-pair-pages.py — In-place fixer for the pair-page tree.

Walks every from/<src>/to/<tgt>/index.html and ensures it ends cleanly.
Handles three states:

  1. **Already patched** (contains `<script src="/js/micro-quiz.js"`)
     → skipped.

  2. **Truncated by the previous generator run** (ends without </body>,
     usually mid `<div ` of the half-written micro-quiz section)
     → strips the truncated tail and rebuilds the bottom: full micro-quiz
       section + footer with quiz link + script tags + </body></html>.

  3. **Old complete page** (has </body> but no micro-quiz)
     → inserts the micro-quiz section before <footer>, updates the footer to
       include a "Try the full language quiz →" link, adds script tags.

Idempotent — running it twice is a no-op.

Usage (from repo root):
    python3 scripts/patch-pair-pages.py
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FROM_DIR = os.path.join(ROOT, "from")
DATA_PATH = os.path.join(ROOT, "data", "languages-matrix.json")

with open(DATA_PATH, encoding="utf-8") as f:
    DATA = json.load(f)
LANG_NAMES = {c: m.get("name", c) for c, m in DATA["data"]["languages"].items()}


def quiz_section(src: str, tgt: str) -> str:
    src_name = LANG_NAMES.get(src, src)
    tgt_name = LANG_NAMES.get(tgt, tgt)
    return (
        '\n'
        '  <!-- Embedded 3-question micro-quiz for this pair -->\n'
        '  <section style="margin-top: 2.5rem;">\n'
        f'    <h2 style="font-size:1.05rem;font-weight:600;margin:0 0 .35rem">Think you can tell them apart?</h2>\n'
        f'    <p style="font-size:.88rem;opacity:.7;margin:0 0 .9rem">A quick 3-question check between {src_name} and {tgt_name}. No signup.</p>\n'
        f'    <div data-micro-quiz data-mq-mode="pair" data-mq-source="{src}" data-mq-target="{tgt}"></div>\n'
        '  </section>\n'
    )


def footer_section(src: str) -> str:
    return (
        '\n'
        '  <footer>\n'
        '    Scores combine lexical overlap, typological grammar comparison, phonological feature overlap, writing-system kinship, and genealogical distance. CEFR proficiency adjustments are available in the <a href="/">interactive tool</a>.\n'
        '    <br><br>\n'
        '    <a href="/">← Back to MyNextLanguage</a> &nbsp;·&nbsp;\n'
        '    <a href="/quiz/">Try the full language quiz →</a>\n'
        '  </footer>\n'
    )


CLOSING_TAGS = (
    '\n'
    '</div>\n'
    '<script src="/js/profile.js" defer></script>\n'
    '<script src="/js/micro-quiz.js" defer></script>\n'
    '</body>\n'
    '</html>\n'
)


# When inserting into an OLD complete page, swap in a richer footer.
FOOTER_REPLACEMENT_PATTERN = re.compile(
    r'(<footer>[\s\S]*?<a href="/">←\s*Back to MyNextLanguage</a>)\s*(</footer>)',
    re.IGNORECASE,
)
FOOTER_REPLACEMENT_REPLACE = (
    r'\1 &nbsp;·&nbsp; <a href="/quiz/">Try the full language quiz →</a>\2'
)


def patch_file(path: str, src: str, tgt: str) -> str:
    """Returns 'already', 'repaired', 'patched', or 'failed: <reason>'."""
    try:
        with open(path, encoding="utf-8") as f:
            html = f.read()
    except Exception as e:
        return f"failed: {e}"

    if 'src="/js/micro-quiz.js"' in html:
        return "already"

    has_close = "</body>" in html
    has_footer = "<footer" in html

    if not has_close:
        # ── Truncated file: strip from the first sign of the half-written
        #    micro-quiz block (or from the last completed tag) and rebuild.
        cut = -1
        # Prefer cutting right before the half-written comment if present
        for marker in (
            "<!-- Embedded 3-question micro-quiz",
            "<!-- ── Embedded 3-question micro-quiz",
        ):
            i = html.find(marker)
            if i != -1:
                cut = i
                break
        if cut == -1:
            # No micro-quiz marker — cut after the last </section> or </ul>
            for marker in ("</section>", "</ul>"):
                i = html.rfind(marker)
                if i != -1:
                    cut = i + len(marker)
                    break
        if cut == -1:
            return "failed: cannot find safe cut point in truncated file"

        head = html[:cut].rstrip()
        new_html = head + "\n" + quiz_section(src, tgt) + footer_section(src) + CLOSING_TAGS
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_html)
        except Exception as e:
            return f"failed: {e}"
        return "repaired"

    # ── Old complete file: insert the section before <footer>, update footer, add scripts
    if not has_footer:
        return "failed: complete file but no <footer>"

    block = quiz_section(src, tgt)
    new_html = re.sub(r"(\s*)<footer", block + r"  <footer", html, count=1)
    new_html, _ = FOOTER_REPLACEMENT_PATTERN.subn(FOOTER_REPLACEMENT_REPLACE, new_html, count=1)
    if 'src="/js/micro-quiz.js"' not in new_html:
        new_html = new_html.replace(
            "</body>",
            '<script src="/js/profile.js" defer></script>\n'
            '<script src="/js/micro-quiz.js" defer></script>\n'
            "</body>",
            1,
        )
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_html)
    except Exception as e:
        return f"failed: {e}"
    return "patched"


def main():
    if not os.path.isdir(FROM_DIR):
        print(f"[patch] No {FROM_DIR}/ directory.")
        return 1

    counts = {"already": 0, "repaired": 0, "patched": 0, "failed": 0}
    failures = []

    for src in sorted(os.listdir(FROM_DIR)):
        src_dir = os.path.join(FROM_DIR, src)
        to_dir = os.path.join(src_dir, "to")
        if not os.path.isdir(to_dir):
            continue
        for tgt in sorted(os.listdir(to_dir)):
            page = os.path.join(to_dir, tgt, "index.html")
            if not os.path.isfile(page):
                continue
            r = patch_file(page, src, tgt)
            if r in counts:
                counts[r] += 1
            else:
                counts["failed"] += 1
                if len(failures) < 5:
                    failures.append((page, r))

    print(f"[patch] already={counts['already']}  repaired={counts['repaired']}  "
          f"patched={counts['patched']}  failed={counts['failed']}")
    if failures:
        print("[patch] first failures:")
        for p, r in failures:
            print(f"  - {p}: {r}")
    return 0 if counts["failed"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
