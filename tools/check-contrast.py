#!/usr/bin/env python3
"""
check-contrast.py — verifies every text colour in the palette meets WCAG AA
against every surface it can appear on.

Why this exists
---------------
On a dark palette it is very easy to pick a muted grey that looks tasteful and
is actually unreadable. Three tokens in this project shipped below the 4.5:1
requirement for months — --text-faint was at 1.62:1 — and nobody noticed by eye,
because low contrast reads as "subtle" rather than as "broken" until someone
tries to use the app in daylight or with reduced vision.

This checks the numbers instead of trusting judgement. Run it after any change
to the palette in css/base.css or the hardcoded status colours in js/storage.js.

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

SURFACE_TOKENS = ['bg', 'surface-1', 'surface-2', 'surface-3', 'surface-4']

# Tokens that carry real text. Decorative-only tokens (borders, glows, the
# scrollbar thumb) are deliberately excluded — holding a 1px rule to a text
# contrast requirement would force the whole palette lighter for no benefit.
TEXT_TOKENS = [
    'text-bright', 'text', 'text-dim', 'text-faint',
    'crit', 'high', 'med', 'low', 'info', 'fail', 'na',
    'accent', 'accent-2',
]

DECORATIVE_TOKENS = ['accent-dim']


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


def read_tokens():
    css = open(os.path.join(ROOT, 'css', 'base.css'), encoding='utf-8').read()
    tokens = {}
    for name, value in re.findall(r'--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})', css):
        tokens[name] = value
    return tokens


def main():
    tokens = read_tokens()
    missing = [t for t in SURFACE_TOKENS + TEXT_TOKENS if t not in tokens]
    if missing:
        print(f'Could not find these tokens in css/base.css: {", ".join(missing)}', file=sys.stderr)
        return 1

    surfaces = [(s, tokens[s]) for s in SURFACE_TOKENS]
    failures = []

    print(f'{"token":14}{"colour":10}{"worst ratio":>12}   result')
    print('-' * 52)
    for name in TEXT_TOKENS:
        colour = tokens[name]
        worst_ratio, worst_surface = min(
            ((contrast(colour, sv), sn) for sn, sv in surfaces),
            key=lambda x: x[0],
        )
        ok = worst_ratio >= AA_NORMAL
        status = 'PASS' if ok else (f'FAIL on {worst_surface}')
        print(f'{name:14}{colour:10}{worst_ratio:>11.2f}   {status}')
        if not ok:
            failures.append((name, colour, round(worst_ratio, 2), worst_surface))

    # Hardcoded colours in JS mirror the CSS tokens and drift out of sync,
    # so they are checked here too rather than trusted.
    print()
    js_failures = []
    for path in sorted(glob.glob(os.path.join(ROOT, 'js', '*.js'))):
        source = open(path, encoding='utf-8').read()
        for match in re.finditer(r"color:\s*'(#[0-9A-Fa-f]{6})'", source):
            colour = match.group(1)
            worst = min(contrast(colour, sv) for _, sv in surfaces)
            if worst < AA_NORMAL:
                js_failures.append((os.path.basename(path), colour, round(worst, 2)))
    if js_failures:
        print('Hardcoded JS colours below AA:')
        for f, c, r in js_failures:
            print(f'  {f}  {c}  {r}:1')
    else:
        print('Hardcoded JS colours: all pass AA')

    print()
    if failures or js_failures:
        print(f'FAILED — {len(failures) + len(js_failures)} colour(s) below WCAG AA {AA_NORMAL}:1')
        return 1
    print(f'PASSED — every text colour clears WCAG AA {AA_NORMAL}:1 on all {len(surfaces)} surfaces')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
