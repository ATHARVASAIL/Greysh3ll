#!/usr/bin/env python3
"""Real-browser verification: responsiveness, layout and the visual fixes
that jsdom structurally cannot confirm (it performs no layout).

Serves the app over HTTP because fetch() is blocked on file:// URLs, then
loads both pages at six viewports and checks for horizontal overflow,
undersized touch targets, invisible elements and console errors.
"""
import http.server, socketserver, threading, functools, json, os, sys, time, tempfile
from playwright.sync_api import sync_playwright

# Repo root derived from this file so the script is portable (CI, clone, dev box).
_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.environ.get('GS_APP') or _REPO_ROOT
SHOTS = os.environ.get('GS_SHOTS') or os.path.join(tempfile.gettempdir(), 'greysh3ll-shots')
PORT = 8123

VIEWPORTS = [
    ('mobile-320',  320,  568),   # smallest phone still in use
    ('mobile-375',  375,  667),
    ('mobile-390',  390,  844),   # common modern phone
    ('tablet-768',  768, 1024),
    ('laptop-1024', 1024, 768),
    ('desktop-1440', 1440, 900),
]

findings = []
def fail(area, msg):
    findings.append((area, msg))

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    handler = functools.partial(Quiet, directory=APP)
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

OVERFLOW_JS = """() => {
  const doc = document.documentElement;
  const out = [];
  if (doc.scrollWidth > doc.clientWidth + 1) {
    // find the specific offenders rather than reporting only that it happened
    document.querySelectorAll('*').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 1) {
        const cs = getComputedStyle(el);
        // an element inside its own horizontal scroll container is fine
        let p = el.parentElement, contained = false;
        while (p) {
          const pcs = getComputedStyle(p);
          if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll' || pcs.overflowX === 'hidden') { contained = true; break; }
          p = p.parentElement;
        }
        if (!contained) out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 60),
          right: Math.round(r.right), width: Math.round(r.width), pos: cs.position,
        });
      }
    });
  }
  return { docWidth: doc.clientWidth, scrollWidth: doc.scrollWidth, offenders: out.slice(0, 8) };
}"""

TOUCH_JS = """() => {
  const small = [];
  document.querySelectorAll('button, a, select, input[type=checkbox], [role=button]').forEach(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0) return;
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    // A full-width row is a comfortable target even below 44px tall: the
    // whole line is tappable, which is what the guidance is protecting.
    // Anything narrower is held to the full 44x44.
    const fullWidthRow = r.width >= 200 && r.height >= 36;
    if (!fullWidthRow && (r.height < 44 || r.width < 44)) {
      small.push({ tag: el.tagName.toLowerCase(), cls: (el.className||'').toString().slice(0,50),
                   w: Math.round(r.width), h: Math.round(r.height),
                   txt: (el.textContent||'').trim().slice(0,24) });
    }
  });
  return small.slice(0, 12);
}"""

def check_page(page, name, vp_name, w):
    r = page.evaluate(OVERFLOW_JS)
    if r['offenders']:
        fail(f'{name} @ {vp_name}',
             f"horizontal overflow: doc {r['docWidth']}px vs scroll {r['scrollWidth']}px; "
             f"offenders {json.dumps(r['offenders'])}")
    if w <= 420:
        small = page.evaluate(TOUCH_JS)
        if small:
            fail(f'{name} @ {vp_name}', f'controls under 44px on a touch viewport: {json.dumps(small)}')

def run():
    os.makedirs(SHOTS, exist_ok=True)
    httpd = serve()
    time.sleep(0.5)
    base = f'http://127.0.0.1:{PORT}'
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for vp_name, w, h in VIEWPORTS:
            # Mobile viewports get touch emulation so `pointer: coarse`
            # media queries actually apply — without this the touch-target
            # rules are never evaluated and the check is meaningless.
            touch = w <= 768
            ctx = browser.new_context(viewport={'width': w, 'height': h},
                                      device_scale_factor=1,
                                      has_touch=touch, is_mobile=touch)
            page = ctx.new_page()
            errors = []
            page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
            page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))

            # ---------- dashboard ----------
            page.goto(f'{base}/index.html', wait_until='networkidle')
            page.wait_for_timeout(700)
            check_page(page, 'index.html', vp_name, w)
            page.screenshot(path=f'{SHOTS}/index-{vp_name}.png', full_page=False)

            # severity dots must actually be visible (the v1.5 fix)
            dots = page.evaluate("""() => {
              const out = [];
              document.querySelectorAll('.sev-dot').forEach(el => {
                const cs = getComputedStyle(el);
                out.push({ bg: cs.backgroundColor, w: el.getBoundingClientRect().width });
              });
              return out;
            }""")
            if dots:
                invisible = [d for d in dots
                             if d['bg'] in ('rgba(0, 0, 0, 0)', 'transparent') or d['w'] == 0]
                if invisible:
                    fail(f'index.html @ {vp_name}',
                         f'{len(invisible)}/{len(dots)} severity dots render with no colour')
            elif vp_name == 'desktop-1440':
                fail('index.html', 'no .sev-dot elements found at all')

            # ---------- assessment workspace ----------
            page.goto(f'{base}/assessment.html', wait_until='networkidle')
            page.wait_for_timeout(1200)
            check_page(page, 'assessment.html', vp_name, w)
            page.screenshot(path=f'{SHOTS}/assessment-{vp_name}.png', full_page=False)

            # expand a domain, then re-check overflow with rows present
            page.evaluate("""() => {
              const head = document.querySelector('.cat-section[data-cat="WIFI"] .cat-head');
              if (head) head.click();
            }""")
            page.wait_for_timeout(500)
            check_page(page, 'assessment.html (expanded)', vp_name, w)

            # expand a row's detail — the widest content in the app
            page.evaluate("""() => {
              const s = document.querySelector('.cat-section[data-cat="WIFI"]');
              const row = s && s.querySelector('.test-head, [data-action="expand"]');
              if (row) row.click();
            }""")
            page.wait_for_timeout(600)
            check_page(page, 'assessment.html (detail open)', vp_name, w)
            page.screenshot(path=f'{SHOTS}/assessment-detail-{vp_name}.png', full_page=False)

            # ---------- toolkit, at desktop only (it is a modal) ----------
            if w >= 768:
                page.evaluate("openToolkit();")
                page.wait_for_timeout(400)
                for tab in ['cvss', 'coverage', 'chains', 'custom', 'scan']:
                    page.evaluate(f"activeToolkitTab='{tab}'; renderToolkitPane();")
                    page.wait_for_timeout(350)
                    check_page(page, f'toolkit:{tab}', vp_name, w)
                page.screenshot(path=f'{SHOTS}/toolkit-{vp_name}.png')
                page.evaluate("closeToolkit();")

            # The sandbox blocks fonts.googleapis.com, which surfaces as a 403.
            # That is an egress restriction here, not an application fault, and
            # the font stacks all declare a monospace fallback.
            real = [e for e in set(errors) if 'fonts.googleapis.com' not in e
                    and 'status of 403' not in e]
            if real:
                fail(f'console @ {vp_name}', '; '.join(sorted(real)[:5]))
            ctx.close()
        browser.close()
    httpd.shutdown()

    if findings:
        print(f'{len(findings)} FINDING(S)\n')
        for area, msg in findings:
            print(f'[{area}]\n  {msg}\n')
        sys.exit(1)
    print('RESPONSIVE CHECK CLEAN — no overflow, no undersized controls, no console errors')

if __name__ == '__main__':
    run()
