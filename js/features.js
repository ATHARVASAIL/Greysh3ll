/* =========================================================
   VAPT CONSOLE — features.js
   Scan-output ingestion (Nmap / Nuclei / Burp → suggested test
   cases) plus rendering helpers for Attack Chains and Custom Test
   Cases. Depends on storage.js (allData, DOMAIN_META, chains/custom
   persistence) and core.js (escapeHtml, svgIcon). Loaded after both.
========================================================= */

/* =========================================================
   SCAN PARSING — best-effort, format-sniffing parser. Doesn't try
   to be a full Nmap/Nuclei/Burp parser; it extracts just enough
   structure (ports/services/products, template names, issue names)
   to drive keyword matching below. Falls back to treating the raw
   text as newline-separated candidate labels if nothing more
   structured is recognized.
========================================================= */
function parseScanOutput(raw){
  const text = (raw||'').trim();
  if(!text) return [];
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);

  // --- Nuclei: JSON Lines output ---
  const jsonLines = lines.filter(l => l.startsWith('{') && l.endsWith('}'));
  if(jsonLines.length && jsonLines.length >= lines.length * 0.5){
    const out = [];
    jsonLines.forEach(l => {
      try{
        const obj = JSON.parse(l);
        if(obj.info || obj['template-id']){
          out.push({
            source:'nuclei',
            label: (obj.info && obj.info.name) || obj['template-id'] || 'Unnamed finding',
            extra: obj['template-id'] || '',
            severity: (obj.info && obj.info.severity) || '',
            host: obj.host || obj['matched-at'] || '',
          });
        }
      }catch(e){ /* not valid JSON on this line, skip */ }
    });
    if(out.length) return out;
  }

  // --- Nmap XML export ---
  if(/<nmaprun/i.test(text)){
    const out = [];
    const portBlockRe = /<port protocol="(tcp|udp)" portid="(\d+)">([\s\S]*?)<\/port>/g;
    let pm;
    while((pm = portBlockRe.exec(text))){
      const [, proto, port, body] = pm;
      if(!/<state state="open"/.test(body)) continue;
      const svcMatch = body.match(/<service name="([^"]*)"(?:[^>]*product="([^"]*)")?/);
      out.push({ source:'nmap', port, proto, service: svcMatch ? svcMatch[1] : '', product: svcMatch && svcMatch[2] ? svcMatch[2] : '' });
    }
    if(out.length) return out;
  }

  // --- Burp XML export ---
  if(/<issue>/i.test(text)){
    const out = [];
    const issueBlockRe = /<issue>([\s\S]*?)<\/issue>/g;
    let bm;
    while((bm = issueBlockRe.exec(text))){
      const nameMatch = bm[1].match(/<name>(.*?)<\/name>/);
      const hostMatch = bm[1].match(/<host[^>]*>(.*?)<\/host>/);
      if(nameMatch) out.push({ source:'burp', label: nameMatch[1], host: hostMatch ? hostMatch[1] : '' });
    }
    if(out.length) return out;
  }

  // --- Nmap greppable/normal text: "22/tcp open ssh OpenSSH 8.2p1" ---
  // Restricted to [ \t] (not \s) around each piece so a line with no
  // trailing product string can't accidentally swallow the next line.
  const greppableRe = /(\d{1,5})\/(tcp|udp)[ \t]+open[ \t]+(\S+)(?:[ \t]+([^\n\r]*))?/gi;
  const grepOut = [];
  let gm;
  while((gm = greppableRe.exec(text))){
    grepOut.push({ source:'nmap-text', port:gm[1], proto:gm[2], service:gm[3], product:(gm[4]||'').trim() });
  }
  if(grepOut.length) return grepOut;

  // --- Fallback: one candidate per non-trivial line ---
  return lines.slice(0, 300)
    .filter(l => l.length > 5 && l.length < 220)
    .map(l => ({ source:'generic', label: l }));
}

/* Port → keyword hints. Deliberately maps to *keywords*, not test-case
   IDs, so matching stays correct even as the underlying test-case set
   changes — the alternative (a hardcoded port→ID table) would silently
   go stale the moment a case is renumbered or renamed. */
const PORT_KEYWORDS = {
  21:['ftp'], 22:['ssh'], 23:['telnet'], 25:['smtp','relay'], 53:['dns'],
  69:['tftp'], 111:['rpc'], 123:['ntp'], 135:['rpc','smb'], 137:['netbios'],
  139:['smb','netbios'], 161:['snmp'], 162:['snmp'], 179:['bgp'],
  389:['ldap'], 445:['smb'], 512:['r-services'], 513:['r-services'],
  514:['r-services','syslog'], 548:['afp'], 631:['print'], 873:['rsync'],
  1433:['sql server','mssql'], 1521:['oracle'], 1723:['pptp'],
  1812:['radius'], 1813:['radius'], 1900:['ssdp','upnp'], 2049:['nfs'],
  2181:['zookeeper'], 3268:['ldap'], 3306:['mysql'], 3389:['rdp','remote desktop'],
  5060:['sip'], 5061:['sip'], 5432:['postgres'], 5900:['vnc'],
  5985:['winrm'], 6379:['redis'], 8009:['ajp'], 8443:['tls'],
  9042:['cassandra'], 9100:['print'], 9200:['elasticsearch'],
  11211:['memcached'], 27017:['mongodb'], 50070:['hadoop'],
};

const STOPWORDS = new Set(['the','and','for','with','from','into','via','that','this','are','was','were','using','used','not','yet','over','under','when','where','what','have','has','had','which','once','than','then','also','onto','off','out','without','their','they','its']);

function significantWords(str){
  return (str||'').toLowerCase().match(/[a-z0-9][a-z0-9\-]{2,}/g)?.filter(w=>!STOPWORDS.has(w)) || [];
}

/* Scores a candidate finding against every test case's title (+ a
   little from cwe/reference.standard) using simple word overlap, plus
   a strong bonus for direct port/service keyword matches. Returns the
   top-N matches with a 0–100 confidence score for the UI to rank and
   label ("Port match" vs "Keyword match"). */
function matchFindingToCases(finding, allItems, limit){
  const scored = [];
  const candidateWords = new Set([
    ...significantWords(finding.label),
    ...significantWords(finding.service),
    ...significantWords(finding.product),
    ...significantWords(finding.extra),
  ]);
  const portHints = finding.port && PORT_KEYWORDS[finding.port] ? PORT_KEYWORDS[finding.port] : null;

  allItems.forEach(item => {
    if(item.custom) return; // don't suggest against user's own custom cases
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const titleWords = new Set(significantWords(item.title));

    if(portHints){
      portHints.forEach(kw => { if(titleLower.includes(kw)) score += 55; });
    }
    let overlap = 0;
    candidateWords.forEach(w => { if(titleWords.has(w) || titleLower.includes(w)) overlap++; });
    if(overlap) score += Math.min(45, overlap * 15);

    // CVE-style mentions (e.g. "CVE-2021-1675" or "EternalBlue") matched against title/cwe
    if(finding.label){
      const label = finding.label.toLowerCase();
      if(item.cwe && label.includes(item.cwe.toLowerCase())) score += 20;
    }

    if(score > 0) scored.push({ item, score: Math.min(100, score) });
  });

  scored.sort((a,b)=>b.score-a.score);
  return scored.slice(0, limit||3);
}

/* Runs the full pipeline: parse → match each finding → collapse into
   one ranked suggestion list per test case (keeping the best-scoring
   originating finding as the evidence line). */
function runScanIngestion(raw){
  const findings = parseScanOutput(raw);
  const byCase = new Map();
  findings.forEach(f => {
    const matches = matchFindingToCases(f, allData, 3);
    matches.forEach(m => {
      const prior = byCase.get(m.item.id);
      if(!prior || m.score > prior.score){
        byCase.set(m.item.id, { item:m.item, score:m.score, finding:f });
      }
    });
  });
  return {
    parsedCount: findings.length,
    suggestions: Array.from(byCase.values()).sort((a,b)=>b.score-a.score),
  };
}

function describeFinding(f){
  if(f.source==='nmap' || f.source==='nmap-text'){
    return `Nmap: port ${f.port}/${f.proto} open — ${f.service||'unknown service'}${f.product?` (${f.product})`:''}`;
  }
  if(f.source==='nuclei') return `Nuclei: ${f.label}${f.severity?` [${f.severity}]`:''}${f.host?` on ${f.host}`:''}`;
  if(f.source==='burp') return `Burp: ${f.label}${f.host?` on ${f.host}`:''}`;
  return `Scan note: ${f.label}`;
}
