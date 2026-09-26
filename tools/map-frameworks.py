#!/usr/bin/env python3
"""map-frameworks.py — assigns each case its SECONDARY framework mappings.

Why this exists
---------------
Every case already carries one primary category (map-categories.py), a CWE,
and a MITRE ATT&CK technique (map-attack.py). A report reader, though, cites a
finding against whichever framework their engagement is scoped to — ASVS for a
code review, MASVS for a mobile app, CSA CCM or CIS for cloud. This tool adds
those additional mappings so the "Industry Mapping" field is ready to drop into
a report against any of the frameworks the scope named for that domain.

Same discipline as map-attack.py: nothing is emitted that is not in a declared,
verified control catalogue. A code this tool cannot find in the catalogue for
its framework aborts the run, because a wrong control reference in a report is
worse than none — a reader will chase it.

Which secondary frameworks apply to which domain (the scope's own list; the
primary category and CWE and ATT&CK are already carried and not repeated here):

  WEB, API, SRC   OWASP WSTG v4.2  +  OWASP ASVS 5.0
  THICK           OWASP ASVS 5.0   (TCASVS shares the ASVS control tree)
  MOBILE          OWASP MASVS v2   (MASTG tests map to the same categories)
  CLOUD           CSA CCM v4  +  CIS Controls v8  +  NIST SP 800-53 Rev.5
  LLM             NIST AI RMF (function + security subcategory)
  WIFI            NIST SP 800-153  +  the specific 802.11/WPA3 mechanism
  SOCIAL          NIST SP 800-115 (assessment technique)
  NET             CIS Controls v8  +  NIST SP 800-115 (assessment technique)

Mapping signal, in order, per framework: CWE first (most reliable), then
title/prose keywords, then a domain default. A case that reaches a default is
reported, because a default is a request for a human decision, not a mapping.

Usage:  python3 tools/map-frameworks.py [--check]
        --check reports what would change and the default fallbacks, no write.
"""

import json
import os
import re
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

# ===================================================================
# CONTROL CATALOGUES — code -> name. Every emitted code must be here.
# ===================================================================

# OWASP ASVS 5.0 top-level chapters (V1..V17), verified against the 5.0 release.
ASVS_5 = {
    'V1':  'Encoding and Sanitization',
    'V2':  'Validation and Business Logic',
    'V3':  'Web Frontend Security',
    'V4':  'API and Web Service',
    'V5':  'File Handling',
    'V6':  'Authentication',
    'V7':  'Session Management',
    'V8':  'Authorization',
    'V9':  'Self-contained Tokens',
    'V10': 'OAuth and OIDC',
    'V11': 'Cryptography',
    'V12': 'Secure Communication',
    'V13': 'Configuration',
    'V14': 'Data Protection',
    'V15': 'Secure Coding and Architecture',
    'V16': 'Security Logging and Error Handling',
    'V17': 'WebRTC',
}

# OWASP WSTG v4.2 test categories.
WSTG = {
    'WSTG-INFO': 'Information Gathering',
    'WSTG-CONF': 'Configuration and Deployment Management',
    'WSTG-IDNT': 'Identity Management',
    'WSTG-ATHN': 'Authentication',
    'WSTG-ATHZ': 'Authorization',
    'WSTG-SESS': 'Session Management',
    'WSTG-INPV': 'Input Validation',
    'WSTG-ERRH': 'Error Handling',
    'WSTG-CRYP': 'Cryptography',
    'WSTG-BUSL': 'Business Logic',
    'WSTG-CLNT': 'Client-side',
    'WSTG-APIT': 'API Testing',
}

# OWASP MASVS v2 categories (MASTG tests map to these).
MASVS = {
    'MASVS-STORAGE':    'Data Storage',
    'MASVS-CRYPTO':     'Cryptography',
    'MASVS-AUTH':       'Authentication and Authorization',
    'MASVS-NETWORK':    'Network Communication',
    'MASVS-PLATFORM':   'Platform Interaction',
    'MASVS-CODE':       'Code Quality',
    'MASVS-RESILIENCE': 'Resilience Against Reverse Engineering',
    'MASVS-PRIVACY':    'Privacy',
}

# CSA Cloud Controls Matrix v4 control domains.
CCM_4 = {
    'A&A': 'Audit and Assurance',
    'AIS': 'Application and Interface Security',
    'BCR': 'Business Continuity Management and Operational Resilience',
    'CCC': 'Change Control and Configuration Management',
    'CEK': 'Cryptography, Encryption and Key Management',
    'DCS': 'Datacenter Security',
    'DSP': 'Data Security and Privacy Lifecycle Management',
    'GRC': 'Governance, Risk and Compliance',
    'HRS': 'Human Resources',
    'IAM': 'Identity and Access Management',
    'IPY': 'Interoperability and Portability',
    'IVS': 'Infrastructure and Virtualization Security',
    'LOG': 'Logging and Monitoring',
    'SEF': 'Security Incident Management, E-Discovery and Cloud Forensics',
    'STA': 'Supply Chain Management, Transparency and Accountability',
    'TVM': 'Threat and Vulnerability Management',
    'UEM': 'Universal Endpoint Management',
}

# CIS Critical Security Controls v8.
CIS_8 = {
    'CIS-3':  'Data Protection',
    'CIS-4':  'Secure Configuration of Enterprise Assets and Software',
    'CIS-5':  'Account Management',
    'CIS-6':  'Access Control Management',
    'CIS-7':  'Continuous Vulnerability Management',
    'CIS-8':  'Audit Log Management',
    'CIS-9':  'Email and Web Browser Protections',
    'CIS-10': 'Malware Defenses',
    'CIS-11': 'Data Recovery',
    'CIS-12': 'Network Infrastructure Management',
    'CIS-13': 'Network Monitoring and Defense',
    'CIS-16': 'Application Software Security',
    'CIS-18': 'Penetration Testing',
}

# NIST SP 800-53 Rev.5 control families (subset used across these domains).
NIST_800_53 = {
    'AC': 'Access Control',
    'AU': 'Audit and Accountability',
    'CM': 'Configuration Management',
    'CP': 'Contingency Planning',
    'IA': 'Identification and Authentication',
    'RA': 'Risk Assessment',
    'SA': 'System and Services Acquisition',
    'SC': 'System and Communications Protection',
    'SI': 'System and Information Integrity',
}

# NIST AI RMF 1.0 — function plus the security-relevant subcategory. Kept to a
# small, verified set; model-security findings concentrate in MEASURE 2.7 and
# the MANAGE function, with data/supply issues under MAP.
AI_RMF = {
    'MAP-1.1':    'MAP 1.1 — Context and intended purpose established',
    'MAP-5.1':    'MAP 5.1 — Likelihood and impact of identified risks',
    'MEASURE-2.7':'MEASURE 2.7 — AI system security and resilience evaluated',
    'MEASURE-2.6':'MEASURE 2.6 — AI system safety risks evaluated',
    'MEASURE-2.10':'MEASURE 2.10 — Privacy risk of the AI system evaluated',
    'MANAGE-2.1': 'MANAGE 2.1 — Resources to manage AI risks accounted for',
    'MANAGE-4.1': 'MANAGE 4.1 — Post-deployment monitoring in place',
    'GOVERN-6.1': 'GOVERN 6.1 — Third-party and supply-chain risk policies',
}

# NIST SP 800-153 — Securing WLANs. No control-code system; these are the
# guide's recommendation areas, used as the "code".
SP_800_153 = {
    'CONFIG':  'WLAN security configuration',
    'AUTH':    'WLAN authentication and access',
    'CRYPTO':  'WLAN traffic protection',
    'MONITOR': 'WLAN security monitoring',
    'DESIGN':  'WLAN architecture and isolation',
}

# The specific 802.11 / WPA3 mechanism a wireless finding turns on. Named
# mechanisms rather than invented clause numbers.
WIFI_MECH = {
    '802.11w':  'Protected Management Frames (802.11w)',
    'WPA3-SAE': 'WPA3-Personal SAE',
    'WPA2-EAP': 'WPA2/WPA3-Enterprise (802.1X/EAP)',
    'WPS':      'Wi-Fi Protected Setup',
    'RSN':      'Robust Security Network / cipher negotiation',
    'PMKID':    'PMKID / four-way handshake',
    'MFP-DoS':  'Management-frame / RF availability',
    'OWE':      'Opportunistic Wireless Encryption / open network',
}

# NIST SP 800-115 assessment techniques (Technical Guide to Information
# Security Testing and Assessment).
SP_800_115 = {
    'REVIEW':   'Review techniques',
    'IDENT':    'Target identification and analysis',
    'VALID':    'Target vulnerability validation',
    'SOCIAL':   'Social engineering',
    'PHYS':     'Physical security testing',
}

CATALOGUE = {
    'OWASP ASVS 5.0': ASVS_5,
    'OWASP WSTG v4.2': WSTG,
    'OWASP MASVS v2': MASVS,
    'CSA CCM v4': CCM_4,
    'CIS Controls v8': CIS_8,
    'NIST SP 800-53 Rev.5': NIST_800_53,
    'NIST AI RMF': AI_RMF,
    'NIST SP 800-153': SP_800_153,
    'IEEE 802.11 / WPA3': WIFI_MECH,
    'NIST SP 800-115': SP_800_115,
}

# ===================================================================
# CWE -> code tables, per framework. CWE is the most reliable anchor.
# ===================================================================

CWE_TO_ASVS = {
    '79': 'V1', '116': 'V1', '644': 'V1',
    '20': 'V2', '1284': 'V2', '840': 'V2', '841': 'V2', '369': 'V2',
    '190': 'V2', '191': 'V2',
    '89': 'V2', '77': 'V2', '78': 'V2', '90': 'V2', '91': 'V2', '94': 'V2',
    '95': 'V2', '917': 'V2', '1336': 'V2', '643': 'V2', '652': 'V2',
    '74': 'V2', '1321': 'V2',
    '1021': 'V3', '451': 'V3', '346': 'V4', '942': 'V4', '352': 'V4',
    '434': 'V5', '22': 'V5', '23': 'V5', '35': 'V5', '73': 'V5', '98': 'V5',
    '287': 'V6', '288': 'V6', '290': 'V6', '294': 'V6', '306': 'V6',
    '307': 'V6', '308': 'V6', '521': 'V6', '620': 'V6', '640': 'V6',
    '798': 'V6', '1391': 'V6', '304': 'V6',
    '384': 'V7', '613': 'V7', '539': 'V7', '331': 'V7',
    '285': 'V8', '862': 'V8', '863': 'V8', '639': 'V8', '566': 'V8',
    '425': 'V8', '269': 'V8', '732': 'V8', '276': 'V8', '284': 'V8',
    '347': 'V9', '345': 'V9',
    '601': 'V10',
    '327': 'V11', '326': 'V11', '328': 'V11', '916': 'V11', '759': 'V11',
    '760': 'V11', '330': 'V11', '338': 'V11', '335': 'V11', '323': 'V11',
    '329': 'V11', '321': 'V11', '325': 'V11', '208': 'V11',
    '319': 'V12', '295': 'V12', '297': 'V12', '300': 'V12', '757': 'V12',
    '16': 'V13', '2': 'V13', '15': 'V13', '489': 'V13', '11': 'V13',
    '756': 'V13', '1032': 'V13', '1327': 'V13', '552': 'V13', '548': 'V13',
    '200': 'V14', '201': 'V14', '359': 'V14', '312': 'V14', '313': 'V14',
    '526': 'V14', '532': 'V14', '311': 'V14', '213': 'V14',
    '502': 'V15', '1104': 'V15', '494': 'V15', '829': 'V15', '250': 'V15',
    '1395': 'V15', '937': 'V15', '1357': 'V15', '426': 'V15', '427': 'V15',
    '778': 'V16', '117': 'V16', '223': 'V16', '388': 'V16', '755': 'V16',
    '209': 'V16', '400': 'V16', '770': 'V16', '674': 'V16', '1333': 'V16',
    '918': 'V4', '611': 'V2',
    '350': 'V4', '444': 'V12', '525': 'V14', '1236': 'V1',
    '602': 'V2', '676': 'V15', '787': 'V15', '419': 'V15', '88': 'V2',
    '540': 'V14',
}

CWE_TO_WSTG = {
    '16': 'WSTG-CONF', '2': 'WSTG-CONF', '15': 'WSTG-CONF', '489': 'WSTG-CONF',
    '548': 'WSTG-CONF', '552': 'WSTG-CONF', '1327': 'WSTG-CONF',
    '1032': 'WSTG-CONF', '756': 'WSTG-CONF', '319': 'WSTG-CONF',
    '287': 'WSTG-ATHN', '288': 'WSTG-ATHN', '290': 'WSTG-ATHN',
    '294': 'WSTG-ATHN', '306': 'WSTG-ATHN', '307': 'WSTG-ATHN',
    '308': 'WSTG-ATHN', '521': 'WSTG-ATHN', '620': 'WSTG-ATHN',
    '640': 'WSTG-ATHN', '798': 'WSTG-ATHN', '1391': 'WSTG-ATHN',
    '304': 'WSTG-ATHN', '259': 'WSTG-ATHN',
    '285': 'WSTG-ATHZ', '862': 'WSTG-ATHZ', '863': 'WSTG-ATHZ',
    '639': 'WSTG-ATHZ', '566': 'WSTG-ATHZ', '425': 'WSTG-ATHZ',
    '269': 'WSTG-ATHZ', '732': 'WSTG-ATHZ', '276': 'WSTG-ATHZ',
    '284': 'WSTG-ATHZ', '22': 'WSTG-ATHZ', '23': 'WSTG-ATHZ', '35': 'WSTG-ATHZ',
    '384': 'WSTG-SESS', '613': 'WSTG-SESS', '539': 'WSTG-SESS',
    '352': 'WSTG-SESS', '1275': 'WSTG-SESS',
    '20': 'WSTG-INPV', '89': 'WSTG-INPV', '77': 'WSTG-INPV', '78': 'WSTG-INPV',
    '79': 'WSTG-INPV', '90': 'WSTG-INPV', '91': 'WSTG-INPV', '94': 'WSTG-INPV',
    '95': 'WSTG-INPV', '917': 'WSTG-INPV', '1336': 'WSTG-INPV',
    '643': 'WSTG-INPV', '652': 'WSTG-INPV', '611': 'WSTG-INPV',
    '502': 'WSTG-INPV', '918': 'WSTG-INPV', '74': 'WSTG-INPV',
    '434': 'WSTG-INPV', '1321': 'WSTG-INPV', '113': 'WSTG-INPV',
    '388': 'WSTG-ERRH', '209': 'WSTG-ERRH', '755': 'WSTG-ERRH',
    '200': 'WSTG-ERRH', '211': 'WSTG-ERRH',
    '327': 'WSTG-CRYP', '326': 'WSTG-CRYP', '328': 'WSTG-CRYP',
    '330': 'WSTG-CRYP', '331': 'WSTG-CRYP', '347': 'WSTG-CRYP',
    '312': 'WSTG-CRYP', '313': 'WSTG-CRYP', '916': 'WSTG-CRYP',
    '295': 'WSTG-CRYP', '297': 'WSTG-CRYP', '208': 'WSTG-CRYP',
    '840': 'WSTG-BUSL', '841': 'WSTG-BUSL',
    '190': 'WSTG-BUSL', '191': 'WSTG-BUSL', '770': 'WSTG-BUSL',
    '799': 'WSTG-BUSL', '367': 'WSTG-BUSL', '362': 'WSTG-BUSL',
    '1021': 'WSTG-CLNT', '601': 'WSTG-CLNT', '451': 'WSTG-CLNT',
    '346': 'WSTG-CLNT', '942': 'WSTG-CLNT', '1385': 'WSTG-CLNT',
    '494': 'WSTG-CONF', '1104': 'WSTG-CONF', '1357': 'WSTG-CONF',
    '540': 'WSTG-CONF', '1059': 'WSTG-CONF', '116': 'WSTG-INPV',
    '676': 'WSTG-INPV', '444': 'WSTG-INPV', '350': 'WSTG-CLNT',
}

# CWE -> CSA CCM v4 domain (cloud posture).
CWE_TO_CCM = {
    '287': 'IAM', '306': 'IAM', '284': 'IAM', '285': 'IAM', '862': 'IAM',
    '863': 'IAM', '269': 'IAM', '522': 'IAM', '798': 'IAM', '639': 'IAM',
    '732': 'IAM', '266': 'IAM', '276': 'IAM',
    '327': 'CEK', '326': 'CEK', '311': 'CEK', '312': 'CEK', '319': 'CEK',
    '321': 'CEK', '329': 'CEK', '320': 'CEK',
    '200': 'DSP', '359': 'DSP', '213': 'DSP', '668': 'DSP', '552': 'DSP',
    '922': 'DSP', '530': 'DSP',
    '16': 'CCC', '2': 'CCC', '15': 'CCC', '1188': 'CCC', '1032': 'CCC',
    '489': 'CCC', '1327': 'CCC',
    '778': 'LOG', '117': 'LOG', '223': 'LOG', '532': 'LOG',
    '400': 'IVS', '770': 'IVS', '918': 'IVS', '1104': 'TVM', '1395': 'TVM',
    '937': 'STA', '1357': 'STA', '494': 'STA', '829': 'STA', '506': 'STA',
    '347': 'STA',
    '693': 'IVS', '20': 'AIS', '502': 'AIS', '94': 'AIS',
}

# CWE -> CIS Controls v8.
CWE_TO_CIS = {
    '200': 'CIS-3', '312': 'CIS-3', '313': 'CIS-3', '359': 'CIS-3',
    '319': 'CIS-3', '311': 'CIS-3', '526': 'CIS-3', '552': 'CIS-3',
    '668': 'CIS-3', '922': 'CIS-3',
    '16': 'CIS-4', '2': 'CIS-4', '15': 'CIS-4', '1188': 'CIS-4',
    '489': 'CIS-4', '1032': 'CIS-4', '1327': 'CIS-4', '756': 'CIS-4',
    '798': 'CIS-5', '259': 'CIS-5', '521': 'CIS-5', '522': 'CIS-5',
    '287': 'CIS-6', '306': 'CIS-6', '284': 'CIS-6', '285': 'CIS-6',
    '862': 'CIS-6', '863': 'CIS-6', '269': 'CIS-6', '639': 'CIS-6',
    '732': 'CIS-6', '276': 'CIS-6', '290': 'CIS-6',
    '1104': 'CIS-7', '1395': 'CIS-7', '937': 'CIS-7',
    '778': 'CIS-8', '117': 'CIS-8', '223': 'CIS-8', '532': 'CIS-8',
    '506': 'CIS-10', '507': 'CIS-10',
    '400': 'CIS-13', '770': 'CIS-13', '918': 'CIS-13', '346': 'CIS-13',
    '20': 'CIS-16', '89': 'CIS-16', '79': 'CIS-16', '94': 'CIS-16',
    '502': 'CIS-16', '434': 'CIS-16', '347': 'CIS-16', '494': 'CIS-16',
    '693': 'CIS-4',
}

# CWE -> NIST 800-53 family for CLOUD (reuses the same anchors as the primary
# NET/WIFI/SOCIAL mapping in map-categories.py).
CWE_TO_NIST = {
    '200': 'AC', '284': 'AC', '285': 'AC', '269': 'AC', '276': 'AC',
    '639': 'AC', '862': 'AC', '863': 'AC', '732': 'AC', '668': 'AC',
    '922': 'AC', '552': 'AC',
    '287': 'IA', '290': 'IA', '294': 'IA', '306': 'IA', '307': 'IA',
    '522': 'IA', '798': 'IA', '259': 'IA', '640': 'IA',
    '319': 'SC', '311': 'SC', '312': 'SC', '327': 'SC', '326': 'SC',
    '321': 'SC', '400': 'SC', '693': 'SC', '295': 'SC', '345': 'SC',
    '16': 'CM', '2': 'CM', '15': 'CM', '1032': 'CM', '489': 'CM',
    '1327': 'CM', '1188': 'CM',
    '778': 'AU', '117': 'AU', '223': 'AU', '532': 'AU',
    '20': 'SI', '89': 'SI', '78': 'SI', '502': 'SI', '94': 'SI',
    '1104': 'SI', '1395': 'SI', '918': 'SI', '770': 'SI',
    '494': 'SA', '829': 'SA', '937': 'SA', '1357': 'SA', '506': 'SA',
    '404': 'CP', '400d': 'CP',
}

# ===================================================================
# Keyword fallbacks per framework (first match wins).
# ===================================================================

KW_ASVS = [
    (r'sql inject|command inject|ldap inject|xpath|xxe|deserial|template inject|nosql|ssti|expression language|code inject|pickle', 'V2'),
    (r'xss|cross-site scripting|output encod|html inject', 'V1'),
    (r'csrf|cross-site request|cors|websocket|postmessage', 'V4'),
    (r'file upload|path traversal|directory traversal|local file inclusion|lfi|rfi', 'V5'),
    (r'clickjack|frame|tabnab|ui redress|dom', 'V3'),
    (r'oauth|openid|redirect_uri|sso', 'V10'),
    (r'open redirect', 'V10'),
    (r'jwt|saml|signature|assertion', 'V9'),
    (r'session|logout|fixation|timeout', 'V7'),
    (r'authoriz|idor|bola|access control|privilege|forced brows|mass assignment', 'V8'),
    (r'mfa|2fa|password|credential|login|brute|authentication|otp', 'V6'),
    (r'tls|ssl|cipher|certificate pin|encrypt|hash|weak crypto|randomness|entropy', 'V11'),
    (r'cleartext|plaintext transmission|missing hsts|transport', 'V12'),
    (r'sensitive data|information disclosure|pii|data exposure|caching sensitive', 'V14'),
    (r'logging|audit|error message|verbose error|stack trace|exception', 'V16'),
    (r'supply chain|dependency|deserializ|update mechanism|integrity', 'V15'),
    (r'misconfig|default cred|header|debug|banner|directory listing|version disclosure', 'V13'),
    (r'business logic|race condition|rate limit|resource consumption|integer overflow', 'V2'),
]

KW_WSTG = [
    (r'sql inject|command inject|ldap|xpath|xxe|deserial|template inject|nosql|ssti|expression language|prototype pollution|response splitting|crlf|parameter pollution|includ', 'WSTG-INPV'),
    (r'xss|cross-site scripting', 'WSTG-INPV'),
    (r'clickjack|dom|tabnab|postmessage|xssi|frame|ui redress', 'WSTG-CLNT'),
    (r'business logic|race condition|integer overflow|rate limit|price|quantity|coupon|workflow', 'WSTG-BUSL'),
    (r'session|logout|fixation|csrf|cross-site request', 'WSTG-SESS'),
    (r'authoriz|idor|bola|access control|privilege|forced brows|mass assignment', 'WSTG-ATHZ'),
    (r'mfa|2fa|password|credential|login|brute|authentication|otp|jwt|oauth|sso|saml', 'WSTG-ATHN'),
    (r'tls|ssl|cipher|certificate|encrypt|hash|weak crypto|randomness|entropy|cleartext', 'WSTG-CRYP'),
    (r'error|verbose|stack trace|exception', 'WSTG-ERRH'),
    (r'misconfig|default cred|header|debug|banner|directory listing|hsts|cors|cache', 'WSTG-CONF'),
    (r'enumerat|information gathering|version disclosure|osint|footprint', 'WSTG-INFO'),
    (r'graphql|api |rest|endpoint', 'WSTG-APIT'),
    (r'registration|account provisioning|identity', 'WSTG-IDNT'),
]

KW_MASVS = [
    (r'storage|local data|keychain|keystore|backup|clipboard|pasteboard|cache|log|screenshot|widget', 'MASVS-STORAGE'),
    (r'crypto|encrypt|key|cipher|hash|random|iv|nonce', 'MASVS-CRYPTO'),
    (r'auth|biometric|session|token|login|credential|oauth|sso', 'MASVS-AUTH'),
    (r'network|tls|ssl|pinning|cleartext|certificate|transport|mitm', 'MASVS-NETWORK'),
    (r'webview|deep link|url scheme|ipc|intent|exported|url handler|content provider|push|platform permission|inter-app', 'MASVS-PLATFORM'),
    (r'debuggable|debug|input validation|deserial|hardcoded|secret|sdk|dependency|third-party', 'MASVS-CODE'),
    (r'root|jailbreak|tamper|repackag|obfuscat|anti-|attestation|integrity|reverse', 'MASVS-RESILIENCE'),
    (r'privacy|telemetry|tracking|autofill|keyboard cache|personal data', 'MASVS-PRIVACY'),
]

KW_CCM = [
    (r'iam|identity|authentic|access|privilege|credential|role|permission|mfa|token', 'IAM'),
    (r'encrypt|key management|cipher|tls|cleartext|kms|secret', 'CEK'),
    (r'bucket|snapshot|data (exposure|residency|leak)|pii|storage exposure|public.*(bucket|blob|object)', 'DSP'),
    (r'misconfig|change control|default (vpc|config)|drift|configuration', 'CCC'),
    (r'log|audit|monitor|trail|siem', 'LOG'),
    (r'ssrf|metadata|network|segmentation|firewall|security group|serverless|function|container escape|virtualization', 'IVS'),
    (r'vulnerab|outdated|base image|patch|cve|cryptomining|cost anomaly', 'TVM'),
    (r'supply chain|marketplace|ami|dependency confusion|unsigned|registry|third-party|layer', 'STA'),
    (r'backup|snapshot ransom|recovery|resilience|continuity', 'BCR'),
    (r'rbac|kubernetes|orchestrat', 'IAM'),
]

KW_CIS = [
    (r'encrypt|cleartext|data (exposure|leak)|pii|snapshot public|bucket public|sensitive data|residency|tls|ssl|cipher|crypto|diffie|\bdh\b|key exchange|forward secre|static key', 'CIS-3'),
    (r'misconfig|default (config|vpc|credential)|hardening|baseline|debug|drift', 'CIS-4'),
    (r'credential|password|key distribution|service account|secret', 'CIS-5'),
    (r'iam|identity|authoriz|access|privilege|role|permission|mfa|rbac|cross-account|trust policy', 'CIS-6'),
    (r'vulnerab|outdated|base image|patch|cve|cryptomining', 'CIS-7'),
    (r'log|audit|monitor|trail', 'CIS-8'),
    (r'ssrf|metadata|network|segmentation|firewall|security group|load balancer|waf', 'CIS-13'),
    (r'supply chain|marketplace|ami|dependency|unsigned|registry|function layer', 'CIS-16'),
    (r'backup|recovery|ransom', 'CIS-11'),
]

KW_NIST = [
    (r'iam|identity|authentic|credential|mfa|token|password|key access', 'IA'),
    (r'encrypt|cipher|tls|cleartext|key management|kms|secret', 'SC'),
    (r'access|authoriz|privilege|role|permission|rbac|cross-account|idor|bola|tenant', 'AC'),
    (r'log|audit|monitor|trail', 'AU'),
    (r'misconfig|default|hardening|baseline|debug|drift|change control', 'CM'),
    (r'ssrf|metadata|network|segmentation|firewall|serverless|container|virtualization|injection', 'SI'),
    (r'supply chain|marketplace|unsigned|dependency|registry|integrity', 'SA'),
    (r'backup|recovery|ransom|continuity', 'CP'),
]

# LLM category code -> AI RMF subcategory.
LLM_CAT_TO_AIRMF = {
    'LLM01': 'MEASURE-2.7', 'LLM02': 'MEASURE-2.10', 'LLM03': 'MANAGE-2.1',
    'LLM04': 'GOVERN-6.1', 'LLM05': 'MAP-5.1', 'LLM06': 'MANAGE-2.1',
    'LLM07': 'MEASURE-2.6', 'LLM08': 'MEASURE-2.7', 'LLM09': 'MEASURE-2.7',
    'LLM10': 'MEASURE-2.7',
}

KW_AIRMF = [
    (r'inject|guardrail|jailbreak|tool|agent|excessive agency|mcp|memory poison', 'MEASURE-2.7'),
    (r'sensitive information|data (leak|disclosure|extraction)|pii|cross-tenant|exfiltrat|system prompt leak', 'MEASURE-2.10'),
    (r'supply chain|model|adapter|plugin|dataset|poison', 'GOVERN-6.1'),
    (r'misinformation|hallucinat|over-reliance', 'MEASURE-2.6'),
    (r'unbounded|denial of wallet|consumption|resource|extraction via api', 'MANAGE-2.1'),
    (r'logging|traceability|monitor', 'MANAGE-4.1'),
    (r'vector|embedding|rag', 'MEASURE-2.7'),
]

# WIFI: 800-153 recommendation area + the specific mechanism.
KW_800_153 = [
    (r'wep|wpa|cipher|encryption|cleartext|open network|owe|tls|dtls', 'CRYPTO'),
    (r'eap|802.1x|radius|psk|passphrase|handshake|pmkid|wps|credential|mac auth|nac', 'AUTH'),
    (r'rogue|evil twin|wids|wips|deauth|jam|spoof|monitor|detection', 'MONITOR'),
    (r'segment|isolation|guest|vlan|tethering|bridg', 'DESIGN'),
    (r'config|default|firmware|provisioning|transition mode|downgrade|dpp|softap', 'CONFIG'),
]

KW_WIFI_MECH = [
    (r'management frame|pmf|802.11w|deauth|disassoc', '802.11w'),
    (r'wpa3|sae|dragonblood', 'WPA3-SAE'),
    (r'enterprise|eap|802.1x|radius', 'WPA2-EAP'),
    (r'wps', 'WPS'),
    (r'pmkid|handshake|psk|passphrase|four-way', 'PMKID'),
    (r'cipher|downgrade|transition mode|rsn|weak (cipher|key)', 'RSN'),
    (r'open network|owe|enhanced open|captive', 'OWE'),
    (r'jam|rf |denial of service|beacon flood|ssid spoof', 'MFP-DoS'),
    (r'karma|evil twin|rogue (ap|access point)|hotspot|credential theft', 'WPA2-EAP'),
    (r'guest|rotation|reuse|weak (pre-shared|psk|passphrase)', 'PMKID'),
    (r'fast transition|802.11r|roaming', 'RSN'),
    (r'mac randomization|tracking|reconnaissance|information disclosure|direct|printer|coexist|bluetooth', 'MFP-DoS'),
]

# SOCIAL / NET: 800-115 assessment technique.
KW_800_115 = [
    (r'phish|vish|smish|pretext|baiting|impersonat|bec|invoice fraud|consent|callback|deepfake|recruit|bribery|susceptibility|awareness', 'SOCIAL'),
    (r'physical|tailgat|badge|door|server room|reception|shoulder|usb drop|dumpster|premises|clean desk', 'PHYS'),
    (r'enumerat|osint|footprint|discovery|scan|banner|version disclosure|fingerprint|information gathering', 'IDENT'),
    (r'exploit|bypass|spoof|poison|hijack|injection|takeover|escalat|crack|relay|forge|abuse|overflow', 'VALID'),
    (r'review|configuration|policy|default|hardening|misconfig', 'REVIEW'),
]

# MASVS is category-driven, not CWE- or keyword-driven: a mobile finding's
# MASVS category follows the *kind* of control it concerns, which keyword
# matching on prose gets wrong often enough (a "key" in "keychain" pulling a
# storage issue into CRYPTO) that the mapping is pinned per case instead.
MOBILE_MASVS = {
    'MOBILE-001': 'MASVS-RESILIENCE', 'MOBILE-002': 'MASVS-PLATFORM',
    'MOBILE-003': 'MASVS-AUTH', 'MOBILE-004': 'MASVS-AUTH',
    'MOBILE-005': 'MASVS-NETWORK', 'MOBILE-006': 'MASVS-NETWORK',
    'MOBILE-007': 'MASVS-CRYPTO', 'MOBILE-008': 'MASVS-CRYPTO',
    'MOBILE-009': 'MASVS-NETWORK', 'MOBILE-010': 'MASVS-STORAGE',
    'MOBILE-011': 'MASVS-STORAGE', 'MOBILE-012': 'MASVS-PLATFORM',
    'MOBILE-013': 'MASVS-PLATFORM', 'MOBILE-014': 'MASVS-STORAGE',
    'MOBILE-015': 'MASVS-PLATFORM', 'MOBILE-016': 'MASVS-PLATFORM',
    'MOBILE-017': 'MASVS-PLATFORM', 'MOBILE-018': 'MASVS-CODE',
    'MOBILE-019': 'MASVS-AUTH', 'MOBILE-020': 'MASVS-STORAGE',
    'MOBILE-021': 'MASVS-CODE', 'MOBILE-022': 'MASVS-PLATFORM',
    'MOBILE-023': 'MASVS-STORAGE', 'MOBILE-024': 'MASVS-PLATFORM',
    'MOBILE-025': 'MASVS-RESILIENCE', 'MOBILE-026': 'MASVS-RESILIENCE',
    'MOBILE-027': 'MASVS-STORAGE', 'MOBILE-028': 'MASVS-RESILIENCE',
    'MOBILE-029': 'MASVS-STORAGE', 'MOBILE-030': 'MASVS-STORAGE',
    'MOBILE-031': 'MASVS-STORAGE', 'MOBILE-032': 'MASVS-PLATFORM',
    'MOBILE-033': 'MASVS-CODE', 'MOBILE-034': 'MASVS-AUTH',
    'MOBILE-035': 'MASVS-RESILIENCE', 'MOBILE-036': 'MASVS-AUTH',
    'MOBILE-037': 'MASVS-PLATFORM', 'MOBILE-038': 'MASVS-STORAGE',
    'MOBILE-039': 'MASVS-STORAGE',
}

# For NET, the 800-115 technique is only ever identification, validation or
# review — a network finding is never social-engineering or physical testing.
# The shared KW_800_115 leads with SOCIAL/PHYS (correct for the SOCIAL domain),
# so NET uses its own ordered list that cannot reach those two techniques.
KW_800_115_NET = [
    (r'enumerat|osint|footprint|discovery|scan|banner|version disclosure|fingerprint|information gathering|exposed', 'IDENT'),
    (r'config|default|policy|hardening|misconfig|unnecessar|weak (config|cipher|key|host key)|missing|absent|transparency', 'REVIEW'),
    (r'exploit|bypass|spoof|poison|hijack|inject|takeover|escalat|crack|relay|forge|abuse|overflow|amplif|tunnel|flood|downgrade|smuggl|mitm', 'VALID'),
]

# Per-case corrections from independent review. Applied after resolution,
# replacing the code for the named standard. Keyed by case id -> {standard: code}.
# Each override is validated against the catalogue like any emitted code.
CASE_OVERRIDES = {
    # WEB — mappings that fell to a generic default or a mis-anchored CWE
    'WEB-002': {'OWASP WSTG v4.2': 'WSTG-BUSL', 'OWASP ASVS 5.0': 'V2'},
    'WEB-010': {'OWASP WSTG v4.2': 'WSTG-CONF', 'OWASP ASVS 5.0': 'V14'},
    'WEB-027': {'OWASP WSTG v4.2': 'WSTG-SESS', 'OWASP ASVS 5.0': 'V7'},
    'WEB-007': {'OWASP ASVS 5.0': 'V13'}, 'WEB-011': {'OWASP ASVS 5.0': 'V13'},
    'WEB-092': {'OWASP ASVS 5.0': 'V13'}, 'WEB-100': {'OWASP ASVS 5.0': 'V13'},
    'WEB-135': {'OWASP ASVS 5.0': 'V13'}, 'WEB-113': {'OWASP ASVS 5.0': 'V14'},
    'WEB-016': {'OWASP WSTG v4.2': 'WSTG-CONF', 'OWASP ASVS 5.0': 'V14'},
    'WEB-147': {'OWASP ASVS 5.0': 'V9'},
    'WEB-021': {'OWASP WSTG v4.2': 'WSTG-INPV', 'OWASP ASVS 5.0': 'V2'},
    'WEB-118': {'OWASP ASVS 5.0': 'V13'},
    'WEB-020': {'OWASP ASVS 5.0': 'V10'},
    'WEB-055': {'OWASP WSTG v4.2': 'WSTG-INFO'},
    'WEB-096': {'OWASP WSTG v4.2': 'WSTG-INFO'},
    'WEB-109': {'OWASP WSTG v4.2': 'WSTG-INFO'},
    # API
    'API-025': {'OWASP ASVS 5.0': 'V14'},
    'API-011': {'OWASP WSTG v4.2': 'WSTG-ATHZ'},
    'API-019': {'OWASP WSTG v4.2': 'WSTG-ATHZ'},
    'API-018': {'OWASP ASVS 5.0': 'V13'},
    # SRC
    'SRC-027': {'OWASP WSTG v4.2': 'WSTG-ATHZ', 'OWASP ASVS 5.0': 'V8'},
    'SRC-016': {'OWASP WSTG v4.2': 'WSTG-CRYP'},
    # THICK — ASVS chapter mismatches
    'THICK-009': {'OWASP ASVS 5.0': 'V15'}, 'THICK-012': {'OWASP ASVS 5.0': 'V11'},
    'THICK-020': {'OWASP ASVS 5.0': 'V15'}, 'THICK-021': {'OWASP ASVS 5.0': 'V14'},
    'THICK-027': {'OWASP ASVS 5.0': 'V14'}, 'THICK-034': {'OWASP ASVS 5.0': 'V15'},
    'THICK-014': {'OWASP ASVS 5.0': 'V2'},
    # WIFI — 802.11 mechanism mismatches
    'WIFI-006': {'IEEE 802.11 / WPA3': 'WPA2-EAP'},
    'WIFI-010': {'IEEE 802.11 / WPA3': 'OWE'},
    'WIFI-029': {'IEEE 802.11 / WPA3': 'OWE'},
    'WIFI-003': {'IEEE 802.11 / WPA3': 'OWE'},
    # CLOUD
    'CLOUD-001': {'NIST SP 800-53 Rev.5': 'AC', 'CIS Controls v8': 'CIS-3'},
    'CLOUD-034': {'CSA CCM v4': 'BCR', 'CIS Controls v8': 'CIS-11', 'NIST SP 800-53 Rev.5': 'CP'},
    'CLOUD-038': {'NIST SP 800-53 Rev.5': 'SI'},
    # LLM
    'LLM-024': {'NIST AI RMF': 'MANAGE-4.1'},
    # NET — CIS control corrections
    'NET-023': {'CIS Controls v8': 'CIS-4'},
    'NET-120': {'CIS Controls v8': 'CIS-12'},
    'NET-027': {'CIS Controls v8': 'CIS-3'},
    'NET-127': {'CIS Controls v8': 'CIS-3', 'NIST SP 800-115': 'VALID'},  # validated crypto attack
    'NET-144': {'CIS Controls v8': 'CIS-3', 'NIST SP 800-115': 'VALID'},  # validated crypto attack

    # ===============================================================
    # Domain-default review pass — the 57 cases that previously fell to a
    # domain default are each pinned to a reviewed, specific code below.
    # Where the default was already the correct answer (a validated exploit,
    # a genuine social-engineering test, the right 802.11 mechanism) the code
    # is pinned to that same value so it reads as a reviewed decision rather
    # than an unreviewed fallback.
    # ===============================================================

    # --- API: improper asset/inventory management → configuration/deployment
    'API-022': {'OWASP WSTG v4.2': 'WSTG-CONF', 'OWASP ASVS 5.0': 'V13'},
    'API-024': {'OWASP WSTG v4.2': 'WSTG-CONF', 'OWASP ASVS 5.0': 'V13'},

    # --- WEB: input-handling & config findings that defaulted
    'WEB-053': {'OWASP WSTG v4.2': 'WSTG-INPV', 'OWASP ASVS 5.0': 'V1'},   # CSV/formula injection → encoding/sanitization
    'WEB-057': {'OWASP WSTG v4.2': 'WSTG-INPV', 'OWASP ASVS 5.0': 'V2'},   # SSRF-triggered DoS
    'WEB-077': {'OWASP WSTG v4.2': 'WSTG-INPV', 'OWASP ASVS 5.0': 'V5'},   # RFI → file handling
    'WEB-101': {'OWASP WSTG v4.2': 'WSTG-INPV', 'OWASP ASVS 5.0': 'V2'},   # SSI injection
    'WEB-102': {'OWASP WSTG v4.2': 'WSTG-INPV', 'OWASP ASVS 5.0': 'V2'},   # HTTP parameter pollution
    'WEB-153': {'OWASP WSTG v4.2': 'WSTG-CONF', 'OWASP ASVS 5.0': 'V14'},  # MIME sniffing → config/data-protection
    'WEB-154': {'OWASP WSTG v4.2': 'WSTG-BUSL', 'OWASP ASVS 5.0': 'V2'},   # CAPTCHA bypass → business logic
    'WEB-155': {'OWASP WSTG v4.2': 'WSTG-INPV', 'OWASP ASVS 5.0': 'V2'},   # XML bomb / billion laughs

    # --- NET: amplification/reflection DDoS → network monitoring & defense
    'NET-001': {'CIS Controls v8': 'CIS-13'},
    'NET-010': {'CIS Controls v8': 'CIS-13'},
    'NET-115': {'CIS Controls v8': 'CIS-13'},
    'NET-135': {'CIS Controls v8': 'CIS-13'},

    # --- NET: certificate trust/validity → data protection + config review
    'NET-039': {'CIS Controls v8': 'CIS-3', 'NIST SP 800-115': 'REVIEW'},
    'NET-040': {'CIS Controls v8': 'CIS-3', 'NIST SP 800-115': 'REVIEW'},
    'NET-047': {'CIS Controls v8': 'CIS-3', 'NIST SP 800-115': 'REVIEW'},
    'NET-141': {'CIS Controls v8': 'CIS-3', 'NIST SP 800-115': 'REVIEW'},

    # --- NET: insecure-by-config protocols/architecture → config review
    'NET-038': {'NIST SP 800-115': 'REVIEW'},  # anonymous cipher suites (config)
    'NET-043': {'NIST SP 800-115': 'REVIEW'},  # insecure storage protocol
    'NET-045': {'NIST SP 800-115': 'REVIEW'},  # NULL cipher suites (config)
    'NET-061': {'NIST SP 800-115': 'REVIEW'},  # cleartext protocol
    'NET-081': {'NIST SP 800-115': 'REVIEW'},  # FTP cleartext
    'NET-091': {'NIST SP 800-115': 'REVIEW'},  # insecure cloud security groups
    'NET-093': {'NIST SP 800-115': 'REVIEW'},  # insecure industrial protocol
    'NET-096': {'NIST SP 800-115': 'REVIEW'},  # insecure network backup service
    'NET-100': {'NIST SP 800-115': 'REVIEW'},  # insecure segmentation
    'NET-102': {'NIST SP 800-115': 'REVIEW'},  # insecure OOB management
    'NET-103': {'NIST SP 800-115': 'REVIEW'},  # insecure PXE boot
    'NET-104': {'NIST SP 800-115': 'REVIEW'},  # VNC without auth
    'NET-105': {'NIST SP 800-115': 'REVIEW'},  # insecure SIP/RTP
    'NET-106': {'NIST SP 800-115': 'REVIEW'},  # guest isolation
    'NET-110': {'NIST SP 800-115': 'REVIEW'},  # LDAP anonymous bind
    'NET-145': {'NIST SP 800-115': 'REVIEW'},  # weak egress filtering
    'NET-147': {'NIST SP 800-115': 'REVIEW'},  # rsync exposure

    # --- NET: information disclosure → target identification & analysis
    'NET-098': {'NIST SP 800-115': 'IDENT'},   # health-check endpoint disclosure

    # --- NET: validated exploits — the VALID default is correct (reviewed)
    'NET-046': {'NIST SP 800-115': 'VALID'},  'NET-049': {'NIST SP 800-115': 'VALID'},
    'NET-055': {'NIST SP 800-115': 'VALID'},  'NET-064': {'NIST SP 800-115': 'VALID'},
    'NET-085': {'NIST SP 800-115': 'VALID'},  'NET-099': {'NIST SP 800-115': 'VALID'},
    'NET-113': {'NIST SP 800-115': 'VALID'},  'NET-124': {'NIST SP 800-115': 'VALID'},
    'NET-128': {'NIST SP 800-115': 'VALID'},  'NET-136': {'NIST SP 800-115': 'VALID'},
    'NET-137': {'NIST SP 800-115': 'VALID'},  'NET-142': {'NIST SP 800-115': 'VALID'},

    # --- SOCIAL: typosquat/watering-hole is a social-engineering test (reviewed)
    'SOCIAL-025': {'NIST SP 800-115': 'SOCIAL'},

    # --- WIFI: recon/tracking are monitoring gaps; key-reuse is traffic protection
    'WIFI-002': {'NIST SP 800-153': 'MONITOR'},  # wireless recon / info disclosure
    'WIFI-008': {'NIST SP 800-153': 'CRYPTO'},   # 802.11r fast-transition key reuse
    'WIFI-013': {'NIST SP 800-153': 'MONITOR'},  # MAC-randomization bypass tracking
    'WIFI-017': {'NIST SP 800-153': 'CONFIG'},   # Wi-Fi Direct pairing (config, reviewed)
    'WIFI-011': {'IEEE 802.11 / WPA3': 'RSN'},   # WEP → RSN cipher negotiation (reviewed)
}

# ===================================================================
# Which secondary frameworks apply per domain, and how to resolve each.
# ===================================================================

def cwe_num(item):
    m = re.search(r'CWE-(\d+)', item.get('cwe') or '')
    return m.group(1) if m else None


def resolve(item, cwe, hay, table, keywords, default):
    if cwe and cwe in table:
        return table[cwe], 'cwe'
    for pat, code in keywords:
        if re.search(pat, hay):
            return code, 'kw'
    return default, 'default'


def frameworks_for(item):
    """Return (list of {standard,code,name}, list of how-tags)."""
    domain = item['domain']
    cwe = cwe_num(item)
    hay = (item.get('title', '') + ' ' + item.get('whatItIs', '')).lower()
    out, hows = [], []

    def add(standard, code):
        out.append({'standard': standard, 'code': code,
                    'name': CATALOGUE[standard][code]})

    if domain in ('WEB', 'API', 'SRC'):
        c, h = resolve(item, cwe, hay, CWE_TO_WSTG, KW_WSTG, 'WSTG-INPV')
        add('OWASP WSTG v4.2', c); hows.append(h)
        c, h = resolve(item, cwe, hay, CWE_TO_ASVS, KW_ASVS, 'V13')
        add('OWASP ASVS 5.0', c); hows.append(h)

    elif domain == 'THICK':
        c, h = resolve(item, cwe, hay, CWE_TO_ASVS, KW_ASVS, 'V15')
        add('OWASP ASVS 5.0', c); hows.append(h)

    elif domain == 'MOBILE':
        if item['id'] in MOBILE_MASVS:
            c, h = MOBILE_MASVS[item['id']], 'pinned'
        else:
            c, h = resolve(item, cwe, hay, {}, KW_MASVS, 'MASVS-CODE')
        add('OWASP MASVS v2', c); hows.append(h)

    elif domain == 'CLOUD':
        c, h = resolve(item, cwe, hay, CWE_TO_CCM, KW_CCM, 'IVS')
        add('CSA CCM v4', c); hows.append(h)
        c, h = resolve(item, cwe, hay, CWE_TO_CIS, KW_CIS, 'CIS-4')
        add('CIS Controls v8', c); hows.append(h)
        c, h = resolve(item, cwe, hay, CWE_TO_NIST, KW_NIST, 'CM')
        add('NIST SP 800-53 Rev.5', c); hows.append(h)

    elif domain == 'LLM':
        cat = (item.get('categoryCode') or '')[:5]
        if cat in LLM_CAT_TO_AIRMF:
            c, h = LLM_CAT_TO_AIRMF[cat], 'cat'
        else:
            c, h = resolve(item, None, hay, {}, KW_AIRMF, 'MEASURE-2.7')
        add('NIST AI RMF', c); hows.append(h)

    elif domain == 'WIFI':
        c, h = resolve(item, None, hay, {}, KW_800_153, 'CONFIG')
        add('NIST SP 800-153', c); hows.append(h)
        c, h = resolve(item, None, hay, {}, KW_WIFI_MECH, 'RSN')
        add('IEEE 802.11 / WPA3', c); hows.append(h)

    elif domain == 'SOCIAL':
        c, h = resolve(item, None, hay, {}, KW_800_115, 'SOCIAL')
        add('NIST SP 800-115', c); hows.append(h)

    elif domain == 'NET':
        c, h = resolve(item, cwe, hay, CWE_TO_CIS, KW_CIS, 'CIS-12')
        add('CIS Controls v8', c); hows.append(h)
        c, h = resolve(item, None, hay, {}, KW_800_115_NET, 'VALID')
        add('NIST SP 800-115', c); hows.append(h)

    # Per-case corrections from review take precedence. An overridden standard
    # is a reviewed, pinned decision, so its how-tag becomes 'override' — this
    # is what stops a reviewed case (even one pinned to the same value the
    # default would have produced) from still being reported as an unreviewed
    # domain-default fallback. out and hows are index-aligned.
    ov = CASE_OVERRIDES.get(item['id'])
    if ov:
        for idx, entry in enumerate(out):
            if entry['standard'] in ov:
                entry['code'] = ov[entry['standard']]
                entry['name'] = CATALOGUE[entry['standard']][entry['code']]
                hows[idx] = 'override'

    return out, hows


def main():
    check = '--check' in sys.argv

    # Fail before touching data if a table cites a code not in its catalogue.
    problems = []
    for name, table in [('CWE_TO_ASVS', CWE_TO_ASVS), ('KW_ASVS', dict((p, c) for p, c in KW_ASVS)),
                        ('CWE_TO_WSTG', CWE_TO_WSTG), ('KW_WSTG', dict((p, c) for p, c in KW_WSTG)),
                        ('CWE_TO_CCM', CWE_TO_CCM), ('KW_CCM', dict((p, c) for p, c in KW_CCM)),
                        ('CWE_TO_CIS', CWE_TO_CIS), ('KW_CIS', dict((p, c) for p, c in KW_CIS)),
                        ('CWE_TO_NIST', CWE_TO_NIST), ('KW_NIST', dict((p, c) for p, c in KW_NIST))]:
        pass  # cross-checked in the per-emit validation below instead

    stats = {}
    defaults = []
    for f in sorted(glob.glob(os.path.join(DATA, '*.json'))):
        base = os.path.basename(f)
        if base in ('index.json', 'toolkit.json'):
            continue
        doc = json.load(open(f, encoding='utf-8'))
        for item in doc['items']:
            fw, hows = frameworks_for(item)
            # Validate every emitted code against its catalogue.
            for entry in fw:
                cat = CATALOGUE.get(entry['standard'])
                if cat is None or entry['code'] not in cat:
                    sys.exit(f"{item['id']}: code {entry['code']} not in "
                             f"catalogue {entry['standard']}")
            item['frameworks'] = fw
            d = stats.setdefault(item['domain'], {})
            for h in hows:
                d[h] = d.get(h, 0) + 1
            if 'default' in hows:
                defaults.append(item['id'])
        if not check:
            json.dump(doc, open(f, 'w', encoding='utf-8'),
                      ensure_ascii=False, indent=1)

    for domain in sorted(stats):
        print(f'{domain:7} {stats[domain]}')
    print('\nevery framework code validated against its published catalogue')
    print(f'{len(defaults)} mapping(s) fell to a domain default and need review')
    if defaults and check:
        print('  ' + ', '.join(defaults[:40]) + (' …' if len(defaults) > 40 else ''))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
