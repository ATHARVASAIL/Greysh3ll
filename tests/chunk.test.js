/* chunk.test.js — 18 tests
   Chunked section rendering. The failure mode these guard against is silent:
   a row that was never built looks identical to a row that does not exist, so
   "jump to case" just does nothing and reads as a broken feature. */
const { boot, Suite, eq, ok, notOk } = require('./harness');

const S = Suite('chunk');
const SCRIPTS = ['storage.js','filters.js','core.js','dashboard.js','primers.js','rendering.js','interactions.js'];

async function app(opts){
  const w = boot(Object.assign({ scripts: SCRIPTS }, opts || {}));
  await w.$fn('loadAllData')();
  return w;
}
/* Mirror boot(): every section starts collapsed. */
async function booted(opts){
  const w = await app(opts);
  w.__eval('CATEGORIES.forEach(c=>state.collapsed.add(c.code));');
  w.$fn('renderResults')();
  return w;
}
const sec = (w, code) => w.document.querySelector(`.cat-section[data-cat="${code}"]`);
const rows = (el) => el.querySelectorAll('.test-item').length;

/* ---------- constants ---------- */
S.test('CATEGORY_CHUNK_SIZE is 30', async () => {
  const w = await app();
  eq(w.$('CATEGORY_CHUNK_SIZE'), 30, 'chunk size');
});

S.test('the two large domains are genuinely larger than one chunk', async () => {
  const w = await app();
  const n = c => w.$(`allData.filter(d=>d.domain==='${c}').length`);
  ok(n('NET') > 30 && n('WEB') > 30, 'NET and WEB exceed the chunk size');
  ok(n('LLM') <= 30, 'LLM fits in one chunk');
});

/* ---------- collapsed default ---------- */
S.test('a collapsed boot builds zero item rows', async () => {
  const w = await booted();
  eq(w.document.querySelectorAll('.test-item').length, 0, 'rows at boot');
});

S.test('collapsed sections are marked unrendered so the body is built lazily', async () => {
  const w = await booted();
  eq(sec(w,'NET').querySelector('.cat-body-inner').dataset.rendered, '0', 'rendered flag');
});

/* ---------- first chunk ---------- */
S.test('expanding a large section renders exactly one chunk', async () => {
  const w = await booted();
  w.$fn('ensureCategoryBodyRendered')(sec(w,'NET'));
  eq(rows(sec(w,'NET')), 30, 'first-pass rows');
});

S.test('expanding a large section installs a sentinel and the domain primer', async () => {
  const w = await booted();
  const s = sec(w,'NET');
  w.$fn('ensureCategoryBodyRendered')(s);
  ok(s.querySelector('.cat-chunk-sentinel'), 'sentinel present');
  ok(s.querySelector('.domain-primer, .primer, .cat-primer'), 'primer rendered');
});

S.test('a small section renders fully with no sentinel machinery', async () => {
  const w = await booted();
  const s = sec(w,'LLM');
  w.$fn('ensureCategoryBodyRendered')(s);
  eq(rows(s), 24, 'all LLM rows');
  notOk(s.querySelector('.cat-chunk-sentinel'), 'no sentinel for a small section');
});

S.test('re-entering ensureCategoryBodyRendered is a no-op, not a double render', async () => {
  const w = await booted();
  const s = sec(w,'NET');
  w.$fn('ensureCategoryBodyRendered')(s);
  w.$fn('ensureCategoryBodyRendered')(s);
  w.$fn('ensureCategoryBodyRendered')(s);
  eq(rows(s), 30, 'still one chunk');
});

/* ---------- incremental chunking ---------- */
S.test('each sentinel intersection appends exactly one more chunk', async () => {
  const w = await booted();
  const s = sec(w,'NET');
  w.$fn('ensureCategoryBodyRendered')(s);
  const io = w.__ios[w.__ios.length - 1];
  io.trigger(); eq(rows(s), 60, 'after 1 trigger');
  io.trigger(); eq(rows(s), 90, 'after 2 triggers');
});

S.test('chunking covers every row with none skipped or duplicated', async () => {
  const w = await booted();
  const s = sec(w,'NET');
  w.$fn('ensureCategoryBodyRendered')(s);
  const io = w.__ios[w.__ios.length - 1];
  for(let i = 0; i < 10; i++) io.trigger();
  const ids = Array.from(s.querySelectorAll('.test-item')).map(e => e.getAttribute('data-id'));
  eq(ids.length, 150, 'total rows');
  eq(new Set(ids).size, 150, 'all distinct — no duplicates');
});

S.test('the sentinel is removed and the observer disconnected once complete', async () => {
  const w = await booted();
  const s = sec(w,'NET');
  w.$fn('ensureCategoryBodyRendered')(s);
  const io = w.__ios[w.__ios.length - 1];
  for(let i = 0; i < 10; i++) io.trigger();
  notOk(s.querySelector('.cat-chunk-sentinel'), 'sentinel removed');
  ok(io.disconnected, 'observer disconnected');
});

S.test('a non-intersecting callback renders nothing', async () => {
  const w = await booted();
  const s = sec(w,'NET');
  w.$fn('ensureCategoryBodyRendered')(s);
  const io = w.__ios[w.__ios.length - 1];
  io.cb([{ isIntersecting:false }], io);
  eq(rows(s), 30, 'still one chunk');
});

/* ---------- IntersectionObserver fallback ---------- */
S.test('without IntersectionObserver the whole section renders immediately', async () => {
  const w = await booted({ noIntersectionObserver: true });
  const s = sec(w,'NET');
  w.$fn('ensureCategoryBodyRendered')(s);
  eq(rows(s), 150, 'correctness over laziness');
  notOk(s.querySelector('.cat-chunk-sentinel'), 'no orphan sentinel left behind');
});

/* ---------- ensureItemRendered ---------- */
S.test('ensureItemRendered returns a row that is already present', async () => {
  const w = await booted();
  w.$fn('ensureCategoryBodyRendered')(sec(w,'NET'));
  const el = w.$fn('ensureItemRendered')('NET-001');
  ok(el && el.getAttribute('data-id') === 'NET-001', 'row returned');
});

S.test('ensureItemRendered expands a collapsed section to reach its row', async () => {
  const w = await booted();
  ok(w.$("state.collapsed.has('WIFI')"), 'precondition: collapsed');
  const el = w.$fn('ensureItemRendered')('WIFI-001');
  ok(el, 'row found');
  notOk(sec(w,'WIFI').classList.contains('collapsed'), 'section expanded');
  notOk(w.$("state.collapsed.has('WIFI')"), 'state updated too');
});

S.test('ensureItemRendered flushes remaining chunks to reach a deep row', async () => {
  const w = await booted();
  const el = w.$fn('ensureItemRendered')('NET-150');
  ok(el && el.getAttribute('data-id') === 'NET-150', 'deep row materialised');
  eq(rows(sec(w,'NET')), 150, 'all rows flushed');
  notOk(sec(w,'NET').querySelector('.cat-chunk-sentinel'), 'sentinel cleaned up');
});

S.test('ensureItemRendered returns null for an unknown id rather than throwing', async () => {
  const w = await booted();
  eq(w.$fn('ensureItemRendered')('NOPE-999'), null, 'unknown id');
});

/* ---------- the Expand-all regression ---------- */
S.test('Expand all goes through chunking instead of one 577-row blocking pass', async () => {
  const w = await booted();
  w.__eval('state.collapsed.clear();');
  w.$fn('renderResults')();
  const total = w.document.querySelectorAll('.test-item').length;
  ok(total < 577, `expanded render must not build every row at once (got ${total})`);
  // derived, not hardcoded: domains cross the chunk size as content grows
  const big = w.$(`CATEGORIES.filter(c => allData.filter(d=>d.domain===c.code).length > CATEGORY_CHUNK_SIZE).length`);
  ok(big > 0, 'at least one domain exceeds the chunk size');
  eq(w.document.querySelectorAll('.cat-chunk-sentinel').length, big,
     'one sentinel per domain larger than a chunk');
  // and the rows that were deferred are still reachable
  ok(w.$fn('ensureItemRendered')('WEB-146'), 'deferred row still reachable');
});

module.exports = S;
