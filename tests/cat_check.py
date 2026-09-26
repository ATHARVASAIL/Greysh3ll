import http.server, socketserver, threading, functools, time, json
from playwright.sync_api import sync_playwright
APP='/home/claude/gs/vapt-console-hacker'; PORT=8191
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
h=socketserver.TCPServer(('127.0.0.1',PORT), functools.partial(Q,directory=APP))
threading.Thread(target=h.serve_forever,daemon=True).start(); time.sleep(0.4)
fails=[]
def check(n,c,d=''):
    print(('ok   ' if c else 'FAIL ')+n+(('  -> '+str(d)) if not c else ''))
    if not c: fails.append(n)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900})
    errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/assessment.html', wait_until='networkidle'); pg.wait_for_timeout(1800)

    pg.evaluate("document.querySelector('.cat-section[data-cat=\"WEB\"] .cat-head').click();")
    pg.wait_for_timeout(900)
    r = pg.evaluate("""() => {
      const s=document.querySelector('.cat-section[data-cat="WEB"]');
      return { picker: s.querySelectorAll('.cat-pick').length,
               rows: s.querySelectorAll('.test-item').length,
               first: s.querySelector('.cat-pick')?.textContent.replace(/\\s+/g,' ').trim().slice(0,60),
               std: s.textContent.includes('OWASP Top 10:2025') };
    }""")
    check('expanding WEB shows categories, not cases', r['picker']>0 and r['rows']==0, r)
    check('picker names the standard', r['std'], r)

    pg.evaluate("""() => {
      const s=document.querySelector('.cat-section[data-cat="WEB"]');
      [...s.querySelectorAll('.cat-pick')].find(e=>e.dataset.code==='A01').click();
    }""")
    pg.wait_for_timeout(1000)
    r = pg.evaluate("""() => {
      const s=document.querySelector('.cat-section[data-cat="WEB"]');
      const ids=[...s.querySelectorAll('.test-item')].map(e=>e.dataset.id);
      return { rows: ids.length, crumb: !!s.querySelector('.cat-crumb'),
               allA01: ids.every(id=>allData.find(d=>d.id===id).categoryCode==='A01'),
               expected: allData.filter(d=>d.domain==='WEB'&&d.categoryCode==='A01').length };
    }""")
    check('selecting a category lists only its cases', r['rows']>0 and r['allA01'], r)
    check('breadcrumb back-link is shown', r['crumb'], r)

    pg.evaluate("document.querySelector('.cat-crumb-back').click();")
    pg.wait_for_timeout(800)
    r = pg.evaluate("""() => {
      const s=document.querySelector('.cat-section[data-cat="WEB"]');
      return { picker: s.querySelectorAll('.cat-pick').length, rows: s.querySelectorAll('.test-item').length };
    }""")
    check('back returns to the category list', r['picker']>0 and r['rows']==0, r)

    # searching should bypass the picker
    pg.evaluate("""() => { const i=document.getElementById('searchInput'); i.value='idor'; i.dispatchEvent(new Event('input',{bubbles:true})); }""")
    pg.wait_for_timeout(1000)
    r = pg.evaluate("""() => ({ rows: document.querySelectorAll('.test-item').length,
                                pickers: document.querySelectorAll('.cat-pick').length })""")
    check('search shows matches directly, not the picker', r['rows']>0 and r['pickers']==0, r)
    pg.evaluate("""() => { const i=document.getElementById('searchInput'); i.value=''; i.dispatchEvent(new Event('input',{bubbles:true})); }""")
    pg.wait_for_timeout(800)

    # every category count must equal the real number of cases
    r = pg.evaluate("""() => {
      const bad=[];
      Object.entries(categoryIndex).forEach(([dom,g])=>g.categories.forEach(c=>{
        const n=allData.filter(d=>d.domain===dom&&d.categoryCode===c.code).length;
        if(n!==c.count) bad.push(dom+'/'+c.code+' says '+c.count+' has '+n);
      }));
      const uncat=allData.filter(d=>!d.categoryCode).map(d=>d.id);
      return {bad:bad.slice(0,5), uncat:uncat.slice(0,5), total:Object.keys(categoryIndex).length};
    }""")
    check('category counts match the data', not r['bad'], r['bad'])
    check('every case has a category', not r['uncat'], r['uncat'])
    check('no uncaught errors', not errs, errs[:3])
    b.close()
h.shutdown()
print('\n'+('CATEGORY LAYER OK' if not fails else f'{len(fails)} FAIL: {fails}'))
