/* VAPT CONSOLE — assessment.js: Assessment Mode, toast notifications, export/import, and the domain context editor. Depends on core.js + rendering.js. */

/* =========================================================
   ASSESSMENT MODE
========================================================= */
let assessModeOpen = false;

/* Assessment Mode now walks whatever the current filters resolve to —
   if the sidebar (or a ?domain= link) has you scoped to WEB, Assessment
   Mode walks only WEB's cases, in sequence order, instead of always
   cycling through the full 524-case dataset regardless of context. */
function getAssessmentQueue(){
  return allData.filter(matchesFilters).sort((a,b)=> a.sequence - b.sequence);
}

function openAssessMode(){
  const sorted = getAssessmentQueue();
  if(sorted.length === 0){
    showToast('No test cases match the current filters — clear a filter to start Assessment Mode.');
    return;
  }
  const firstIncomplete = sorted.findIndex(d=>d.status !== 'tested-pass');
  assessIndex = firstIncomplete === -1 ? 0 : firstIncomplete;
  assessModeOpen = true;
  const overlay = document.getElementById('assessOverlay');
  if(overlay) overlay.classList.add('open');
  renderAssessCard();
}
function closeAssessMode(){
  assessModeOpen = false;
  const overlay = document.getElementById('assessOverlay');
  if(overlay) overlay.classList.remove('open');
  renderAll();
}
/* Domains whose detail fetch has already triggered a re-render, so a second
   render never re-enters the same path. Without this, an item whose id is
   missing from its detail file leaves hasDetail() false forever: the cached
   promise resolves instantly, calls renderAssessCard again, which requests the
   same domain again — an unbounded microtask loop that hard-freezes the tab. */
const assessDetailAttempted = new Set();

function renderAssessCard(){
  const sorted = getAssessmentQueue();
  if(sorted.length === 0){ closeAssessMode(); return; }
  if(assessIndex >= sorted.length) assessIndex = sorted.length - 1;
  const item = sorted[assessIndex];

  /* Assessment Mode walks case by case, so fetch the domain's detail the first
     time it reaches that domain, then re-render once with full content. The
     card below still renders immediately from index-level fields, so the step
     never appears blank while the fetch is in flight. */
  if(!hasDetail(item) && !assessDetailAttempted.has(item.domain)){
    assessDetailAttempted.add(item.domain);
    ensureDetail(item.domain)
      .then(()=>{ if(assessModeOpen) renderAssessCard(); })
      .catch(()=>{
        // Allow a genuine retry later, but not an immediate re-entry.
        assessDetailAttempted.delete(item.domain);
        showToast('Could not load detail for this test case.');
      });
  }

  const total = sorted.length;
  const catMeta = DOMAIN_META.find(c=>c.code === item.domain);
  const phaseNum = DOMAIN_META.findIndex(c=>c.code === item.domain) + 1;

  const counter = document.getElementById('assessCounter');
  const progressFill = document.getElementById('assessProgressFill');
  if(counter) counter.textContent = `Test ${assessIndex+1} / ${total}`;
  if(progressFill) progressFill.style.width = ((assessIndex+1)/total*100) + '%';

  const body = document.getElementById('assessBody');
  if(!body) return;
  const isFirstOfDomain = assessIndex === 0 || sorted[assessIndex-1].domain !== item.domain;
  body.innerHTML = `
    <span class="assess-cat-tag">Phase ${phaseNum} · ${catMeta?catMeta.code:''} · ${escapeHtml(catMeta?catMeta.name:'')}</span>
    ${isFirstOfDomain ? renderDomainPrimer(item.domain) : ''}
    <div class="assess-title">${escapeHtml(item.title)}</div>
    <div class="item-top u-mb-14">
      <span class="order-badge">#${item.sequence}</span>
      <span class="item-id">${item.id}</span>
      <span class="sev-badge sev-chip" data-sev="${item.severity}">${escapeHtml(item.severityLabel||item.severity)}</span>
      <span class="cwe-badge">${escapeHtml(item.cwe||'—')}</span>
    </div>
    ${getDetailHtml(item)}
    <div class="assess-nav">
      <button class="btn${assessIndex===0?' u-disabled':''}" id="assessPrevBtn" ${assessIndex===0?'disabled':''}>${svgIcon('chevronleft')} Previous</button>
      <button class="btn assess-mark ${item.status==='tested-pass'?'done':''}" id="assessMarkBtn">${item.status==='tested-pass'?checkSvg()+' Passed':'Mark Pass'}</button>
      <button class="btn${assessIndex===total-1?' u-disabled':''}" id="assessNextBtn" ${assessIndex===total-1?'disabled':''}>Next ${svgIcon('chevronright')}</button>
    </div>
    <div class="assess-jump-hint">Use <kbd>←</kbd> <kbd>→</kbd> to navigate, <kbd>Esc</kbd> to exit</div>
  `;
  bindResultEvents(body);
  const prevBtn = document.getElementById('assessPrevBtn');
  const nextBtn = document.getElementById('assessNextBtn');
  const markBtn = document.getElementById('assessMarkBtn');
  if(prevBtn) prevBtn.onclick = assessPrev;
  if(nextBtn) nextBtn.onclick = assessNext;
  if(markBtn){
    markBtn.onclick = ()=>{
      item.status = item.status === 'tested-pass' ? 'not-tested' : 'tested-pass';
      markInteraction(item.domain);
      detailCache.delete(item.id);
      persist();
      renderAssessCard();
      if(item.status === 'tested-pass') setTimeout(()=>{ if(assessIndex < total-1) assessNext(); }, 400);
    };
  }
}
function assessNext(){
  const sorted = getAssessmentQueue();
  if(assessIndex < sorted.length-1){ assessIndex++; renderAssessCard(); }
}
function assessPrev(){ if(assessIndex > 0){ assessIndex--; renderAssessCard(); } }

document.getElementById('assessModeBtn').addEventListener('click', openAssessMode);
document.getElementById('assessClose').addEventListener('click', closeAssessMode);
document.getElementById('assessOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'assessOverlay') closeAssessMode(); });

/* =========================================================
   TOAST
========================================================= */
function showToast(msg){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=> t.classList.remove('show'), 2800);
}

/* =========================================================
   EXPORT / IMPORT
========================================================= */
document.getElementById('exportJsonBtn').addEventListener('click', ()=>{
  /* An item is worth exporting if ANY part of its notes has content —
     not just the findings text. Filtering on findings alone silently
     dropped items where the assessor had only attached a screenshot or
     filled in endpoints, which is real evidence loss on re-import. */
  const hasNotes = (d)=>{
    const n = d.assessorNotes;
    if(!n) return false;
    return !!(n.findings || n.pocDetails
      || (n.evidenceLinks && n.evidenceLinks.length)
      || (n.affectedEndpoints && n.affectedEndpoints.length)
      || (n.attachments && n.attachments.length)
      || (n.remediation && (n.remediation.state !== 'open' || n.remediation.retestedAt || n.remediation.note)));
  };
  const payload = {
    tester: document.getElementById('testerName').value || '',
    exportedAt: new Date().toISOString(),
    statuses: Object.fromEntries(allData.filter(d=>d.status && d.status !== 'not-tested').map(d=>[d.id, d.status])),
    notes: Object.fromEntries(allData.filter(hasNotes).map(d=>[d.id, JSON.stringify(d.assessorNotes)])),
    flagged: allData.filter(d=>d.flagged).map(d=>d.id),
    /* Custom cases and chains live in their own storage keys, so without
       exporting them here a re-import would restore progress against test
       cases that no longer exist, and drop the analyst's own authored
       content entirely. */
    customCases: (typeof loadCustomCases === 'function') ? loadCustomCases() : [],
    chains: (typeof loadChains === 'function') ? loadChains() : [],
  };
  downloadFile(`greysh3ll-progress-${Date.now()}.json`, JSON.stringify(payload,null,2), 'application/json');
  showToast('Progress saved to file.');
});
document.getElementById('exportCsvBtn').addEventListener('click', async ()=>{
  /* The CSV includes each case's reference standard and tools, which live in
     the lazily-fetched detail files — pull every domain before building it,
     otherwise those columns silently export empty for unopened domains. */
  showToast('Preparing export…');
  try{ await ensureAllDetail(); }
  catch(err){ showToast('Could not load all test case detail — export cancelled.'); return; }
  const tester = document.getElementById('testerName').value || '(unspecified)';
  const header = 'TestOrder,Tester,Domain,ID,Vulnerability,Severity,Status,Flagged,CWE,Standard,Tools,Notes,Remediation,RetestedOn,RetestNotes\n';
  const esc = (s)=> `"${String(s==null?'':s).replace(/"/g,'""')}"`;
  const rows = allData.slice().sort((a,b)=>a.sequence-b.sequence).map(d=>{
    const ref = d.reference || {};
    const tools = Array.isArray(ref.tools) ? ref.tools.join(', ') : (ref.tools || '');
    return [d.sequence, esc(tester), esc(d.domain), esc(d.id), esc(d.title), esc(d.severityLabel||d.severity),
      esc(d.status), d.flagged?'YES':'NO', esc(d.cwe||''), esc(ref.standard||''),
      esc(tools), esc(d.assessorNotes?.findings||''),
      esc(d.status==='tested-fail' ? getRemediationObj((d.assessorNotes?.remediation||{}).state).label : ''),
      esc((d.assessorNotes?.remediation||{}).retestedAt||''),
      esc((d.assessorNotes?.remediation||{}).note||'')].join(',');
  }).join('\n');
  downloadFile(`greysh3ll-findings-${Date.now()}.csv`, header+rows, 'text/csv');
  showToast('CSV exported.');
});
document.getElementById('printBtn').addEventListener('click', async ()=>{
  /* The report prints descriptions, impact and mitigations for every failed
     or flagged case, so all detail must be resident before it is built. */
  showToast('Building report…');
  try{ await ensureAllDetail(); }
  catch(err){ showToast('Could not load all test case detail — report cancelled.'); return; }
  document.getElementById('reportRoot').innerHTML = buildReportHTML();
  const originalTitle = document.title;
  const dateForFilename = new Date().toISOString().slice(0,10);
  document.title = `GreySh3ll-Security-Assessment-Report-${dateForFilename}`;
  window.print();
  setTimeout(()=>{ document.title = originalTitle; }, 500);
});

/* =========================================================
   REPORT GENERATION
   Builds a proper cover-page → executive-summary → findings →
   appendix report instead of just printing the interactive
   checklist UI. Only runs at print time (see printBtn above);
   @media print hides everything on the page except #reportRoot.
========================================================= */
const REPORT_SEV_COLOR = { critical:'#B91C1C', high:'#C2410C', medium:'#A16207', low:'#15803D', info:'#0369A1' };
const REPORT_STATUS_LABEL = { 'not-tested':'Not Tested', 'in-progress':'In Progress', 'tested-pass':'Pass', 'tested-fail':'Fail', 'not-applicable':'N/A' };

function buildReportHTML(){
  const tester = (document.getElementById('testerName').value || '').trim() || 'Unspecified';
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { year:'numeric', month:'long', day:'numeric' });

  const total = allData.length;
  const byStatus = { 'tested-pass':0, 'tested-fail':0, 'not-applicable':0, 'in-progress':0, 'not-tested':0 };
  allData.forEach(d => { byStatus[d.status] = (byStatus[d.status]||0) + 1; });
  const pct = total ? Math.round(byStatus['tested-pass']/total*100) : 0;
  const flaggedItems = allData.filter(d => d.flagged);
  const findings = allData
    .filter(d => d.status === 'tested-fail' || d.flagged)
    .sort((a,b) => (SEV_ORDER[a.severity]-SEV_ORDER[b.severity]) || (a.sequence-b.sequence));

  const domainContext = loadDomainContext();
  const domainsWithContext = CATEGORIES.filter(c => {
    const ctx = domainContext[c.code];
    return ctx && (ctx.scopeNotes || ctx.targetDetails || ctx.engagementDates || ctx.authorizationRef);
  });

  const sevCounts = SEVERITIES.map(s => ({
    ...s, total: allData.filter(d=>d.severity===s.key).length,
    open: allData.filter(d=>d.severity===s.key && d.status==='tested-fail').length
  }));

  return `
    <section class="report-page report-cover">
      <div class="report-cover-inner">
        <div class="report-cover-eyebrow">GreySh3ll — Vulnerability Assessment &amp; Penetration Testing</div>
        <h1 class="report-cover-title">Security Assessment<br>Report</h1>
        <div class="report-cover-rule"></div>
        <table class="report-cover-meta">
          <tr><td>Prepared by</td><td>${escapeHtml(tester)}</td></tr>
          <tr><td>Report date</td><td>${escapeHtml(dateStr)}</td></tr>
          <tr><td>Scope</td><td>${CATEGORIES.length} domains · ${total} test cases</td></tr>
          <tr><td>Overall completion</td><td>${pct}% (${byStatus['tested-pass']}/${total} passed)</td></tr>
          <tr><td>Open findings</td><td>${findings.length}</td></tr>
        </table>
      </div>
      <div class="report-cover-footer">
        <strong>CONFIDENTIAL</strong> — Prepared for the intended recipient only. This report
        documents the results of an authorized security assessment and may contain
        sensitive technical detail. Distribute only to individuals with a legitimate
        need to know.
      </div>
    </section>

    <section class="report-page">
      <h2 class="report-h2">Executive Summary</h2>
      <p class="report-body">
        This report documents the results of a security assessment covering
        <strong>${CATEGORIES.length} testing domains</strong> —
        ${CATEGORIES.map(c=>escapeHtml(c.name)).join(', ')} — comprising
        <strong>${total} individual test cases</strong>, executed and tracked
        by ${escapeHtml(tester)} using the GreySh3ll assessment methodology.
        Testing followed the engagement order network reconnaissance,
        application-layer testing, and human-layer/physical testing last,
        with each test case identified, exploited where applicable, and
        assessed against its corresponding CWE, OWASP, and/or MITRE ATT&amp;CK
        reference.
      </p>

      <div class="report-stat-row">
        <div class="report-stat-box"><b>${total}</b><span>Total test cases</span></div>
        <div class="report-stat-box"><b>${byStatus['tested-pass']}</b><span>Passed</span></div>
        <div class="report-stat-box report-stat-warn"><b>${byStatus['tested-fail']}</b><span>Failed / open findings</span></div>
        <div class="report-stat-box"><b>${byStatus['not-applicable']}</b><span>Not applicable</span></div>
        <div class="report-stat-box"><b>${pct}%</b><span>Overall completion</span></div>
      </div>

      <h3 class="report-h3">Risk Summary by Severity</h3>
      <table class="report-table">
        <thead><tr><th>Severity</th><th>Total cases</th><th>Open findings</th><th>Status</th></tr></thead>
        <tbody>
          ${sevCounts.map(s => `<tr>
            <td><span class="report-sev-chip" style="background:${REPORT_SEV_COLOR[s.key]}">${escapeHtml(s.label)}</span></td>
            <td>${s.total}</td>
            <td>${s.open}</td>
            <td>${s.open > 0 ? `<strong style="color:${REPORT_SEV_COLOR[s.key]}">Action required</strong>` : 'Clear'}</td>
          </tr>`).join('')}
        </tbody>
      </table>

      ${domainsWithContext.length ? `
      <h3 class="report-h3">Engagement Details</h3>
      <table class="report-table report-table-context">
        <thead><tr><th>Domain</th><th>Scope</th><th>Target(s)</th><th>Dates</th><th>Authorization</th></tr></thead>
        <tbody>
          ${domainsWithContext.map(c => {
            const ctx = domainContext[c.code];
            return `<tr>
              <td><strong>${escapeHtml(c.code)}</strong></td>
              <td>${escapeHtml(ctx.scopeNotes||'—')}</td>
              <td>${escapeHtml(ctx.targetDetails||'—')}</td>
              <td>${escapeHtml(ctx.engagementDates||'—')}</td>
              <td>${escapeHtml(ctx.authorizationRef||'—')}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>` : ''}
    </section>

    <section class="report-page">
      <h2 class="report-h2">Testing Coverage</h2>
      <p class="report-body">The table below summarizes coverage across all ${CATEGORIES.length} domains in engagement order.</p>
      <table class="report-table">
        <thead><tr><th>#</th><th>Domain</th><th>Total</th><th>Pass</th><th>Fail</th><th>N/A</th><th>Not tested</th></tr></thead>
        <tbody>
          ${CATEGORIES.map((c,i) => {
            const items = allData.filter(d=>d.domain===c.code);
            const t = items.length;
            const p = items.filter(d=>d.status==='tested-pass').length;
            const f = items.filter(d=>d.status==='tested-fail').length;
            const na = items.filter(d=>d.status==='not-applicable').length;
            const nt = items.filter(d=>d.status==='not-tested'||d.status==='in-progress').length;
            return `<tr><td>${i+1}</td><td>${escapeHtml(c.name)} (${c.code})</td><td>${t}</td><td>${p}</td><td>${f?`<strong style="color:${REPORT_SEV_COLOR.critical}">${f}</strong>`:'0'}</td><td>${na}</td><td>${nt}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    </section>

    ${findings.length ? `
    <section class="report-page">
      <h2 class="report-h2">Detailed Findings</h2>
      <p class="report-body">
        The following ${findings.length} finding(s) were identified during testing or flagged
        by the assessor for follow-up, ordered by severity.
      </p>
      ${findings.map(item => {
        const catMeta = DOMAIN_META.find(c=>c.code===item.domain);
        const notes = item.assessorNotes || {};
        return `
        <div class="report-finding">
          <div class="report-finding-head">
            <span class="report-sev-chip" style="background:${REPORT_SEV_COLOR[item.severity]}">${escapeHtml(item.severityLabel||item.severity)}</span>
            <span class="report-finding-id">${escapeHtml(item.id)}</span>
            <span class="report-finding-status">${item.flagged ? 'FLAGGED' : REPORT_STATUS_LABEL[item.status]}</span>
          </div>
          <h3 class="report-finding-title">${escapeHtml(item.title)}</h3>
          <div class="report-finding-meta">${escapeHtml(catMeta ? catMeta.name : item.domain)} &middot; ${escapeHtml(item.cwe||'')} ${item.reference?.standard ? '&middot; '+escapeHtml(item.reference.standard) : ''}</div>

          <div class="report-field"><div class="report-field-label">Description</div><p>${escapeHtml(item.whatItIs||'')}</p></div>
          <div class="report-field"><div class="report-field-label">Impact</div><p>${escapeHtml(item.impact||'')}</p></div>
          ${notes.findings ? `<div class="report-field"><div class="report-field-label">Assessor Findings</div><p>${escapeHtml(notes.findings)}</p></div>` : ''}
          ${notes.pocDetails ? `<div class="report-field"><div class="report-field-label">Proof of Concept</div><p>${escapeHtml(notes.pocDetails)}</p></div>` : ''}
          ${(notes.affectedEndpoints && notes.affectedEndpoints.length) ? `<div class="report-field"><div class="report-field-label">Affected Endpoints</div><ul>${notes.affectedEndpoints.map(e=>`<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
          <div class="report-field"><div class="report-field-label">Recommended Mitigation</div>
            <ul>${(item.mitigation||[]).slice(0,4).map(m=>`<li>${escapeHtml(m)}</li>`).join('')}</ul>
          </div>
          ${(notes.evidenceLinks && notes.evidenceLinks.length) ? `<div class="report-field"><div class="report-field-label">Evidence</div><ul>${notes.evidenceLinks.map(e=>`<li>${escapeHtml(e)}</li>`).join('')}</ul></div>` : ''}
          ${(notes.remediation && notes.remediation.state && notes.remediation.state!=='open') ? `<div class="report-field"><div class="report-field-label">Remediation Status</div><p>${escapeHtml(getRemediationObj(notes.remediation.state).label)}${notes.remediation.retestedAt?` &middot; retested ${escapeHtml(notes.remediation.retestedAt)}`:''}${notes.remediation.note?` &mdash; ${escapeHtml(notes.remediation.note)}`:''}</p></div>` : ''}
          ${(notes.attachments && notes.attachments.length) ? `<div class="report-field"><div class="report-field-label">Evidence Attachments</div>
            <div class="report-attachments">${notes.attachments.map(a=>`<img src="${a.dataUrl}" alt="${escapeHtml(a.name||'evidence')}" class="report-attachment-img">`).join('')}</div>
          </div>` : ''}
        </div>`;
      }).join('')}
    </section>` : `
    <section class="report-page">
      <h2 class="report-h2">Detailed Findings</h2>
      <p class="report-body">No failed or flagged test cases were recorded at the time this report was generated.</p>
    </section>`}

    ${(typeof buildChainSequences === 'function' && buildChainSequences().length) ? `
    <section class="report-page">
      <h2 class="report-h2">Attack Chain Analysis</h2>
      <p class="report-body">The following finding sequences were identified during testing, showing how individual issues combine into a broader compromise path.</p>
      ${buildChainSequences().map(seq => `
        <div class="report-finding u-no-break">
          <div class="report-chain-path">
            ${seq.map((edge,i)=>{
              const fromItem = allData.find(d=>d.id===edge.fromId);
              const toItem = allData.find(d=>d.id===edge.toId);
              return `${i===0?`<div class="report-chain-node"><strong>${escapeHtml(edge.fromId)}</strong> — ${escapeHtml(fromItem?fromItem.title:'')}</div>`:''}
                <div class="report-chain-arrow">↓${edge.note?` <em>${escapeHtml(edge.note)}</em>`:''}</div>
                <div class="report-chain-node"><strong>${escapeHtml(edge.toId)}</strong> — ${escapeHtml(toItem?toItem.title:'')}</div>`;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </section>` : ''}

    <section class="report-page">
      <h2 class="report-h2">Appendix — Full Test Log</h2>
      <p class="report-body">Complete record of every test case executed as part of this engagement, in testing order.</p>
      <table class="report-table report-table-compact">
        <thead><tr><th>ID</th><th>Domain</th><th>Test Case</th><th>Severity</th><th>Status</th></tr></thead>
        <tbody>
          ${allData.slice().sort((a,b)=>a.sequence-b.sequence).map(d => `<tr>
            <td>${escapeHtml(d.id)}</td>
            <td>${escapeHtml(d.domain)}</td>
            <td>${escapeHtml(d.title)}</td>
            <td>${escapeHtml(d.severityLabel||d.severity)}</td>
            <td>${d.flagged ? 'Flagged' : escapeHtml(REPORT_STATUS_LABEL[d.status]||d.status)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="report-footnote">Report generated by GreySh3ll on ${escapeHtml(dateStr)}. This document reflects the assessment state at the time of generation and does not update automatically.</p>
    </section>
  `;
}
document.getElementById('importBtn').addEventListener('click', ()=>{
  document.getElementById('importInput').click();
});
document.getElementById('importInput').addEventListener('change', (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = (evt)=>{
    let payload;
    try{
      payload = JSON.parse(evt.target.result);
    }catch(err){
      showToast('That file is not valid JSON — pick a progress file exported from GreySh3ll.');
      return;
    }

    // Reject anything that is not actually a GreySh3ll export, with the
    // specific reason, rather than importing nothing and reporting success.
    const check = validateProgressPayload(payload);
    if(!check.ok){
      showToast(check.errors[0] || 'That file is not a valid GreySh3ll export.');
      console.error('GreySh3ll: import rejected —', check.errors);
      return;
    }

    /* Importing overwrites the current engagement's statuses and notes, which
       is destructive and was previously unguarded. Show exactly what is in the
       file — including how many entries refer to cases this build does not
       have — so the decision is informed rather than blind. */
    const s = check.summary;
    const lines = [
      'Import this progress file into the current engagement?',
      '',
      `  ${s.statuses} test case statuses`,
      `  ${s.notes} sets of assessor notes`,
      `  ${s.flagged} flagged cases`,
      `  ${s.customCases} custom test cases`,
      `  ${s.chains} attack chain links`,
    ];
    if(s.tester) lines.push(`  Tester: ${s.tester}`);
    if(s.exportedAt) lines.push(`  Exported: ${s.exportedAt.slice(0,10)}`);
    if(s.unmatched) lines.push('', `${s.unmatched} entr${s.unmatched===1?'y refers':'ies refer'} to test cases not in this build and will be skipped.`);
    lines.push('', 'This overwrites matching entries in your current engagement.');
    if(!confirm(lines.join('\n'))) return;

    try{
      applyProgress(payload);
      if(payload.tester) document.getElementById('testerName').value = payload.tester;
      detailCache.clear();
      saveProgress(); renderAll();
      showToast(`Imported ${s.statuses} statuses, ${s.customCases} custom cases and ${s.chains} chain links.`);
    }catch(err){
      console.error('GreySh3ll: import failed', err);
      showToast('Import failed partway through. Check the browser console, then re-import.');
    }
  };
  reader.readAsText(file); e.target.value = '';
});
function downloadFile(filename, content, type){
  const blob = new Blob([content],{type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* =========================================================
   DOMAIN CONTEXT EDITOR
========================================================= */
function renderDomainContext(){
  const code = state.activeDomain;
  const domainMeta = DOMAIN_META.find(c => c.code === code);
  const panel = document.getElementById('domainContextPanel');
  if(!panel) return;
  if(!code || !domainMeta) {
    panel.classList.add('u-hidden');
    return;
  }
  let ctx = loadDomainContext();
  if(!ctx[code]) ctx[code] = { scopeNotes:'', targetDetails:'', engagementDates:'', authorizationRef:'' };

  panel.classList.remove('u-hidden');
  panel.querySelector('.ctx-domain-name').textContent = `${domainMeta.code} — ${domainMeta.name}`;

  ['scopeNotes','targetDetails','engagementDates','authorizationRef'].forEach(field => {
    const input = document.getElementById('ctx-'+field);
    if(input) input.value = ctx[code][field] || '';
  });
}

function saveDomainContextFromUI(){
  const code = state.activeDomain;
  if(!code) return;

  let ctx = loadDomainContext();
  if(!ctx[code]) ctx[code] = {};
  ['scopeNotes','targetDetails','engagementDates','authorizationRef'].forEach(field => {
    const input = document.getElementById('ctx-'+field);
    if(input) ctx[code][field] = input.value;
  });
  saveDomainContext(ctx);
}

function bindDomainContextEvents(){
  ['scopeNotes','targetDetails','engagementDates','authorizationRef'].forEach(field => {
    const input = document.getElementById('ctx-'+field);
    if(input) input.addEventListener('input', ()=> saveDomainContextFromUI());
  });
}

