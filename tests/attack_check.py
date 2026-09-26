import http.server, socketserver, threading, functools, time, json
from playwright.sync_api import sync_playwright
APP='/home/claude/gs/vapt-console-hacker'; PORT=8211
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
h=socketserver.TCPServer(('127.0.0.1',PORT), functools.partial(Q,directory=APP))
threading.Thread(target=h.serve_forever,daemon=True).start(); time.sleep(0.4)
fails=[]
def ck(n,c,d=''):
    print(('ok   ' if c else 'FAIL ')+n+(('  -> '+str(d)) if not c else '')); 
    if not c: fails.append(n)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/assessment.html', wait_until='networkidle'); pg.wait_for_timeout(1800)
    # open WEB -> A01 -> first case
    pg.evaluate("document.querySelector('.cat-section[data-cat=\"WEB\"] .cat-head').click();")
    pg.wait_for_timeout(900)
    pg.evaluate("""() => { const s=document.querySelector('.cat-section[data-cat=\"WEB\"]');
      [...s.querySelectorAll('.cat-pick')].find(e=>e.dataset.code==='A01').click(); }""")
    pg.wait_for_timeout(900)
    pg.evaluate("document.querySelector('.cat-section[data-cat=\"WEB\"] .test-item .expand-btn').click();")
    pg.wait_for_timeout(1200)
    r = pg.evaluate("""() => {
      const d=document.querySelector('.test-item.expanded');
      const chips=[...d.querySelectorAll('.attack-chip')].map(a=>({t:a.textContent.trim(), href:a.getAttribute('href'), rel:a.getAttribute('rel')}));
      const fields=[...d.querySelectorAll('.detail-field .k')].map(e=>e.textContent.trim());
      return {chips, hasAttackField: fields.includes('MITRE ATT&CK'), hasCatField: fields.includes('Framework Category')};
    }""")
    ck('case detail shows a Framework Category field', r['hasCatField'], r)
    ck('case detail shows a MITRE ATT&CK field', r['hasAttackField'], r)
    ck('ATT&CK chips render with a technique', len(r['chips'])>0, r['chips'])
    ck('chips link to attack.mitre.org', all('attack.mitre.org/techniques/' in (c['href'] or '') for c in r['chips']), r['chips'])
    ck('external links carry rel=noopener', all('noopener' in (c['rel'] or '') for c in r['chips']), r['chips'])
    # LLM shows the ATLAS note rather than a forced technique
    pg.evaluate("""() => { const s=document.querySelector('.cat-section[data-cat=\"LLM\"]'); s.querySelector('.cat-head').click(); }""")
    pg.wait_for_timeout(800)
    pg.evaluate("""() => { const s=document.querySelector('.cat-section[data-cat=\"LLM\"]');
      const b=[...s.querySelectorAll('.cat-pick')].find(e=>!e.disabled); b && b.click(); }""")
    pg.wait_for_timeout(900)
    pg.evaluate("""() => { const s=document.querySelector('.cat-section[data-cat=\"LLM\"]');
      s.querySelector('.test-item .expand-btn').click(); }""")
    pg.wait_for_timeout(1200)
    r2 = pg.evaluate("""() => {
      const d=[...document.querySelectorAll('.test-item.expanded')].pop();
      return d ? d.textContent.includes('MITRE ATLAS') : null; }""")
    ck('LLM cases point at ATLAS instead of a forced ATT&CK id', r2 is True, r2)
    # LLM category names are the 2026 edition
    r3 = pg.evaluate("""() => ({ std: categoryIndexFor('LLM').standard,
      names: categoryIndexFor('LLM').categories.map(c=>c.code+' '+c.name) })""")
    ck('LLM taxonomy is the 2026 edition', '2026' in r3['std'], r3['std'])
    ck('LLM08 is Hidden Context Exposure (2026 rename)',
       any(n=='LLM08 Hidden Context Exposure' for n in r3['names']), r3['names'])
    ck('LLM03 is Excessive Agency (2026 promotion)',
       any(n=='LLM03 Excessive Agency' for n in r3['names']), r3['names'])
    ck('no uncaught errors', not errs, errs[:3])
    b.close()
h.shutdown()
print('\n' + ('ATT&CK + 2026 TAXONOMY OK' if not fails else f'{len(fails)} FAIL: {fails}'))
