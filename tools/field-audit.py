#!/usr/bin/env python3
"""field-audit.py — measures every case against the seven mandatory fields.

The brief for a report-grade case is fixed:
  1 prerequisites + root cause      5 variants (>=3)
  2 steps to identify (>=5)         6 mitigation, split technical/client
  3 exploitation steps (>=5)        7 industry mapping (CWE + category + ATT&CK)
  4 real payloads (>=4, no placeholders)

This prints the gap rather than asserting it, because the corpus is being
brought up to the bar domain by domain and a hard failure would block every
other gate in the meantime. Once no domain reports a gap, --strict is wired
into the test run so the bar cannot silently regress.

Usage:  python3 tools/field-audit.py [--strict] [--domain WEB]
"""

import json, glob, os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

MIN_IDENTIFY, MIN_EXPLOIT, MIN_PAYLOAD, MIN_VARIANT, MIN_MITIGATION = 5, 5, 4, 3, 4
MIN_CLIENT_WORDS = 60

# Placeholders that must never reach a client report. example.test and the
# other RFC 2606 reserved names are deliberately excluded: they are the
# correct thing to write in a payload, not a lazy stand-in.
PLACEHOLDERS = [
    (r'\bexample\.(com|org|net)\b', 'example.com'),
    (r'<script>\s*alert\(\s*1\s*\)\s*</script>', 'alert(1) stub'),
    (r'\byour[-_]?(site|domain|host|server)\b', 'your-site'),
    (r'\b(foo|bar|baz)\.(com|net|org)\b', 'foo.com'),
    (r'\bTODO\b|\bFIXME\b', 'TODO marker'),
]


def payload_text(item):
    out = []
    for p in item.get('examplePayloads') or []:
        out.append(p if isinstance(p, str) else ' '.join(str(v) for v in p.values()))
    return out


def gaps(item):
    g = []
    if not (item.get('prerequisites') or '').strip() or item['prerequisites'] == 'Not specified.':
        g.append('prerequisites')
    if not (item.get('rootCause') or '').strip() or item['rootCause'] == 'Not specified.':
        g.append('rootCause')
    if len(item.get('stepsToIdentify') or []) < MIN_IDENTIFY:   g.append('identify')
    if len(item.get('exploitationSteps') or []) < MIN_EXPLOIT:  g.append('exploit')
    pays = payload_text(item)
    if len(pays) < MIN_PAYLOAD:                                 g.append('payloads')
    if len(item.get('variants') or []) < MIN_VARIANT:           g.append('variants')
    if len(item.get('mitigation') or []) < MIN_MITIGATION:      g.append('mitigation')
    if len((item.get('mitigationClientFacing') or '').split()) < MIN_CLIENT_WORDS:
        g.append('clientFacing')
    if not (item.get('cwe') or '').startswith('CWE-'):          g.append('cwe')
    if not item.get('categoryCode'):                            g.append('category')
    if not item.get('attack') and item['domain'] != 'LLM':      g.append('attack')
    blob = ' '.join(pays + (item.get('variants') or []))
    for pat, label in PLACEHOLDERS:
        if re.search(pat, blob, re.I):
            g.append('placeholder:' + label)
    return g


def main():
    strict = '--strict' in sys.argv
    only = None
    if '--domain' in sys.argv:
        only = sys.argv[sys.argv.index('--domain') + 1].upper()

    per_domain, reasons, total, clean = collections.OrderedDict(), collections.Counter(), 0, 0
    for f in sorted(glob.glob(os.path.join(DATA, '*.json'))):
        if os.path.basename(f) in ('index.json', 'toolkit.json'):
            continue
        for item in json.load(open(f, encoding='utf-8'))['items']:
            if only and item['domain'] != only:
                continue
            total += 1
            g = gaps(item)
            d = per_domain.setdefault(item['domain'], {'n': 0, 'ok': 0})
            d['n'] += 1
            if g:
                for r in g:
                    reasons[r] += 1
            else:
                d['ok'] += 1
                clean += 1

    print(f'{"domain":8} {"cases":>6} {"at bar":>7} {"gap":>6}')
    for dom, d in sorted(per_domain.items()):
        bar = '#' * int(20 * d['ok'] / d['n']) if d['n'] else ''
        print(f'{dom:8} {d["n"]:6} {d["ok"]:7} {d["n"]-d["ok"]:6}  {bar}')
    print(f'\n{clean}/{total} cases meet all seven fields\n')
    if reasons:
        print('cases short, by field:')
        for r, c in reasons.most_common():
            print(f'  {r:24} {c}')
    if strict and clean != total:
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
