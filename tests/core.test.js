/* core.test.js — 25 tests
   Data loading, lazy detail merge, toolkit bundle, primer table wrapping,
   scan ingestion, custom cases, chains, remediation model. */
const { read, boot, Suite, eq, ok, notOk, includes, excludes } = require('./harness');

const S = Suite('core');
const SCRIPTS = ['storage.js','filters.js','core.js','dashboard.js','primers.js','rendering.js','features.js'];

async function app(){
  const w = boot({ scripts: SCRIPTS });
  await w.$fn('loadAllData')();
  return w;
}

/* ---------- lazy loading ---------- */
S.test('loadAllData populates all 577 cases from index.json', async () => {
  const w = await app();
  eq(w.$('allData').length, 577, 'case count');
});

S.test('startup fetches only index.json — no detail file is pulled eagerly', async () => {
  const w = await app();
  eq(w.__fetchLog, ['data/index.json'], 'startup fetches');
});

S.test('ensureDetail merges heavy fields, which are absent until then', async () => {
  const w = await app();
  notOk(w.$fn('hasDetail')(w.$("allData.find(d=>d.domain==='NET')")), 'no detail before load');
  await w.$fn('ensureDetail')('NET');
  const item = w.$("allData.find(d=>d.domain==='NET')");
  ok(w.$fn('hasDetail')(item), 'hasDetail after merge');
  ok(item.stepsToIdentify && item.stepsToIdentify.length > 0, 'stepsToIdentify populated');
  ok(item.exploitationSteps && item.exploitationSteps.length > 0, 'exploitationSteps populated');
});

S.test('ensureDetail only loads the domain asked for', async () => {
  const w = await app();
  await w.$fn('ensureDetail')('WIFI');
  eq(w.__fetchLog, ['data/index.json','data/detail/wifi.json'], 'fetch log');
  const other = w.$("allData.find(d=>d.domain==='CLOUD')");
  notOk(w.$fn('hasDetail')(other), 'CLOUD must stay unloaded');
});

S.test('concurrent ensureDetail calls share one in-flight request', async () => {
  const w = await app();
  await Promise.all([
    w.$fn('ensureDetail')('API'),
    w.$fn('ensureDetail')('API'),
    w.$fn('ensureDetail')('API'),
  ]);
  const hits = w.__fetchLog.filter(u => u === 'data/detail/api.json').length;
  eq(hits, 1, 'detail/api.json fetch count');
});

/* ---------- toolkit bundle ---------- */
S.test('ensureToolkitData loads the light bundle, not the full detail set', async () => {
  const w = await app();
  await w.$fn('ensureToolkitData')();
  ok(w.__fetchLog.includes('data/toolkit.json'), 'toolkit.json fetched');
  eq(w.__fetchLog.filter(u => u.startsWith('data/detail/')).length, 0, 'no detail fetches');
});

S.test('toolkit bundle covers every case and carries payloads', async () => {
  const w = await app();
  const data = await w.$fn('ensureToolkitData')();
  const list = Array.isArray(data) ? data : (data.items || Object.values(data));
  eq(list.length, 577, 'toolkit item count');
  ok(list.some(i => i.examplePayloads && i.examplePayloads.length), 'payloads present');
});

S.test('invalidateToolkitData forces the next call to refetch', async () => {
  const w = await app();
  await w.$fn('ensureToolkitData')();
  w.$fn('invalidateToolkitData')();
  await w.$fn('ensureToolkitData')();
  eq(w.__fetchLog.filter(u => u === 'data/toolkit.json').length, 2, 'refetch count');
});

/* ---------- primers ---------- */
S.test('preparePrimerHtml wraps tables in a scrollable, focusable region', async () => {
  const w = await app();
  const out = w.$fn('preparePrimerHtml')(
    '<table class="primer-table"><tr><th>Col</th></tr><tr><td>x</td></tr></table>', 'NET');
  includes(out, 'primer-table-wrap', 'wrapper class');
  includes(out, 'tabindex="0"', 'keyboard-scrollable');
  includes(out, 'role="region"', 'region role');
});

/* ---------- scan ingestion ---------- */
S.test('parseScanOutput extracts host/port findings from nmap-style text', async () => {
  const w = await app();
  const findings = w.$fn('parseScanOutput')(
    'Nmap scan report for 10.0.0.5\n445/tcp open  microsoft-ds\n512/tcp open  exec\n');
  ok(findings.length >= 2, `expected >=2 findings, got ${findings.length}`);
  ok(findings.some(f => String(f.port) === '445'), 'port 445 parsed');
  ok(findings.some(f => String(f.port) === '512'), 'port 512 parsed');
});

S.test('port 512 maps to r-services, not to a case count', async () => {
  const w = await app();
  const map = w.$('PORT_KEYWORDS');
  eq(map[512], ['r-services'], 'PORT_KEYWORDS[512]');
  eq(map[513], ['r-services'], 'PORT_KEYWORDS[513]');
});

S.test('matchFindingToCases returns relevant cases for an SMB finding', async () => {
  const w = await app();
  const matches = w.$fn('matchFindingToCases')(
    { host:'10.0.0.5', port:445, service:'microsoft-ds' }, w.$('allData'), 5);
  ok(matches.length > 0, 'at least one match');
  ok(matches.length <= 5, 'respects limit');
});

/* ---------- custom cases + chains ---------- */
S.test('addCustomCase creates a normalised, persisted case', async () => {
  const w = await app();
  const before = w.$('allData').length;
  const created = w.$fn('addCustomCase')({
    domain:'WEB', title:'  Custom check  ', severity:'high', cwe:'CWE-79',
    prerequisites:'', whatItIs:'A custom check.', rootCause:'', impact:'',
    stepsToIdentify:'step one\nstep two', exploitationSteps:'exploit one',
    mitigation:'fix it',
  });
  eq(created.title, 'Custom check', 'title trimmed');
  eq(created.stepsToIdentify.length, 2, 'newline-split steps');
  eq(created.prerequisites, 'Not specified.', 'empty optional field defaulted');
  ok(created && created.id, 'returns created case with id');
  eq(w.$('allData').length, before + 1, 'added to allData');
  eq(w.$fn('loadCustomCases')().length, 1, 'persisted');
  const removed = w.$fn('removeCustomCase')(created.id);
  ok(removed !== false, 'removal reported');
  eq(w.$fn('loadCustomCases')().length, 0, 'persisted removal');
});

S.test('addChain links two cases and rejects an exact duplicate', async () => {
  const w = await app();
  w.$fn('addChain')('NET-001', 'WEB-001', 'pivot');
  const afterFirst = w.$fn('loadChains')().length;
  eq(afterFirst, 1, 'first chain stored');
  w.$fn('addChain')('NET-001', 'WEB-001', 'pivot again');
  eq(w.$fn('loadChains')().length, 1, 'duplicate from>to rejected');
  w.$fn('addChain')('WEB-001', 'API-001', 'next hop');
  eq(w.$fn('loadChains')().length, 2, 'distinct chain accepted');
  const seqs = w.$fn('buildChainSequences')();
  ok(seqs.length > 0, 'sequences built');
  eq(seqs.length, 1, 'both edges fold into one sequence');
  eq(seqs[0].map(e => e.fromId + '>' + e.toId),
     ['NET-001>WEB-001','WEB-001>API-001'], 'walk order');
});

S.test('remediation model normalises unknown values and gates unsupported statuses', async () => {
  const w = await app();
  const keys = w.$('REMEDIATION_VALUES').map(r => r.key);
  ok(keys.includes('open') && keys.includes('fixed'), 'expected remediation keys');
  eq(w.$fn('normalizeRemediation')({state:'not-a-real-state'}).state, 'open', 'unknown state falls back');
  eq(w.$fn('normalizeRemediation')(null).state, 'open', 'null falls back to open');
  eq(w.$fn('normalizeRemediation')({state:'fixed', note:'patched'}).note, 'patched', 'note preserved');
  eq(w.$fn('getRemediationObj')('nope').key, 'open', 'unknown key falls back to first');
  notOk(w.$fn('supportsRemediation')({ status:'not-tested' }), 'untested case has no remediation');
  ok(w.$fn('supportsRemediation')({ status:'tested-fail' }), 'failed case supports remediation');
});

S.test('ensureAllDetail reports progress from 0 to every domain', async () => {
  const w = await app();
  const seen = [];
  await w.$fn('ensureAllDetail')((done, total) => seen.push([done, total]));
  eq(seen[0], [0, 10], 'reports before any fetch resolves');
  eq(seen[seen.length - 1], [10, 10], 'reports completion');
  eq(seen.length, 11, 'one report per domain plus the initial one');
  ok(seen.every(([d, t]) => t === 10 && d <= 10), 'counts stay in range');
});

S.test('ensureAllDetail still works with no progress callback', async () => {
  const w = await app();
  await w.$fn('ensureAllDetail')();
  eq(w.$('allData.filter(d=>!hasDetail(d)).length'), 0, 'every case has detail');
});

S.test('every global sequence number is unique and contiguous', async () => {
  const w = await app();
  const seqs = w.$('allData.map(d=>d.sequence)').slice().sort((a, b) => a - b);
  eq(seqs.length, 577, 'one per case');
  eq(new Set(seqs).size, seqs.length, 'no duplicate "#" badges');
  eq(seqs[0], 1, 'starts at 1');
  eq(seqs[seqs.length - 1], seqs.length, 'and runs unbroken to the end');
});

S.test('sequences follow the domain order the sidebar shows', async () => {
  const w = await app();
  const order = w.$('CATEGORIES.map(c=>c.code)');
  let last = 0;
  order.forEach(code => {
    const block = w.$(`allData.filter(d=>d.domain===${JSON.stringify(code)}).map(d=>d.sequence)`);
    const lo = Math.min(...block), hi = Math.max(...block);
    ok(lo === last + 1, `${code} starts at ${last + 1}, got ${lo}`);
    ok(hi - lo + 1 === block.length, `${code} occupies one contiguous block`);
    last = hi;
  });
});

S.test('case ids are per-domain ordinals, not global numbers', async () => {
  const w = await app();
  const offenders = [];
  w.$('CATEGORIES.map(c=>c.code)').forEach(code => {
    const ids = w.$(`allData.filter(d=>d.domain===${JSON.stringify(code)}).map(d=>d.id)`);
    ids.forEach(id => {
      const n = parseInt(id.split('-').pop(), 10);
      // WEB carries historical gaps in its original numbering; what must
      // never happen again is an id far outside its domain's own range.
      if (n > ids.length + 10) offenders.push(id);
    });
  });
  eq(offenders, [], 'ids taken from the global sequence instead of the domain');
});

S.test('every case is numbered from 1 within its own domain', async () => {
  const w = await app();
  w.$('CATEGORIES.map(c=>c.code)').forEach(code => {
    const idx = w.$(`allData.filter(d=>d.domain===${JSON.stringify(code)}).map(d=>d.domainIndex)`)
      .slice().sort((a, b) => a - b);
    eq(idx[0], 1, `${code} starts at 1`);
    eq(idx[idx.length - 1], idx.length, `${code} runs unbroken to ${idx.length}`);
    eq(new Set(idx).size, idx.length, `${code} has no duplicate numbers`);
  });
});

S.test('the row badge shows the per-domain number, not the global one', () => {
  const src = read('js/rendering.js');
  includes(src, 'order-badge', 'badge present');
  const badge = src.slice(src.indexOf('order-badge'), src.indexOf('order-badge') + 200);
  includes(badge, 'item.domainIndex', 'badge must use the per-domain index');
  excludes(badge, 'item.sequence', '#401 tells an analyst nothing about where they are');
});

S.test('a custom case joins its domain\'s numbering instead of breaking it', async () => {
  const w = await app();
  const before = w.$("allData.filter(d=>d.domain==='WIFI')");
  const maxIdx = Math.max(...before.map(d => d.domainIndex));
  const created = w.$fn('addCustomCase')({
    domain:'WIFI', title:'Numbering probe', severity:'high', cwe:'CWE-1',
    prerequisites:'', whatItIs:'x', rootCause:'', impact:'',
    stepsToIdentify:'a', exploitationSteps:'b', mitigation:'c',
  });
  // Built at runtime, so it never passes through build-data.py — without an
  // explicit domainIndex the row badge rendered "#undefined".
  eq(created.domainIndex, maxIdx + 1, 'takes the next number in its domain');
  ok(Number.isFinite(created.sequence), 'has an orderable sequence');
  w.$fn('removeCustomCase')(created.id);
});

S.test('a custom case sequence cannot collide with the next domain', async () => {
  const w = await app();
  const created = w.$fn('addCustomCase')({
    domain:'NET', title:'Collision probe', severity:'low', cwe:'CWE-1',
    prerequisites:'', whatItIs:'x', rootCause:'', impact:'',
    stepsToIdentify:'a', exploitationSteps:'b', mitigation:'c',
  });
  // Every domain owns a contiguous integer block, so maxSeq + 1 would land
  // on the first case of the following domain and scramble Testing Order.
  const clashes = w.$(`allData.filter(d=>d.sequence===${created.sequence}).length`);
  eq(clashes, 1, 'sequence is unique');
  const netMax = Math.max(...w.$("allData.filter(d=>d.domain==='NET' && !d.custom).map(d=>d.sequence)"));
  const nextDomainMin = Math.min(...w.$("allData.filter(d=>d.domain==='WEB').map(d=>d.sequence)"));
  ok(created.sequence > netMax && created.sequence < nextDomainMin,
     `sequence ${created.sequence} must sit between ${netMax} and ${nextDomainMin}`);
  w.$fn('removeCustomCase')(created.id);
});

S.test('the dead phase field is gone from the dataset', async () => {
  const w = await app();
  eq(w.$("allData.filter(d=>'phase' in d).length"), 0,
     'phase duplicated sequence and was read by nothing');
});

/* ---------- standards categorisation ---------- */
S.test('every case carries a category from a named standard', async () => {
  const w = await app();
  const bad = w.$("allData.filter(d=>!d.categoryCode||!d.categoryName||!d.categoryStandard).map(d=>d.id)");
  eq(bad, [], 'cases missing a category');
});

S.test('each domain uses one standard, and cases only use its categories', async () => {
  const w = await app();
  const idx = w.$('categoryIndex');
  Object.keys(idx).forEach(domain => {
    const codes = new Set(idx[domain].categories.map(c => c.code));
    const items = w.$(`allData.filter(d=>d.domain===${JSON.stringify(domain)})`);
    items.forEach(d => {
      ok(codes.has(d.categoryCode),
         `${d.id} is ${d.categoryCode}, which is not in ${domain}'s taxonomy`);
      eq(d.categoryStandard, idx[domain].standard, `${d.id} standard`);
    });
  });
});

S.test('the taxonomy counts reconcile with the cases', async () => {
  const w = await app();
  const idx = w.$('categoryIndex');
  Object.keys(idx).forEach(domain => {
    const summed = idx[domain].categories.reduce((n, c) => n + c.count, 0);
    const actual = w.$(`allData.filter(d=>d.domain===${JSON.stringify(domain)} && !d.custom).length`);
    eq(summed, actual, `${domain} taxonomy total`);
  });
});

S.test('the OWASP lists are complete, empty categories included', async () => {
  const w = await app();
  const idx = w.$('categoryIndex');
  // A reader glancing at the web chooser should see that OWASP has a Supply
  // Chain category even when this corpus has nothing filed under it.
  eq(idx.WEB.categories.length, 10, 'OWASP Top 10:2025 has ten categories');
  eq(idx.API.categories.length, 10, 'OWASP API Top 10:2023 has ten');
  eq(idx.MOBILE.categories.length, 10, 'OWASP Mobile Top 10:2024 has ten');
  eq(idx.LLM.categories.length, 10, 'OWASP LLM Top 10:2025 has ten');
  ok(idx.WEB.categories.some(c => c.count === 0), 'an empty category is still listed');
});

S.test('standards are named by their published edition', async () => {
  const w = await app();
  const idx = w.$('categoryIndex');
  eq(idx.WEB.standard, 'OWASP Top 10:2025', 'web');
  eq(idx.API.standard, 'OWASP API Security Top 10:2023', 'api');
  eq(idx.MOBILE.standard, 'OWASP Mobile Top 10:2024', 'mobile');
  eq(idx.NET.standard, 'NIST SP 800-53 Rev. 5', 'network');
});

S.test('landmark findings land in the category the standard puts them in', async () => {
  const w = await app();
  const catOf = id => w.$(`(allData.find(d=>d.id===${JSON.stringify(id)})||{}).categoryCode`);
  // SSRF was absorbed into Broken Access Control in the 2025 edition.
  eq(catOf('WEB-082'), 'A01', 'SSRF is A01 in 2025, not its own category');
  eq(catOf('WEB-085'), 'A01', 'IDOR is Broken Access Control');
  eq(catOf('WEB-081'), 'A05', 'SQL injection is Injection');
  eq(catOf('WEB-084'), 'A05', 'XSS is Injection');
  eq(catOf('WEB-089'), 'A08', 'deserialization is Integrity Failures');
  // The API list keeps SSRF as its own category, so it must not be folded
  // into object-level authorization there.
  eq(catOf('API-031'), 'API7', 'SSRF has its own category in the API list');
});

/* ---- Mitigation split ------------------------------------------------
   Remediation is delivered twice: technical bullets for the engineer who
   applies the fix, and a plain-language paragraph an assessor can lift
   into a client report. The custom-case path has drifted from the
   generated one twice before, so both are asserted here. */

S.test('client-facing mitigation is optional on a custom case', async () => {
  const w = await app();
  const created = w.$fn('addCustomCase')({
    domain:'WEB', title:'No client copy', severity:'low', cwe:'CWE-1',
    prerequisites:'', whatItIs:'x', rootCause:'', impact:'',
    stepsToIdentify:'a', exploitationSteps:'b', mitigation:'c',
  });
  // Omitted entirely by the caller — must not become undefined, because the
  // render guard is a truthiness check and the report export reads it too.
  eq(created.mitigationClientFacing, '', 'defaults to an empty string');
  w.$fn('removeCustomCase')(created.id);
});

S.test('client-facing mitigation is kept when a custom case supplies it', async () => {
  const w = await app();
  const created = w.$fn('addCustomCase')({
    domain:'WEB', title:'With client copy', severity:'low', cwe:'CWE-1',
    prerequisites:'', whatItIs:'x', rootCause:'', impact:'',
    stepsToIdentify:'a', exploitationSteps:'b', mitigation:'c',
    mitigationClientFacing: '  Plain language for the client.  ',
  });
  eq(created.mitigationClientFacing, 'Plain language for the client.', 'trimmed and stored');
  w.$fn('removeCustomCase')(created.id);
});

S.test('a generated case renders both mitigation sections', async () => {
  const w = await app();
  await w.$fn('ensureDetail')('LLM');
  const item = w.$("allData.find(d=>d.id==='LLM-001')");
  ok(Array.isArray(item.mitigation) && item.mitigation.length, 'technical bullets present');
  ok((item.mitigationClientFacing||'').length > 200, 'client paragraph is substantive, not a stub');
  const html = w.$fn('renderDetailInner')(item);
  ok(html.includes('Mitigation — technical fix'), 'technical section is labelled');
  ok(html.includes('Mitigation — client-facing explanation'), 'client section is labelled');
});

/* ---- Secondary framework mappings -----------------------------------
   Field 7 (Industry Mapping) carries CWE + primary category + ATT&CK plus
   the secondary framework mappings the scope may be reported against.
   Assigned by tools/map-frameworks.py for the corpus; the runtime custom
   path must carry the field too, or the detail grid renders undefined. */

S.test('a generated case carries validated secondary framework mappings', async () => {
  const w = await app();
  await w.$fn('ensureDetail')('WEB');
  const item = w.$("allData.find(d=>d.id==='WEB-045')");
  ok(Array.isArray(item.frameworks) && item.frameworks.length >= 2,
     'IDOR carries at least WSTG + ASVS');
  item.frameworks.forEach(f => {
    ok(f.standard && f.code && f.name, 'each mapping has standard, code and name');
  });
  // IDOR is an authorization failure, not business logic — regression guard on
  // the duplicate-key precedence bug that once sent CWE-639 to WSTG-BUSL.
  const codes = item.frameworks.map(f => f.code);
  ok(codes.includes('WSTG-ATHZ'), 'IDOR maps to WSTG Authorization');
  ok(codes.includes('V8'), 'IDOR maps to ASVS V8 Authorization');
});

S.test('a generated case renders its framework mappings in the detail pane', async () => {
  const w = await app();
  await w.$fn('ensureDetail')('CLOUD');
  const item = w.$("allData.find(d=>d.id==='CLOUD-031')");
  const html = w.$fn('renderDetailInner')(item);
  ok(html.includes('Additional framework mappings'), 'section is labelled');
  ok(html.includes('fw-chip'), 'mappings render as chips');
  ok(html.includes(item.frameworks[0].code), 'a real code appears in the markup');
});

S.test('a custom case carries an empty frameworks list, not undefined', async () => {
  const w = await app();
  const created = w.$fn('addCustomCase')({
    domain:'WEB', title:'FW parity probe', severity:'low', cwe:'CWE-1',
    prerequisites:'', whatItIs:'x', rootCause:'', impact:'',
    stepsToIdentify:'a', exploitationSteps:'b', mitigation:'c',
  });
  eq(Array.isArray(created.frameworks), true, 'frameworks is an array');
  eq(created.frameworks.length, 0, 'and empty by default');
  // The detail grid guards on length, so an empty list must render, not throw.
  const html = w.$fn('renderDetailInner')(created);
  ok(html.includes('Additional framework mappings'), 'section still renders');
  w.$fn('removeCustomCase')(created.id);
});

module.exports = S;
