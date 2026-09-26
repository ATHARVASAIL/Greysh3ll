#!/usr/bin/env python3
"""
check-contrast.py — verifies every text colour in the palette meets WCAG AA
against every surface it can appear on, in BOTH themes.

Why this exists
---------------
On a dark palette it is very easy to pick a muted grey that looks tasteful and
is actually unreadable. Three tokens in this project shipped below the 4.5:1
requirement for months — --text-faint was at 1.62:1 — and nobody noticed by eye,
because low contrast reads as "subtle" rather than as "broken" until someone
tries to use the app in daylight or with reduced vision.

This checks the numbers instead of trusting judgement.

Two themes, two palettes
------------------------
The dark (default) palette lives in css/base.css. The light palette is a full
set of token overrides inside the :root[data-theme="light"] block in
css/theme-extras.css. For months this script only read base.css, so every
light-theme colour was completely unchecked — and the light palette leans on
dark ambers (#B37700) and mid greys that are far riskier on light surfaces than
their dark-theme counterparts are on dark ones. This now validates both.

Surfaces text can actually sit on
---------------------------------
--surface-4 is deliberately excluded from the text-background set. In this
project it is decorative only — terminal-window dots, the scrollbar thumb, a
copy-button hover fill, and the progress-bar track — never a background for
body text. Holding text tokens to it forces the whole light palette darker for
no readability benefit (its own grey-blue #D9DFE8 is much darker than the
white/near-white surfaces text really appears on). This mirrors the existing
policy of excluding purely decorative tokens like --accent-dim.

Usage:  python3 tools/check-contrast.py
Exit code is non-zero when something fails, so it can gate a commit or build.
"""

import re
import os
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# WCAG 2.1 AA: 4.5:1 for normal text, 3.0:1 for large (>=18.66px bold / 24px).
AA_NORMAL = 4.5
AA_LARGE = 3.0

# Surfaces text can genuinely appear on. surface-4 is intentionally omitted —
# it is decorative-only in this codebase (see module docstring).
SURFACE_TOKENS = ['bg', 'surface-1', 'surface-2', 'surface-3']

# Tokens that carry real text. Decorative-only tokens (borders, glows, the
# scrollbar thumb) are deliberately excluded — holding a 1px rule to a text
# contrast requirement would force the whole palette lighter for no benefit.
TEXT_TOKENS = [
    'text-bright', 'text', 'text-dim', 'text-faint',
    'crit', 'high', 'med', 'low', 'info', 'fail', 'na', 'accepted',
    'accent', 'accent-2',
]

DECORATIVE_TOKENS = ['accent-dim', 'surface-4']


def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def relative_luminance(rgb):
    def channel(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = relative_luminance(hex_to_rgb(a)), relative_luminance(hex_to_rgb(b))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def _tokens_from_css(css):
    """Every --token:#hexhex pair in a blob of CSS, last one wins (cascade)."""
    tokens = {}
    for name, value in re.findall(r'--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})', css):
        tokens[name] = value
    return tokens


def read_dark_tokens():
    """The default (dark) palette — the whole :root block in base.css."""
    css = open(os.path.join(ROOT, 'css', 'base.css'), encoding='utf-8').read()
    return _tokens_from_css(css)


def read_light_tokens():
    """The light palette: base tokens, then the :root[data-theme="light"]
    overrides layered on top, exactly as the cascade resolves them at runtime.

    The light block redefines every surface and text token, but layering on the
    base set first means any token it *doesn't* override is still checked with
    its inherited value rather than silently dropped."""
    base = read_dark_tokens()
    extras = open(os.path.join(ROOT, 'css', 'theme-extras.css'), encoding='utf-8').read()
    # Isolate the light-theme :root block so we don't pick up token values that
    # happen to appear inside unrelated component rules further down the file.
    m = re.search(r':root\[data-theme="light"\]\s*\{(.*?)\}', extras, re.DOTALL)
    if not m:
        print('Could not find the :root[data-theme="light"] block in '
              'css/theme-extras.css', file=sys.stderr)
        return None
    light = dict(base)
    light.update(_tokens_from_css(m.group(1)))
    return light


def check_palette(theme_name, tokens):
    """Returns (rows, failures) for one theme. rows is for printing."""
    missing = [t for t in SURFACE_TOKENS + TEXT_TOKENS if t not in tokens]
    if missing:
        print(f'[{theme_name}] Could not resolve these tokens: '
              f'{", ".join(missing)}', file=sys.stderr)
        return None, [('__missing__', '', 0, ', '.join(missing))]

    surfaces = [(s, tokens[s]) for s in SURFACE_TOKENS]
    rows, failures = [], []
    for name in TEXT_TOKENS:
        colour = tokens[name]
        worst_ratio, worst_surface = min(
            ((contrast(colour, sv), sn) for sn, sv in surfaces),
            key=lambda x: x[0],
        )
        ok = worst_ratio >= AA_NORMAL
        rows.append((name, colour, worst_ratio, worst_surface, ok))
        if not ok:
            failures.append((name, colour, round(worst_ratio, 2), worst_surface))
    return rows, failures


def print_palette(theme_name, tokens, rows):
    surfaces = [tokens[s] for s in SURFACE_TOKENS]
    print(f'== {theme_name} theme ==  (surfaces: {", ".join(surfaces)})')
    print(f'{"token":14}{"colour":10}{"worst ratio":>12}   result')
    print('-' * 52)
    for name, colour, worst_ratio, worst_surface, ok in rows:
        status = 'PASS' if ok else (f'FAIL on {worst_surface}')
        print(f'{name:14}{colour:10}{worst_ratio:>11.2f}   {status}')
    print()


def check_js_colours(dark):
    """Hardcoded colours in JS mirror the *dark* CSS tokens (they are the dark
    palette's severity/status hexes, e.g. #FFB000 for --high) and drift out of
    sync, so they are checked here too rather than trusted. They are validated
    against the dark surfaces only: under the light theme these same status
    keys resolve through CSS tokens (data-status / data-rem attributes), not
    through these JS literals, so checking a bright dark-theme hex against a
    near-white light surface would be a false failure for a colour that is
    never painted there."""
    surfaces = [dark[s] for s in SURFACE_TOKENS]
    js_failures = []
    for path in sorted(glob.glob(os.path.join(ROOT, 'js', '*.js'))):
        source = open(path, encoding='utf-8').read()
        for match in re.finditer(r"color:\s*'(#[0-9A-Fa-f]{6})'", source):
            colour = match.group(1)
            worst = min(contrast(colour, sv) for sv in surfaces)
            if worst < AA_NORMAL:
                js_failures.append((os.path.basename(path), colour, round(worst, 2)))
    return js_failures


def main():
    dark = read_dark_tokens()
    light = read_light_tokens()
    if light is None:
        return 1

    all_failures = []
    for theme_name, tokens in (('DARK (default)', dark), ('LIGHT', light)):
        rows, failures = check_palette(theme_name, tokens)
        if rows is None:
            return 1
        print_palette(theme_name, tokens, rows)
        for f in failures:
            all_failures.append((theme_name, *f))

    js_failures = check_js_colours(dark)
    if js_failures:
        print('Hardcoded JS colours below AA (dark surfaces):')
        for f, c, r in js_failures:
            print(f'  {f}  {c}  {r}:1')
    else:
        print('Hardcoded JS colours: all pass AA on dark surfaces')
    print()

    total = len(all_failures) + len(js_failures)
    if total:
        print(f'FAILED — {total} colour(s) below WCAG AA {AA_NORMAL}:1')
        for theme_name, name, colour, ratio, surface in all_failures:
            print(f'  [{theme_name}] {name} {colour} — {ratio}:1 on {surface}')
        return 1
    n = len(SURFACE_TOKENS)
    print(f'PASSED — every text colour clears WCAG AA {AA_NORMAL}:1 '
          f'on all {n} text surfaces, in both themes')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
