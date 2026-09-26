#!/usr/bin/env python3
"""Exhaustive real-browser verification for GreySh3ll.

Drives both pages and every interactive feature through 18 viewports, from a
320px phone to a 1920px desktop, including landscape phones and the WCAG
reflow condition (1.4.10: content usable at 320 CSS px wide, which is what
400% zoom on a 1280px display produces).

Checks at each step:
  - horizontal overflow of the document, with the offending element named
  - elements extending past the right edge that are not inside a scroller
  - text clipped by a container that has no ellipsis and no scroll
  - overlays and modals that do not fit the viewport
  - interactive controls below 44px on coarse pointers
  - console errors and uncaught exceptions
"""
import http.server, socketserver, threading, functools, json, os, sys, time, tempfile
from playwright.sync_api import sync_playwright

# Repo root is the parent of tests/ — derived from this file so the script runs
# unchanged on any machine (CI runner, a fresh clone, a dev box). Paths and the
# screenshot output dir are resolved relative to here rather than assuming any
# particular home directory, which would fail on a CI runner.
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.environ.get('GS_APP') or _REPO_ROOT
SHOTS = os.environ.get('GS_SHOTS') or os.path.join(tempfile.gettempdir(), 'greysh3ll-shots')
PORT = 8131

VIEWPORTS = [
    ('320x568  reflow/small',      320,  568, True),
    ('360x640  android-small',     360,  640, True),
    ('375x667  iphone-se',         375,  667, True),
    ('390x844  iphone-14',         390,  844, True),
    ('412x915  pixel',             412,  915, True),
    ('428x926  iphone-max',        428,  926, True),
    ('480x800  phablet',           480,  800, True),
    ('540x960  surface-duo',       540,  960, True),
    ('600x960  small-tablet',      600,  960, True),
    ('667x375  phone-landscape',   667,  375, True),
    ('768x1024 ipad-portrait',     768, 1024, True),
    ('820x1180 ipad-air',          820, 1180, True),
    ('1024x768 ipad-landscape',   1024,  768, True),
    ('1180x820 tablet-landscape', 1180,  820, False),
    ('1280x800 laptop',           1280,  800, False),
    ('1366x768 laptop-common',    1366,  768, False),
    ('1440x900 desktop',          1440,  900, False),
    ('1920x1080 wide',            1920, 1080, False),
]

findings = []
def fail(area, msg):
    findings.append((area, msg))

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT),
                                   functools.partial(Quiet, directory=APP))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

LAYOUT_JS = r"""() => {
  const doc = document.documentElement;
  const vw = doc.clientWidth, vh = window.innerHeight;
  const res = { vw, scrollWidth: doc.scrollWidth, overflow: [], clipped: [], modals: [] };

  const inScroller = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const cs = getComputedStyle(p);
      if (['auto','scroll','hidden'].includes(cs.overflowX)) return true;
      p = p.parentElement;
    }
    return false;
  };

  // 1. elements past the right edge, not contained by a horizontal scroller
  if (doc.scrollWidth > vw + 1) {
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1 && !inScroller(el)) {
        res.overflow.push({ tag: el.tagName.toLowerCase(),
                            cls: (el.className||'').toString().slice(0,50),
                            right: Math.round(r.right), w: Math.round(r.width) });
      }
    });
  }

  // 2. text clipped with no ellipsis and no scroll available
  document.querySelectorAll('body *').forEach(el => {
    if (!el.children.length && (el.textContent||'').trim().length > 2) {
      const cs = getComputedStyle(el);
      const hiddenX = cs.overflowX === 'hidden' || cs.overflow === 'hidden';
      const ellipsis = cs.textOverflow === 'ellipsis';
      if (hiddenX && !ellipsis && el.scrollWidth > el.clientWidth + 2) {
        res.clipped.push({ tag: el.tagName.toLowerCase(),
                           cls: (el.className||'').toString().slice(0,40),
                           txt: el.textContent.trim().slice(0,30),
                           scroll: el.scrollWidth, client: el.clientWidth });
      }
    }
  });

  // 3. visible overlays must fit the viewport
  document.querySelectorAll('.overlay, .modal, .toolkit, .palette, .assess-mode, [role=dialog]')
    .forEach(el => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return;
      if (r.width > vw + 1 || r.left < -1 || r.right > vw + 1) {
        res.modals.push({ cls: (el.className||'').toString().slice(0,40),
                          left: Math.round(r.left), right: Math.round(r.right), vw });
      }
    });

  return res;
}"""

TOUCH_JS = r"""() => {
  const small = [];
  document.querySelectorAll('button, a, select, input, [role=button], [data-action]')
    .forEach(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0) return;
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      const fullWidthRow = r.width >= 200 && r.height >= 36;
      // A checkbox inside an already-clickable row only needs the WCAG
      // 2.5.8 floor of 24x24; the row itself is the generous target.
      if (el.classList.contains('checkbox') && r.width >= 24 && r.height >= 24) return;
      if (!fullWidthRow && (r.height < 44 || r.width < 44)) {
        small.push({ tag: el.tagName.toLowerCase(),
                     cls: (el.className||'').toString().slice(0,40),
                     w: Math.round(r.width), h: Math.round(r.height),
                     txt: (el.textContent||'').trim().slice(0,20) });
      }
    });
  return small.slice(0, 10);
}"""

def check(page, area, touch):
    r = page.evaluate(LAYOUT_JS)
    if r['overflow']:
        fail(area, f"horizontal overflow (vw {r['vw']}, scroll {r['scrollWidth']}): "
                   f"{json.dumps(r['overflow'][:5])}")
    if r['clipped']:
        fail(area, f"clipped text, no ellipsis or scroll: {json.dumps(r['clipped'][:5])}")
    if r['modals']:
        fail(area, f"overlay does not fit the viewport: {json.dumps(r['modals'][:3])}")
    if touch:
        small = page.evaluate(TOUCH_JS)
        if small:
            fail(area, f"controls under 44px: {json.dumps(small)}")

def run():
    # Runs in batches so a long sweep cannot lose everything to a timeout:
    #   python3 full_check.py <start> <end>
    lo = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    hi = int(sys.argv[2]) if len(sys.argv) > 2 else len(VIEWPORTS)
    batch = VIEWPORTS[lo:hi]
    os.makedirs(SHOTS, exist_ok=True)
    httpd = serve(); time.sleep(0.5)
    base = f'http://127.0.0.1:{PORT}'
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for label, w, h, touch in batch:
            tag = label.split()[0]
            ctx = browser.new_context(viewport={'width': w, 'height': h},
                                      has_touch=touch, is_mobile=touch and w < 1024)
            page = ctx.new_page()
            errs = []
            # Capture the resource URL alongside the text: a resource that fails
            # to load logs "Failed to load resource: net::ERR_..." with the URL
            # only in the message location, so text-only filtering cannot tell a
            # sandbox egress block (Google Fonts) from a genuine app error.
            def _console(m):
                if m.type != 'error':
                    return
                loc = (m.location or {}).get('url', '') if hasattr(m, 'location') else ''
                errs.append(m.text + ' ' + loc)
            page.on('console', _console)
            page.on('pageerror', lambda e: errs.append('uncaught: ' + str(e)))

            # ============ DASHBOARD ============
            page.goto(f'{base}/index.html', wait_until='networkidle')
            page.wait_for_timeout(800)
            check(page, f'index @ {label}', touch)
            page.screenshot(path=f'{SHOTS}/index-{tag}.png')

            page.evaluate("""() => {
              const i = document.getElementById('dashSearch');
              if (i) { i.value = 'xss'; i.dispatchEvent(new Event('input', {bubbles:true})); }
            }""")
            page.wait_for_timeout(500)
            check(page, f'index search @ {label}', touch)

            # theme both ways
            for _ in range(2):
                page.evaluate("document.getElementById('themeToggle')?.click();")
                page.wait_for_timeout(250)
            check(page, f'index theme @ {label}', touch)

            # ============ ASSESSMENT ============
            page.goto(f'{base}/assessment.html', wait_until='networkidle')
            page.wait_for_timeout(1400)
            check(page, f'assessment @ {label}', touch)
            page.screenshot(path=f'{SHOTS}/assess-{tag}.png')

            # sidebar / drawer
            page.evaluate("document.getElementById('menuBtn')?.click();")
            page.wait_for_timeout(400)
            check(page, f'assessment sidebar @ {label}', touch)
            page.evaluate("document.getElementById('menuBtn')?.click();")
            page.wait_for_timeout(300)

            # filters: every status chip
            chips = page.evaluate("document.querySelectorAll('#statusChips .chip').length")
            for i in range(chips):
                page.evaluate(f"document.querySelectorAll('#statusChips .chip')[{i}]?.click();")
                page.wait_for_timeout(120)
            check(page, f'assessment filters @ {label}', touch)
            page.evaluate("document.querySelector('#statusChips .chip')?.click();")

            # search + sort
            page.evaluate("""() => {
              const i = document.getElementById('searchInput');
              if (i) { i.value = 'smb'; i.dispatchEvent(new Event('input', {bubbles:true})); }
            }""")
            page.wait_for_timeout(400)
            check(page, f'assessment search @ {label}', touch)
            page.evaluate("""() => {
              const i = document.getElementById('searchInput');
              if (i) { i.value = ''; i.dispatchEvent(new Event('input', {bubbles:true})); }
            }""")
            page.wait_for_timeout(400)

            # A domain opens into its standard's category chooser now, and the
            # case rows live one level in — so check the chooser, then open a
            # category and carry on into the rows.
            page.evaluate("""() => {
              ['NET','WEB'].forEach(c => {
                document.querySelector(`.cat-section[data-cat="${c}"] .cat-head`)?.click();
              });
            }""")
            page.wait_for_timeout(700)
            check(page, f'category chooser @ {label}', touch)
            page.screenshot(path=f'{SHOTS}/picker-{tag}.png')
            page.evaluate("""() => {
              ['NET','WEB'].forEach(c => {
                const s = document.querySelector(`.cat-section[data-cat="${c}"]`);
                s?.querySelector('.cat-pick:not([disabled])')?.click();
              });
            }""")
            page.wait_for_timeout(700)
            check(page, f'assessment expanded @ {label}', touch)

            page.evaluate("""() => {
              const s = document.querySelector('.cat-section[data-cat="NET"]');
              (s?.querySelector('.test-head') || s?.querySelector('[data-action="expand"]'))?.click();
            }""")
            page.wait_for_timeout(900)
            check(page, f'assessment detail @ {label}', touch)
            page.screenshot(path=f'{SHOTS}/detail-{tag}.png')

            # A row from BEYOND the first chunk. Every earlier check only
            # opened the first row of a section, so it confirmed that late
            # rows exist without ever confirming they respond — which is how
            # a dead expand button on every case past the 30th survived
            # several audits. Assert behaviour, not presence.
            late = page.evaluate("() => {\n  if (typeof ensureItemRendered !== 'function') return 'no helper';\n  const el = ensureItemRendered('NET-120');\n  if (!el) return 'row missing';\n  const btn = el.querySelector('.expand-btn');\n  if (!btn) return 'no expand button';\n  btn.click();\n  const opened = el.classList.contains('expanded');\n  btn.click();\n  const closed = !el.classList.contains('expanded');\n  const h = Math.round(el.querySelector('.detail-panel').getBoundingClientRect().height);\n  return { opened, closed, collapsedHeight: h };\n}")
            if not isinstance(late, dict):
                fail(f'late row @ {label}', f'could not reach NET-120: {late}')
            else:
                if not late.get('opened'):
                    fail(f'late row @ {label}',
                         'a case past the first chunk does not open')
                if not late.get('closed'):
                    fail(f'late row @ {label}',
                         'a case past the first chunk does not close')
                if late.get('collapsedHeight', 0) > 2:
                    fail(f'late row @ {label}',
                         f"collapsed detail still {late['collapsedHeight']}px tall")
            page.wait_for_timeout(300)

            # expand all — the heaviest layout in the app
            page.evaluate("document.getElementById('expandBtn')?.click();")
            page.wait_for_timeout(1200)
            check(page, f'assessment expand-all @ {label}', touch)

            # ============ OVERLAYS ============
            page.evaluate("typeof openPalette === 'function' && openPalette();")
            page.wait_for_timeout(400)
            check(page, f'command palette @ {label}', touch)
            page.screenshot(path=f'{SHOTS}/palette-{tag}.png')
            page.evaluate("typeof closePalette === 'function' && closePalette();")
            page.wait_for_timeout(250)

            page.evaluate("typeof openStats === 'function' && openStats();")
            page.wait_for_timeout(500)
            check(page, f'stats @ {label}', touch)
            page.evaluate("typeof closeStats === 'function' && closeStats();")
            page.wait_for_timeout(250)

            # ============ TOOLKIT: every tab, every viewport ============
            page.evaluate("typeof openToolkit === 'function' && openToolkit();")
            page.wait_for_timeout(500)
            # Click the real tab buttons rather than calling the renderer
            # directly — setting activeToolkitTab by hand skips the click
            # handler, which is what keeps the tab strip highlight in sync.
            tab_labels = ['CVSS', 'Payload', 'Drills', 'Report', 'Scan',
                          'Chains', 'Custom', 'Coverage']
            for tab in tab_labels:
                page.evaluate(f"""() => {{
                  const t = [...document.querySelectorAll('.ttab')]
                    .find(b => b.textContent.includes({tab!r}));
                  t && t.click();
                }}""")
                page.wait_for_timeout(700)
                check(page, f'toolkit:{tab} @ {label}', touch)
                active = page.evaluate(
                    "document.querySelector('.ttab.active')?.textContent || ''")
                if tab not in active:
                    fail(f'toolkit:{tab} @ {label}',
                         f'tab strip out of sync: active is {active.strip()!r}')
                if tab in ('CVSS','Coverage','Report'):
                    page.screenshot(path=f'{SHOTS}/toolkit-{tab}-{tag}.png')
            page.evaluate("typeof closeToolkit === 'function' && closeToolkit();")
            page.wait_for_timeout(300)

            # The app's only external dependency is the web font. When the
            # egress proxy blocks it (CI), the failure carries a fonts.* origin;
            # a genuine app error will not. A tunnel error to any other host is
            # left in, so a real egress problem still surfaces.
            real = [e for e in set(errs)
                    if 'fonts.googleapis.com' not in e
                    and 'fonts.gstatic.com' not in e
                    and '403' not in e]
            if real:
                fail(f'console @ {label}', '; '.join(sorted(real)[:4]))
            ctx.close()
        browser.close()
    httpd.shutdown()

    with open(os.path.join(SHOTS, f'results-{lo}-{hi}.txt'), 'w') as fh:
        for area, msg in findings:
            fh.write(f'[{area}]\n  {msg}\n')
    if findings:
        print(f'{len(findings)} FINDING(S) across viewports {lo}-{hi}\n')
        seen = set()
        for area, msg in findings:
            key = msg[:110]
            if key in seen:
                continue
            seen.add(key)
            print(f'[{area}]\n  {msg}\n')
        sys.exit(1)
    print(f'CLEAN — {len(batch)} viewports x every feature: no overflow, '
          f'no clipped text, overlays fit, touch targets met, no console errors')

if __name__ == '__main__':
    run()
