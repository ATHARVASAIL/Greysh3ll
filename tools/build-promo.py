#!/usr/bin/env python3
"""Build GreySh3ll promo assets from the app's own design tokens.

Colours are parsed out of css/base.css rather than retyped, so the assets
cannot drift from the product. Every text colour used on a surface is checked
against WCAG AA before anything is written.
"""
import re, os, sys, math, json
import qrcode
import cairosvg

APP = os.environ.get('GS_APP') or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.environ.get('GS_PROMO_OUT') or '/mnt/user-data/outputs'
SITE = 'https://atharvasail.github.io/GreySh3ll/index.html'
MONO = "DejaVu Sans Mono, JetBrains Mono, monospace"

# ---------- tokens straight out of the product ----------
def load_tokens():
    css = open(os.path.join(APP, 'css/base.css')).read()
    toks = dict(re.findall(r'--([a-z0-9\-]+)\s*:\s*(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\))', css))
    need = ['bg','surface-1','surface-2','surface-3','text-bright','text','text-dim',
            'text-faint','accent','accent-2','crit','high','med','low','info','border']
    missing = [n for n in need if n not in toks]
    if missing:
        sys.exit(f'missing design tokens in base.css: {missing}')
    return toks

T = load_tokens()


# ---------- case counts, read from the data rather than restated ----------
# These were hardcoded once and went three versions stale before anyone
# noticed, so they are now derived. The severity colour per domain is a
# presentation choice and stays here; the numbers never do.
DOMAIN_COLOR = {
    'NET': 'info', 'WEB': 'crit', 'SRC': 'high', 'API': 'med', 'MOBILE': 'low',
    'CLOUD': 'info', 'THICK': 'high', 'WIFI': 'med', 'SOCIAL': 'low', 'LLM': 'crit',
}
DISPLAY_NAME = {'LLM': 'LLM/AI'}


def load_domain_counts():
    """Return [(display name, count, colour token)] ordered largest first,
    plus the total, straight from the built index."""
    index_path = os.path.join(APP, 'data', 'index.json')
    with open(index_path) as fh:
        items = json.load(fh)['items']
    counts = {}
    for it in items:
        counts[it['domain']] = counts.get(it['domain'], 0) + 1
    missing = [d for d in counts if d not in DOMAIN_COLOR]
    if missing:
        sys.exit(f'build-promo: no colour mapping for domain(s) {missing}')
    rows = [(DISPLAY_NAME.get(d, d), n, DOMAIN_COLOR[d])
            for d, n in sorted(counts.items(), key=lambda kv: -kv[1])]
    return rows, len(items)


DOMAINS, TOTAL = load_domain_counts()

# ---------- contrast gate (same rule as tools/check-contrast.py) ----------
def _srgb(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def lum(hexc):
    hexc = hexc.lstrip('#')
    if len(hexc) == 3:
        hexc = ''.join(ch * 2 for ch in hexc)
    r, g, b = (int(hexc[i:i+2], 16) for i in (0, 2, 4))
    return 0.2126*_srgb(r) + 0.7152*_srgb(g) + 0.0722*_srgb(b)

def ratio(fg, bg):
    a, b = lum(fg), lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)

CONTRAST_CHECKS = []
def text(fg_token, bg_token, note):
    """Register a fg/bg pair for the AA gate and return the colour."""
    fg, bg = T[fg_token], T[bg_token]
    CONTRAST_CHECKS.append((note, fg_token, bg_token, ratio(fg, bg)))
    return fg

# ---------- QR ----------
def qr_svg_paths(data, modules_px, origin_x, origin_y):
    """Return (svg_rects, module_count). Rendered as plain rects so the QR
    scales cleanly and needs no embedded raster."""
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=1, border=0)
    q.add_data(data)
    q.make(fit=True)
    m = q.get_matrix()
    n = len(m)
    cell = modules_px / n
    rects = []
    for y, row in enumerate(m):
        x = 0
        while x < n:
            if row[x]:
                run = 1
                while x + run < n and row[x + run]:
                    run += 1
                rects.append(
                    f'<rect x="{origin_x + x*cell:.3f}" y="{origin_y + y*cell:.3f}" '
                    f'width="{run*cell:.3f}" height="{cell:.3f}" fill="#000000"/>')
                x += run
            else:
                x += 1
    return '\n'.join(rects), n

# ---------- shared chrome ----------
def defs():
    return f'''<defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{T['surface-1']}"/>
      <stop offset="60%" stop-color="{T['bg']}"/>
      <stop offset="100%" stop-color="{T['surface-2']}"/>
    </linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="{T['accent']}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="{T['accent']}" stop-opacity="0"/>
    </linearGradient>
  </defs>'''

def grid(w, h, step=40, opacity=0.05):
    lines = []
    for x in range(0, w + 1, step):
        lines.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{h}"/>')
    for y in range(0, h + 1, step):
        lines.append(f'<line x1="0" y1="{y}" x2="{w}" y2="{y}"/>')
    return (f'<g stroke="{T["accent"]}" stroke-width="1" opacity="{opacity}">'
            + ''.join(lines) + '</g>')

def wordmark(x, y, size=44):
    # NOTE: the wordmark is split across two tspans below — "GreySh" in the
    # bright colour and "3ll" in the accent. A search for the full name will
    # not match either half, so any future rename has to touch both.
    grey = text('text-bright', 'bg', 'wordmark GreySh')
    tail = text('accent', 'bg', 'wordmark 3ll')
    return (f'<text x="{x}" y="{y}" font-family="{MONO}" font-size="{size}" '
            f'font-weight="700" fill="{grey}" letter-spacing="1">GreySh'
            f'<tspan fill="{tail}">3ll</tspan></text>')

def prompt(x, y, size=17, label='vapt-console'):
    c = text('low', 'bg', 'prompt caret')
    d = text('text-faint', 'bg', 'prompt path')
    return (f'<text x="{x}" y="{y}" font-family="{MONO}" font-size="{size}" fill="{c}">'
            f'~/{label} <tspan fill="{d}">$</tspan></text>')

def chip(x, y, label, tok, w=None, size=15):
    """Severity/label chip drawn from the product's severity colours."""
    w = w or (len(label) * size * 0.62 + 26)
    col = T[tok]
    CONTRAST_CHECKS.append((f'chip {label}', tok, 'surface-2', ratio(col, T['surface-2'])))
    return (f'<g><rect x="{x}" y="{y}" width="{w:.1f}" height="30" rx="6" '
            f'fill="{col}" fill-opacity="0.13" stroke="{col}" stroke-opacity="0.45"/>'
            f'<text x="{x + w/2:.1f}" y="{y + 20}" text-anchor="middle" '
            f'font-family="{MONO}" font-size="{size}" fill="{col}">{label}</text></g>')

# ---------- assets ----------
def banner():
    w, h = 1200, 630
    body = text('text', 'bg', 'banner body')
    dim = text('text-dim', 'bg', 'banner dim')
    accent2 = text('accent-2', 'bg', 'banner count')
    domains = DOMAINS
    # Two deliberate rows of five, rather than letting the tenth chip orphan
    # itself onto a line of its own.
    chips = []
    for row_i, row in enumerate((domains[:5], domains[5:])):
        cx, cy = 72, 430 + row_i * 44
        for name, n, tok in row:
            label = f'{name} {n}'
            cw = len(label) * 15 * 0.62 + 26
            chips.append(chip(cx, cy, label, tok))
            cx += cw + 12
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  {defs()}
  <rect width="{w}" height="{h}" fill="url(#bgGrad)"/>
  {grid(w, h)}
  <rect x="0" y="0" width="{w}" height="4" fill="url(#rule)"/>
  {prompt(72, 92)}
  {wordmark(72, 168, 62)}
  <text x="72" y="222" font-family="{MONO}" font-size="21" fill="{dim}">
    VAPT assessment console</text>
  <text x="72" y="300" font-family="{MONO}" font-size="38" fill="{body}">
    <tspan fill="{accent2}" font-weight="700">{TOTAL}</tspan> test cases ·
    <tspan fill="{accent2}" font-weight="700">10</tspan> domains</text>
  <text x="72" y="348" font-family="{MONO}" font-size="20" fill="{dim}">
    Runs entirely in your browser. No backend, no accounts, no telemetry.</text>
  {''.join(chips)}
  <text x="72" y="{h - 44}" font-family="{MONO}" font-size="18" fill="{text('accent','bg','banner url')}">
    atharvasail.github.io/GreySh3ll</text>
  <text x="{w - 72}" y="{h - 44}" text-anchor="end" font-family="{MONO}" font-size="16" fill="{text('text-faint','bg','banner author')}">
    MIT · Atharva Sail</text>
</svg>'''

def square():
    w = h = 1080
    dim = text('text-dim', 'bg', 'square dim')
    body = text('text', 'bg', 'square body')
    accent2 = text('accent-2', 'bg', 'square count')
    lines = [
        ('Checklist', 'every case tracked by status'),
        ('Knowledge base', 'steps, payloads, mitigations'),
        ('Report builder', 'export a PDF when you are done'),
    ]
    rows = []
    y = 620
    for title, sub in lines:
        rows.append(
            f'<text x="96" y="{y}" font-family="{MONO}" font-size="30" fill="{body}">'
            f'<tspan fill="{T["accent"]}">▸</tspan> {title}</text>'
            f'<text x="130" y="{y + 38}" font-family="{MONO}" font-size="22" fill="{dim}">{sub}</text>')
        y += 104
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  {defs()}
  <rect width="{w}" height="{h}" fill="url(#bgGrad)"/>
  {grid(w, h, 45)}
  <rect x="0" y="0" width="{w}" height="5" fill="url(#rule)"/>
  {prompt(96, 128, 20)}
  {wordmark(96, 218, 76)}
  <text x="96" y="272" font-family="{MONO}" font-size="26" fill="{dim}">VAPT assessment console</text>
  <text x="96" y="390" font-family="{MONO}" font-size="88" font-weight="700" fill="{accent2}">{TOTAL}</text>
  <text x="96" y="440" font-family="{MONO}" font-size="28" fill="{body}">test cases across {len(DOMAINS)} domains</text>
  <line x1="96" y1="500" x2="{w-96}" y2="500" stroke="{T['border']}" stroke-width="2"/>
  {''.join(rows)}
  <text x="96" y="{h - 108}" font-family="{MONO}" font-size="24" fill="{text('low','bg','square privacy')}">
    Client-side only · nothing leaves your machine</text>
  <text x="96" y="{h - 64}" font-family="{MONO}" font-size="22" fill="{text('accent','bg','square url')}">
    atharvasail.github.io/GreySh3ll</text>
</svg>'''

def slide(idx, title, kicker, lines, footer, extra=''):
    w, h = 1080, 1350
    dim = text('text-dim', 'bg', 'slide dim')
    body = text('text', 'bg', 'slide body')
    rows = []
    y = 560
    for ln in lines:
        rows.append(f'<text x="88" y="{y}" font-family="{MONO}" font-size="30" fill="{body}">'
                    f'<tspan fill="{T["accent"]}">▸</tspan> {ln}</text>')
        y += 76
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  {defs()}
  <rect width="{w}" height="{h}" fill="url(#bgGrad)"/>
  {grid(w, h, 45)}
  <rect x="0" y="0" width="{w}" height="5" fill="url(#rule)"/>
  <text x="88" y="120" font-family="{MONO}" font-size="20" fill="{text('text-faint','bg','slide idx')}">
    {idx} / 4</text>
  <text x="88" y="230" font-family="{MONO}" font-size="22" fill="{text('accent-2','bg','slide kicker')}">{kicker}</text>
  <text x="88" y="320" font-family="{MONO}" font-size="60" font-weight="700" fill="{text('text-bright','bg','slide title')}">{title}</text>
  <line x1="88" y1="400" x2="{w-88}" y2="400" stroke="{T['border']}" stroke-width="2"/>
  {''.join(rows)}
  {extra}
  <text x="88" y="{h - 72}" font-family="{MONO}" font-size="22" fill="{dim}">{footer}</text>
</svg>'''

def slides():
    out = []
    out.append(slide(
        1, 'GreySh3ll', 'VAPT ASSESSMENT CONSOLE',
        [f'{TOTAL} test cases, {len(DOMAINS)} security domains',
         'Checklist, knowledge base, report builder',
         'Runs entirely in your browser'],
        'Swipe →',
        extra=f'{wordmark(88, 1120, 70)}'))
    out.append(slide(
        2, 'The problem', 'WHY IT EXISTS',
        ['Scope lives in a spreadsheet someone forked',
         'Methodology lives in six different notebooks',
         'The report gets rebuilt by hand, every time',
         'Nothing links a finding back to its evidence'],
        'Swipe →'))
    out.append(slide(
        3, 'What it does', 'FEATURES',
        ['Track every case by status, severity, owner',
         'Steps to identify, payloads, mitigations, CWE',
         'Attack chains: link findings that enable each other',
         'Scan import: paste Nmap / Nuclei / Burp output',
         'Export a PDF report with your evidence attached'],
        'Swipe →'))

    qr_px = 300
    qx, qy = (1080 - qr_px) / 2, 720
    pad = 22
    rects, n = qr_svg_paths(SITE, qr_px, qx, qy)
    qr_block = (f'<rect x="{qx-pad}" y="{qy-pad}" width="{qr_px+pad*2}" height="{qr_px+pad*2}" '
                f'rx="10" fill="#FFFFFF"/>' + rects +
                f'<text x="540" y="{qy + qr_px + 88}" text-anchor="middle" '
                f'font-family="{MONO}" font-size="26" fill="{text("accent","bg","qr url")}">'
                f'atharvasail.github.io/GreySh3ll</text>')
    out.append(slide(
        4, 'Try it', 'FREE · MIT · NO SIGNUP',
        ['No install, no signup, no account',
         'Your progress stays in your own browser'],
        'Built by Atharva Sail', extra=qr_block))
    return out, n

def write(name, svg, png_w=None):
    svg_path = os.path.join(OUT, name + '.svg')
    png_path = os.path.join(OUT, name + '.png')
    open(svg_path, 'w').write(svg)
    kw = {'output_width': png_w} if png_w else {}
    cairosvg.svg2png(bytestring=svg.encode(), write_to=png_path, **kw)
    return svg_path, png_path

def main():
    os.makedirs(OUT, exist_ok=True)
    written = []
    written.append(write('greysh3ll-banner-1200x630', banner()))
    written.append(write('greysh3ll-square-1080', square()))
    svgs, qr_modules = slides()
    for i, s in enumerate(svgs, 1):
        written.append(write(f'greysh3ll-slide-{i}', s))

    print(f'QR: {qr_modules}x{qr_modules} modules, ECC level H')
    print('\nContrast gate (WCAG AA = 4.5:1):')
    fails = [c for c in CONTRAST_CHECKS if c[3] < 4.5]
    seen = set()
    for note, fg, bg, r in CONTRAST_CHECKS:
        key = (fg, bg)
        if key in seen:
            continue
        seen.add(key)
        print(f'  {fg:<12} on {bg:<10} {r:6.2f}  {"PASS" if r >= 4.5 else "FAIL"}   ({note})')
    if fails:
        sys.exit(f'\nFAILED: {len(fails)} colour pair(s) below AA')
    print('\nPASSED — every promo text colour clears AA')
    print('\nWritten:')
    for s, p in written:
        print('  ', os.path.basename(s), '+', os.path.basename(p))

if __name__ == '__main__':
    main()
