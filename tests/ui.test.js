/* ui.test.js — 24 tests
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
      ok(uses > 1, `js/${f}: ${name} is declared but never used`);
    });
  });
});

S.test('a collapsed detail panel contributes no height', () => {
  // The 0fr track zeroes the content box but not padding, so .detail-inner's
  // vertical padding showed as a strip of detail under every closed row.
  // Asserted by effect, not by one exact selector: the rule was later
  // broadened from .detail-inner to every direct child, because collapsing a
  // row mid-load left a .detail-loading placeholder keeping its own padding.
  const idx = CSS.indexOf('.test-item:not(.expanded) > .detail-panel >');
  ok(idx !== -1, 'a rule must zero the padding of a collapsed panel\'s children');
  const rule = CSS.slice(idx, idx + 200);
  includes(rule, 'padding-top:0', 'padding-top zeroed');
  includes(rule, 'padding-bottom:0', 'padding-bottom zeroed');
});

S.test('content-visibility is scoped to expanded panels only', () => {
  // On a collapsed panel, contain-intrinsic-size reserved 900px for an empty
  // element, so every off-screen row claimed the height of an open one.
  const collapsed = CSS.match(/\.detail-panel\{[^}]*\}/);
  ok(collapsed, '.detail-panel rule found');
  excludes(collapsed[0], 'content-visibility', 'collapsed panel must not skip rendering');
  const expanded = CSS.match(/\.test-item\.expanded \.detail-panel\{[^}]*\}/);
  ok(expanded, 'expanded rule found');
  includes(expanded[0], 'content-visibility:auto', 'the optimisation belongs here');
});

S.test('the expand handler resolves its row with closest(), not a descendant search', () => {
  const src = read('js/interactions.js');
  includes(src, "el.closest('.test-item')",
    'rows appended in later chunks are bound with the row as root');
});

/* ---------- Assessment Mode removal ---------- */
S.test('Assessment Mode is gone from markup, script and styles', () => {
  ['index.html', 'assessment.html'].forEach(p => {
    excludes(read(p), 'assessModeBtn', `${p} still has the entry point`);
    excludes(read(p), 'assessOverlay', `${p} still has the overlay`);
  });
  JS_FILES.forEach(f => {
    const src = read('js/' + f);
    ['openAssessMode', 'closeAssessMode', 'assessNext', 'assessPrev', 'assessModeOpen']
      .forEach(sym => excludes(src, sym, `js/${f} still references ${sym}`));
  });
  // and no rule left targeting elements that no longer exist
  ['.assess-overlay', '.assess-card', '.assess-body', '.assess-nav', '.assess-head']
    .forEach(sel => excludes(CSS, sel, `dead rule ${sel}`));
});

/* ---------- collapse all ---------- */
S.test('collapse all clears open test cases as well as the sections', () => {
  const src = read('js/interactions.js');
  const handler = src.slice(src.indexOf("getElementById('expandBtn')"));
  const block = handler.slice(0, handler.indexOf('});'));
  includes(block, 'state.expanded.clear()',
    'collapsing everything must close open cases too, not just the sections');
});

/* ---------- dashboard charts ---------- */
S.test('the dashboard declares all three chart containers', () => {
  const html = read('index.html');
  ['chartStatus', 'chartSeverity', 'chartDomains']
    .forEach(id => includes(html, id, `missing #${id}`));
});

S.test('charts escape every label they render', () => {
  const src = read('js/home.js');
  const charts = src.slice(src.indexOf('DASHBOARD CHARTS'));
  // Labels come from the dataset, but the rule is the rule: nothing reaches
  // innerHTML unescaped, so a future data change cannot introduce a sink.
  const interpolations = charts.match(/\$\{[^}]*\.label[^}]*\}/g) || [];
  ok(interpolations.length > 0, 'chart labels found');
  interpolations.forEach(m => includes(m, 'escapeHtml', 'unescaped label: ' + m));
});

S.test('chart animation is behind a reduced-motion guard', () => {
  const block = CSS.slice(CSS.indexOf('DASHBOARD CHARTS'));
  const guard = block.indexOf('prefers-reduced-motion: no-preference');
  const firstAnim = block.indexOf('animation:');
  ok(guard !== -1, 'reduced-motion guard present');
  ok(guard < firstAnim, 'every chart animation sits inside the guard');
});

/* ---------- attachment hardening ---------- */
S.test('attachment data URLs are allowlisted and escaped before reaching src', () => {
  const src = read('js/rendering.js');
  includes(src, 'SAFE_IMAGE_URL', 'allowlist regex present');
  includes(src, 'isDisplayableAttachment', 'guard used');
  // imported progress files are attacker-controlled, so the raw value must
  // never be interpolated into the attribute
  excludes(src, '<img src="${a.dataUrl}"', 'raw dataUrl interpolated into src');
  excludes(src, 'svg+xml', 'SVG must not be an allowed attachment type');
});

S.test('imported notes are normalised rather than trusted', () => {
  const src = read('js/storage.js');
  includes(src, 'normalizeAssessorNotes', 'shape guard present');
  excludes(src, 'd.assessorNotes = JSON.parse(', 'parsed JSON assigned straight through');
});

module.exports = S;
