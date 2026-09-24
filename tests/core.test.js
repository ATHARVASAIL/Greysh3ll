/* core.test.js — 15 tests
   Data loading, lazy detail merge, toolkit bundle, primer table wrapping,
   scan ingestion, custom cases, chains, remediation model. */
const { boot, Suite, eq, ok, notOk, includes } = require('./harness');

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

module.exports = S;
