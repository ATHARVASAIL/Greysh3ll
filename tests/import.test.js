/* import.test.js — 21 tests
   Import used to accept anything that parsed as JSON and overwrite the live
   engagement with no confirmation. These tests pin both halves of the fix:
   junk is rejected with a reason, and a good file is described before it is
   allowed to replace anything. */
const { boot, Suite, eq, ok, notOk, includes } = require('./harness');

const S = Suite('import');
const SCRIPTS = ['storage.js','filters.js','core.js'];

async function app(){
  const w = boot({ scripts: SCRIPTS });
  await w.$fn('loadAllData')();
  return w;
}
const validate = (w, payload) => w.$fn('validateProgressPayload')(payload);

function goodPayload(){
  return {
    statuses: { 'NET-001':'tested-pass', 'WEB-001':'tested-fail' },
    notes: { 'NET-001':'{"findings":"open port"}' },
    flagged: ['WEB-001'],
    customCases: [],
    chains: [],
    tester: 'Atharva Sail',
    exportedAt: '2026-09-20T10:00:00.000Z',
  };
}

/* ---------- shape rejection ---------- */
S.test('null is rejected as not a progress export', async () => {
  const w = await app();
  const r = validate(w, null);
  notOk(r.ok, 'rejected'); eq(r.summary, null, 'no summary');
  includes(r.errors[0], 'does not contain a GreySh3ll progress export', 'reason given');
});

S.test('an array is rejected', async () => {
  const w = await app();
  notOk(validate(w, [1,2,3]).ok, 'array rejected');
});

S.test('a string is rejected', async () => {
  const w = await app();
  notOk(validate(w, 'progress').ok, 'string rejected');
});

S.test('a number and a boolean are rejected', async () => {
  const w = await app();
  notOk(validate(w, 42).ok, 'number rejected');
  notOk(validate(w, true).ok, 'boolean rejected');
});

S.test('an empty object is rejected — no expected fields present', async () => {
  const w = await app();
  const r = validate(w, {});
  notOk(r.ok, 'rejected');
  includes(r.errors[0], 'not a GreySh3ll progress export', 'reason names the mismatch');
});

S.test('unrelated but valid JSON is rejected, not half-applied', async () => {
  const w = await app();
  const r = validate(w, { name:'package', version:'1.0.0', dependencies:{} });
  notOk(r.ok, 'rejected');
  eq(r.summary, null, 'nothing summarised');
});

/* ---------- field-level malformation ---------- */
S.test('a non-object "statuses" is reported as malformed', async () => {
  const w = await app();
  const r = validate(w, { statuses: ['NET-001'] });
  notOk(r.ok, 'rejected');
  ok(r.errors.some(e => e.includes('"statuses" is malformed')), 'names the field');
});

S.test('a non-object "notes" is reported as malformed', async () => {
  const w = await app();
  const r = validate(w, { statuses:{}, notes:'some notes' });
  ok(r.errors.some(e => e.includes('"notes" is malformed')), 'names the field');
});

S.test('a non-array "flagged" is reported as malformed', async () => {
  const w = await app();
  const r = validate(w, { statuses:{}, flagged:{ 'NET-001':true } });
  ok(r.errors.some(e => e.includes('"flagged" is malformed')), 'names the field');
});

S.test('non-array customCases and chains are both reported', async () => {
  const w = await app();
  const r = validate(w, { statuses:{}, customCases:{}, chains:'none' });
  ok(r.errors.some(e => e.includes('"customCases" is malformed')), 'customCases');
  ok(r.errors.some(e => e.includes('"chains" is malformed')), 'chains');
});

S.test('several malformed fields are all reported, not just the first', async () => {
  const w = await app();
  const r = validate(w, { statuses:[], notes:[], flagged:{}, chains:{} });
  ok(r.errors.length >= 4, `expected >=4 errors, got ${r.errors.length}`);
});

/* ---------- status values ---------- */
S.test('an unrecognised status value is rejected with a count', async () => {
  const w = await app();
  const r = validate(w, { statuses:{ 'NET-001':'totally-owned', 'WEB-001':'pwned' } });
  notOk(r.ok, 'rejected');
  ok(r.errors.some(e => e.includes('2 test case(s)')), 'counts the bad entries');
});

S.test('every documented status value is accepted', async () => {
  const w = await app();
  const statuses = {};
  w.$('STATUS_VALUES').forEach((s, i) => { statuses['NET-00' + (i+1)] = s.key; });
  ok(validate(w, { statuses }).ok, 'all STATUS_VALUES accepted');
});

/* ---------- summary accuracy ---------- */
S.test('a well-formed export is accepted', async () => {
  const w = await app();
  const r = validate(w, goodPayload());
  ok(r.ok, `expected ok, errors: ${JSON.stringify(r.errors)}`);
});

S.test('the summary counts statuses, notes and flags for the confirm dialog', async () => {
  const w = await app();
  const s = validate(w, goodPayload()).summary;
  eq(s.statuses, 2, 'statuses'); eq(s.notes, 1, 'notes'); eq(s.flagged, 1, 'flagged');
});

S.test('the summary carries tester and export date through', async () => {
  const w = await app();
  const s = validate(w, goodPayload()).summary;
  eq(s.tester, 'Atharva Sail', 'tester');
  eq(s.exportedAt, '2026-09-20T10:00:00.000Z', 'exportedAt');
});

S.test('a non-string tester or date is normalised away rather than shown raw', async () => {
  const w = await app();
  const p = Object.assign(goodPayload(), { tester: { name:'x' }, exportedAt: 12345 });
  const s = validate(w, p).summary;
  eq(s.tester, '', 'tester blanked'); eq(s.exportedAt, '', 'date blanked');
});

S.test('entries for cases that no longer exist are counted as unmatched', async () => {
  const w = await app();
  const p = goodPayload();
  p.statuses['NET-9001'] = 'tested-pass';
  p.statuses['GONE-001'] = 'tested-pass';
  const r = validate(w, p);
  ok(r.ok, 'an older dataset still imports');
  eq(r.summary.unmatched, 2, 'unmatched count surfaced to the user');
});

S.test('a status recorded against an imported custom case is not counted unmatched', async () => {
  const w = await app();
  const p = goodPayload();
  p.customCases = [{ id:'WEB-C001', domain:'WEB', title:'Custom', severity:'high' }];
  p.statuses['WEB-C001'] = 'tested-fail';
  const r = validate(w, p);
  eq(r.summary.customCases, 1, 'custom case counted');
  eq(r.summary.unmatched, 0, 'custom id resolves');
});

S.test('customCases entries without an id are not counted', async () => {
  const w = await app();
  const p = goodPayload();
  p.customCases = [{ domain:'WEB', title:'No id' }, null, { id:'WEB-C002' }];
  eq(validate(w, p).summary.customCases, 1, 'only the entry with an id counts');
});

/* ---------- application ---------- */
S.test('applyProgress restores statuses, flags and parsed notes', async () => {
  const w = await app();
  w.$fn('applyProgress')(goodPayload());
  const net = w.$("allData.find(d=>d.id==='NET-001')");
  const web = w.$("allData.find(d=>d.id==='WEB-001')");
  eq(net.status, 'tested-pass', 'status applied');
  eq(net.assessorNotes.findings, 'open port', 'JSON note parsed');
  eq(web.flagged, true, 'flag applied');
});

module.exports = S;
