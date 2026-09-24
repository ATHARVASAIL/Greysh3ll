/* logic.test.js — 20 tests
   Correctness rather than absence-of-crash: the numbers the console reports
   to an analyst have to be right, because they end up in a client report. */
const { boot, Suite, eq, ok, notOk, includes, excludes } = require('./harness');

const S = Suite('logic');
const SCRIPTS = ['storage.js','filters.js','core.js','dashboard.js','primers.js',
                 'rendering.js','interactions.js','assessment.js','features.js','toolkit.js'];

async function app(){
  const w = boot({ scripts: SCRIPTS });
  await w.$fn('loadAllData')();
  w.__eval("allData.forEach(d=>{d.status='not-tested'; d.flagged=false; d.assessorNotes.remediation={state:'open',retestedAt:'',note:''};});");
  w.__eval("state.search=''; state.status='all'; state.activeDomain=null; state.activeSevs.clear();");
  return w;
}
const count = (w) => w.$('allData.filter(matchesFilters).length');

/* ---------- CVSS against published base scores ---------- */
const VECTORS = [
  ['AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H', 9.8],
  ['AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H', 10.0],
  ['AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H', 7.5],
  ['AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N', 4.3],
  ['AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H', 7.8],
  ['AV:N/AC:H/PR:N/UI:R/S:C/C:L/I:L/A:N', 4.7],
  ['AV:L/AC:H/PR:H/UI:R/S:U/C:L/I:L/A:L', 3.8],
  ['AV:P/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', 4.6],
  ['AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N', 6.1],
  ['AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H', 9.1],
  ['AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N', 6.2],
];

S.test('CVSS base scores match the published values for 11 vectors', async () => {
  const w = await app();
  VECTORS.forEach(([vec, expected]) => {
    const sel = Object.fromEntries(vec.split('/').map(p => p.split(':')));
    const got = w.$fn('computeCvssScore')(sel);
    if(Math.abs(got - expected) > 0.05)
      throw new Error(`${vec}: expected ${expected}, got ${got}`);
  });
});

S.test('a vector with no impact scores zero', async () => {
  const w = await app();
  const sel = Object.fromEntries('AV:A/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N'.split('/').map(p => p.split(':')));
  eq(w.$fn('computeCvssScore')(sel), 0, 'no-impact score');
});

S.test('CVSS severity bands follow the 3.1 boundaries', async () => {
  const w = await app();
  [[0,'None'],[0.1,'Low'],[3.9,'Low'],[4.0,'Medium'],[6.9,'Medium'],
   [7.0,'High'],[8.9,'High'],[9.0,'Critical'],[10,'Critical']]
    .forEach(([score, band]) => eq(w.$fn('cvssSeverityLabel')(score), band, `score ${score}`));
});

/* ---------- coverage ---------- */
S.test('coverage is 0% before anything is tested', async () => {
  const w = await app();
  const cov = w.$fn('computeCoverage')();
  eq(cov.overallPct, 0, 'pct'); eq(cov.applicable, 577, 'applicable');
});

S.test('coverage reaches 100% when every case is tested', async () => {
  const w = await app();
  w.__eval("allData.forEach(d=>d.status='tested-pass');");
  eq(w.$fn('computeCoverage')().overallPct, 100, 'pct');
});

S.test('cases marked N/A leave the denominator instead of counting as tested', async () => {
  const w = await app();
  w.__eval("allData.slice(0,24).forEach(d=>d.status='not-applicable');");
  const cov = w.$fn('computeCoverage')();
  eq(cov.applicable, 553, 'applicable excludes N/A');
  eq(cov.overallPct, 0, 'N/A must not inflate coverage');
});

S.test('per-domain coverage sums back to the overall tested count', async () => {
  const w = await app();
  w.__eval("allData.filter(d=>d.domain==='WIFI').forEach(d=>d.status='tested-pass');");
  const cov = w.$fn('computeCoverage')();
  const summed = cov.perDomain.reduce((n, d) => n + d.tested, 0);
  eq(summed, cov.tested, 'per-domain tested vs overall');
  eq(cov.perDomain.find(d => d.code === 'WIFI').pct, 100, 'WIFI fully covered');
});

/* ---------- risk ---------- */
S.test('risk is empty with no confirmed findings', async () => {
  const w = await app();
  const r = w.$fn('computeRisk')();
  eq(r.failed, 0, 'failed'); eq(r.open, 0, 'open'); eq(r.score, 0, 'score');
});

S.test('confirmed findings raise the score and are counted by severity', async () => {
  const w = await app();
  w.__eval("allData.filter(d=>d.severity==='critical').slice(0,3).forEach(d=>d.status='tested-fail');");
  const r = w.$fn('computeRisk')();
  eq(r.failed, 3, 'failed'); eq(r.open, 3, 'open'); eq(r.bySev.critical, 3, 'bySev');
  ok(r.score > 0, 'score raised');
});

S.test('a verified fix reduces the score but not the findings total', async () => {
  const w = await app();
  w.__eval("allData.filter(d=>d.severity==='critical').slice(0,3).forEach(d=>d.status='tested-fail');");
  const before = w.$fn('computeRisk')().score;
  w.__eval("allData.filter(d=>d.status==='tested-fail').forEach(d=>{d.assessorNotes.remediation={state:'fixed'};});");
  const after = w.$fn('computeRisk')();
  ok(after.score < before, `score ${after.score} should be below ${before}`);
  eq(after.open, 0, 'no open findings left');
  eq(after.failed, 3, 'confirmed total is unchanged — the findings still happened');
});

S.test('a formally accepted risk is discounted the same way a fix is', async () => {
  const w = await app();
  w.__eval("allData.filter(d=>d.severity==='high').slice(0,2).forEach(d=>d.status='tested-fail');");
  w.__eval("allData.filter(d=>d.status==='tested-fail').forEach(d=>{d.assessorNotes.remediation={state:'risk-accepted'};});");
  const r = w.$fn('computeRisk')();
  eq(r.open, 0, 'open'); eq(r.score, 0, 'score discounted');
});

S.test('the risk band follows the score thresholds and is a known value', async () => {
  const w = await app();
  const bands = new Set(['Low','Medium','High','Critical']);
  eq(w.$fn('computeRisk')().band, 'Low', 'no findings is Low');
  w.__eval("allData.filter(d=>d.severity==='critical').forEach(d=>d.status='tested-fail');");
  const r = w.$fn('computeRisk')();
  ok(bands.has(r.band), 'band is one of the known values: ' + r.band);
  eq(r.band, 'Critical', 'every critical case failing is a Critical band');
});

/* ---------- filters ---------- */
S.test('with no filters every case matches', async () => {
  const w = await app();
  eq(count(w), 577, 'unfiltered');
});

S.test('the domain filter narrows to that domain only', async () => {
  const w = await app();
  w.__eval("state.activeDomain='WIFI';");
  eq(count(w), 33, 'WIFI');
  w.__eval("state.activeDomain='LLM';");
  eq(count(w), 24, 'LLM');
});

S.test('the severity filter matches the underlying severity counts', async () => {
  const w = await app();
  w.__eval("state.activeSevs.add('critical');");
  eq(count(w), w.$("allData.filter(d=>d.severity==='critical').length"), 'critical');
});

S.test('each status chip selects what its label promises', async () => {
  const w = await app();
  w.__eval("state.status='done';");
  eq(count(w), 0, 'nothing passed yet');
  w.__eval("allData.slice(0,5).forEach(d=>d.status='tested-pass');");
  eq(count(w), 5, 'done = passed');
  w.__eval("state.status='open';");
  eq(count(w), 572, 'open excludes resolved and N/A');
  w.__eval("allData.slice(5,7).forEach(d=>d.flagged=true); state.status='flagged';");
  eq(count(w), 2, 'flagged');
});

S.test('search matches id, CWE and title, and misses cleanly', async () => {
  const w = await app();
  w.__eval("state.search='NET-001';");
  eq(count(w), 1, 'by id');
  w.__eval("state.search='CWE-79';");
  ok(count(w) > 0, 'by CWE');
  w.__eval("state.search='zzzznotathing';");
  eq(count(w), 0, 'no false positives');
});

/* ---------- sort ---------- */
S.test('severity sort orders critical first and keeps every item', async () => {
  const w = await app();
  const items = w.$("allData.filter(d=>d.domain==='API')");
  const sorted = w.$fn('sortItems')(items, 'severity');
  const rank = { critical:0, high:1, medium:2, low:3, info:4 };
  sorted.forEach((it, i) => {
    if(i && rank[sorted[i-1].severity] > rank[it.severity])
      throw new Error(`out of order at ${i}: ${sorted[i-1].id} before ${it.id}`);
  });
  eq(sorted.length, items.length, 'no items lost');
});

S.test('every sort mode returns the same set of items', async () => {
  const w = await app();
  const items = w.$("allData.filter(d=>d.domain==='CLOUD')");
  const baseline = items.map(i => i.id).sort().join(',');
  ['default','severity','az','unchecked'].forEach(mode => {
    const out = w.$fn('sortItems')(items.slice(), mode);
    eq(out.map(i => i.id).sort().join(','), baseline, `mode ${mode}`);
  });
});

/* ---------- report ---------- */
S.test('the report contains confirmed findings and excludes untested cases', async () => {
  const w = await app();
  w.__eval("allData.find(d=>d.id==='API-001').status='tested-fail';");
  await w.$fn('ensureAllDetail')();
  const text = w.$fn('buildReportText')();
  includes(text, 'API-001', 'confirmed finding present');
  excludes(text, 'API-002', 'untested case absent');
  const html = w.$fn('buildReportHTML')();
  ok(html.length > 500, 'report HTML is substantive');
  includes(html, 'API-001', 'finding present in HTML report');
});

module.exports = S;
