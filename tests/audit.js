/* audit.js — end-to-end functional audit.
   Boots each page with its real script list, runs boot(), then drives every
   user-facing flow. Any thrown error, console.error, or unhandled rejection
   is recorded as a finding rather than crashing the run. */
const { boot } = require('./harness');

const ASSESS = ['storage.js','primers.js','filters.js','search.js','dashboard.js','core.js',
                'rendering.js','interactions.js','assessment.js','features.js','toolkit.js',
                'effects-identity.js','boot.js'];
const HOME = ['storage.js','core.js','effects-identity.js','home.js'];

const findings = [];
function record(area, err){
  const msg = (err && err.message) || String(err);
  const stack = (err && err.stack || '').split('\n').slice(1,3).map(s=>s.trim()).join(' | ');
  findings.push({ area, msg, stack });
}

function instrument(w){
  const errs = [];
  w.__errors = errs;
  w.console = {
    log(){}, info(){}, warn(){},
    error(...a){ errs.push(a.map(x => (x && x.message) || String(x)).join(' ')); },
  };
  w.addEventListener('error', e => errs.push('window.onerror: ' + (e.message || e)));
  return w;
}

async function step(area, fn){
  try { await fn(); }
  catch(e){ record(area, e); }
}

async function auditAssessment(){
  const w = instrument(boot({ page:'assessment.html', scripts: ASSESS }));
  /* boot.js already kicks off loadAllData().then(boot) as it loads. Calling
     boot() again here would run it against an empty allData. Wait for the
     app's own boot instead. */
  await step('boot', async () => {
    for(let i = 0; i < 200; i++){
      if(w.document.querySelector('.cat-section')) return;
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error('app never rendered any .cat-section after boot');
  });

  const click = (sel, root) => {
    const el = (root || w.document).querySelector(sel);
    if(!el) throw new Error(`selector not found: ${sel}`);
    el.dispatchEvent(new w.Event('click', { bubbles:true }));
    return el;
  };
  const clickAll = (sel) => Array.from(w.document.querySelectorAll(sel));

  /* ---- section expand / collapse ---- */
  await step('section toggle', () => {
    click('.cat-section[data-cat="WIFI"] .cat-head');
    click('.cat-section[data-cat="WIFI"] .cat-head');
    click('.cat-section[data-cat="WIFI"] .cat-head');
  });

  /* Expanding a domain now lands on the category picker, so every step that
     works with rows has to choose a category first — the same journey a user
     takes. Picks the first category that actually has cases. */
  await step('pick a category', () => {
    const s = w.document.querySelector('.cat-section[data-cat="WIFI"]');
    const pick = Array.from(s.querySelectorAll('.cat-pick')).find(b => !b.disabled);
    if(!pick) throw new Error('no selectable category in WIFI');
    pick.dispatchEvent(new w.Event('click', { bubbles:true }));
  });

  /* ---- status cycling on a row ---- */
  await step('row status toggle', () => {
    const s = w.document.querySelector('.cat-section[data-cat="WIFI"]');
    for(let i=0;i<6;i++) click('[data-action="toggle"]', s);
  });
  await step('row flag toggle', () => {
    const s = w.document.querySelector('.cat-section[data-cat="WIFI"]');
    const f = s.querySelector('[data-action="flag"]');
    if(f){ f.dispatchEvent(new w.Event('click',{bubbles:true}));
           f.dispatchEvent(new w.Event('click',{bubbles:true})); }
  });

  /* ---- expanding a row's detail (async detail fetch) ---- */
  await step('row detail expand', async () => {
    const s = w.document.querySelector('.cat-section[data-cat="WIFI"]');
    const btn = s.querySelector('[data-action="expand"], .test-head');
    if(btn) btn.dispatchEvent(new w.Event('click',{bubbles:true}));
    await new Promise(r => setTimeout(r, 60));
  });

  /* ---- every status chip and severity filter ---- */
  await step('status chips', () => {
    clickAll('#statusChips .chip').forEach(c => c.dispatchEvent(new w.Event('click',{bubbles:true})));
  });
  await step('severity filters', () => {
    clickAll('[data-sev-filter], #sevChips .chip').forEach(c => c.dispatchEvent(new w.Event('click',{bubbles:true})));
  });
  await step('sort options', () => {
    const sel = w.document.getElementById('sortSelect');
    Array.from(sel.options).forEach(o => {
      sel.value = o.value;
      sel.dispatchEvent(new w.Event('change',{bubbles:true}));
    });
  });
  await step('search box', () => {
    const inp = w.document.getElementById('searchInput');
    ['smb','zzzznomatch','CWE-79',''].forEach(v => {
      inp.value = v; inp.dispatchEvent(new w.Event('input',{bubbles:true}));
    });
  });
  await step('expand all / collapse all', () => {
    click('#expandBtn'); click('#expandBtn'); click('#expandBtn');
  });
  await step('sidebar domain links', () => {
    clickAll('.side-link, .sidebar-domain, [data-domain]').slice(0,12)
      .forEach(a => a.dispatchEvent(new w.Event('click',{bubbles:true})));
  });
  await step('theme toggle', () => { click('#themeToggle'); click('#themeToggle'); });

  /* ---- command palette ---- */
  await step('command palette', () => {
    w.$fn('openPalette')();
    const inp = w.document.getElementById('paletteInput');
    if(inp){ inp.value = 'NET-100'; inp.dispatchEvent(new w.Event('input',{bubbles:true})); }
    const first = w.document.querySelector('.palette-item, .palette-row');
    if(first) first.dispatchEvent(new w.Event('click',{bubbles:true}));
    w.$fn('closePalette')();
  });

  /* ---- toolkit: every tab ---- */
  for(const tab of ['cvss','payloads','drills','report','scan','chains','custom','coverage']){
    await step('toolkit tab: ' + tab, async () => {
      w.__eval(`openToolkit(); activeToolkitTab = ${JSON.stringify(tab)}; renderToolkitPane();`);
      await new Promise(r => setTimeout(r, 120));
      w.__eval('renderToolkitPane();');
      await new Promise(r => setTimeout(r, 120));
    });
  }
  await step('toolkit close', () => { w.$fn('closeToolkit')(); });

  /* ---- CVSS calculator across every metric ---- */
  await step('cvss calculator', () => {
    const vectors = [
      'AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
      'AV:A/AC:H/PR:L/UI:R/S:C/C:L/I:L/A:N',
      'AV:P/AC:L/PR:H/UI:N/S:U/C:N/I:N/A:N',
    ];
    vectors.forEach(v => {
      const parts = Object.fromEntries(v.split('/').map(p => p.split(':')));
      const score = w.$fn('computeCvssScore')(parts);
      if(typeof score !== 'number' || Number.isNaN(score)) throw new Error(`bad score for ${v}: ${score}`);
      if(score < 0 || score > 10) throw new Error(`score out of range for ${v}: ${score}`);
      w.$fn('cvssSeverityLabel')(score);
    });
  });

  /* ---- scan ingestion for each supported format ---- */
  await step('scan import: nmap text', () => {
    const r = w.$fn('runScanIngestion')('Nmap scan report for 10.0.0.5\n445/tcp open microsoft-ds\n22/tcp open ssh\n');
    if(!r) throw new Error('no result object');
  });
  await step('scan import: nmap xml', () => {
    w.$fn('runScanIngestion')('<nmaprun><host><address addr="10.0.0.5"/><ports><port portid="443" protocol="tcp"><state state="open"/><service name="https"/></port></ports></host></nmaprun>');
  });
  await step('scan import: nuclei jsonl', () => {
    w.$fn('runScanIngestion')('{"template-id":"tech-detect","host":"https://x.example.com","info":{"name":"Tech detect","severity":"info"}}\n{"template-id":"ssl-issuer","host":"https://x.example.com","info":{"name":"SSL","severity":"low"}}');
  });
  await step('scan import: burp xml', () => {
    w.$fn('runScanIngestion')('<issues><issue><name>Cross-site scripting</name><host>x.example.com</host><severity>High</severity></issue></issues>');
  });
  await step('scan import: garbage input', () => {
    w.$fn('runScanIngestion')('%%% not a scan at all %%%');
    w.$fn('runScanIngestion')('');
  });

  /* ---- chains ---- */
  await step('chains', () => {
    w.$fn('addChain')('NET-001','WEB-001','pivot');
    w.$fn('addChain')('WEB-001','API-001','token reuse');
    w.$fn('addChain')('API-001','NET-001','loop back');   // cycle
    w.$fn('buildChainSequences')();
    const list = w.$fn('loadChains')();
    list.forEach(c => w.$fn('removeChain')(c.id));
  });

  /* ---- custom cases ---- */
  await step('custom cases', () => {
    const c = w.$fn('addCustomCase')({
      domain:'CLOUD', title:'Custom cloud case', severity:'medium', cwe:'CWE-284',
      prerequisites:'', whatItIs:'Something.', rootCause:'', impact:'',
      stepsToIdentify:'a\nb', exploitationSteps:'c', mitigation:'d' });
    w.$fn('renderResults')();
    w.$fn('removeCustomCase')(c.id);
    w.$fn('renderResults')();
  });

  /* ---- notes, remediation, attachments ---- */
  await step('assessor notes', () => {
    const el = w.document.querySelector('[data-action="notes-findings"]');
    if(el){ el.value = 'found something'; el.dispatchEvent(new w.Event('input',{bubbles:true}));
            el.dispatchEvent(new w.Event('change',{bubbles:true})); }
  });
  await step('remediation state', () => {
    w.$fn('setItemStatus')('WIFI-001','tested-fail');
    w.$fn('renderResults')();
    const sel = w.document.querySelector('[data-action="rem-state"]');
    if(sel){ sel.value = 'fixed'; sel.dispatchEvent(new w.Event('change',{bubbles:true})); }
  });

  /* ---- progress export / import round trip ---- */
  await step('export + import round trip', () => {
    w.$fn('setItemStatus')('NET-002','tested-pass');
    w.$fn('saveProgress')();
    const payload = {
      statuses: { 'NET-002':'tested-pass', 'WEB-003':'tested-fail' },
      notes: { 'NET-002':'{"findings":"x"}' }, flagged:['WEB-003'],
      customCases:[], chains:[], tester:'QA', exportedAt:new Date().toISOString() };
    const v = w.$fn('validateProgressPayload')(payload);
    if(!v.ok) throw new Error('valid payload rejected: ' + JSON.stringify(v.errors));
    w.$fn('applyProgress')(payload);
    w.$fn('renderAll')();
  });

  /* ---- report build ---- */
  await step('report build', async () => {
    await w.$fn('ensureAllDetail')();
    const html = w.$fn('buildReportHTML')();
    if(!html || html.length < 500) throw new Error('report HTML suspiciously short');
    const text = w.$fn('buildReportText')();
    if(!text || text.length < 200) throw new Error('report text suspiciously short');
  });

  /* ---- profiles ---- */
  await step('profiles', () => {
    const st = w.$('profilesState');
    w.$fn('switchToProfile')(st.profiles[0].id);
    w.$fn('renderProfileBar')();
  });

  /* ---- profile create / rename / delete, accept paths ---- */
  await step('profiles: create, rename, delete', () => {
    const before = w.$('profilesState.profiles.length');
    w.__promptReply = 'Audit Engagement';
    click('#profileNewBtn');
    if(w.$('profilesState.profiles.length') !== before + 1)
      throw new Error('new engagement was not created');
    w.__promptReply = '  Renamed Engagement  ';
    click('#profileRenameBtn');
    if(w.$('activeProfile().name') !== 'Renamed Engagement')
      throw new Error('rename did not trim or apply: ' + w.$('activeProfile().name'));
    w.__promptReply = '   ';                 // whitespace-only rename is a no-op
    click('#profileRenameBtn');
    if(w.$('activeProfile().name') !== 'Renamed Engagement')
      throw new Error('whitespace rename should have been ignored');
    w.__promptReply = '';                    // empty new-engagement name falls back
    click('#profileNewBtn');
    if(!w.$('activeProfile().name')) throw new Error('empty name produced a nameless engagement');
    w.__confirmReply = true;
    click('#profileDeleteBtn');
    w.__promptReply = null;
  });
  await step('profiles: last engagement cannot be deleted', () => {
    w.__eval('profilesState.profiles = [profilesState.profiles[0]];'
           + 'profilesState.activeId = profilesState.profiles[0].id; saveProfiles();');
    w.__confirmReply = true;
    click('#profileDeleteBtn');
    if(w.$('profilesState.profiles.length') !== 1)
      throw new Error('the final engagement was deleted');
  });

  /* ---- gamification / stats ---- */
  await step('stats + gamification', () => {
    w.$fn('updateGamification')();
    w.$fn('computeStats')();
    w.$fn('openStats')(); w.$fn('closeStats')();
  });

  /* ---- domain context ---- */
  await step('domain context', () => {
    w.$fn('saveDomainContext')({ NET:{ scope:'10.0.0.0/24', notes:'internal' } });
    w.$fn('renderDomainContext')();
  });

  /* ---- reset (destructive, guarded) ---- */
  await step('reset flow', () => {
    w.__confirmReply = false;
    click('#resetBtn');
    w.__confirmReply = true;
    click('#resetBtn');
  });

  /* Brute sweep: every button, every select option, every text control on the
     page. Catches handlers no scripted flow above happened to reach. */
  await step('sweep: every button', async () => {
    const btns = Array.from(w.document.querySelectorAll('button, [role="button"]'));
    for(const b of btns){
      try { b.dispatchEvent(new w.Event('click', { bubbles:true })); }
      catch(e){ record('button ' + (b.id || b.className || b.textContent.trim().slice(0,20)), e); }
      await new Promise(r => setTimeout(r, 0));
    }
  });
  await step('sweep: every select', () => {
    Array.from(w.document.querySelectorAll('select')).forEach(sel => {
      Array.from(sel.options).forEach(o => {
        try {
          sel.value = o.value;
          sel.dispatchEvent(new w.Event('change', { bubbles:true }));
        } catch(e){ record('select ' + (sel.id || sel.className), e); }
      });
    });
  });
  await step('sweep: every text control', () => {
    Array.from(w.document.querySelectorAll('input[type="text"], input:not([type]), textarea'))
      .forEach(el => {
        try {
          el.value = 'audit value <b>&</b> "quoted"';
          el.dispatchEvent(new w.Event('input', { bubbles:true }));
          el.dispatchEvent(new w.Event('change', { bubbles:true }));
          el.dispatchEvent(new w.Event('blur', { bubbles:true }));
        } catch(e){ record('input ' + (el.id || el.dataset.action || el.className), e); }
      });
  });
  await step('sweep: keyboard shortcuts', () => {
    ['/', 'j', 'k', 'Escape', '?', 'g'].forEach(key => {
      try {
        w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles:true }));
      } catch(e){ record('keydown ' + key, e); }
    });
  });

  await new Promise(r => setTimeout(r, 400));
  w.__errors.forEach(e => findings.push({ area:'assessment.html console.error', msg:e, stack:'' }));
  return w;
}

async function auditHome(){
  const w = instrument(boot({ page:'index.html', scripts: HOME }));
  await step('home boot', async () => {
    for(let i = 0; i < 200; i++){
      if(w.document.querySelector('.domain-card, [data-domain]')) return;
      await new Promise(r => setTimeout(r, 20));
    }
    throw new Error('dashboard never rendered any domain card');
  });
  await step('home search', () => {
    const inp = w.document.getElementById('dashSearch');
    if(inp){ ['xss','NET-001','zzz',''].forEach(v => {
      inp.value = v; inp.dispatchEvent(new w.Event('input',{bubbles:true})); }); }
  });
  await step('home identity collapse', () => {
    const b = w.document.getElementById('identityCollapseBtn');
    if(b){ b.dispatchEvent(new w.Event('click',{bubbles:true}));
           b.dispatchEvent(new w.Event('click',{bubbles:true})); }
  });
  await step('home theme', () => {
    const b = w.document.getElementById('themeBtn');
    if(b){ b.dispatchEvent(new w.Event('click',{bubbles:true}));
           b.dispatchEvent(new w.Event('click',{bubbles:true})); }
  });
  await step('home domain cards', () => {
    Array.from(w.document.querySelectorAll('.domain-card, [data-domain]')).slice(0,12)
      .forEach(c => c.dispatchEvent(new w.Event('click',{bubbles:true})));
  });
  await new Promise(r => setTimeout(r, 150));
  w.__errors.forEach(e => findings.push({ area:'index.html console.error', msg:e, stack:'' }));
  return w;
}

(async () => {
  await auditAssessment();
  await auditHome();

  if(!findings.length){
    console.log('AUDIT CLEAN — no errors across any exercised flow');
  } else {
    console.log(`AUDIT: ${findings.length} finding(s)\n`);
    const seen = new Set();
    findings.forEach(f => {
      const k = f.area + '::' + f.msg;
      if(seen.has(k)) return;
      seen.add(k);
      console.log(`[${f.area}]\n  ${f.msg}`);
      if(f.stack) console.log(`  ${f.stack}`);
    });
  }
  process.exit(0);
})();
