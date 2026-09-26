/* csp.test.js — 13 tests
   style-src has no 'unsafe-inline', so any inline style="..." that creeps
   back into a template is not a style bug — it is a silently unstyled
   element in production. These tests are the tripwire. */
const fs = require('fs');
const path = require('path');
const { APP, read, boot, Suite, eq, ok, notOk, includes, excludes } = require('./harness');

const S = Suite('csp');
const PAGES = ['index.html','assessment.html'];
const JS_FILES = fs.readdirSync(path.join(APP,'js')).filter(f => f.endsWith('.js'));
const CSS = fs.readdirSync(path.join(APP,'css')).filter(f => f.endsWith('.css'))
  .map(f => read('css/' + f)).join('\n');

function cspOf(page){
  const m = read(page).match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  if(!m) throw new Error(`no CSP meta tag in ${page}`);
  return m[1];
}

/* ---------- the policy itself ---------- */
S.test('both pages declare a CSP meta tag', () => {
  PAGES.forEach(p => ok(cspOf(p).length > 0, `${p} has a CSP`));
});

S.test("style-src has no 'unsafe-inline' on either page", () => {
  PAGES.forEach(p => {
    const style = cspOf(p).match(/style-src[^;]*/)[0];
    excludes(style, "'unsafe-inline'", `${p} style-src`);
  });
});

S.test("script-src is 'self' only — no unsafe-inline, no unsafe-eval", () => {
  PAGES.forEach(p => {
    const script = cspOf(p).match(/script-src[^;]*/)[0];
    excludes(script, "'unsafe-inline'", `${p} script-src`);
    excludes(script, "'unsafe-eval'", `${p} script-src`);
  });
});

S.test('object-src, base-uri and form-action are all locked down', () => {
  PAGES.forEach(p => {
    const csp = cspOf(p);
    includes(csp, "object-src 'none'", `${p} object-src`);
    includes(csp, "base-uri 'none'", `${p} base-uri`);
    includes(csp, "form-action 'none'", `${p} form-action`);
  });
});

S.test('both pages carry an identical policy', () => {
  eq(cspOf('index.html'), cspOf('assessment.html'), 'policies match');
});

/* ---------- the policy is actually satisfiable ---------- */
S.test('defer is on every script tag, and there are no inline script blocks', () => {
  PAGES.forEach(p => {
    const html = read(p);
    const tags = html.match(/<script\b[^>]*>/g) || [];
    ok(tags.length > 0, `${p} has scripts`);
    tags.forEach(t => ok(/\bdefer\b/.test(t), `${p}: missing defer on ${t}`));
    excludes(html.replace(/<script\b[^>]*><\/script>/g, ''), '<script', `${p} inline script block`);
    excludes(html, 'document.write', `${p} document.write`);
  });
});

S.test('neither page contains an inline style attribute', () => {
  PAGES.forEach(p => excludes(read(p), 'style="', `${p} inline style`));
});

S.test('no JS file emits an inline style attribute (report builder included)', () => {
  // The PDF report used to be a sanctioned exception (4 inline style= in the
  // report builder driven by REPORT_SEV_COLOR). Those were actually blocked by
  // the strict style-src 'self' CSP, so the report chips rendered colourless.
  // They are now .rsev-* / .rsev-text-* classes, so there is no exception left.
  const offenders = [];
  JS_FILES.forEach(f => {
    const src = read('js/' + f);
    src.split('\n').forEach((line, i) => {
      if(/style="/.test(line) || /style='/.test(line)){
        offenders.push(`js/${f}:${i+1}`);
      }
    });
  });
  eq(offenders, [], 'inline styles anywhere in JS');
});

S.test('the report severity palette is class-driven, not inline', () => {
  const src = read('js/assessment.js');
  // no inline style= built from the palette anywhere in the report builder
  const inlineUses = (src.match(/style="[^"]*\$\{REPORT_SEV_COLOR/g) || []).length;
  eq(inlineUses, 0, 'no inline REPORT_SEV_COLOR styles remain');
  // the templates reference the severity classes instead
  includes(src, 'rsev-', 'report builder uses .rsev-* severity classes');
  // and those classes are defined in the print CSS with their hexes
  ['.rsev-critical','.rsev-high','.rsev-medium','.rsev-low','.rsev-info',
   '.rsev-text-critical']
    .forEach(cls => includes(CSS, cls, `missing report severity class ${cls}`));
});

/* ---------- the CSS side of the migration ---------- */
S.test('the utility and data-attribute classes the templates rely on exist', () => {
  ['.u-hidden','.u-fill','.csp-w','.sev-critical','.sev-high','.sev-low']
    .forEach(cls => includes(CSS, cls, `missing ${cls}`));
});

/* ---------- applyCspStyles ---------- */
S.test('applyCspStyles resolves data-pct and data-sev without inline attributes', () => {
  const w = boot({ scripts:['storage.js','filters.js','core.js'] });
  const host = w.document.createElement('div');
  host.innerHTML = '<div class="csp-w" data-pct="42" data-sev="high"></div>';
  w.document.body.appendChild(host);
  w.$fn('applyCspStyles')(host);
  const el = host.firstChild;
  eq(el.style.getPropertyValue('--pct'), '42%', 'width custom property');
  ok(el.classList.contains('sev-high'), 'severity class applied');
  eq(el.getAttribute('data-csp-done'), '1', 'marked processed');
});

S.test('applyCspStyles clamps out-of-range percentages and is idempotent', () => {
  const w = boot({ scripts:['storage.js','filters.js','core.js'] });
  const host = w.document.createElement('div');
  host.innerHTML = '<div class="csp-w" data-pct="250"></div><div class="csp-w" data-pct="-30"></div>'
                 + '<div data-idx="99"></div>';
  w.document.body.appendChild(host);
  w.$fn('applyCspStyles')(host);
  const [a, b, c] = host.children;
  eq(a.style.getPropertyValue('--pct'), '100%', 'clamped high');
  eq(b.style.getPropertyValue('--pct'), '0%', 'clamped low');
  eq(c.style.getPropertyValue('--anim-delay-ms'), '300', 'animation delay capped');
  a.setAttribute('data-pct', '10');
  w.$fn('applyCspStyles')(host);
  eq(a.style.getPropertyValue('--pct'), '100%', 'processed nodes are skipped on re-run');
});

S.test('placeholders use a real ellipsis, never three ASCII dots', () => {
  const sources = PAGES.map(p => [p, read(p)])
    .concat(JS_FILES.map(f => ['js/' + f, read('js/' + f)]));
  const offenders = [];
  sources.forEach(([name, src]) => {
    (src.match(/placeholder="[^"]*"/g) || []).forEach(ph => {
      if(ph.includes('...')) offenders.push(`${name}: ${ph}`);
    });
  });
  eq(offenders, [], 'placeholders with ASCII "..."');
});

module.exports = S;
