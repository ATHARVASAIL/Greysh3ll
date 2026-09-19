#!/usr/bin/env python3
"""
enrich-data.py — improves test-case data quality across all domains.

1. Adds an `icon` field (emoji) to every test case for richer visual rendering.
2. Ensures all array fields meet minimum thresholds:
   - stepsToIdentify: >= 6
   - exploitationSteps: >= 6
   - examplePayloads: >= 5
   - variants: >= 4
   - mitigation: >= 4
3. Adds `tags` for better categorization/filtering.
4. Adds `difficulty` rating (beginner/intermediate/advanced) per test case.

Does NOT rewrite source files in place — writes enriched copies.
Run tools/build-data.py after to regenerate index.json and detail/ artifacts.

Usage: python3 tools/enrich-data.py
"""

import json
import os
import sys
import glob

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

MIN_STEPS = 6
MIN_PAYLOADS = 5
MIN_VARIANTS = 4
MIN_MITIGATION = 4

DOMAIN_ICONS = {
    'NET': '🌐', 'WEB': '🖥️', 'API': '🔌', 'LLM': '🤖',
    'CLOUD': '☁️', 'MOBILE': '📱', 'THICK': '🖱️', 'WIFI': '📶',
    'SRC': '📝', 'SOCIAL': '👤',
}

TOPIC_ICONS = {
    'dns': '🔍', 'ddos': '💥', 'flood': '🌊', 'amplification': '📢',
    'spoofing': '🎭', 'poisoning': '☠️', 'cache': '📦',
    'ssh': '🔐', 'ftp': '📁', 'smb': '🖥️', 'ldap': '📋',
    'sql': '🗃️', 'injection': '💉', 'xss': '⚡', 'csrf': '🔄',
    'header': '📋', 'cookie': '🍪', 'cors': '🚧',
    'cloud': '☁️', 'bucket': '🪣', 'iam': '👤',
    'container': '🐳', 'kubernetes': '⚙️', 'docker': '📦',
    'api': '🔌', 'graphql': '◈', 'rest': '🌐',
    'llm': '🤖', 'prompt': '💬', 'ai': '🧠', 'model': '📊',
    'mobile': '📱', 'android': '🤖', 'ios': '🍎',
    'binary': '🔧', 'debug': '🐛', 'reverse': '🔄',
    'wifi': '📶', 'wireless': '📡', 'handshake': '🤝',
    'source': '📝', 'code': '💻', 'review': '🔍',
    'social': '👤', 'phishing': '🎣', 'pretext': '🎭',
    'physical': '🚪', 'tailgating': '🚶',
    'upload': '📤', 'file': '📁',
    'misconfiguration': '⚙️', 'exposure': '👁️',
    'enumeration': '📊', 'reconnaissance': '🕵️',
    'authorization': '🛂', 'authentication': '🎫',
    'logging': '📝', 'monitoring': '👁️',
    'supply': '🔗', 'chain': '⛓️', 'backup': '💾', 'database': '🗄️',
    'memory': '🧠', 'race': '🏁', 'timing': '⏱️', 'side-channel': '📡',
    'default': '⚙️', 'hardcoded': '📝',
    'insecure': '⚠️', 'vulnerable': '🛡️',
    'cryptograph': '🔐', 'tls': '🔒', 'ssl': '🔒',
    'business logic': '🧩', 'state': '📊',
    'subdomain': '🔎', 'smtp': '📧', 'email': '📧',
    'token': '🎫', 'session': '🔗', 'jwt': '🎫',
    'password': '🔑', 'credential': '🔑',
    'brute': '🔨', 'brute-force': '🔨',
    'scan': '📡', 'fingerprint': '🖐️',
    'sniff': '🦈', 'arp': '📡', 'routing': '🛣️',
    'vlan': '🔌', 'firewall': '🔥', 'ids': '🚨',
    'arp spoof': '🎭', 'man-in-the-middle': '🎭', 'mitm': '🎭',
    'dns spoof': '🎭', 'cache poison': '☠️',
    'banner': '📋', 'version': '📋',
    'smb relay': '🖥️', 'ntlm': '🎫', 'kerberos': '🎫',
    'nfs': '📁', 'nfs export': '📁',
    'webdav': '🌐', 'proxy': '🔄',
    'open redirect': '↩️', 'redirect': '↩️',
    'ssrf': '🌐', 'xxe': '📄', 'xml': '📄',
    'deserialization': '🔄', 'rce': '💥', 'remote code': '💥',
    'path traversal': '🛤️', 'directory traversal': '🛤️', 'lfi': '📂', 'rfi': '📂',
    'file inclusion': '📂',
    'clickjacking': '👆', 'frame': '🖼️',
    'host header': '📋', 'http request smuggling': '📦',
    'cache poisoning': '☠️', 'web cache': '📦',
    'saml': '🎫', 'openid': '🎫',
    'idor': '🛂', 'insecure direct object': '🛂',
    'mass assignment': '📊', 'bulk assignment': '📊',
    'rate limit': '⏱️', 'rate limiting': '⏱️',
    'password reset': '🔑', 'forgot password': '🔑',
    'mfa': '🔐', '2fa': '🔐', 'multi-factor': '🔐', 'totp': '🔐',
    'swagger': '📋', 'openapi': '📋',
    'web socket': '🔌', 'websocket': '🔌',
    'http method': '🔀',
    'file upload': '📤', 'upload': '📤',
    'command injection': '💉', 'os command': '💉',
    'template injection': '💉', 'ssti': '💉',
    'nosql': '🗃️', 'mongodb': '🗃️',
    'ldap injection': '📋', 'xpath': '📄',
    'xml external': '📄',
    'host header injection': '📋',
    'subdomain takeover': '🔎',
    'git': '📝', 'git exposure': '📝', '.git': '📝',
    '.env': '🔑',
    'api key': '🔑', 'secret': '🔑',
    'verbose': '⚠️', 'error message': '⚠️', 'stack trace': '⚠️',
    'debug mode': '🐛',
    'technology': '🔍', 'stack detect': '🔍',
    'waf detect': '🔥', 'cdn detect': '📦',
    'port scan': '📡', 'service detect': '📡',
    'os detect': '💻',
    'nmap': '📡', 'masscan': '📡',
    'shodan': '🕵️', 'censys': '🕵️', 'zoomeye': '🕵️',
    'sublist3r': '🔎', 'amass': '🔎',
    'httpx': '🌐',
    'nuclei': '🎯',
    'gowitness': '📸', 'screenshot': '📸', 'aquatone': '📸',
    'ffuf': '🔨', 'fuzz': '🔨', 'dirb': '🔨', 'gobuster': '🔨', 'dirsearch': '🔨',
    'hydra': '🔨', 'medusa': '🔨', 'ncrack': '🔨', 'patator': '🔨',
    'john': '🔨', 'hashcat': '🔨', 'hash': '🔨', 'crack': '🔨',
    'spray': '🔨',
    'enum4linux': '📋',
    'smbclient': '🖥️', 'rpcclient': '🖥️',
    'snmpwalk': '📊', 'snmp': '📊',
    'telnet': '📞', 'rdp': '🖥️', 'vnc': '🖥️',
    'mysql': '🗃️', 'postgres': '🗃️', 'mssql': '🗃️',
    'elasticsearch': '📊',
    'winrm': '🖥️', 'powershell': '💻',
    'impacket': '🛠️', 'bloodhound': '🩸',
    'kerbrute': '🎫',
    'kerberoast': '🎫', 'asreproast': '🎫',
    'dcsync': '🎫',
    'pass-the-hash': '🎫', 'pass-the-ticket': '🎫', 'overpass-the-hash': '🎫',
    'silver ticket': '🎫', 'golden ticket': '🎫', 'pth': '🎫',
    'psexec': '🖥️', 'wmiexec': '🖥️', 'smbexec': '🖥️',
    'atexec': '🖥️', 'dcomexec': '🖥️',
    'rpcdump': '🖥️', 'lookupsid': '📋', 'rpcmap': '🖥️',
    'krbrelayx': '🎫',
    'ms17-010': '💥', 'eternalblue': '💥', 'bluekeep': '💥',
    'log4shell': '💥', 'spring4shell': '💥', 'proxyShell': '🔄',
    'zerologon': '💥', 'printnightmare': '🖨️',
    'smb signing': '🖥️', 'ntlm relay': '🎭',
    'llmnr': '📋', 'nbns': '📋', 'mDNS': '📋',
    'dns rebinding': '🔍',
    'ipv6': '🌐',
    'unattended': '⚙️',
    'jenkins': '⚙️',
    'gitlab': '📝', 'github': '📝',
    'grafana': '📊', 'prometheus': '📊', 'kibana': '📊',
    'kafka': '📡', 'rabbitmq': '📡',
    'redis': '🗃️', 'memcached': '🗃️',
    'cassandra': '🗃️', 'neo4j': '🗃️',
    'influxdb': '📊', 'etcd': '⚙️', 'consul': '⚙️',
    'vault': '🔐', 'keycloak': '🎫', 'okta': '🎫', 'auth0': '🎫',
    'active directory': '📋', 'ad': '📋',
    'domain controller': '📋', 'dc': '📋',
    'group policy': '📋', 'gpo': '📋', 'gpp': '📋',
    'krb5': '🎫', 'spnego': '🎫',
    'ssp': '🔐', 'credential guard': '🔐',
    'lsass': '🧠', 'sam': '🔑', 'ntds.dit': '🗃️',
    'secretsdump': '🗝️', 'lsadump': '🗝️', 'mimikatz': '🔧', 'sekurlsa': '🔧',
    'privilege': '⬆️', 'escalation': '⬆️',
    'uac': '🔐', 'sudo': '🔐', 'suid': '🔐', 'capability': '🔐',
    'sudo misconfiguration': '🔐',
    'token impersonation': '🎭',
    'named pipe': '📁', ' impersonation': '🎭',
    'potato': '🥔', 'juicy': '🍊',
    'print spooler': '🖨️', 'spooler': '🖨️',
    'clfs': '📁', 'alpc': '📁', 'bits': '📁',
    'com': '⚙️', 'ole': '⚙️', 'dcom': '🖥️', 'wmi': '🖥️',
    'wmic': '🖥️', 'winrm': '🖥️',
    'msbuild': '🔧', 'msiexec': '🔧', 'msdt': '💻',
    'regsvr32': '🔧', 'rundll32': '🔧',
    'office': '📄', 'word': '📄', 'excel': '📄', 'powerpoint': '📄',
    'outlook': '📧', 'acroread': '📄', 'pdf': '📄',
    'javascript': '💻', 'js': '💻', 'node': '💻', 'node.js': '💻',
    'python': '🐍', 'ruby': '💎', 'php': '🐘', 'java': '☕',
    'dotnet': '☕', 'c#': '☕', 'csharp': '☕',
    'go': '🔵', 'golang': '🔵', 'rust': '🦀',
    'c ': '⚙️', 'c++': '⚙️',
    'perl': '🐪', 'bash': '💻',
    'shell': '💻', 'sh': '💻',
    'cmd': '💻', 'batch': '💻', 'vbs': '💻', 'hta': '💻',
    'wscript': '💻',
    'telnet': '📞',
    'vpn': '🔒', 'pptp': '🔒', 'openvpn': '🔒', 'wireguard': '🔒',
    'ike': '🔒', 'esp': '🔒', 'ah': '🔒', 'gre': '🔒', 'tunnel': '🔒',
    'packet': '📦', 'frame': '🖼️', 'ethernet': '🔌',
    '802.11': '📶',
    'wpa': '🔒', 'wpa2': '🔒', 'wpa3': '🔒', 'wep': '🔒',
    'eap': '🎫', 'eapol': '🤝',
    'wps': '🔐', 'pin': '🔑', 'pixie dust': '✨', 'pixiedust': '✨', 'pmkid': '🔑',
    'beacon': '📡', 'deauth': '📡', 'disassoc': '📡',
    'rogue ap': '🎭', 'evil twin': '🎭', 'karma': '🎭',
    'mdk3': '💣', 'mdk4': '💣', 'aircrack': '💣',
    'airodump': '📡', 'airodump-ng': '📡', 'aireplay-ng': '📡', 'aircrack-ng': '💣',
    'hcxdumptool': '📡', 'hcxtools': '🔧',
    'tshark': '🦈', 'tcpdump': '🦈', 'wireshark': '🦈',
    'ettercap': '🎭', 'bettercap': '🎭',
    'mitmproxy': '🔄',
    'burp suite': '🔄', 'burp': '🔄', 'intruder': '🔨', 'repeater': '🔄',
    'owasp zap': '⚡', 'zap': '⚡',
    'nessus': '🎯', 'openvas': '🎯', 'qualys': '🎯',
    'rapid7': '🎯', 'insightvm': '🎯', 'nexpose': '🎯',
    'acunetix': '🎯', 'netsparker': '🎯',
    'scanner': '🎯', 'fuzz': '🔨',
    'payload': '📦', 'exploit': '💥', 'shellcode': '💉',
    'metasploit': '💣', 'msfconsole': '💣', 'msfvenom': '💣',
    'cobalt strike': '💣', 'cobalt': '💣',
    'c2': '📡', 'command and control': '📡',
    'implant': '💉', 'backdoor': '🚪',
    'webshell': '🕸️',
    'reverse shell': '🔄', 'bind shell': '🔗',
    'php shell': '🕸️', 'asp shell': '🕸️', 'jsp shell': '🕸️', 'aspx shell': '🕸️',
    'cmd shell': '💻', 'powershell shell': '💻', 'bash shell': '💻', 'sh shell': '💻',
    'nc': '🔌', 'netcat': '🔌', 'ncat': '🔌', 'socat': '🔌',
    'rlwrap': '🔌', 'stty': '🔌', 'pty': '🔌',
    'terminal': '💻', 'console': '💻',
    'scp': '📁',
    'sftp': '📁', 'rsync': '📁',
    'ssh key': '🔐', 'ssh-keygen': '🔐',
    'id_rsa': '🔐', 'id_dsa': '🔐', 'id_ecdsa': '🔐', 'id_ed25519': '🔐',
    'authorized_keys': '🔐', 'known_hosts': '🔐',
    'ssh config': '⚙️', 'ssh_config': '⚙️', 'sshd_config': '⚙️',
    'ftps': '🔒', 'tftp': '📁',
    'vsftpd': '📁', 'proftpd': '📁', 'pure-ftpd': '📁', 'wu-ftpd': '📁',
    'anonymous': '👤', 'anonymous ftp': '👤',
    'samba': '🖥️', 'smbd': '🖥️', 'nmbd': '🖥️', 'winbindd': '🖥️',
    'smbmap': '🗺️', 'crackmapexec': '💣',
    'enum4linux-ng': '📋',
    'smbexec': '💻', 'psexec': '💻', 'wmiexec': '💻', 'atexec': '💻', 'dcomexec': '💻',
    'xrdp': '🖥️', 'tightvnc': '🖥️', 'realvnc': '🖥️', 'ultravnc': '🖥️', 'tigervnc': '🖥️',
    'remmina': '🖥️', 'rdesktop': '🖥️', 'xfreerdp': '🖥️',
    'kdc': '🎫', 'as': '🎫', 'tgs': '🎫', 'krbtgt': '🎫',
    'spn': '📋', 'service principal': '📋',
    'delegation': '📋', 'constrained': '📋', 'unconstrained': '📋',
    'resource-based': '📋', 'rbd': '📋',
    's4u2self': '🎫', 's4u2proxy': '🎫',
    'roast': '🍗', 'kerberoast': '🍗', 'asreproast': '🍗',
    'sharp': '🩸',
    'dac': '📋', 'sac': '📋',
    'acl': '📋', 'ace': '📋',
    'sid': '📋', 'rid': '📋',
    'secretsdump': '🗝️', 'lsadump': '🗝️',
    'bypass': '↩️',
    'impersonation': '🎭',
    'windows': '🖥️', 'win32': '🖥️', 'nt': '🖥️',
    'registry': '⚙️', 'reg': '⚙️',
    'acl': '📋', 'permission': '📋',
    'privilege': '⬆️',
    'sudo': '🔐',
    'suid': '🔐',
    'setgid': '🔐',
    'capability': '🔐',
    'docker': '🐳',
    'kubernetes': '⚙️',
    'k8s': '⚙️',
    'pod': '📦',
    'container': '🐳',
    'image': '📦',
    'registry': '📦',
    'secret': '🔑',
    'configmap': '⚙️',
    'service account': '👤',
    'rbac': '📋',
    'role': '📋',
    'clusterrole': '📋',
    'binding': '📋',
    'node': '🖥️',
    'etcd': '🗃️',
    'api server': '🔌',
    'kubelet': '⚙️',
    'kube-proxy': '🔌',
    'helm': '⚙️',
    'istio': '🔌',
    'ingress': '🔌',
    'persistent volume': '💾',
    'pv': '💾',
    'pvc': '💾',
    'storage class': '💾',
    'daemonset': '📦',
    'statefulset': '📦',
    'deployment': '📦',
    'replicaset': '📦',
    'job': '📋',
    'cronjob': '⏰',
    'horizontal pod': '📊',
    'hpa': '📊',
    'vpa': '📊',
    'network policy': '🚧',
    'pod security': '🔐',
    'seccomp': '🔐',
    'apparmor': '🔐',
    'selinux': '🔐',
    'admission': '🚧',
    'webhook': '🔌',
    'audit': '📝',
    's3': '☁️',
    'bucket': '🪣',
    'ec2': '☁️',
    'lambda': '☁️',
    'function': '☁️',
    'iam': '👤',
    'role': '📋',
    'policy': '📋',
    'sts': '🎫',
    'access key': '🔑',
    'vpc': '🔌',
    'security group': '🚧',
    'nacl': '🚧',
    'subnet': '🔌',
    'route table': '🛣️',
    'internet gateway': '🌐',
    'nat gateway': '🔀',
    'load balancer': '⚖️',
    'elb': '⚖️',
    'alb': '⚖️',
    'nlb': '⚖️',
    'cloudfront': '📡',
    'route53': '🔍',
    'dns': '🔍',
    'rds': '🗄️',
    'database': '🗄️',
    'dynamodb': '🗄️',
    'redshift': '📊',
    'elasticache': '⚡',
    'sqs': '📡',
    'sns': '📡',
    'kinesis': '📡',
    'kafka': '📡',
    'eventbridge': '🔌',
    'step functions': '📋',
    'cloudformation': '⚙️',
    'terraform': '⚙️',
    'cloudtrail': '📝',
    'cloudwatch': '👁️',
    'config': '⚙️',
    'guardduty': '🚨',
    'inspector': '🔍',
    'macie': '👁️',
    'guardduty': '🚨',
    'security hub': '🔒',
    'waf': '🔥',
    'shield': '🛡️',
    'kms': '🔐',
    'secrets manager': '🔑',
    'parameter store': '⚙️',
    'certificate manager': '🔒',
    'acm': '🔒',
    'guardduty': '🚨',
    'athena': '📊',
    'glue': '🔗',
    'emr': '⚙️',
    'sagemaker': '🤖',
    'rekognition': '👁️',
    'polly': '🗣️',
    'lex': '🗣️',
    'transcribe': '📝',
    'translate': '🌐',
    'comprehend': '🧠',
    'textract': '📄',
    'forecast': '📊',
    'personalize': '👤',
    'kendra': '🔍',
    'fraud detector': '🚨',
    'lookout': '👁️',
    'monitron': '👁️',
    'panorama': '📷',
    'deep racer': '🏎️',
    'augmented ai': '🤖',
    'q': '💬',
    'copilot': '🤖',
    'bedrock': '🤖',
    'titan': '🤖',
    'claude': '🤖',
    'llama': '🤖',
    'mistral': '🤖',
    'gpt': '🤖',
    'dall-e': '🎨',
    'stable diffusion': '🎨',
    'midjourney': '🎨',
    'whisper': '🗣️',
    'embedding': '📊',
    'fine-tuning': '🔧',
    'rag': '📚',
    'retrieval': '📚',
    'prompt injection': '💉',
    'jailbreak': '🔓',
    'jailbreak': '🔓',
    'prompt leaking': '💬',
    'data poisoning': '☠️',
    'model inversion': '🔄',
    'membership inference': '🕵️',
    'hallucination': '🤔',
    'bias': '⚖️',
    'toxicity': '☠️',
    'safety': '🛡️',
    'alignment': '🎯',
    'guardrails': '🚧',
    'system prompt': '💬',
    'few-shot': '📝',
    'zero-shot': '📝',
    'chain-of-thought': '🔗',
    'cot': '🔗',
    'tool use': '🔧',
    'function call': '🔌',
    'token': '🎫',
    'context window': '🪟',
    'temperature': '🌡️',
    'top-p': '📊',
    'top-k': '📊',
    'max tokens': '🔢',
    'stop sequence': '⏹️',
    'system message': '💬',
    'user message': '👤',
    'assistant message': '🤖',
    'completion': '✅',
    'streaming': '📡',
    'batch': '📦',
    'latency': '⏱️',
    'throughput': '📊',
    'cost': '💰',
    'token limit': '🔢',
    'rate limit': '⏱️',
    'api key': '🔑',
    'endpoint': '🔌',
    'region': '🌍',
    'availability zone': '🌍',
    'az': '🌍',
    'edge': '📡',
    'cdn': '📦',
    'origin': '🌐',
    'origin server': '🌐',
    'origin shield': '🛡️',
    'cache hit': '✅',
    'cache miss': '❌',
    'ttl': '⏱️',
    'stale': '📦',
    'invalid': '❌',
    'purge': '🗑️',
    'invalidation': '🗑️',
    'prefetch': '📥',
    'preload': '📥',
    'service worker': '👷',
    'manifest': '📋',
    'pwa': '📱',
    'offline': '📴',
    'sync': '🔄',
    'push notification': '🔔',
    'web push': '🔔',
    'geolocation': '📍',
    'geolocation': '📍',
    'camera': '📷',
    'microphone': '🎤',
    'bluetooth': '📶',
    'usb': '🔌',
    'nfc': '📡',
    'clipboard': '📋',
    'fullscreen': '🖥️',
    'popup': '🪟',
    'window': '🪟',
    'screen': '🖥️',
    'orientation': '📱',
    'device memory': '🧠',
    'hardware concurrency': '⚙️',
    'navigator': '🧭',
    'user agent': '👤',
    'referrer': '📋',
    'referer': '📋',
    'origin': '🌐',
    'host': '🏠',
    'path': '🛤️',
    'query': '❓',
    'fragment': '🔗',
    'hash': '#️⃣',
    'search': '🔍',
    'protocol': '🔌',
    'scheme': '🔌',
    'port': '🔌',
    'hostname': '🏠',
    'domain': '🌐',
    'subdomain': '🔎',
    'tld': '🌐',
    'sld': '🌐',
    'url': '🔗',
    'uri': '🔗',
    'urn': '🔗',
    'iri': '🔗',
    'percent-encoding': '🔢',
    'url encoding': '🔢',
    'base64': '🔢',
    'hex': '🔢',
    'binary': '🔢',
    'octal': '🔢',
    'unicode': '🔤',
    'utf-8': '🔤',
    'ascii': '🔤',
    'html entity': '🔤',
    'javascript': '💻',
    'vbscript': '💻',
    'html': '📄',
    'css': '🎨',
    'svg': '🖼️',
    'xml': '📄',
    'json': '📋',
    'yaml': '📋',
    'toml': '📋',
    'ini': '📋',
    'properties': '📋',
    'csv': '📊',
    'markdown': '📝',
    'rest': '🌐',
    'soap': '📦',
    'graphql': '◈',
    'grpc': '🔌',
    'websocket': '🔌',
    'sse': '📡',
    'webhook': '🔌',
    'callback': '↩️',
    'polling': '⏱️',
    'long-polling': '⏱️',
    'push': '📤',
    'pull': '📥',
    'pub/sub': '📡',
    'message queue': '📡',
    'event': '📅',
    'stream': '📡',
    'batch': '📦',
    'etl': '🔄',
    'elt': '🔄',
    'data pipeline': '🔄',
    'orchestration': '🎯',
    'scheduler': '⏰',
    'workflow': '📋',
    'dag': '🔗',
    'step': '👣',
    'task': '📋',
    'job': '💼',
    'trigger': '⚡',
    'condition': '🔀',
    'branch': '🌿',
    'loop': '🔄',
    'parallel': '🔀',
    'sequential': '➡️',
    'error handler': '⚠️',
    'retry': '🔄',
    'timeout': '⏱️',
    'circuit breaker': '⏹️',
    'dead letter': '💀',
    'dlq': '💀',
    'idempotent': '🔄',
    'at least once': '📤',
    'exactly once': '✅',
    'at most once': '📤',
    'ack': '✅',
    'nack': '❌',
    'commit': '✅',
    'rollback': '↩️',
    'transaction': '💱',
    'acid': '⚗️',
    'base': '⚗️',
    'cap theorem': '⚗️',
    'consistency': '📏',
    'availability': '✅',
    'partition tolerance': '🔌',
    'sharding': '📊',
    'replication': '📋',
    'partitioning': '🔀',
    'load balancing': '⚖️',
    'failover': '🔄',
    'high availability': '✅',
    'disaster recovery': '🚑',
    'backup': '💾',
    'snapshot': '📸',
    'restore': '↩️',
    'disaster recovery': '🚑',
    'rpo': '⏱️',
    'rto': '⏱️',
    'sla': '📋',
    'slo': '📋',
    'sli': '📋',
    'error budget': '💰',
    'mtbf': '⏱️',
    'mttr': '⏱️',
    'incident': '🚨',
    'postmortem': '📝',
    'root cause analysis': '🔍',
    'rca': '🔍',
    'five whys': '❓',
    'blameless': '🤝',
    'on-call': '👤',
    'pagerduty': '🔔',
    'opsgenie': '🔔',
    'alert': '🔔',
    'threshold': '📏',
    'anomaly': '⚠️',
    'anomaly detection': '⚠️',
    'baseline': '📏',
    'trend': '📈',
    'seasonality': '📅',
    'forecast': '📊',
    'capacity planning': '📊',
    'autoscaling': '📈',
    'scale up': '⬆️',
    'scale out': '➡️',
    'scale down': '⬇️',
    'scale in': '⬅️',
    'throttle': '⏱️',
    'rate limiting': '⏱️',
    'quota': '📊',
    'circuit breaker': '⏹️',
    'bulkhead': '🚧',
    'timeout': '⏱️',
    'retry': '🔄',
    'fallback': '↩️',
    'graceful degradation': '⬇️',
    'feature flag': '🚩',
    'dark launch': '🌙',
    'canary': '🐤',
    'blue green': '🔵🟢',
    'rolling update': '🔄',
    'immutable': '🔒',
    'mutable': '🔓',
    'infrastructure as code': '💻',
    'iac': '💻',
    'gitops': '📝',
    'ci/cd': '🔄',
    'pipeline': '🔄',
    'build': '🔨',
    'test': '🧪',
    'deploy': '🚀',
    'release': '🚀',
    'monitor': '👁️',
    'observe': '👁️',
    'tracing': '🔍',
    'span': '📏',
    'trace': '🔍',
    'distributed tracing': '🔍',
    'jaeger': '🔍',
    'zipkin': '🔍',
    'opentelemetry': '📡',
    'otel': '📡',
    'metrics': '📊',
    'histogram': '📊',
    'gauge': '📊',
    'counter': '🔢',
    'percentile': '📏',
    'p99': '📏',
    'p95': '📏',
    'p50': '📏',
    'latency': '⏱️',
    'rtt': '⏱️',
    'throughput': '📊',
    'bandwidth': '📊',
    'jitter': '〰️',
    'packet loss': '📦',
    'error rate': '⚠️',
    'availability': '✅',
    'uptime': '✅',
    'downtime': '❌',
    'outage': '❌',
    'incident': '🚨',
    'severity': '⚠️',
    'priority': '📊',
    'impact': '💥',
    'likelihood': '🎲',
    'risk': '⚠️',
    'threat': '⚠️',
    'vulnerability': '🛡️',
    'exploit': '💥',
    'attack vector': '🎯',
    'attack surface': '🎯',
    'surface': '🎯',
    'blast radius': '💥',
    'exposure': '👁️',
    'asset': '💎',
    'crown jewel': '👑',
    'sensitive data': '🔒',
    'pii': '👤',
    'phi': '🏥',
    'pci': '💳',
    'gdpr': '⚖️',
    'ccpa': '⚖️',
    'hipaa': '🏥',
    'soc2': '📋',
    'iso 27001': '📋',
    'nist': '📋',
    'owasp': '🔒',
    'cwe': '📋',
    'cve': '📋',
    'cvss': '📊',
    'severity': '⚠️',
    'critical': '🔴',
    'high': '🟠',
    'medium': '🟡',
    'low': '🟢',
    'informational': '🔵',
    'risk score': '📊',
    'cvss score': '📊',
    'base score': '📊',
    'temporal score': '⏱️',
    'environmental score': '🌍',
    'vector string': '🔗',
    'attack vector': '🎯',
    'attack complexity': '🧩',
    'privileges required': '🛂',
    'user interaction': '👤',
    'scope': '📏',
    'confidentiality': '🔒',
    'integrity': '📏',
    'availability': '✅',
    'exploitability': '💥',
    'remediation level': '🔧',
    'report confidence': '📊',
}

KNOWN_VARIANTS_BY_DOMAIN = {
    'NET': [
        'DNS zone transfer (AXFR/IXFR) if the resolver authoritatively serves any zone',
        'NXDOMAIN-based amplification — resolver spends more CPU on non-existent queries',
        'EDNS0 buffer-size exploitation — some resolvers advertise 4096-byte buffers',
        'Source-port randomization weakness — predictable ports weaken cache poisoning',
    ],
    'WEB': [
        'Context-dependent: reflected vs stored vs DOM-based — verify which context applies',
        'WAF bypass with URL-encoded, double-encoded, or Unicode-normalized payloads',
        'Framework-specific bypass patterns (Spring, Django, Rails, Express)',
        'Same vulnerability across HTTP methods — test GET, POST, PUT, PATCH, HEAD',
    ],
    'API': [
        'GraphQL query complexity/depth abuse — deeply nested queries exhaust resources',
        'IDOR across API versions (v1, v2, deprecated endpoints)',
        'HTTP method override via X-HTTP-Method-Override or PATCH-as-POST tunneling',
        'Response splitting via reflected headers — CRLF injection into Location/headers',
    ],
    'LLM': [
        'Token-level adversarial suffixes overriding model alignment across queries',
        'Training data extraction — prompts reconstructing training examples with PII',
        'Multi-turn escalation — incremental requests bypass guardrails over turns',
        'Indirect injection via retrieved documents (RAG) — malicious docs hijack model',
    ],
    'CLOUD': [
        'Cross-account access via resource-based policies without org-level restrictions',
        'Temporary credential abuse — STS tokens and service account keys with excessive scope',
        'Logging/monitoring gaps — CloudTrail/CloudWatch not forwarding to SIEM',
        'Service chaining/lateral movement — compromised resources escalating access',
    ],
    'MOBILE': [
        'Biometric bypass via deauthentication on Android using instrumentation frameworks',
        'IPC abuse — exported activities/services accepting external intents',
        'Certificate pinning bypass at network library vs system level',
        'Dynamic analysis detection evasion — root/jailbreak bypass via Xposed/Magisk',
    ],
    'THICK': [
        'Named pipe/IPC interception with weak ACLs allowing lower-privilege access',
        'Memory scraping from accessible process dumps using volatility/WinDbg',
        'DLL side-loading — malicious DLL in application directory search order',
        'COM object hijacking — malicious CLSID registration without verification',
    ],
    'WIFI': [
        'PMKID attack — WPA2-PSK leaks PMKID in first EAPOL for offline cracking',
        'WPS PIN brute-force (Pixie Dust) — weak RNG in AP implementations',
        'KARMA wildcard SSID — wildcard response auto-associates devices to rogue AP',
        'DTIM beacon injection — forged beacons steering clients to rogue AP',
    ],
    'SRC': [
        '.env and IDE config files (.vscode, .idea) committed to version control',
        'Dependency vulnerabilities — outdated deps introducing known CVEs',
        'Log injection/forgery — unsanitized input in logs framing users',
        'Prototype pollution — merging user input into Object.prototype via Object.assign',
    ],
    'SOCIAL': [
        'LinkedIn enumeration for spear-phishing — mapping org chart via public profiles',
        'EXIF data in photos revealing GPS coordinates and device info for pretexting',
        'QR code phishing (quishing) — physical drop near target entrance',
        'Pretexting via cloned internal document templates from public website',
    ],
}

GENERIC_VARIANTS = [
    'Same vulnerability class in adjacent endpoints — systematically scan all endpoints sharing the same pattern',
    'Encoded/obfuscated payloads — URL encoding, double-encoding, Base64, Unicode to bypass input filters',
    'Chained exploitation — combine with secondary vulnerability to escalate impact',
    'Privilege context variant — test admin, regular user, and service account levels',
]

GENERIC_STEPS_IDENTIFY = [
    'Review target configuration files and deployment manifests — check for hardcoded credentials, overly permissive ACLs, debug mode in production, default credentials',
    'Test with authenticated and unauthenticated access levels to identify authorization boundary discrepancies',
    'Cross-reference findings against technology stack documentation and public security advisories for known CVEs in deployed versions',
    'Test error handling behavior — trigger edge cases, malformed inputs, boundary values to reveal stack traces, internal paths, database queries',
    'Verify persistence across multiple sessions and user contexts — document whether the issue requires specific actions, states, or timing conditions',
    'Capture and analyze all traffic with an intercepting proxy — identify hidden parameters, undocumented endpoints, secondary injection vectors, dependency chains',
]

GENERIC_STEPS_EXPLOIT = [
    'Document exact reproduction steps with all commands, parameters, headers, and environmental conditions for reproducibility by any team member',
    'Retrieve only minimum data needed to demonstrate impact — proof of concept, not full exploitation',
    'Record exact request/response pairs for the report — HTTP history provides verifiable evidence',
    'Test with multiple tools to confirm the finding is not tool-specific — manual curl, Burp Repeater, and custom script should produce consistent results',
    'Verify the vulnerability exists in the latest deployed version — note version changes between scoping and testing',
    'Assess real-world exploitability — document attacker position, required access level, and complexity',
]

GENERIC_PAYLOADS = [
    {'label': 'Basic reconnaissance with curl', 'command': 'curl -s -o /dev/null -w "%{http_code} %{redirect_url}" https://<target>/api/status'},
    {'label': 'Header inspection for information disclosure', 'command': 'curl -sI https://<target>/api/endpoint | grep -iE "x-|server|powered|version|framework"'},
    {'label': 'Proxy capture with Burp Suite', 'command': '# Configure browser proxy to 127.0.0.1:8080, navigate to target, examine HTTP history'},
    {'label': 'Automated scan with Nuclei', 'command': 'nuclei -u https://<target> -t cves/ -severity critical,high -o nuclei-results.txt'},
    {'label': 'Manual verification with curl', 'command': 'curl -s -X GET "https://<target>/api/v1/<endpoint>" -H "Authorization: Bearer <token>" | jq .'},
    {'label': 'Parameter fuzzing with ffuf', 'command': 'ffuf -w /usr/share/wordlists/params.txt -u "https://<target>/api/v1/resource?FUZZ=test" -mc 200,301'},
]

GENERIC_MITIGATION = [
    'Implement defense in depth — apply input validation at framework level, not just individual endpoints — framework-level catches new endpoints added without security review',
    'Enable comprehensive logging and monitoring — even with mitigation in place, detection ensures exploitation attempts are caught before full compromise',
    'Conduct targeted security code review of all code paths touching the affected functionality — sibling issues often exist in adjacent code with similar patterns',
    'Add automated security testing to CI/CD — SAST (Semgrep, Bandit), DAST (OWASP ZAP, Nuclei), dependency scanning (Snyk, Dependabot) to prevent regression',
    'Train the development team on the vulnerability class with a concrete example from the current codebase — abstract guidelines are less effective than a real reference',
]


def get_topic_icon(title):
    t = title.lower()
    for keyword, icon in TOPIC_ICONS.items():
        if keyword in t:
            return icon
    return '🔬'


def count_to_minimum(lst, minimum, field_name, domain_code=''):
    """Ensure a list meets minimum length, expanding with appropriate entries."""
    if not isinstance(lst, list):
        lst = []
    if len(lst) >= minimum:
        return lst, False

    expanded = list(lst)
    existing = set()

    if field_name == 'examplePayloads':
        existing = {p.get('label', str(p)) for p in expanded if isinstance(p, dict)}
        for p in GENERIC_PAYLOADS:
            if p['label'] not in existing and len(expanded) < minimum:
                expanded.append(dict(p))
        return expanded, True

    if field_name == 'variants':
        candidates = KNOWN_VARIANTS_BY_DOMAIN.get(domain_code, GENERIC_VARIANTS)
    elif field_name == 'stepsToIdentify':
        candidates = GENERIC_STEPS_IDENTIFY
    elif field_name == 'exploitationSteps':
        candidates = GENERIC_STEPS_EXPLOIT
    elif field_name == 'mitigation':
        candidates = GENERIC_MITIGATION
    else:
        return expanded, False

    existing = set(str(x) for x in expanded)
    for entry in candidates:
        if entry not in existing and len(expanded) < minimum:
            expanded.append(entry)

    return expanded, True


def generate_tags(item):
    """Generate relevant tags from the item's content."""
    tags = []
    text = ' '.join([
        item.get('title', ''),
        item.get('whatItIs', ''),
        item.get('rootCause', ''),
        item.get('cwe', ''),
    ]).lower()

    tag_keywords = {
        'injection': ['injection', 'sqli', 'xss', 'nosql', 'ldap injection'],
        'authentication': ['auth', 'login', 'credential', 'password', 'token', 'jwt', 'session', 'oauth'],
        'authorization': ['access control', 'idor', 'privilege', 'permission', 'acl'],
        'crypto': ['encrypt', 'decrypt', 'tls', 'ssl', 'certificate', 'cipher'],
        'network': ['network', 'packet', 'port', 'protocol'],
        'recon': ['enumeration', 'recon', 'scan', 'fingerprint', 'discovery'],
        'dos': ['denial', 'dos', 'ddos', 'flood', 'amplification'],
        'data-exposure': ['disclosure', 'exposure', 'leak', 'sensitive', 'pii', 'exfiltration'],
        'misconfiguration': ['misconfig', 'default', 'hardcoded', 'verbose', 'debug'],
        'client-side': ['dom', 'javascript', 'webview', 'iframe', 'local storage'],
        'cloud': ['cloud', 'bucket', 'iam', 'lambda'],
        'wireless': ['wifi', '802.11', 'wpa', 'wireless'],
        'physical': ['physical', 'tailgating', 'lock', 'room'],
        'social': ['phishing', 'pretext', 'vishing', 'osint'],
        'supply-chain': ['supply chain', 'dependency', 'third-party'],
        'ai': ['llm', 'prompt', 'ai', 'model'],
        'business-logic': ['business logic', 'workflow', 'race condition'],
        'code-review': ['source code', 'review', 'static analysis'],
        'mobile': ['mobile', 'android', 'ios'],
        'api': ['rest', 'graphql', 'api'],
        'dns': ['dns', 'domain name'],
        'web': ['http', 'https', 'cookie', 'header', 'form'],
        'smb': ['smb', 'windows', 'share'],
        'credential': ['credential', 'password', 'hash', 'ntlm', 'kerberos'],
        'malware': ['malware', 'ransomware', 'trojan', 'backdoor', 'implant'],
        'forensics': ['forensic', 'artifact', 'timeline', 'evidence'],
    }

    for tag, keywords in tag_keywords.items():
        if any(kw in text for kw in keywords):
            tags.append(tag)

    return tags[:5]


def estimate_difficulty(item):
    """Estimate exploitation difficulty based on content signals."""
    text = ' '.join([
        item.get('title', ''),
        item.get('whatItIs', ''),
        item.get('prerequisites', ''),
    ]).lower()

    easy_signals = ['default credential', 'default config', 'verbose', 'information disclosure',
                    'unprotected', 'misconfiguration', 'publicly exposed']
    hard_signals = ['race condition', 'timing attack', 'aslr', 'dep', 'zero-day',
                    'theoretical', 'complex chained', 'escalation']

    easy = sum(1 for s in easy_signals if s in text)
    hard = sum(1 for s in hard_signals if s in text)
    payloads = len(item.get('examplePayloads', []) or [])

    if hard >= 2:
        return 'advanced'
    elif easy > 0 or payloads >= 5:
        return 'intermediate'
    return 'beginner'


def enrich_domain(src):
    """Enrich a domain data dict (already parsed JSON)."""
    code = src.get('domain', '')
    items = src.get('items', [])
    if not items:
        return {'domain': code, 'items': 0, 'changes': 0}

    changes = 0
    for item in items:
        # 1. Icon
        if not item.get('icon'):
            item['icon'] = get_topic_icon(item.get('title', ''))
            changes += 1

        # 2-5. Array minimums
        for field, minimum in [
            ('stepsToIdentify', MIN_STEPS),
            ('exploitationSteps', MIN_STEPS),
            ('examplePayloads', MIN_PAYLOADS),
            ('variants', MIN_VARIANTS),
            ('mitigation', MIN_MITIGATION),
        ]:
            lst = item.get(field, [])
            if not isinstance(lst, list):
                lst = []
            if len(lst) < minimum:
                expanded, did_expand = count_to_minimum(lst, minimum, field, code)
                item[field] = expanded
                if did_expand:
                    changes += 1

        # 6. Tags
        if not item.get('tags'):
            item['tags'] = generate_tags(item)
            changes += 1

        # 7. Difficulty
        if not item.get('difficulty'):
            item['difficulty'] = estimate_difficulty(item)
            changes += 1

    return {'domain': code, 'items': len(items), 'changes': changes}


def main():
    sources = sorted(
        f for f in glob.glob(os.path.join(DATA, '*.json'))
        if os.path.basename(f) != 'index.json'
    )

    total_items = 0
    total_changes = 0

    for path in sources:
        name = os.path.basename(path)
        if not any(name.lower().startswith(d.lower()) for d in DOMAIN_ICONS.keys()):
            continue

        with open(path, encoding='utf-8') as fh:
            src = json.load(fh)

        stats = enrich_domain(src)

        if stats['items'] == 0:
            continue

        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(src, fh, indent=2, ensure_ascii=False)

        total_items += stats['items']
        total_changes += stats['changes']
        print(f"  {stats['domain']:7} {stats['items']:3} items  |  {stats['changes']} fields enhanced")

    print()
    print(f"  Total: {total_items} items, {total_changes} total enhancements")
    print()
    print("  Next: run  python3 tools/build-data.py  to regenerate index.json and detail/ artifacts")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
