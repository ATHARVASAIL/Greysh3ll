#!/usr/bin/env python3
"""map-categories.py — assigns every test case a category from a published
standard, and writes the taxonomy the UI groups by.

Why a script rather than hand-editing 577 files
-----------------------------------------------
The mapping has to be defensible: every case must land in a category that a
reader can look up in the published standard, and the same input must always
produce the same output. Rules live here, in one place, so the mapping can be
re-derived and reviewed rather than drifting case by case.

Taxonomy per domain (each verified against the publisher's own page):

  WEB, SRC, THICK, CLOUD  OWASP Top 10:2025          A01-A10
  API                     OWASP API Security Top 10:2023  API1-API10
  MOBILE                  OWASP Mobile Top 10:2024   M1-M10
  LLM                     OWASP Top 10 for LLM Applications 2025  LLM01-LLM10
  NET, WIFI, SOCIAL       NIST SP 800-53 Rev. 5 control families

Web-style domains share the OWASP Top 10 because that is the taxonomy their
findings are actually reported under. Network, wireless and human-layer
testing do not map honestly onto an application risk list, so those use NIST
SP 800-53 control families, which is what an assessment report for that work
cites anyway.

Usage:  python3 tools/map-categories.py [--check]
        --check reports what would change without writing.
"""

import json
import os
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

# ---------------------------------------------------------------- taxonomies

OWASP_2025 = {
    'A01': 'Broken Access Control',
    'A02': 'Security Misconfiguration',
    'A03': 'Software Supply Chain Failures',
    'A04': 'Cryptographic Failures',
    'A05': 'Injection',
    'A06': 'Insecure Design',
    'A07': 'Authentication Failures',
    'A08': 'Software or Data Integrity Failures',
    'A09': 'Security Logging and Alerting Failures',
    'A10': 'Mishandling of Exceptional Conditions',
}

OWASP_API_2023 = {
    'API1':  'Broken Object Level Authorization',
    'API2':  'Broken Authentication',
    'API3':  'Broken Object Property Level Authorization',
    'API4':  'Unrestricted Resource Consumption',
    'API5':  'Broken Function Level Authorization',
    'API6':  'Unrestricted Access to Sensitive Business Flows',
    'API7':  'Server Side Request Forgery',
    'API8':  'Security Misconfiguration',
    'API9':  'Improper Inventory Management',
    'API10': 'Unsafe Consumption of APIs',
}

OWASP_MOBILE_2024 = {
    'M1':  'Improper Credential Usage',
    'M2':  'Inadequate Supply Chain Security',
    'M3':  'Insecure Authentication/Authorization',
    'M4':  'Insufficient Input/Output Validation',
    'M5':  'Insecure Communication',
    'M6':  'Inadequate Privacy Controls',
    'M7':  'Insufficient Binary Protections',
    'M8':  'Security Misconfiguration',
    'M9':  'Insecure Data Storage',
    'M10': 'Insufficient Cryptography',
}

OWASP_LLM_2026 = {
    'LLM01': 'Prompt Injection',
    'LLM02': 'Sensitive Information Disclosure',
    'LLM03': 'Excessive Agency',
    'LLM04': 'Supply Chain',
    'LLM05': 'Data and Model Poisoning',
    'LLM06': 'Unbounded Consumption',
    'LLM07': 'Misinformation',
    'LLM08': 'Hidden Context Exposure',
    'LLM09': 'Vector and Embedding Weaknesses',
    'LLM10': 'Improper Output Handling',
}

# The 2026 edition (published 4 August 2026) renumbered eight of the ten
# entries and renamed one, so a code carried in reference.standard is a 2025
# code and has to be translated, not read straight through. Verified against
# the OWASP GenAI Security Project release.
OWASP_LLM_2025_TO_2026 = {
    'LLM01': 'LLM01',   # Prompt Injection                  no change
    'LLM02': 'LLM02',   # Sensitive Information Disclosure  no change
    'LLM03': 'LLM04',   # Supply Chain                      down 1
    'LLM04': 'LLM05',   # Data and Model Poisoning          down 1
    'LLM05': 'LLM10',   # Improper Output Handling          down 5
    'LLM06': 'LLM03',   # Excessive Agency                  up 3
    'LLM07': 'LLM08',   # System Prompt Leakage -> Hidden Context Exposure
    'LLM08': 'LLM09',   # Vector and Embedding Weaknesses   down 1
    'LLM09': 'LLM07',   # Misinformation                    up 2
    'LLM10': 'LLM06',   # Unbounded Consumption             up 4
}

NIST_800_53 = {
    'AC': 'Access Control',
    'AT': 'Awareness and Training',
    'AU': 'Audit and Accountability',
    'CM': 'Configuration Management',
    'IA': 'Identification and Authentication',
    'MP': 'Media Protection',
    'PE': 'Physical and Environmental Protection',
    'RA': 'Risk Assessment',
    'SA': 'System and Services Acquisition',
    'SC': 'System and Communications Protection',
    'SI': 'System and Information Integrity',
}

# --------------------------------------------- domain-specific CWE overrides
# The generic web mapping is wrong for a few risks that have a dedicated
# category in the domain's own list. SSRF is the clearest: the web Top 10
# absorbed it into A01, but the API list still carries API7 for it, so
# translating A01 -> API1 would bury it under object-level authorization.
CWE_TO_API = {
    '918': 'API7',                                   # SSRF has its own category
    '639': 'API1', '566': 'API1', '285': 'API1', '863': 'API1',
    '862': 'API5', '284': 'API5',                    # function-level authz
    '200': 'API3', '213': 'API3', '915': 'API3',     # property-level exposure
    '287': 'API2', '290': 'API2', '294': 'API2', '306': 'API2',
    '307': 'API4', '347': 'API2', '384': 'API2',
    '798': 'API2', '521': 'API2', '613': 'API2', '640': 'API2',
    '770': 'API4', '400': 'API4', '405': 'API4', '1333': 'API4',
    '441': 'API1', '1059': 'API9', '1104': 'API10', '1357': 'API10',
    '345': 'API10', '1389': 'API10',
    '16': 'API8', '2': 'API8', '942': 'API8', '444': 'API8',
    '524': 'API8', '346': 'API8', '778': 'API8', '117': 'API8',
    '757': 'API9', '306': 'API5', '799': 'API6', '840': 'API6',
    '489': 'API9', '841': 'API6',
    '319': 'API8', '326': 'API8', '327': 'API8',
    '89': 'API3', '79': 'API3', '94': 'API3', '502': 'API8',
    '532': 'API8',
}
KEYWORDS_API = [
    (r'ssrf|server-side request forgery', 'API7'),
    (r'bola|object level|idor|tenant|ownership', 'API1'),
    (r'function level|admin endpoint|privileged (endpoint|operation)|bfla', 'API5'),
    (r'mass assignment|excessive data|property level|field', 'API3'),
    (r'business flow|workflow abuse|scalp|automation abuse', 'API6'),
    (r'rate limit|resource consumption|pagination|bulk|quota|unbounded', 'API4'),
    (r'inventory|deprecated|shadow|undocumented|version(ing)? (endpoint|sprawl)|documentation', 'API9'),
    (r'third.party|upstream|consum(e|ing|ption) of api|webhook (signature|verification)', 'API10'),
    (r'auth|token|jwt|session|credential|login|oauth', 'API2'),
]

CWE_TO_MOBILE = {
    '522': 'M1', '798': 'M1', '259': 'M1', '256': 'M1', '257': 'M1',
    '312': 'M9', '313': 'M9', '316': 'M9', '359': 'M6', '532': 'M9',
    '530': 'M9', '921': 'M9', '200': 'M9', '524': 'M9',
    '287': 'M3', '288': 'M3', '290': 'M3', '306': 'M3', '307': 'M3',
    '384': 'M3', '613': 'M3', '640': 'M3', '862': 'M3', '863': 'M3',
    '285': 'M3', '601': 'M3',
    '20': 'M4', '79': 'M4', '89': 'M4', '94': 'M4', '470': 'M4',
    '502': 'M4', '611': 'M4', '749': 'M4', '927': 'M4', '939': 'M4',
    '319': 'M5', '295': 'M5', '297': 'M5', '757': 'M5',
    '326': 'M10', '327': 'M10', '328': 'M10', '329': 'M10', '330': 'M10',
    '331': 'M10', '338': 'M10',
    '345': 'M7', '347': 'M7', '353': 'M7', '489': 'M7', '656': 'M7',
    '919': 'M7', '1278': 'M7',
    '1104': 'M2', '1395': 'M2', '829': 'M2', '494': 'M2',
    '16': 'M8', '276': 'M8', '1021': 'M8', '250': 'M8', '453': 'M8',
}
KEYWORDS_MOBILE = [
    (r'root|jailbreak|tamper|repackag|reverse engineer|obfuscat|rasp|anti-debug|attestation|integrity', 'M7'),
    (r'keychain|keystore|hardcoded|credential|secret in', 'M1'),
    (r'storage|database|cache|backup|log|pasteboard|clipboard|screenshot|snapshot|keyboard|autofill|memory', 'M9'),
    (r'privacy|pii|tracking|telemetry|analytics|permission', 'M6'),
    (r'sdk|third.party|library|dependency|supply chain', 'M2'),
    (r'tls|ssl|certificate|pinning|cleartext|transport|network', 'M5'),
    (r'cipher|crypt|hash|random|entropy|key (size|derivation)', 'M10'),
    (r'injection|traversal|deep link|url scheme|intent|content provider|webview|validation', 'M4'),
    (r'auth|session|token|oauth|biometric|login', 'M3'),
    (r'exported|debuggable|misconfigur|manifest|entitlement', 'M8'),
]

DOMAIN_TAXONOMY = {
    'WEB':    ('OWASP Top 10:2025', OWASP_2025),
    'SRC':    ('OWASP Top 10:2025', OWASP_2025),
    'THICK':  ('OWASP Top 10:2025', OWASP_2025),
    'CLOUD':  ('OWASP Top 10:2025', OWASP_2025),
    'API':    ('OWASP API Security Top 10:2023', OWASP_API_2023),
    'MOBILE': ('OWASP Mobile Top 10:2024', OWASP_MOBILE_2024),
    'LLM':    ('OWASP Top 10 for LLM Applications 2026', OWASP_LLM_2026),
    'NET':    ('NIST SP 800-53 Rev. 5', NIST_800_53),
    'WIFI':   ('NIST SP 800-53 Rev. 5', NIST_800_53),
    'SOCIAL': ('NIST SP 800-53 Rev. 5', NIST_800_53),
}

# ------------------------------------------------- OWASP 2021 -> 2025 bridge
# Straight from the 2025 release notes: SSRF was absorbed into A01, and
# "Vulnerable and Outdated Components" was expanded into Software Supply
# Chain Failures. Every other 2021 category survives under a new number.
OWASP_2021_TO_2025 = {
    'A01': 'A01',   # Broken Access Control            -> unchanged
    'A02': 'A04',   # Cryptographic Failures           -> A04
    'A03': 'A05',   # Injection                        -> A05
    'A04': 'A06',   # Insecure Design                  -> A06
    'A05': 'A02',   # Security Misconfiguration        -> A02
    'A06': 'A03',   # Vulnerable & Outdated Components -> Software Supply Chain
    'A07': 'A07',   # Identification & Auth Failures   -> Authentication Failures
    'A08': 'A08',   # Software & Data Integrity        -> unchanged
    'A09': 'A09',   # Logging & Monitoring             -> Logging & Alerting
    'A10': 'A01',   # SSRF                             -> absorbed into A01
}

# --------------------------------------------------------------- CWE anchors
# CWE is the most reliable signal available: it is assigned per case already
# and the standards themselves are defined in terms of CWE sets. Keyword
# matching is only used where CWE is absent or too generic.
CWE_TO_OWASP = {
    # Broken Access Control (incl. SSRF and IDOR/BOLA)
    '22': 'A01', '23': 'A01', '35': 'A01', '59': 'A01', '200': 'A01',
    '201': 'A01', '219': 'A01', '264': 'A01', '269': 'A01', '275': 'A01', '276': 'A01',
    '284': 'A01', '285': 'A01', '352': 'A01', '359': 'A01', '377': 'A01',
    '402': 'A01', '425': 'A01', '441': 'A01', '497': 'A01', '538': 'A01',
    '540': 'A01', '548': 'A01', '552': 'A01', '566': 'A01', '601': 'A01',
    '639': 'A01', '651': 'A01', '668': 'A01', '706': 'A01', '862': 'A01',
    '863': 'A01', '913': 'A01', '918': 'A01', '922': 'A01', '1275': 'A01',
    # Security Misconfiguration
    '2': 'A02', '11': 'A02', '13': 'A02', '15': 'A02', '16': 'A02',
    '260': 'A02', '315': 'A02', '520': 'A02', '526': 'A02', '537': 'A02',
    '541': 'A02', '547': 'A02', '611': 'A02', '614': 'A02', '756': 'A02',
    '776': 'A02', '942': 'A02', '1004': 'A02', '1032': 'A02',
    '1174': 'A02', '1188': 'A02',
    # Software Supply Chain Failures
    '494': 'A03', '1035': 'A03', '1104': 'A03', '1357': 'A03', '1395': 'A03',
    '937': 'A03',
    # Cryptographic Failures
    '261': 'A04', '296': 'A04', '310': 'A04', '319': 'A04', '321': 'A04',
    '322': 'A04', '323': 'A04', '324': 'A04', '325': 'A04', '326': 'A04',
    '327': 'A04', '328': 'A04', '329': 'A04', '330': 'A04', '331': 'A04',
    '335': 'A04', '336': 'A04', '337': 'A04', '338': 'A04', '340': 'A04',
     '523': 'A04', '720': 'A04', '757': 'A04', '759': 'A04',
    '760': 'A04', '780': 'A04', '818': 'A04', '916': 'A04', '295': 'A04',
    '316': 'A04', '524': 'A04', '312': 'A04', '313': 'A04',
    # Injection
    '20': 'A05', '74': 'A05', '75': 'A05', '77': 'A05', '78': 'A05',
    '79': 'A05', '80': 'A05', '83': 'A05', '87': 'A05', '88': 'A05',
    '89': 'A05', '90': 'A05', '91': 'A05', '93': 'A05', '94': 'A05',
    '95': 'A05', '96': 'A05', '97': 'A05', '98': 'A05', '99': 'A05',
    '113': 'A05', '116': 'A05', '138': 'A05', '184': 'A05', '470': 'A05',
    '119': 'A05', '120': 'A05', '125': 'A05', '134': 'A05', '787': 'A05',
    '471': 'A05', '564': 'A05', '610': 'A05', '643': 'A05', '644': 'A05',
    '652': 'A05', '917': 'A05', '1321': 'A05',
    # Insecure Design
    '1021': 'A06', '73': 'A06', '183': 'A06', '209': 'A06', '213': 'A06', '235': 'A06',
    '256': 'A06', '257': 'A06', '266': 'A06', '280': 'A06',
    '311': 'A04', '419': 'A06', '430': 'A06',
    '434': 'A06', '444': 'A06', '451': 'A06', '472': 'A06', '501': 'A06',
    '522': 'A06', '525': 'A06', '539': 'A06', '579': 'A06', '598': 'A06',
    '602': 'A06', '642': 'A06', '646': 'A06', '650': 'A06', '653': 'A06',
    '656': 'A06', '657': 'A06', '799': 'A06', '807': 'A06', '840': 'A06',
    '841': 'A06', '927': 'A06', '1021x': 'A06', '1173': 'A06', '1269': 'A06',
    # Authentication Failures
    '255': 'A07', '259': 'A07', '287': 'A07', '288': 'A07', '290': 'A07',
    '294': 'A07', '297': 'A07', '300': 'A07', '302': 'A07', '304': 'A07',
    '306': 'A07', '307': 'A07', '346': 'A07', '384': 'A07', '521': 'A07',
    '613': 'A07', '620': 'A07', '640': 'A07', '798': 'A07', '940': 'A07',
    '1216': 'A07', '384x': 'A07',
    # Software or Data Integrity Failures
    '345': 'A08', '347': 'A08', '353': 'A08', '426': 'A08', '427': 'A08', '502': 'A08', '565': 'A08',
    '784': 'A08', '829': 'A08', '830': 'A08', '915': 'A08', '1104x': 'A08',
    # Security Logging and Alerting Failures
    '117': 'A09', '223': 'A09', '532': 'A09', '778': 'A09',
    # Mishandling of Exceptional Conditions
    '209x': 'A10', '248': 'A10', '252': 'A10', '362': 'A10', '367': 'A10',
    '390': 'A10', '391': 'A10', '396': 'A10', '397': 'A10', '460': 'A10',
    '476': 'A10', '544': 'A10', '636': 'A10', '703': 'A10', '754': 'A10',
    '755': 'A10', '770': 'A10', '1288': 'A10',
}

# NIST control families, keyed on the same CWE signal.
CWE_TO_NIST = {
    '200': 'AC', '264': 'AC', '269': 'AC', '276': 'AC', '284': 'AC',
    '285': 'AC', '425': 'AC', '441': 'AC', '639': 'AC', '862': 'AC',
    '863': 'AC', '923': 'AC', '1188': 'AC',
    '287': 'IA', '290': 'IA', '294': 'IA', '295': 'IA', '297': 'IA',
    '300': 'IA', '302': 'IA', '304': 'IA', '306': 'IA', '307': 'IA',
    '308': 'IA', '521': 'IA', '522': 'IA', '640': 'IA', '798': 'IA',
    '259': 'IA', '1391': 'IA',
    '310': 'SC', '311': 'SC', '319': 'SC', '321': 'SC', '323': 'SC',
    '325': 'SC', '326': 'SC', '327': 'SC', '328': 'SC', '330': 'SC',
    '757': 'SC', '345': 'SC', '346': 'SC', '350': 'SC', '400': 'SC',
    '406': 'SC', '693': 'SC', '1021': 'SC',
    '2': 'CM', '15': 'CM', '16': 'CM', '260': 'CM', '453': 'CM',
    '1032': 'CM', '1174': 'CM', '520': 'CM', '1327': 'CM',
    '117': 'AU', '223': 'AU', '532': 'AU', '778': 'AU',
    '20': 'SI', '74': 'SI', '77': 'SI', '78': 'SI', '79': 'SI',
    '89': 'SI', '94': 'SI', '250': 'SI', '494': 'SI', '502': 'SI',
    '1104': 'SI', '1395': 'SI',
    '359': 'MP', '312': 'MP', '313': 'MP', '530': 'MP',
    '1263': 'PE', '1278': 'PE',
    '1392': 'IA', '1391': 'IA', '306': 'IA', '732': 'AC', '668': 'AC',
    '1287': 'SI', '362': 'SI', '74': 'SI', '922': 'AC', '552': 'AC',
    '1269': 'SA', '1357': 'SA', '937': 'SA',
}

# Keyword fallbacks, applied only when CWE gives nothing. Ordered: the first
# match wins, so the most specific phrases come first.
KEYWORDS_OWASP = [
    (r'ssrf|server-side request forgery|metadata endpoint', 'A01'),
    (r'idor|bola|object level author|privilege escalat|path traversal|directory listing|bucket|public(ly)? (read|access|exposed)|tenant', 'A01'),
    (r'supply chain|dependency confusion|unsigned (image|plugin|package)|registry|lockfile|third-party (sdk|library|component)|outdated', 'A03'),
    (r'injection|xss|cross-site scripting|sqli|command exec|deserializ|template|xxe|prototype pollution', 'A05'),
    (r'cipher|tls|ssl|certificate|encrypt|hash|entropy|random|key (storage|derivation|management)|cleartext|plaintext', 'A04'),
    (r'mfa|2fa|password|credential|session|token|login|authentication|jwt|oauth|sso|brute', 'A07'),
    (r'logging|audit trail|monitor|alert', 'A09'),
    (r'race condition|error handling|exception|fail open|crash|denial of service|resource exhaust|rate limit', 'A10'),
    (r'integrity|signature|tamper|update mechanism|ci/cd|pipeline|workflow', 'A08'),
    (r'business logic|design|workflow abuse|excessive agency|threat model', 'A06'),
    (r'misconfigur|default (credential|config)|header|cors|debug|verbose|banner|expose', 'A02'),
]

KEYWORDS_SOCIAL = [
    (r'physical|tailgat|badge|door\b|server room|reception|front.desk|shoulder.surf|premises|on-?site|clean desk', 'PE'),
    (r'dumpster|shred|document disposal|printed|paper', 'MP'),
    (r'phish|vish|smish|pretext|baiting|qr code|usb drop|impersonat|typosquat|watering hole|consent|callback|bec|invoice fraud|awareness|susceptibility|insider|recruit|bribery|osint', 'AT'),
    (r'help desk|password reset|sim swap|mfa bypass|credential', 'IA'),
    (r'workstation|lockout|session', 'AC'),
    (r'supplier|third.party|contractor|vendor', 'SA'),
]

KEYWORDS_NIST = [
    (r'physical|tailgat|badge|door\b|dumpster|shoulder.surf|clean desk|usb drop|on-?site|premises|datacent|server room', 'PE'),
    (r'phish|vish|smish|pretext|awareness|training|insider|recruit|social engineer|bribery', 'AT'),
    (r'shred|media sanitiz|disposal|printed|paper|hard copy', 'MP'),
    (r'logging|audit|siem|log retention|alerting', 'AU'),
    (r'password|credential|mfa|2fa|authentication|login|kerberos|ntlm|hash|eap|psk|wps|pmkid|handshake|null session|anonymous', 'IA'),
    (r'encrypt|cipher|tls|ssl|certificate|wep|wpa|cleartext|plaintext|vpn|segment|isolation|firewall|spoof|mitm|rogue|jam|deauth|amplif|tunnel', 'SC'),
    (r'default|misconfigur|banner|version disclosure|snmp|smb sign|hardening|baseline|inventory|provisioning|unnecessar', 'CM'),
    (r'injection|exploit|patch|vulnerab|malware|outdated|cve|downgrade|race', 'SI'),
    (r'access control|permission|share|privilege|authoriz|relay|enumerat|disclosure|exposure|exposed', 'AC'),
    (r'supplier|third.party|contractor|vendor', 'SA'),
]


def pick(cwe, title, text, table, keywords, default):
    """CWE first, then keywords over the title and prose, then the domain
    default. Returning the default is a signal the case needs review, and
    --check reports how often it happens."""
    num = None
    m = re.search(r'CWE-(\d+)', cwe or '')
    if m:
        num = m.group(1)
    if num and num in table:
        return table[num], 'cwe'
    hay = (title + ' ' + text).lower()
    for pattern, cat in keywords:
        if re.search(pattern, hay):
            return cat, 'keyword'
    return default, 'default'


def cwe_num(item):
    m = re.search(r'CWE-(\d+)', item.get('cwe') or '')
    return m.group(1) if m else None


def classify(item):
    domain = item['domain']
    standard, taxonomy = DOMAIN_TAXONOMY[domain]
    title = item.get('title', '')
    text = ' '.join(str(item.get(k, '')) for k in ('whatItIs', 'rootCause', 'impact'))
    existing = (item.get('reference') or {}).get('standard', '') or ''
    num = cwe_num(item)

    # 0a. Strongest signal of all: the case is named after a category in its
    #     own taxonomy. "Unsafe Consumption of APIs" is API10 by definition,
    #     and CWE alone was routing several of these elsewhere.
    lower_title = title.lower()
    if taxonomy is not NIST_800_53:
        for code, name in taxonomy.items():
            if len(name) > 12 and name.lower() in lower_title:
                return code, standard, 'title'

    # 0b. A domain with its own CWE table wins outright: these are the risks
    #    the generic web mapping gets wrong, and CWE is the definition the
    #    standards themselves are built on.
    if domain == 'API' and num in CWE_TO_API:
        return CWE_TO_API[num], standard, 'cwe'
    if domain == 'MOBILE' and num in CWE_TO_MOBILE:
        return CWE_TO_MOBILE[num], standard, 'cwe'
    if taxonomy is OWASP_2025 and num in CWE_TO_OWASP:
        return CWE_TO_OWASP[num], standard, 'cwe'

    # 1. The case already names a category in its own taxonomy — trust it.
    if domain == 'LLM':
        m = re.search(r'(LLM\d\d)', existing)
        if m:
            code = OWASP_LLM_2025_TO_2026.get(m.group(1), m.group(1))
            if code in taxonomy:
                return code, standard, 'bridged-2025'
    if domain == 'API':
        m = re.search(r'\b(API\d{1,2}):', existing)
        if m and m.group(1) in taxonomy:
            return m.group(1), standard, 'existing'
    if domain == 'MOBILE':
        m = re.search(r'\b(M\d{1,2}):', existing)
        if m and m.group(1) in taxonomy:
            return m.group(1), standard, 'existing'

    # 2. An OWASP web category, in either edition.
    if taxonomy is OWASP_2025:
        m = re.search(r'\bA(\d\d):2025', existing)
        if m and 'A' + m.group(1) in taxonomy:
            return 'A' + m.group(1), standard, 'existing-2025'
        m = re.search(r'\bA(\d\d)[:\s]', existing)
        if m:
            mapped = OWASP_2021_TO_2025.get('A' + m.group(1))
            if mapped:
                return mapped, standard, 'bridged-2021'

    # 3. NIST: the case may already cite a control.
    if taxonomy is NIST_800_53:
        m = re.search(r'\b(AC|AT|AU|CM|IA|MP|PE|RA|SA|SC|SI)-\d', existing)
        if m and m.group(1) in taxonomy:
            return m.group(1), standard, 'existing'

    # 4. Derive.
    if domain == 'SOCIAL':
        for pattern, cat in KEYWORDS_SOCIAL:
            if re.search(pattern, lower_title):
                return cat, standard, 'keyword'
        cat, how = pick(item.get('cwe'), title, '', CWE_TO_NIST, KEYWORDS_NIST, 'AT')
    elif taxonomy is NIST_800_53:
        # title only — see the note above KEYWORDS_NIST
        cat, how = pick(item.get('cwe'), title, '', CWE_TO_NIST, KEYWORDS_NIST, 'CM')
    elif taxonomy is OWASP_2025:
        cat, how = pick(item.get('cwe'), title, text, CWE_TO_OWASP, KEYWORDS_OWASP, 'A02')
    else:
        # API / MOBILE keep their own keyword lists; LLM has no CWE table of
        # its own, so it falls back through the web mapping and is translated.
        if domain == 'API':
            cat, how = pick(item.get('cwe'), title, text, CWE_TO_API, KEYWORDS_API, 'API8')
        elif domain == 'MOBILE':
            cat, how = pick(item.get('cwe'), title, text, CWE_TO_MOBILE, KEYWORDS_MOBILE, 'M8')
        else:
            web, how = pick(item.get('cwe'), title, text, CWE_TO_OWASP, KEYWORDS_OWASP, 'A02')
            cat = TRANSLATE[domain].get(web, TRANSLATE[domain]['_default'])
    return cat, standard, how


# Translation used only for cases that carry no label in their own taxonomy.
TRANSLATE = {
    'API': {'A01': 'API1', 'A02': 'API8', 'A03': 'API10', 'A04': 'API2',
            'A05': 'API3', 'A06': 'API6', 'A07': 'API2', 'A08': 'API8',
            'A09': 'API9', 'A10': 'API4', '_default': 'API8'},
    'MOBILE': {'A01': 'M3', 'A02': 'M8', 'A03': 'M2', 'A04': 'M10',
               'A05': 'M4', 'A06': 'M6', 'A07': 'M1', 'A08': 'M7',
               'A09': 'M8', 'A10': 'M4', '_default': 'M8'},
    'LLM': {'A01': 'LLM06', 'A02': 'LLM03', 'A03': 'LLM03', 'A04': 'LLM02',
            'A05': 'LLM01', 'A06': 'LLM06', 'A07': 'LLM06', 'A08': 'LLM04',
            'A09': 'LLM06', 'A10': 'LLM10', '_default': 'LLM06'},
}


def main():
    check = '--check' in sys.argv
    stats = {}
    changed = 0
    for f in sorted(glob.glob(os.path.join(DATA, '*.json'))):
        base = os.path.basename(f)
        if base in ('index.json', 'toolkit.json'):
            continue
        doc = json.load(open(f, encoding='utf-8'))
        for item in doc['items']:
            cat, standard, how = classify(item)
            _, taxonomy = DOMAIN_TAXONOMY[item['domain']]
            record = {
                'categoryStandard': standard,
                'categoryCode': cat,
                'categoryName': taxonomy[cat],
            }
            if any(item.get(k) != v for k, v in record.items()):
                changed += 1
            item.update(record)
            d = stats.setdefault(item['domain'], {'how': {}, 'cats': {}})
            d['how'][how] = d['how'].get(how, 0) + 1
            key = f'{cat} {taxonomy[cat]}'
            d['cats'][key] = d['cats'].get(key, 0) + 1
        if not check:
            json.dump(doc, open(f, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    for domain in sorted(stats):
        d = stats[domain]
        total = sum(d['cats'].values())
        print(f'--- {domain} ({total})  [{DOMAIN_TAXONOMY[domain][0]}] ---')
        for k in sorted(d['cats'], key=lambda x: -d['cats'][x]):
            print(f'   {d["cats"][k]:4}  {k}')
        print(f'   source: {d["how"]}')
    print(f'\n{changed} field(s) {"would change" if check else "written"}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
