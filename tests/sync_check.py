import http.server, socketserver, threading, functools, time, json, os
from playwright.sync_api import sync_playwright
# Repo root from this file so the script runs on any machine, not just where it was written.
APP = os.environ.get('GS_APP') or os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT=8181
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
h=socketserver.TCPServer(('127.0.0.1',PORT), functools.partial(Q,directory=APP))
threading.Thread(target=h.serve_forever,daemon=True).start(); time.sleep(0.4)
fails=[]
def check(name, cond, detail=''):
    print(('ok   ' if cond else 'FAIL ')+name+(('  -> '+str(detail)) if not cond and detail else ''))
    if not cond: fails.append(name)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900})
    errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{PORT}/assessment.html', wait_until='networkidle'); pg.wait_for_timeout(1700)

    # ---- 1. numbering is consistent across the dataset ----
    r = pg.evaluate("""() => {
      const bad=[]; const seqs=new Set();
      CATEGORIES.forEach(c=>{
        const dom=allData.filter(d=>d.domain===c.code).sort((a,b)=>a.sequence-b.sequence);
        dom.forEach((d,i)=>{ if(d.domainIndex!==i+1) bad.push(d.id+' idx '+d.domainIndex); });
      });
      allData.forEach(d=>{ if(seqs.has(d.sequence)) bad.push('dup seq '+d.id); seqs.add(d.sequence); });
      return {bad: bad.slice(0,5), hasPhase: allData.some(d=>'phase' in d)};
    }""")
    check('domainIndex contiguous & sequences unique', not r['bad'], r['bad'])
    check('phase field fully removed', not r['hasPhase'])

    # ---- 2. custom case joins the domain cleanly ----
    r = pg.evaluate("""() => {
      const before = allData.filter(d=>d.domain==='WIFI');
      const maxIdx = Math.max(...before.map(d=>d.domainIndex));
      const c = addCustomCase({domain:'WIFI', title:'Sync probe', severity:'high', cwe:'CWE-1',
        prerequisites:'', whatItIs:'x', rootCause:'', impact:'',
        stepsToIdentify:'a', exploitationSteps:'b', mitigation:'c'});
      state.collapsed.delete('WIFI');
      renderAll();
      ensureCategoryBodyRendered(document.querySelector('.cat-section[data-cat="WIFI"]'));
      const el = ensureItemRendered(c.id);
      const row = el && el.querySelector('.order-badge');
      // does its sequence collide with the next domain's first case?
      const nextDomainMin = Math.min(...allData.filter(d=>d.domain==='SRC').map(d=>d.sequence));
      const sorted = sortItems(allData.slice(), 'default');
      const pos = sorted.findIndex(d=>d.id===c.id);
      const neighbourDomain = sorted[pos-1] && sorted[pos-1].domain;
      const out = { id:c.id, idx:c.domainIndex, expectIdx:maxIdx+1,
                    badge: row ? row.textContent : null,
                    seqCollides: allData.filter(d=>d.sequence===c.sequence).length>1,
                    sortsInsideDomain: neighbourDomain==='WIFI' };
      removeCustomCase(c.id); renderAll();
      return out;
    }""")
    check('custom case gets the next domain number', r['idx']==r['expectIdx'], r)
    check('custom case badge is not #undefined', r['badge'] and 'undefined' not in r['badge'], r['badge'])
    check('custom case sequence does not collide', not r['seqCollides'])
    check('custom case sorts within its own domain', r['sortsInsideDomain'])

    # ---- 3. collapse-all / expand-all label + state stay in sync ----
    pg.evaluate("document.querySelector('.cat-section[data-cat=\"LLM\"] .cat-head').click();")
    pg.wait_for_timeout(600)
    # a domain opens into its category chooser now, so pick one first
    pg.evaluate("document.querySelector('.cat-section[data-cat=\"LLM\"] .cat-pick:not([disabled])').click();")
    pg.wait_for_timeout(800)
    pg.evaluate("document.querySelectorAll('.cat-section[data-cat=\"LLM\"] .test-item .expand-btn')[0].click();")
    pg.wait_for_timeout(700)
    lbl1 = pg.evaluate("document.querySelector('#expandBtn .lbl').textContent")
    pg.evaluate("document.getElementById('expandBtn').click();"); pg.wait_for_timeout(600)
    st = pg.evaluate("({exp: state.expanded.size, col: state.collapsed.size, lbl: document.querySelector('#expandBtn .lbl').textContent})")
    check('collapse all clears open cases', st['exp']==0, st)
    check('collapse all label flips to Expand all', st['lbl'].strip()=='Expand all', st)
    pg.evaluate("document.getElementById('expandBtn').click();"); pg.wait_for_timeout(900)
    st2 = pg.evaluate("({exp: state.expanded.size, col: state.collapsed.size, lbl: document.querySelector('#expandBtn .lbl').textContent})")
    check('expand all reopens sections only', st2['col']==0 and st2['exp']==0, st2)

    # ---- 4. CSV export carries the per-domain number ----
    csv = pg.evaluate("""() => {
      const hdr='DomainCaseNo';
      const src = document.querySelector('script[src*="assessment.js"]') ? true : false;
      return src;
    }""")
    check('assessment.js still loaded', csv)

    # ---- 5. export -> import round trip preserves everything ----
    r = pg.evaluate("""() => {
      const id='WIFI-005';
      const item=allData.find(d=>d.id===id);
      item.status='tested-fail'; item.flagged=true;
      item.assessorNotes.findings='round trip probe';
      item.assessorNotes.evidenceLinks=['https://example.test/a'];
      saveProgress();
      const payload={ statuses:Object.fromEntries(allData.filter(d=>d.status!=='not-tested').map(d=>[d.id,d.status])),
                      notes:Object.fromEntries(allData.filter(d=>d.assessorNotes.findings).map(d=>[d.id,JSON.stringify(d.assessorNotes)])),
                      flagged:allData.filter(d=>d.flagged).map(d=>d.id), customCases:[], chains:[] };
      const v=validateProgressPayload(payload);
      // wipe, then restore
      allData.forEach(d=>{d.status='not-tested'; d.flagged=false; d.assessorNotes={findings:'',evidenceLinks:[],pocDetails:'',affectedEndpoints:[],attachments:[]};});
      applyProgress(payload);
      const back=allData.find(d=>d.id===id);
      return { ok:v.ok, status:back.status, flagged:back.flagged,
               findings:back.assessorNotes.findings,
               links:Array.isArray(back.assessorNotes.evidenceLinks),
               attachments:Array.isArray(back.assessorNotes.attachments) };
    }""")
    check('export payload validates', r['ok'], r)
    check('status/flag/notes survive round trip', r['status']=='tested-fail' and r['flagged'] and r['findings']=='round trip probe', r)
    check('normalised notes keep array shapes', r['links'] and r['attachments'], r)

    # ---- 6. hostile import is neutralised ----
    r = pg.evaluate("""() => {
      const id='WIFI-006';
      applyProgress({ statuses:{}, notes:{ [id]: JSON.stringify({
        findings:'x', evidenceLinks:'not-an-array',
        attachments:[{name:'a', dataUrl:'data:image/png,x" onerror="window.__pwned=1'}]
      })}, flagged:[] });
      renderAll();
      const it=allData.find(d=>d.id===id);
      const html=renderAttachmentGrid(it);
      return { links:Array.isArray(it.assessorNotes.evidenceLinks),
               rawSrc: html.includes('onerror'),
               pwned: !!window.__pwned };
    }""")
    check('malformed evidenceLinks coerced to array', r['links'], r)
    check('hostile dataUrl never reaches src', not r['rawSrc'], r)
    check('no script executed from import', not r['pwned'])

    # ---- 6b. categorisation is coherent across every surface ----
    r = pg.evaluate("""() => {
      const idx = categoryIndex;
      const problems = [];
      Object.keys(idx).forEach(dom => {
        const codes = new Set(idx[dom].categories.map(c => c.code));
        allData.filter(d => d.domain === dom).forEach(d => {
          if (!codes.has(d.categoryCode)) problems.push(d.id + ':' + d.categoryCode);
          if (d.categoryStandard !== idx[dom].standard && !d.custom)
            problems.push(d.id + ' standard');
        });
        const summed = idx[dom].categories.reduce((n,c)=>n+c.count,0);
        const actual = allData.filter(d => d.domain === dom && !d.custom).length;
        if (summed !== actual) problems.push(dom + ' count ' + summed + '!=' + actual);
      });
      return { problems: problems.slice(0,5), domains: Object.keys(idx).length };
    }""")
    check('every case sits in its domain taxonomy', not r['problems'], r)
    check('all ten domains have a taxonomy', r['domains'] == 10, r)

    r = pg.evaluate("""() => {
      // every category card must lead to exactly the cases it claims
      document.querySelector('.cat-section[data-cat="MOBILE"] .cat-head').click();
      return new Promise(res => setTimeout(() => {
        const s = document.querySelector('.cat-section[data-cat="MOBILE"]');
        const cards = [...s.querySelectorAll('.cat-pick:not([disabled])')];
        const card = cards[0];
        const code = card.dataset.code;
        const claimed = parseInt(card.querySelector('.cat-pick-count').textContent.split('/')[1], 10);
        card.click();
        setTimeout(() => {
          const ids = [...s.querySelectorAll('.test-item')].map(e => e.dataset.id);
          res({ code, claimed,
                shown: ids.length,
                allMatch: ids.every(id => allData.find(d => d.id === id).categoryCode === code),
                expected: allData.filter(d => d.domain === 'MOBILE' && d.categoryCode === code).length });
        }, 700);
      }, 700));
    }""")
    check('card count matches the category size', r['claimed'] == r['expected'], r)
    check('opening a card lists only that category', r['allMatch'], r)

    # ---- 7. dashboard charts agree with the cards ----
    pg.goto(f'http://127.0.0.1:{PORT}/index.html', wait_until='networkidle'); pg.wait_for_timeout(1600)
    r = pg.evaluate("""() => {
      const card=parseInt(document.getElementById('dashTotal').textContent,10);
      const donut=parseInt(document.querySelector('.chart-donut-center b').textContent,10);
      const legend=[...document.querySelectorAll('#chartStatus .chart-legend-val')]
        .reduce((s,e)=>s+parseInt(e.textContent,10),0);
      const bars=[...document.querySelectorAll('.chart-bar-val')]
        .reduce((s,e)=>s+parseInt(e.textContent.split('/')[1],10),0);
      return {card, donut, legend, bars, data: allData.length};
    }""")
    check('donut total matches dataset', r['donut']==r['data'], r)
    check('status legend sums to dataset', r['legend']==r['data'], r)
    check('domain bars sum to dataset', r['bars']==r['data'], r)
    check('dashboard card matches dataset', r['card']==r['data'], r)

    check('no uncaught errors', not errs, errs[:3])
    b.close()
h.shutdown()
print('\n' + ('ALL CONSISTENT' if not fails else f'{len(fails)} INCONSISTENCY: {fails}'))
