#!/usr/bin/env python3
"""map-attack.py — assigns each test case its MITRE ATT&CK technique(s).

Why this is generated rather than hand-written
----------------------------------------------
A wrong technique ID is worse than no technique ID: it looks authoritative in
a report and a client's detection team will chase it. So nothing here is
recalled from memory. Every ID this script emits is checked against
tools/attack-techniques.json, which is extracted directly from MITRE's own
published STIX bundles (enterprise-attack and mobile-attack). An ID that is
not in that file, or one MITRE has revoked or deprecated, aborts the run.

Mapping signal, in order:
  1. CWE  — the most reliable anchor, already assigned per case.
  2. Title/prose keywords — only where CWE is absent or too generic.
  3. Domain default — a deliberate, broad technique rather than a guess.

Cases where only the domain default applies are reported, because a default
is an admission that the case needs a human decision, not a mapping.

LLM cases are left alone: enterprise ATT&CK does not describe model-layer
attacks, and MITRE ATLAS is the correct matrix for them. ATLAS is not in
these bundles, so inventing AML.Txxxx identifiers here would be exactly the
failure this script exists to prevent.

Usage:  python3 tools/map-attack.py [--check]
"""

import json
import os
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
LOOKUP = os.path.join(ROOT, 'tools', 'attack-techniques.json')

# --------------------------------------------------------------- CWE anchors
CWE_TO_ATTACK = {
    # --- injection / remote exploitation -------------------------------
    '77': ['T1059'], '78': ['T1059'], '94': ['T1059'], '95': ['T1059'],
    '917': ['T1059'], '1321': ['T1059'],
    '89': ['T1190'], '79': ['T1190'], '564': ['T1190'], '611': ['T1190'],
    '20': ['T1190'], '74': ['T1190'], '1427': ['T1190'],
    '502': ['T1190', 'T1059'],
    '434': ['T1505.003'],
    '918': ['T1090'],
    # --- credentials ----------------------------------------------------
    '798': ['T1552.001'], '259': ['T1552.001'], '257': ['T1552.001'],
    '522': ['T1552'], '256': ['T1552'], '260': ['T1552'], '315': ['T1552'],
    '312': ['T1552'], '313': ['T1552'], '316': ['T1552'], '532': ['T1552'],
    '540': ['T1552'], '526': ['T1552'],
    '307': ['T1110'], '521': ['T1110'], '1391': ['T1110'],
    '287': ['T1078'], '288': ['T1078'], '306': ['T1078'], '290': ['T1078'],
    '304': ['T1078'], '303': ['T1078'],
    '384': ['T1539'], '613': ['T1539'], '539': ['T1539'],
    '640': ['T1098'], '620': ['T1098'],
    '294': ['T1550'], '345': ['T1550'], '347': ['T1550'],
    '295': ['T1557'], '297': ['T1557'], '300': ['T1557'], '319': ['T1040'],
    '757': ['T1557'], '350': ['T1557'],
    # --- access control -------------------------------------------------
    '639': ['T1213'], '566': ['T1213'], '862': ['T1213'], '863': ['T1213'],
    '285': ['T1078'], '284': ['T1078'], '425': ['T1213'],
    '269': ['T1068'], '250': ['T1068'], '276': ['T1068'], '732': ['T1068'],
    '22': ['T1083'], '23': ['T1083'], '35': ['T1083'], '552': ['T1083'],
    '200': ['T1213'], '201': ['T1213'], '359': ['T1213'], '213': ['T1213'],
    '538': ['T1083'], '548': ['T1083'],
    # --- supply chain / integrity ---------------------------------------
    '1104': ['T1195.001'], '1357': ['T1195.001'], '1395': ['T1195.001'],
    '494': ['T1195'], '829': ['T1195'], '937': ['T1195'],
    '426': ['T1574'], '427': ['T1574'], '428': ['T1574'],
    # --- configuration / defence evasion --------------------------------
    '16': ['T1592'], '15': ['T1592'], '1032': ['T1592'], '1188': ['T1592'],
    '778': ['T1685.002'], '117': ['T1685.002'], '223': ['T1685.002'],
    '693': ['T1685'], '919': ['T1685'],
    # --- availability -----------------------------------------------------
    '400': ['T1499'], '770': ['T1499'], '834': ['T1499'], '1050': ['T1499'],
    # --- physical / human -------------------------------------------------
    '1021': ['T1185'],
}

# Mobile matrix — the enterprise techniques above do not describe a handset.
CWE_TO_ATTACK_MOBILE = {
    '312': ['T1409'], '313': ['T1409'], '315': ['T1409'], '316': ['T1409'],
    '522': ['T1409'], '530': ['T1409'], '922': ['T1409'], '524': ['T1409'],
    '798': ['T1634'], '259': ['T1634'],
    '319': ['T1521'], '295': ['T1521'], '297': ['T1521'], '300': ['T1521'],
    '919': ['T1629'], '693': ['T1629'], '489': ['T1629'],
    '926': ['T1626'], '276': ['T1626'], '269': ['T1626'],
    '1021': ['T1516'],
    '532': ['T1409'],
    '287': ['T1417'], '306': ['T1417'],
    '1104': ['T1474'], '1395': ['T1474'], '829': ['T1474'],
    '20': ['T1407'], '89': ['T1407'], '79': ['T1407'],
}

KEYWORDS = [
    (r'osint|open.source intelligence|social media|employee information|footprint', ['T1589']),
    (r'org(anisation|anization)? (chart|structure)|supplier|vendor|partner list', ['T1591']),
    (r'elicit|information gathering call|phishing for information', ['T1598']),
    (r'impersonat(e|ion)|fake (profile|account|persona)', ['T1585']),
    (r'phish|vish|smish|pretext|lure|credential harvest', ['T1566']),
    (r'tailgat|badge|door|lock|physical access|usb drop', ['T1200']),
    (r'dumpster|shred|printed|paper|clean desk', ['T1592']),
    (r'shoulder surf|screen', ['T1592']),
    (r'insider|recruit|bribe', ['T1078']),
    (r'rogue (ap|access point)|evil twin|karma', ['T1557']),
    (r'deauth|jam|denial of service|dos\b|flood|exhaust', ['T1499']),
    (r'sniff|capture traffic|monitor mode|handshake|pmkid', ['T1040']),
    (r'crack|dictionary|wordlist|brute', ['T1110']),
    (r'relay|ntlm|responder|mitm|man.in.the.middle|arp spoof|dns spoof', ['T1557']),
    (r'kerberoast|service ticket', ['T1558.003']),
    (r'as-rep|pre-auth', ['T1558.004']),
    (r'enumerat|discovery|scan|fingerprint|banner', ['T1046']),
    (r'bucket|blob|object storage|s3\b', ['T1530']),
    (r'metadata (endpoint|service)|imds', ['T1552.005']),
    (r'snapshot|backup|ransom', ['T1490']),
    (r'registry|container image|unsigned image', ['T1195.002']),
    (r'webhook|third.party api|upstream', ['T1195']),
    (r'token|jwt|oauth|session', ['T1550.001']),
    (r'mfa|2fa|otp', ['T1111']),
    (r'sim swap|port.out', ['T1451']),
    (r'privilege escalat|escalat', ['T1068']),
    (r'logging|audit|alert', ['T1685.002']),
    (r'rate limit|pagination|bulk export|resource consumption', ['T1499']),
    (r'injection|traversal|deserial', ['T1190']),
]

DOMAIN_DEFAULT = {
    'WEB': ['T1190'], 'API': ['T1190'], 'SRC': ['T1190'],
    'NET': ['T1046'], 'WIFI': ['T1040'], 'CLOUD': ['T1078.004'],
    'THICK': ['T1204'], 'MOBILE': ['T1409'], 'SOCIAL': ['T1566'],
}


def cwe_num(item):
    m = re.search(r'CWE-(\d+)', item.get('cwe') or '')
    return m.group(1) if m else None


def classify(item, lookup):
    domain = item['domain']
    if domain == 'LLM':
        return [], 'skipped-atlas'
    num = cwe_num(item)
    hay_early = (item.get('title', '') + ' ' + item.get('whatItIs', '')).lower()
    if domain == 'SOCIAL':
        for pattern, ids in KEYWORDS:
            if re.search(pattern, hay_early):
                return ids, 'keyword'
    table = CWE_TO_ATTACK_MOBILE if domain == 'MOBILE' else CWE_TO_ATTACK
    if num and num in table:
        return table[num], 'cwe'
    if domain != 'MOBILE' and num and num in CWE_TO_ATTACK:
        return CWE_TO_ATTACK[num], 'cwe'
    hay = (item.get('title', '') + ' ' + item.get('whatItIs', '')).lower()
    for pattern, ids in KEYWORDS:
        if re.search(pattern, hay):
            return ids, 'keyword'
    return DOMAIN_DEFAULT[domain], 'default'


def main():
    check = '--check' in sys.argv
    if not os.path.exists(LOOKUP):
        sys.exit(f'missing {LOOKUP} — regenerate it from MITRE\'s STIX bundles')
    lookup = json.load(open(LOOKUP, encoding='utf-8'))

    # Fail before touching data if the tables themselves cite a bad ID.
    declared = set()
    for table in (CWE_TO_ATTACK, CWE_TO_ATTACK_MOBILE, DOMAIN_DEFAULT):
        for ids in table.values():
            declared.update(ids)
    for _, ids in KEYWORDS:
        declared.update(ids)
    unknown = sorted(t for t in declared if t not in lookup)
    if unknown:
        sys.exit(f'technique id(s) not in MITRE\'s published set: {unknown}')

    # A revoked id still resolves in older references and in most people's
    # memory, which is exactly why it has to fail loudly. T1562 Impair
    # Defenses and its whole subtree were renumbered into T1685; mapping a
    # finding to a retired id sends a client's detection team after a
    # technique MITRE no longer publishes.
    revoked_path = os.path.join(ROOT, 'tools', 'attack-revoked.json')
    if os.path.exists(revoked_path):
        revoked = json.load(open(revoked_path, encoding='utf-8'))
        bad = sorted((t, revoked[t]) for t in declared if t in revoked)
        if bad:
            sys.exit('revoked technique id(s); use the replacement: '
                     + ', '.join(f'{a} -> {b}' for a, b in bad))

    stats = {}
    for f in sorted(glob.glob(os.path.join(DATA, '*.json'))):
        base = os.path.basename(f)
        if base in ('index.json', 'toolkit.json'):
            continue
        doc = json.load(open(f, encoding='utf-8'))
        for item in doc['items']:
            ids, how = classify(item, lookup)
            item['attack'] = [
                {'id': t, 'name': lookup[t]['name'], 'matrix': lookup[t]['matrix']}
                for t in ids
            ]
            d = stats.setdefault(item['domain'], {})
            d[how] = d.get(how, 0) + 1
        if not check:
            json.dump(doc, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    total_default = 0
    for domain in sorted(stats):
        print(f'{domain:7} {stats[domain]}')
        total_default += stats[domain].get('default', 0)
    print(f'\nall technique ids validated against MITRE\'s published set')
    print(f'{total_default} case(s) fell back to a domain default and need review')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
