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
LIGHT_FIELDS = {
    'id', 'domain', 'phase', 'sequence', 'title',
    'severity', 'severityLabel', 'cwe', 'reference',
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
DETAIL_DIR = os.path.join(DATA, 'detail')

# Generated artifacts must not be read back in as sources on a re-run.
GENERATED = {'index.json'}


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

    # Keep the index in a stable order so the generated file does not churn
    # between runs purely because of filesystem ordering.
    index['items'].sort(key=lambda i: (i.get('domain', ''), i.get('sequence', 0), i.get('id', '')))

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
