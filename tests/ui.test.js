/* ui.test.js — 14 tests
   Every test here corresponds to a defect found in the end-to-end audit.
   The common thread is that all of them rendered without throwing, so nothing
   short of looking at the output would have caught them. */
const fs = require('fs');
const path = require('path');
const { APP, read, boot, Suite, eq, ok, notOk, includes, excludes } = require('./harness');

const S = Suite('ui');
const JS_FILES = fs.readdirSync(path.join(APP,'js')).filter(f => f.endsWith('.js'));
const CSS = fs.readdirSync(path.join(APP,'css')).filter(f => f.endsWith('.css'))
  .map(f => read('css/' + f)).join('\n');
const FULL = ['storage.js','primers.js','filters.js','search.js','dashboard.js','core.js',
              'rendering.js','interactions.js','assessment.js','features.js','toolkit.js'];

async function app(){
  const w = boot({ scripts: FULL });
  await w.$fn('loadAllData')();
  return w;
}

/* ---------- duplicate class attributes ---------- */
S.test('no element is emitted with two class attributes', () => {
  const offenders = [];
  JS_FILES.forEach(f => {
    read('js/' + f).split('\n').forEach((line, i) => {
      if(/class="[^"]*"[^>]*class="/.test(line)) offenders.push(`js/${f}:${i+1}`);
    });
  });
  // HTML keeps the first class attribute and silently drops the second, so a
  // duplicate is always a styling bug rather than a harmless redundancy.
  eq(offenders, [], 'elements carrying two class attributes');
});

S.test('the same holds for both pages', () => {
  ['index.html','assessment.html'].forEach(p => {
    read(p).split('\n').forEach((line, i) => {
      if(/class="[^"]*"[^>]*class="/.test(line))
        throw new Error(`${p}:${i+1} has two class attributes`);
    });
  });
});

/* ---------- data-sev / data-status / data-rem values ---------- */
S.test('every data-sev value a template can emit has a CSS rule', async () => {
  const w = await app();
  const declared = new Set(
    (CSS.match(/\[data-sev="([a-z-]+)"\]/g) || []).map(m => m.match(/"([a-z-]+)"/)[1]));
  w.$('SEVERITIES').forEach(s => ok(declared.has(s.key), `no CSS for data-sev="${s.key}"`));
});

S.test('severity keys are lowercase, so a capitalised label can never be used raw', async () => {
  const w = await app();
  w.$('SEVERITIES').forEach(s => eq(s.key, s.key.toLowerCase(), `severity key ${s.key}`));
  // the CVSS tab derives data-sev from a display label, which is capitalised
  const src = read('js/toolkit.js');
  (src.match(/data-sev="\$\{[^}]*label[^}]*\}"/g) || []).forEach(m => {
    includes(m, 'toLowerCase', 'a label-derived data-sev must be lowercased: ' + m);
  });
});

S.test('remediation states use data-rem, which has its own colour scale', () => {
  const declared = new Set(
    (CSS.match(/\[data-rem="([a-z-]+)"\]/g) || []).map(m => m.match(/"([a-z-]+)"/)[1]));
  ['open','in-remediation','retest-pending','fixed','risk-accepted','not-fixed']
    .forEach(k => ok(declared.has(k), `no CSS for data-rem="${k}"`));
  includes(CSS, '.rem-text[data-rem]', 'the remediation count needs a text rule');
});

S.test('no template styles a remediation state as if it were a severity', () => {
  JS_FILES.forEach(f => {
    const src = read('js/' + f);
    ['risk-accepted','in-remediation','retest-pending','not-fixed'].forEach(k => {
      excludes(src, `data-sev="${k}"`, `js/${f} uses a remediation key as a severity`);
    });
  });
});

/* ---------- the coverage tab ---------- */
S.test('the coverage tab renders without throwing', async () => {
  const w = await app();
  w.__eval("allData.filter(d=>d.severity==='critical').slice(0,3).forEach(d=>d.status='tested-fail');");
  const html = w.$fn('renderCoverageTab')();
  ok(html && html.length > 400, 'coverage HTML produced');
});

S.test('the coverage tab reports the risk band with a usable data-sev', async () => {
  const w = await app();
  w.__eval("allData.filter(d=>d.severity==='critical').forEach(d=>d.status='tested-fail');");
  const html = w.$fn('renderCoverageTab')();
  includes(html, 'data-sev="critical"', 'lowercased band');
  excludes(html, 'data-sev="Critical"', 'raw capitalised band');
});

S.test('the coverage tab renders with an empty engagement too', async () => {
  const w = await app();
  w.__eval("allData.forEach(d=>d.status='not-tested');");
  const html = w.$fn('renderCoverageTab')();
  includes(html, 'Coverage', 'still renders a summary');
});

/* ---------- every toolkit tab renders ---------- */
S.test('every toolkit tab renders without throwing', async () => {
  const w = await app();
  await w.$fn('ensureAllDetail')();
  await w.$fn('ensureToolkitData')();
  const renderers = ['renderCvssTab','renderPayloadCheatSheetTab','renderDrillsTab',
                     'renderReportTab','renderScanImportTab','renderChainsTab',
                     'renderCustomCasesTab','renderCoverageTab'];
  renderers.forEach(fn => {
    const html = w.$fn(fn)();
    ok(typeof html === 'string' && html.length > 0, `${fn} produced no output`);
  });
});

/* ---------- motion and canvas ---------- */
S.test('confetti honours prefers-reduced-motion', () => {
  const src = read('js/effects-identity.js');
  const fn = src.slice(src.indexOf('function burstConfetti'));
  includes(fn.slice(0, 900), 'prefers-reduced-motion',
    'a full-screen burst must respect the reduced-motion setting');
});

S.test('both canvases tolerate getContext returning null', () => {
  const src = read('js/effects-identity.js');
  const contexts = src.match(/getContext\s*&&\s*canvas\.getContext\('2d'\)/g) || [];
  eq(contexts.length, 2, 'both canvases guard the context');
  ok((src.match(/if\(!ctx\) return;/g) || []).length >= 2, 'both bail out when it is null');
});

/* ---------- prompt-driven flows ---------- */
S.test('prompt results are checked loosely, so a suppressed prompt cannot throw', () => {
  const src = read('js/rendering.js');
  const sites = (src.match(/prompt\(/g) || []).length;
  ok(sites >= 2, `expected at least 2 prompt call sites, found ${sites}`);
  // A strict === null check leaves undefined unhandled, and .trim() on
  // undefined throws. Embedded webviews and sandboxed frames without
  // allow-modals do return undefined here.
  excludes(src, 'name===null', 'strict null check on a prompt result');
  excludes(src, 'name === null', 'strict null check on a prompt result');
  ok((src.match(/name == null/g) || []).length >= 2, 'both sites use a loose null check');
});

/* ---------- dead colour constants ---------- */
S.test('no module keeps a hardcoded colour map it never uses', () => {
  JS_FILES.forEach(f => {
    const src = read('js/' + f);
    (src.match(/^\s*const (\w*[Cc]olor\w*)\s*=/gm) || []).forEach(m => {
      const name = m.match(/const (\w+)/)[1];
      const uses = (src.match(new RegExp('\\b' + name + '\\b', 'g')) || []).length;
      // REPORT_SEV_COLOR is the sanctioned print-document exception
      if(name === 'REPORT_SEV_COLOR') return;
      ok(uses > 1, `js/${f}: ${name} is declared but never used`);
    });
  });
});

module.exports = S;
