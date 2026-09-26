#!/usr/bin/env python3
"""
build-data.py — generates the runtime data artifacts from the source files.

Why this exists
---------------
The app previously fetched all ten full domain files (~3 MB) before it was
usable, even though the dashboard, sidebar counts, search and list rows only
need a handful of fields per test case. This script splits each source file in
two:

  data/index.json          ~86 KB   every test case, light fields only
  data/detail/<code>.json  ~260 KB  the heavy fields, keyed by test-case id

The app loads the index on startup and pulls a domain's detail file only when
something actually needs it (opening a test case, running Assessment Mode,
building a report, or opening a toolkit tab that reads payloads).

The files in data/*.json remain the editable source of truth — edit those, then
re-run this script. Nothing here rewrites them.

Usage:  python3 tools/build-data.py
"""

import json
import re
import os
import glob
import sys

# Fields the app needs before a test case is opened: list rows, search,
# filters, sidebar counts, dashboard stats and Assessment Mode ordering.
#
# `reference` is included deliberately. It is the single largest light field
# (~136 KB across all domains), but the toolbar search matches against
# reference.standard, reference.tools and reference.links. Deferring it would
# make searching for a tool or standard silently return nothing until that
# domain happened to be loaded — a correctness regression not worth the saving.
# The drill tab truncates descriptions to roughly this length on screen.
DRILL_EXCERPT_CHARS = 240

LIGHT_FIELDS = {
    'id', 'domain', 'sequence', 'domainIndex', 'title',
    'categoryStandard', 'categoryCode', 'categoryName',
    'severity', 'severityLabel', 'cwe', 'reference',
    # ATT&CK rides in the index rather than the detail files: it is a few
    # bytes per case and the report builder needs it without pulling ~2.8 MB
    # of detail for every domain.
    'attack',
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
DETAIL_DIR = os.path.join(DATA, 'detail')

# Generated artifacts must not be read back in as sources on a re-run.
GENERATED = {'index.json', 'toolkit.json'}


def domain_order():
    """The canonical domain order, read from the CATEGORIES list in
    js/storage.js so this file and the app cannot disagree about it."""
    src = open(os.path.join(ROOT, 'js', 'storage.js'), encoding='utf-8').read()
    start = src.index('const CATEGORIES = [')
    depth, i = 0, src.index('[', start)
    for j in range(i, len(src)):
        if src[j] == '[':
            depth += 1
        elif src[j] == ']':
            depth -= 1
            if depth == 0:
                block = src[i:j + 1]
                break
    return re.findall(r'"code"\s*:\s*"([A-Z]+)"', block)


def renumber_domain_order(items):
    """Assign each case a unique global sequence following the domain order,
    preserving each domain's own internal ordering."""
    order = domain_order()
    if not order:
        raise SystemExit('build-data: could not read CATEGORIES from js/storage.js')
    rank = {code: n for n, code in enumerate(order)}
    unknown = sorted({i['domain'] for i in items if i['domain'] not in rank})
    if unknown:
        raise SystemExit(f'build-data: domain(s) missing from CATEGORIES: {unknown}')

    def within(item):
        # keep the domain's existing internal order, falling back to the id
        return (item.get('sequence', 0), item.get('id', ''))

    by_domain = {}
    for it in items:
        by_domain.setdefault(it['domain'], []).append(it)

    n = 0
    for code in order:
        # `sequence` is the global ordering key (Testing Order sort, "next
        # untested" lookup). `domainIndex` is what the UI shows: cases are
        # numbered from 1 within their own domain, because "#401" told an
        # analyst nothing useful about where they were in MOBILE.
        for i, it in enumerate(sorted(by_domain.get(code, []), key=within), 1):
            n += 1
            it['sequence'] = n
            it['domainIndex'] = i

def load_taxonomies():
    """Import the taxonomies from tools/map-categories.py so the two files
    cannot disagree about what a standard contains."""
    import importlib.util
    path = os.path.join(ROOT, 'tools', 'map-categories.py')
    spec = importlib.util.spec_from_file_location('map_categories', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.DOMAIN_TAXONOMY


def build_category_index(items):
    """domain -> { standard, categories: [ {code, name, count} ] }.

    Every category the standard defines is listed, including ones this
    engagement has no cases in. Omitting them would quietly redraw the
    standard: a reader glancing at the web picker should see that OWASP has
    a Supply Chain category even when the corpus has nothing filed under it.

    Order follows the publisher's own numbering, which needs a natural sort
    on the numeric part — a string sort puts API10 between API1 and API2."""
    taxonomies = load_taxonomies()
    out = {}
    for it in items:
        d = out.setdefault(it['domain'], {'standard': it['categoryStandard'], 'counts': {}})
        d['counts'][it['categoryCode']] = d['counts'].get(it['categoryCode'], 0) + 1

    def order(code):
        m = re.search(r'(\d+)', code)
        return (re.sub(r'\d+', '', code), int(m.group(1)) if m else 0)

    for domain, d in out.items():
        _, taxonomy = taxonomies[domain]
        # An OWASP "Top 10" is a fixed list a reader expects to see whole, so
        # empty categories are shown (greyed out) rather than quietly dropped.
        # NIST SP 800-53 is a control catalogue, not a ranked ten, and listing
        # six empty families next to the two that matter is just noise — so
        # there only the families actually used are listed.
        fixed_list = d['standard'].startswith('OWASP')
        cats = [{'code': c, 'name': taxonomy[c], 'count': d['counts'].get(c, 0)}
                for c in sorted(taxonomy, key=order)
                if fixed_list or d['counts'].get(c, 0) > 0]
        # anything the data uses that the taxonomy does not define (the
        # custom-case bucket) is appended rather than dropped
        extra = [c for c in d['counts'] if c not in taxonomy]
        for c in sorted(extra, key=order):
            name = next((i['categoryName'] for i in items
                         if i['domain'] == domain and i['categoryCode'] == c), c)
            cats.append({'code': c, 'name': name, 'count': d['counts'][c]})
        d['categories'] = cats
        del d['counts']
    return out


def main():
    sources = sorted(
        f for f in glob.glob(os.path.join(DATA, '*.json'))
        if os.path.basename(f) not in GENERATED
    )
    if not sources:
        print('No source data files found in data/', file=sys.stderr)
        return 1

    os.makedirs(DETAIL_DIR, exist_ok=True)

    index = {'domains': {}, 'items': []}
    total_items = 0
    detail_bytes = 0

    for path in sources:
        name = os.path.basename(path)
        with open(path, encoding='utf-8') as fh:
            src = json.load(fh)

        code = src.get('domain')
        items = src.get('items', [])
        if not code or not isinstance(items, list):
            print(f'  skipping {name}: no domain code or items array', file=sys.stderr)
            continue

        index['domains'][code] = src.get('context', {})

        detail = {}
        for item in items:
            light = {k: v for k, v in item.items() if k in LIGHT_FIELDS}
            heavy = {k: v for k, v in item.items() if k not in LIGHT_FIELDS}
            index['items'].append(light)
            detail[item['id']] = heavy

        out = os.path.join(DETAIL_DIR, f'{code.lower()}.json')
        with open(out, 'w', encoding='utf-8') as fh:
            json.dump(detail, fh, separators=(',', ':'), ensure_ascii=False)

        size = os.path.getsize(out)
        detail_bytes += size
        total_items += len(items)
        print(f'  {code:7} {len(items):4} items -> detail/{code.lower()}.json  {size/1024:6.1f} KB')

    # ---- toolkit bundle -------------------------------------------------
    # The payload cheat-sheet and drill tabs read across every domain at once.
    # They previously forced a full detail load (~2.5 MB) to use a fraction of
    # it — the drill tab only shows the first ~220 characters of a description.
    # This bundle carries exactly what those two tabs render, which keeps a
    # mobile browser from parsing megabytes of JSON it will never display.
    toolkit = []
    for path in sources:
        with open(path, encoding='utf-8') as fh:
            src = json.load(fh)
        for item in src.get('items', []):
            excerpt = (item.get('whatItIs') or '')[:DRILL_EXCERPT_CHARS]
            toolkit.append({
                'id': item['id'],
                'domain': item.get('domain'),
                'title': item.get('title'),
                'severity': item.get('severity'),
                'cwe': item.get('cwe'),
                'examplePayloads': item.get('examplePayloads', []),
                'whatItIs': excerpt,
            })
    toolkit.sort(key=lambda i: (i.get('domain', ''), i.get('id', '')))
    toolkit_path = os.path.join(DATA, 'toolkit.json')
    with open(toolkit_path, 'w', encoding='utf-8') as fh:
        json.dump(toolkit, fh, separators=(',', ':'), ensure_ascii=False)
    print(f'  toolkit.json  {len(toolkit)} items  {os.path.getsize(toolkit_path)/1024:.1f} KB'
          '  (payload + drill tabs)')

    # ---- derive the global test number -------------------------------
    # `sequence` is the "#NNN" badge and the key for the Testing Order sort,
    # so it has to be unique and has to follow the domain order the sidebar
    # shows. Hand-maintained, it had drifted badly: 134 numbers were shared
    # by two cases (LLM-001 and NET-001 were both "#1"), and appended cases
    # took numbers that collided with the next domain's block. Deriving it
    # here means it cannot drift again.
    renumber_domain_order(index['items'])

    # The category taxonomy per domain, in the order the standard publishes
    # it, with counts. The app reads this rather than deriving it from the
    # items, so an empty category still appears (a domain with no injection
    # findings should still show that the category exists and holds none).
    index['categories'] = build_category_index(index['items'])

    # Keep the index in a stable order so the generated file does not churn
    # between runs purely because of filesystem ordering.
    index['items'].sort(key=lambda i: i.get('sequence', 0))

    # ---- the category layer the workspace groups by -------------------
    # Emitted here rather than derived in the browser so the order is fixed
    # and identical everywhere: categories appear in their standard's own
    # order (A01, A02, ...), not in whatever order cases happen to sit.
    cats = {}
    for it in index['items']:
        key = (it['domain'], it['categoryCode'])
        entry = cats.setdefault(key, {
            'domain': it['domain'],
            'code': it['categoryCode'],
            'name': it['categoryName'],
            'standard': it['categoryStandard'],
            'count': 0,
        })
        entry['count'] += 1

    def cat_sort_key(entry):
        # A01 / API7 / M10 / LLM03 / AC — numeric where there is a number,
        # alphabetical for the NIST control families.
        m = re.search(r'(\d+)$', entry['code'])
        return (0, int(m.group(1))) if m else (1, entry['code'])

    # Keyed by domain, because that is how the workspace looks them up:
    # categoryIndexFor('WEB') must hand back that domain's standard and its
    # ordered category list in one object. A flat array made every lookup a
    # scan and left the standard name to be rediscovered per render.
    # Seed every domain with its standard's COMPLETE category list, so a
    # category with no cases still appears (disabled, 0/0) in the picker.
    # Showing the whole standard is the point: an empty A10 tells an analyst
    # the corpus has no coverage there, which a silently absent row does not.
    import importlib.util as _ilu
    _spec = _ilu.spec_from_file_location('mapcats', os.path.join(ROOT, 'tools', 'map-categories.py'))
    _mc = _ilu.module_from_spec(_spec)
    _spec.loader.exec_module(_mc)
    for _domain, (_standard, _taxonomy) in _mc.DOMAIN_TAXONOMY.items():
        for _code, _name in _taxonomy.items():
            cats.setdefault((_domain, _code), {
                'domain': _domain, 'code': _code, 'name': _name,
                'standard': _standard, 'count': 0,
            })

    grouped = {}
    for entry in sorted(cats.values(), key=lambda e: (e['domain'], cat_sort_key(e))):
        bucket = grouped.setdefault(entry['domain'], {
            'standard': entry['standard'],
            'categories': [],
        })
        bucket['categories'].append({
            'code': entry['code'],
            'name': entry['name'],
            'count': entry['count'],
        })
    index['categories'] = grouped

    index_path = os.path.join(DATA, 'index.json')
    with open(index_path, 'w', encoding='utf-8') as fh:
        json.dump(index, fh, separators=(',', ':'), ensure_ascii=False)

    index_size = os.path.getsize(index_path)
    print()
    print(f'  index.json  {total_items} items  {index_size/1024:.1f} KB  (loaded on startup)')
    print(f'  detail/     {detail_bytes/1024:.1f} KB total, fetched per domain on demand')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
