/* storage_safe.test.js — 15 tests
   The safeStorage* helpers exist because a bare catch(e){} once discarded an
   analyst's whole engagement in silence. These tests pin the two properties
   that matter: a real failure is surfaced, and it is surfaced again the next
   time it happens. */
const { boot, Suite, eq, ok, notOk, includes, excludes } = require('./harness');

const S = Suite('storage_safe');
const SCRIPTS = ['storage.js'];

function app(){
  const w = boot({ scripts: SCRIPTS });
  w.__toasts.length = 0;          // ignore anything written during module init
  w.__storage.failNext = 0;
  w.__storage.failAlways = false;
  return w;
}

/* ---------- isQuotaError ---------- */
S.test('isQuotaError recognises the standard quota error name', () => {
  const w = app();
  ok(w.$fn('isQuotaError')({ name:'QuotaExceededError' }), 'QuotaExceededError');
});

S.test('isQuotaError recognises the Firefox name and both legacy codes', () => {
  const w = app();
  ok(w.$fn('isQuotaError')({ name:'NS_ERROR_DOM_QUOTA_REACHED' }), 'firefox name');
  ok(w.$fn('isQuotaError')({ code:22 }), 'code 22');
  ok(w.$fn('isQuotaError')({ code:1014 }), 'code 1014');
});

S.test('isQuotaError rejects unrelated errors and null', () => {
  const w = app();
  notOk(w.$fn('isQuotaError')({ name:'SecurityError' }), 'SecurityError is not quota');
  notOk(w.$fn('isQuotaError')(null), 'null');
  notOk(w.$fn('isQuotaError')(undefined), 'undefined');
});

/* ---------- safeStorageSet ---------- */
S.test('safeStorageSet writes the value and reports success', () => {
  const w = app();
  eq(w.$fn('safeStorageSet')('k','v','Progress'), true, 'return value');
  eq(w.$fn('safeStorageGet')('k'), 'v', 'value readable');
});

S.test('safeStorageSet reports failure instead of throwing', () => {
  const w = app();
  w.__storage.failNext = 1;
  eq(w.$fn('safeStorageSet')('k','v','Progress'), false, 'return value on failure');
});

S.test('a quota failure warns the user and names the export escape hatch', () => {
  const w = app();
  w.__storage.failNext = 1;
  w.$fn('safeStorageSet')('k','v','Progress');
  eq(w.__toasts.length, 1, 'one toast');
  includes(w.__toasts[0], 'storage is full', 'names the cause');
  includes(w.__toasts[0], 'Export your progress', 'offers the recovery action');
});

S.test('the warning names the specific thing that was not saved', () => {
  const w = app();
  w.__storage.failNext = 1;
  w.$fn('safeStorageSet')('k','v','Attack chain');
  includes(w.__toasts[0], 'Attack chain was NOT saved', 'label used');
});

S.test('a non-quota failure warns without blaming a full disk', () => {
  const w = app();
  w.__storage.failMode = 'other';
  w.__storage.failNext = 1;
  w.$fn('safeStorageSet')('k','v','Progress');
  eq(w.__toasts.length, 1, 'one toast');
  excludes(w.__toasts[0], 'storage is full', 'must not claim quota');
  includes(w.__toasts[0], 'Export your progress', 'still offers recovery');
});

S.test('an unlabelled failure still produces an intelligible warning', () => {
  const w = app();
  w.__storage.failNext = 1;
  w.$fn('safeStorageSet')('k','v');
  includes(w.__toasts[0], 'Recent changes were NOT saved', 'generic label');
});

S.test('repeated failures warn only once — no toast storm per keystroke', () => {
  const w = app();
  w.__storage.failAlways = true;
  for(let i = 0; i < 25; i++) w.$fn('safeStorageSet')('k','v','Progress');
  eq(w.__toasts.length, 1, 'toast count across 25 failures');
});

S.test('the warning re-arms after a successful save (the regression that bit us)', () => {
  const w = app();
  w.__storage.failNext = 1;
  w.$fn('safeStorageSet')('k','v','Progress');       // fails, warns
  eq(w.__toasts.length, 1, 'first warning');
  eq(w.$fn('safeStorageSet')('k','v','Progress'), true, 'user frees space, save works');
  w.__storage.failNext = 1;
  w.$fn('safeStorageSet')('k','v','Progress');       // fails again
  eq(w.__toasts.length, 2, 'second failure must warn again');
});

/* ---------- reads and removes never nag ---------- */
S.test('safeStorageGet returns null for a missing key without warning', () => {
  const w = app();
  eq(w.$fn('safeStorageGet')('never-written'), null, 'missing key');
  eq(w.__toasts.length, 0, 'reads are silent — first run is not a failure');
});

S.test('safeStorageRemove deletes the key and reports success', () => {
  const w = app();
  w.$fn('safeStorageSet')('k','v','x');
  eq(w.$fn('safeStorageRemove')('k'), true, 'return value');
  eq(w.$fn('safeStorageGet')('k'), null, 'key gone');
});

/* ---------- cosmetic prefs stay quiet ---------- */
S.test('safeStoragePref failure is silent — a lost theme must not cry wolf', () => {
  const w = app();
  w.__storage.failAlways = true;
  eq(w.$fn('safeStoragePref')('vapt_console_theme','light'), false, 'reports false');
  eq(w.__toasts.length, 0, 'no toast for a cosmetic preference');
});

S.test('a failed pref does not suppress a later real data warning', () => {
  const w = app();
  w.__storage.failAlways = true;
  w.$fn('safeStoragePref')('vapt_console_theme','light');
  w.$fn('safeStorageSet')('progress','{}','Progress');
  eq(w.__toasts.length, 1, 'the real failure still warns');
});

module.exports = S;
