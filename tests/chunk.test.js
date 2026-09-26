/* chunk.test.js — 20 tests
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

/* A domain now opens into its standard's categories, and the case rows live
   one level in. Chunking applies to the rows, so these tests select a
   category first. NET/IA is the largest (67 cases, well over a chunk);
   NET/SI is deliberately tiny (3) for the small-section case. */
const BIG = { domain: 'NET', cat: 'IA', size: 67 };
const SMALL = { domain: 'NET', cat: 'SI', size: 3 };
function openCategory(w, domain, cat){
  w.__eval(`state.activeCategory.set(${JSON.stringify(domain)}, ${JSON.stringify(cat)});`);
  w.$fn('renderResults')();
  return sec(w, domain);
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
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  eq(rows(s), 30, 'first-pass rows');
});

S.test('expanding a large section installs a sentinel and the domain primer', async () => {
  const w = await booted();
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  ok(s.querySelector('.cat-chunk-sentinel'), 'sentinel present');
  ok(s.querySelector('.cat-crumb'), 'breadcrumb back to the category chooser');
});

S.test('a small section renders fully with no sentinel machinery', async () => {
  const w = await booted();
  const s = openCategory(w, SMALL.domain, SMALL.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  eq(rows(s), SMALL.size, 'every row in a small category');
  notOk(s.querySelector('.cat-chunk-sentinel'), 'no sentinel for a small category');
});

S.test('re-entering ensureCategoryBodyRendered is a no-op, not a double render', async () => {
  const w = await booted();
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  w.$fn('ensureCategoryBodyRendered')(s);
  w.$fn('ensureCategoryBodyRendered')(s);
  eq(rows(s), 30, 'still one chunk');
});

/* ---------- incremental chunking ---------- */
S.test('each sentinel intersection appends exactly one more chunk', async () => {
  const w = await booted();
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  const io = w.__ios[w.__ios.length - 1];
  io.trigger(); eq(rows(s), 60, 'after 1 trigger');
  io.trigger(); eq(rows(s), BIG.size, 'after 2 triggers the category is complete');
});

S.test('chunking covers every row with none skipped or duplicated', async () => {
  const w = await booted();
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  const io = w.__ios[w.__ios.length - 1];
  for(let i = 0; i < 10; i++) io.trigger();
  const ids = Array.from(s.querySelectorAll('.test-item')).map(e => e.getAttribute('data-id'));
  eq(ids.length, BIG.size, 'total rows');
  eq(new Set(ids).size, BIG.size, 'all distinct — no duplicates');
});

S.test('the sentinel is removed and the observer disconnected once complete', async () => {
  const w = await booted();
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  const io = w.__ios[w.__ios.length - 1];
  for(let i = 0; i < 10; i++) io.trigger();
  notOk(s.querySelector('.cat-chunk-sentinel'), 'sentinel removed');
  ok(io.disconnected, 'observer disconnected');
});

S.test('a non-intersecting callback renders nothing', async () => {
  const w = await booted();
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  const io = w.__ios[w.__ios.length - 1];
  io.cb([{ isIntersecting:false }], io);
  eq(rows(s), 30, 'still one chunk');
});

/* ---------- IntersectionObserver fallback ---------- */
S.test('without IntersectionObserver the whole section renders immediately', async () => {
  const w = await booted({ noIntersectionObserver: true });
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  eq(rows(s), BIG.size, 'correctness over laziness');
  notOk(s.querySelector('.cat-chunk-sentinel'), 'no orphan sentinel left behind');
});

/* ---------- ensureItemRendered ---------- */
S.test('ensureItemRendered returns a row that is already present', async () => {
  const w = await booted();
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
  // Only that case's own category is flushed, not the whole 150-case domain.
  const cat = w.$("allData.find(d=>d.id==='NET-150').categoryCode");
  const expected = w.$(`allData.filter(d=>d.domain==='NET' && d.categoryCode===${JSON.stringify(cat)}).length`);
  eq(rows(sec(w,'NET')), expected, 'every row in that category is present');
  notOk(sec(w,'NET').querySelector('.cat-chunk-sentinel'), 'sentinel cleaned up');
});

S.test('ensureItemRendered returns null for an unknown id rather than throwing', async () => {
  const w = await booted();
  eq(w.$fn('ensureItemRendered')('NOPE-999'), null, 'unknown id');
});

S.test('jumping to a case opens the category that holds it', async () => {
  const w = await booted();
  // Search and the command palette both land in ensureItemRendered. Without
  // opening the case's category the domain shows the chooser and the row the
  // caller asked for does not exist in the DOM at all.
  const el = w.$fn('ensureItemRendered')('SOCIAL-018');
  ok(el, 'row materialised');
  eq(w.$("state.activeCategory.get('SOCIAL')"),
     w.$("allData.find(d=>d.id==='SOCIAL-018').categoryCode"),
     'the case\'s own category was opened');
});

/* ---------- Expand all ---------- */
S.test('Expand all shows ten category choosers, not 577 rows', async () => {
  const w = await booted();
  w.__eval('state.collapsed.clear();');
  w.$fn('renderResults')();
  eq(w.document.querySelectorAll('.test-item').length, 0, 'no case rows built');
  eq(w.document.querySelectorAll('.cat-picker').length, 10, 'one chooser per domain');
  ok(w.$fn('ensureItemRendered')('WEB-146'), 'any case is still reachable');
});

S.test('a large category still chunks rather than building whole', async () => {
  const w = await booted();
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  eq(rows(s), 30, 'first chunk only');
  eq(s.querySelectorAll('.cat-chunk-sentinel').length, 1, 'one sentinel');
});

/* ---------- event binding on appended rows ---------- */
function lateRowId(w){
  return w.$(`allData.filter(d=>d.domain===${JSON.stringify(BIG.domain)} && d.categoryCode===${JSON.stringify(BIG.cat)}).map(d=>d.id)`)[40];
}

S.test('a row in a later chunk actually responds to its expand button', async () => {
  const w = await booted();
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  w.__ios[w.__ios.length - 1].trigger();   // rows 31-60 appended here
  const id = lateRowId(w);
  const row = s.querySelector(`.test-item[data-id="${id}"]`);
  ok(row, 'a second-chunk row exists');
  const btn = row.querySelector('.expand-btn');
  ok(btn, 'expand button present');
  btn.dispatchEvent(new w.Event('click', { bubbles: true }));
  // Appended rows are bound with the row itself as root. A handler that
  // resolves the item with root.querySelector() finds nothing there, which
  // silently broke every case past the first 30.
  ok(w.$(`state.expanded.has(${JSON.stringify(id)})`), 'expanding a late row updates state');
  ok(row.classList.contains('expanded'), 'and the row is marked expanded');
});

S.test('collapsing a late-chunk row clears the expanded state again', async () => {
  const w = await booted();
  const s = openCategory(w, BIG.domain, BIG.cat);
  w.$fn('ensureCategoryBodyRendered')(s);
  w.__ios[w.__ios.length - 1].trigger();
  const id = lateRowId(w);
  const row = s.querySelector(`.test-item[data-id="${id}"]`);
  const btn = row.querySelector('.expand-btn');
  btn.dispatchEvent(new w.Event('click', { bubbles: true }));
  btn.dispatchEvent(new w.Event('click', { bubbles: true }));
  notOk(w.$(`state.expanded.has(${JSON.stringify(id)})`), 'state cleared');
  notOk(row.classList.contains('expanded'), 'class removed');
  eq(btn.getAttribute('aria-expanded'), 'false', 'aria kept in sync');
});

module.exports = S;
