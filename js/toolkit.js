/* VAPT CONSOLE — toolkit.js: the Analyst Toolkit (CVSS calculator, payload cheat-sheet, OSCP-style drills, report builder). Depends on core.js. */

/* =========================================================
   ANALYST TOOLKIT — CVSS calculator / payload cheat-sheet /
   OSCP-style drills / report builder
========================================================= */
const CVSS_METRICS = [
  { key:'AV', label:'Attack Vector', options:[['N','Network',0.85],['A','Adjacent',0.62],['L','Local',0.55],['P','Physical',0.2]] },
  { key:'AC', label:'Attack Complexity', options:[['L','Low',0.77],['H','High',0.44]] },
  { key:'PR', label:'Privileges Required', options:[['N','None',0.85],['L','Low',0.62],['H','High',0.27]] },
  { key:'UI', label:'User Interaction', options:[['N','None',0.85],['R','Required',0.62]] },
  { key:'S',  label:'Scope', options:[['U','Unchanged',0],['C','Changed',0]] },
  { key:'C',  label:'Confidentiality', options:[['N','None',0],['L','Low',0.22],['H','High',0.56]] },
  { key:'I',  label:'Integrity', options:[['N','None',0],['L','Low',0.22],['H','High',0.56]] },
  { key:'A',  label:'Availability', options:[['N','None',0],['L','Low',0.22],['H','High',0.56]] },
];
let cvssSelection = {AV:'N', AC:'L', PR:'N', UI:'N', S:'U', C:'N', I:'N', A:'N'};

function cvssSeverityLabel(score){
  if(score===0) return 'None';
  if(score<4) return 'Low';
  if(score<7) return 'Medium';
  if(score<9) return 'High';
  return 'Critical';
}
/* Standard CVSS v3.1 base score formula. */
function computeCvssScore(sel){
  const val = (key)=>{
    const m = CVSS_METRICS.find(mm=>mm.key===key);
    const opt = m.options.find(o=>o[0]===sel[key]);
    return opt ? opt[2] : 0;
  };
  const privReqMod = (key)=>{
    if(key!=='PR') return val('PR');
    const scoped = sel.S === 'C';
    if(sel.PR==='L') return scoped ? 0.68 : 0.62;
    if(sel.PR==='H') return scoped ? 0.5 : 0.27;
    return 0.85;
  };
  const iss = 1 - ((1-val('C')) * (1-val('I')) * (1-val('A')));
  let impact;
  if(sel.S === 'U') impact = 6.42 * iss;
  else impact = 7.52*(iss-0.029) - 3.25*Math.pow(iss-0.02, 15);
  if(impact <= 0) return 0;
  const exploitability = 8.22 * val('AV') * val('AC') * privReqMod('PR') * val('UI');
  let base;
  if(sel.S === 'U') base = Math.min(impact+exploitability, 10);
  else base = Math.min(1.08*(impact+exploitability), 10);
  return Math.ceil(base*10)/10;
}
function renderCvssVector(sel){
  return `CVSS:3.1/AV:${sel.AV}/AC:${sel.AC}/PR:${sel.PR}/UI:${sel.UI}/S:${sel.S}/C:${sel.C}/I:${sel.I}/A:${sel.A}`;
}
function renderCvssTab(){
  const score = computeCvssScore(cvssSelection);
  const label = cvssSeverityLabel(score);
  return `
    <div class="cvss-result">
      <div class="cvss-score sev-text" data-sev="${label.toLowerCase()}">${score.toFixed(1)}</div>
      <div class="cvss-sevlabel sev-text" data-sev="${label.toLowerCase()}">${label}</div>
      <div class="u-note u-mt-14 u-note-break">${escapeHtml(renderCvssVector(cvssSelection))}</div>
      <button class="btn u-mt-12" id="cvssCopyBtn">Copy vector</button>
    </div>
    <div class="cvss-grid">
      ${CVSS_METRICS.map(m=>`
        <div>
          <div class="cvss-metric-label">${m.label}</div>
          <div class="cvss-opts" data-metric="${m.key}">
            ${m.options.map(o=>`<button class="cvss-opt ${cvssSelection[m.key]===o[0]?'active':''}" data-val="${o[0]}">${o[1]}</button>`).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}
function bindCvssTab(pane){
  pane.querySelectorAll('.cvss-opts').forEach(row=>{
    row.querySelectorAll('.cvss-opt').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        cvssSelection[row.dataset.metric] = btn.dataset.val;
        renderToolkitPane();
      });
    });
  });
  const copyBtn = pane.querySelector('#cvssCopyBtn');
  if(copyBtn) copyBtn.addEventListener('click', ()=>{
    const text = renderCvssVector(cvssSelection);
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=> showToast('CVSS vector copied.'))
        .catch(()=> showToast('Could not copy to clipboard.'));
    }
  });
}

let toolkitCheatFilter = '';
function renderPayloadCheatSheetTab(){
  const q = toolkitCheatFilter.toLowerCase();
  /* Reads the lightweight toolkit bundle rather than allData, so this tab
     never requires the full ~2.5 MB detail set to be resident. */
  const source = (typeof toolkitData !== 'undefined' && toolkitData) ? toolkitData : allData;
  const sections = DOMAIN_META.map(c=>{
    const rows = [];
    source.filter(d=>d.domain===c.code).forEach(item=>{
      getPayloadList(item).forEach((p, i)=>{
        const hay = `${item.id} ${item.title} ${p.label||''} ${p.command||p.code||''}`.toLowerCase();
        if(q && !hay.includes(q)) return;
        rows.push({item, p, i});
      });
    });
    return { c, rows };
  }).filter(s=>s.rows.length);

  const totalRows = sections.reduce((n,s)=>n+s.rows.length, 0);

  return `
    <input type="text" id="cheatFilterInput" class="cheat-filter-input" placeholder="Filter payloads by test case, ID, or command…" value="${escapeHtml(toolkitCheatFilter)}">
    <div class="drill-hint u-my-block-b">${totalRows} payload${totalRows===1?'':'s'} match${q?` "${escapeHtml(toolkitCheatFilter)}"`:''}</div>
    <div class="cheatsheet">
      ${sections.map(({c, rows})=>`
        <div class="cheat-section">
          <div class="cheat-cat-label">${c.code} — ${escapeHtml(c.name)}</div>
          ${rows.slice(0,40).map(({item,p,i})=>`
            <div class="payload-block">
              <div class="term-window">
                <div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span><span class="term-title">${escapeHtml(item.id)} · ${escapeHtml(p.label||'payload')}</span></div>
                <div class="detail-payload">${escapeHtml(p.command||p.code||'')}<button class="detail-payload-copy" data-action="copy-payload" data-id="${item.id}" data-idx="${i}">Copy</button></div>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('') || '<div class="palette-empty">No payloads match your filter.</div>'}
    </div>
  `;
}
function bindPayloadCheatSheetTab(pane){
  const input = pane.querySelector('#cheatFilterInput');
  if(input){
    input.addEventListener('input', (e)=>{
      toolkitCheatFilter = e.target.value;
      renderToolkitPane();
      // restore focus + caret since renderToolkitPane replaces the input
      const el = document.getElementById('cheatFilterInput');
      if(el){ el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
    });
  }
  bindCopyEvents(pane);
}

let currentDrillSet = [];
function pickDrillSet(){
  /* Drill cards show a short description excerpt, which the light bundle
     already carries — but test status lives on allData, so match the two up
     by id rather than pulling full detail just to read a status field. */
  const lite = (typeof toolkitData !== 'undefined' && toolkitData) ? toolkitData : null;
  const statusById = new Map(allData.map(d=>[d.id, d.status]));
  const base = lite
    ? lite.map(r => ({ ...r, status: statusById.get(r.id) || 'not-tested' }))
    : allData;
  const pool = base.filter(d=> d.status !== 'tested-pass' && d.status !== 'not-applicable');
  const source = pool.length ? pool : base.slice();
  const shuffled = source.slice().sort(()=> Math.random()-0.5);
  currentDrillSet = shuffled.slice(0, 5);
}
function renderDrillsTab(){
  if(!currentDrillSet.length) pickDrillSet();
  const prof = activeProfile();
  return `
    <div class="drill-meta-row">
      <span>Drills completed: <b class="u-bright">${prof.drillsCompleted||0}</b></span>
      <button class="btn" id="drillsShuffleBtn">${svgIcon('shuffle')} New drill set</button>
    </div>
    ${currentDrillSet.map((item, idx)=>{
      const catMeta = DOMAIN_META.find(c=>c.code===item.domain);
      const desc = (item.whatItIs||'').slice(0,220);
      return `
      <div class="drill-card" data-idx="${idx}">
        <div class="drill-face drill-front">
          <div class="drill-tag">${escapeHtml(catMeta?catMeta.code:item.domain)} · ${escapeHtml(item.severityLabel||item.severity)}</div>
          <div class="drill-text">${escapeHtml(item.title)}</div>
          <div class="drill-hint">Think through how you'd identify and exploit this — click to reveal</div>
        </div>
        <div class="drill-face drill-back">
          <div class="drill-tag">${item.id} · CWE ${escapeHtml(item.cwe||'—')}</div>
          <div class="drill-text">${escapeHtml(desc)}${(item.whatItIs||'').length>220?'…':''}</div>
          <div class="drill-hint">Click to flip back</div>
        </div>
      </div>
    `;}).join('')}
    <div class="drill-controls">
      <button class="btn primary" id="drillsCompleteBtn">Mark this drill set complete</button>
    </div>
  `;
}
function bindDrillsTab(pane){
  pane.querySelectorAll('.drill-card').forEach(card=>{
    card.addEventListener('click', ()=> card.classList.toggle('flipped'));
  });
  const shuffleBtn = pane.querySelector('#drillsShuffleBtn');
  if(shuffleBtn) shuffleBtn.addEventListener('click', (e)=>{ e.stopPropagation(); pickDrillSet(); renderToolkitPane(); });
  const completeBtn = pane.querySelector('#drillsCompleteBtn');
  if(completeBtn) completeBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const prof = activeProfile();
    prof.drillsCompleted = (prof.drillsCompleted||0) + 1;
    saveProfiles();
    showToast('Drill set marked complete.');
    pickDrillSet();
    renderToolkitPane();
  });
}

function buildReportText(){
  const tester = document.getElementById('testerName').value || '(unspecified)';
  const stats = computeStats();
  const domainCounts = computeDomainCounts();
  const flaggedItems = allData.filter(d=>d.flagged);
  const lines = [];
  lines.push(`VAPT ASSESSMENT REPORT`);
  lines.push(`Tester: ${tester}`);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`SUMMARY`);
  lines.push(`Total test cases: ${stats.total}`);
  lines.push(`Passed: ${stats.completed}  Failed: ${stats.failed}  In progress: ${stats.inProgress}  N/A: ${stats.na}  Not tested: ${stats.remaining}`);
  lines.push(`Overall coverage: ${stats.pct}%`);
  lines.push('');
  lines.push(`COVERAGE BY DOMAIN`);
  DOMAIN_META.forEach(c=>{
    const cc = domainCounts[c.code];
    const pct = cc.total ? Math.round((cc.pass+cc.na)/cc.total*100) : 0;
    lines.push(`  ${c.code} — ${c.name}: ${cc.pass}/${cc.total} (${pct}%)`);
  });
  lines.push('');
  lines.push(`FLAGGED FOR RETEST (${flaggedItems.length})`);
  if(!flaggedItems.length) lines.push('  None.');
  flaggedItems.forEach(d=>{
    lines.push(`  [${d.severityLabel||d.severity}] ${d.id} — ${d.title}`);
    if(d.assessorNotes && d.assessorNotes.findings) lines.push(`    Findings: ${d.assessorNotes.findings}`);
  });
  lines.push('');
  lines.push(`FAILED TEST CASES`);
  const failedItems = allData.filter(d=>d.status==='tested-fail');
  if(!failedItems.length) lines.push('  None.');
  failedItems.forEach(d=>{
    lines.push(`  [${d.severityLabel||d.severity}] ${d.id} — ${d.title} (CWE: ${d.cwe||'—'})`);
    if(d.assessorNotes && d.assessorNotes.findings) lines.push(`    Findings: ${d.assessorNotes.findings}`);
  });
  return lines.join('\n');
}
function renderReportTab(){
  return `
    <div class="stats-panel">
      <h4>Report preview</h4>
      <p class="u-hint-block">Plain-text summary of current progress, findings, and flagged items — coverage by domain, flagged retest items, and failed test cases.</p>
      <button class="btn primary u-mb-16" id="reportDownloadBtn">${svgIcon('download')} Download report</button>
      <div class="term-window">
        <div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span><span class="term-title">vapt-report.txt</span></div>
        <div class="detail-payload u-scroll-340" id="reportPreview"></div>
      </div>
    </div>
  `;
}
function bindReportTab(pane){
  const preview = pane.querySelector('#reportPreview');
  if(preview) preview.textContent = buildReportText();
  const btn = pane.querySelector('#reportDownloadBtn');
  if(btn) btn.addEventListener('click', ()=>{
    downloadFile(`vapt-report-${Date.now()}.txt`, buildReportText(), 'text/plain');
    showToast('Report downloaded.');
  });
}

/* =========================================================
   SCAN IMPORT — paste raw Nmap/Nuclei/Burp output, parse it
   (features.js), and surface ranked test-case suggestions the
   assessor can accept as evidence with one click.
========================================================= */
let lastScanResult = null;
function renderScanImportTab(){
  const r = lastScanResult;
  return `
    <div class="drill-hint u-mb-12">
      Paste raw Nmap (XML, greppable, or normal text), Nuclei (JSON Lines), or Burp (XML) output below.
      This runs entirely in your browser — nothing is uploaded anywhere.
    </div>
    <textarea id="scanInputArea" class="scan-input-area" placeholder="Paste scan output here…"></textarea>
    <div class="u-row-gap">
      <button class="btn primary" id="scanParseBtn">Parse &amp; Match</button>
      <button class="btn" id="scanClearBtn">Clear</button>
    </div>
    ${r ? `
      <div class="drill-hint u-mb-12">
        Parsed ${r.parsedCount} finding${r.parsedCount===1?'':'s'} &middot; ${r.suggestions.length} test case${r.suggestions.length===1?'':'s'} suggested
      </div>
      <div class="scan-results">
        ${r.suggestions.length ? r.suggestions.map(s => `
          <div class="scan-result-row">
            <span class="sev-badge sev-chip" data-sev="${s.item.severity}">${escapeHtml(s.item.severityLabel||s.item.severity)}</span>
            <div class="scan-result-body">
              <div class="scan-result-title">${escapeHtml(s.item.id)} — ${escapeHtml(s.item.title)}</div>
              <div class="scan-result-evidence">${escapeHtml(describeFinding(s.finding))}</div>
            </div>
            <span class="scan-result-score" title="Match confidence">${s.score}%</span>
            <button class="btn" data-action="scan-accept" data-id="${escapeHtml(s.item.id)}" data-evidence="${escapeHtml(describeFinding(s.finding))}">Add as evidence</button>
          </div>
        `).join('') : '<div class="palette-empty">No test cases matched this output. Try pasting more context (service banners, template names).</div>'}
      </div>
    ` : ''}
  `;
}
function bindScanImportTab(pane){
  const parseBtn = pane.querySelector('#scanParseBtn');
  const clearBtn = pane.querySelector('#scanClearBtn');
  const area = pane.querySelector('#scanInputArea');
  if(area && lastScanResult && lastScanResult.rawText) area.value = lastScanResult.rawText;
  if(parseBtn){
    parseBtn.addEventListener('click', ()=>{
      const raw = area ? area.value : '';
      const result = runScanIngestion(raw);
      result.rawText = raw;
      lastScanResult = result;
      renderToolkitPane();
      showToast(`Parsed ${result.parsedCount} finding${result.parsedCount===1?'':'s'}, matched ${result.suggestions.length} test case${result.suggestions.length===1?'':'s'}.`);
    });
  }
  if(clearBtn){
    clearBtn.addEventListener('click', ()=>{ lastScanResult = null; renderToolkitPane(); });
  }
  pane.querySelectorAll('[data-action="scan-accept"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const item = allData.find(d=>d.id===id);
      if(!item) return;
      const evidenceLine = btn.dataset.evidence;
      const existing = item.assessorNotes.findings || '';
      item.assessorNotes.findings = existing ? `${existing}\n${evidenceLine}` : evidenceLine;
      if(item.status === 'not-tested') item.status = 'in-progress';
      detailCache.delete(id);
      saveProgress();
      showToast(`Added to ${id} as evidence.`);
      btn.textContent = 'Added ✓';
      btn.disabled = true;
    });
  });
}

/* =========================================================
   ATTACK CHAINS — link two findings ("A enables B") and view
   the resulting sequences. Storage in storage.js (addChain /
   removeChain / buildChainSequences), scoped per engagement.
========================================================= */
function renderChainsTab(){
  const sequences = buildChainSequences();
  const caseOptions = allData.slice().sort((a,b)=>a.sequence-b.sequence)
    .map(d=>`<option value="${escapeHtml(d.id)}">${escapeHtml(d.id)} — ${escapeHtml(d.title)}</option>`).join('');
  return `
    <div class="drill-hint u-mb-12">
      Link findings that chain together — e.g. an exposed credential (A) that enables lateral movement (B) —
      to build a simple attack-path narrative for the report.
    </div>
    <div class="chain-form">
      <select id="chainFromSelect"><option value="">From finding…</option>${caseOptions}</select>
      <span class="chain-arrow">→</span>
      <select id="chainToSelect"><option value="">Enables finding…</option>${caseOptions}</select>
      <input type="text" id="chainNoteInput" placeholder="How does it chain? (optional)">
      <button class="btn primary" id="chainAddBtn">Link</button>
    </div>
    <div class="chain-list">
      ${sequences.length ? sequences.map(seq => `
        <div class="chain-sequence">
          ${seq.map((edge, i) => {
            const fromItem = allData.find(d=>d.id===edge.fromId);
            const toItem = allData.find(d=>d.id===edge.toId);
            return `
              ${i===0 ? `<div class="chain-node">${escapeHtml(edge.fromId)}${fromItem?` — ${escapeHtml(fromItem.title)}`:''}</div>` : ''}
              <div class="chain-edge">
                <span class="chain-edge-arrow">↓${edge.note ? ` <em>${escapeHtml(edge.note)}</em>` : ''}</span>
                <button class="chain-remove-btn" data-action="chain-remove" data-chain-id="${escapeHtml(edge.id)}" title="Remove link">${svgIcon('x')}</button>
              </div>
              <div class="chain-node">${escapeHtml(edge.toId)}${toItem?` — ${escapeHtml(toItem.title)}`:''}</div>
            `;
          }).join('')}
        </div>
      `).join('') : '<div class="palette-empty">No attack chains linked yet.</div>'}
    </div>
  `;
}
function bindChainsTab(pane){
  const addBtn = pane.querySelector('#chainAddBtn');
  if(addBtn){
    addBtn.addEventListener('click', ()=>{
      const from = pane.querySelector('#chainFromSelect').value;
      const to = pane.querySelector('#chainToSelect').value;
      const note = pane.querySelector('#chainNoteInput').value;
      if(!from || !to){ showToast('Pick both a "from" and "enables" finding.'); return; }
      if(from === to){ showToast('A finding can\'t chain into itself.'); return; }
      const chain = addChain(from, to, note);
      if(!chain){ showToast('That link already exists.'); return; }
      renderToolkitPane();
      showToast('Chain linked.');
    });
  }
  pane.querySelectorAll('[data-action="chain-remove"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(!confirm('Remove this link from the attack chain? The test cases themselves are not affected.')) return;
      removeChain(btn.dataset.chainId);
      renderToolkitPane();
    });
  });
}

/* =========================================================
   CUSTOM TEST CASES — user-authored cases layered onto the
   built-in set. Storage in storage.js (addCustomCase / removeCustomCase).
========================================================= */
function renderCustomCasesTab(){
  const domainOptions = DOMAIN_META.map(c=>`<option value="${c.code}">${c.code} — ${escapeHtml(c.name)}</option>`).join('');
  const sevOptions = SEVERITIES.map(s=>`<option value="${s.key}">${s.label}</option>`).join('');
  const existing = loadCustomCases();
  return `
    <div class="drill-hint u-mb-12">
      Add a client-specific or emerging technique alongside the built-in 524. Custom cases show up in their
      chosen domain's list, track status/notes exactly like any other case, and are included in exports.
    </div>
    <form id="customCaseForm" class="custom-case-form">
      <div class="ctx-field"><label>Title</label><input type="text" id="ccTitle" required placeholder="e.g. Custom Header Injection in Internal Gateway"></div>
      <div class="custom-case-row">
        <div class="ctx-field"><label>Domain</label><select id="ccDomain">${domainOptions}</select></div>
        <div class="ctx-field"><label>Severity</label><select id="ccSeverity">${sevOptions}</select></div>
        <div class="ctx-field"><label>CWE <span class="hint">(optional)</span></label><input type="text" id="ccCwe" placeholder="CWE-000"></div>
      </div>
      <div class="ctx-field"><label>What it is</label><textarea id="ccWhatItIs" required placeholder="Describe the issue…"></textarea></div>
      <div class="ctx-field"><label>Root cause <span class="hint">(optional)</span></label><textarea id="ccRootCause"></textarea></div>
      <div class="ctx-field"><label>Impact <span class="hint">(optional)</span></label><textarea id="ccImpact"></textarea></div>
      <div class="ctx-field"><label>Prerequisites <span class="hint">(optional)</span></label><textarea id="ccPrereqs"></textarea></div>
      <div class="ctx-field"><label>Steps to identify <span class="hint">(one per line)</span></label><textarea id="ccSteps"></textarea></div>
      <div class="ctx-field"><label>Exploitation steps <span class="hint">(one per line)</span></label><textarea id="ccExploit"></textarea></div>
      <div class="ctx-field"><label>Mitigation <span class="hint">(one per line)</span></label><textarea id="ccMitigation"></textarea></div>
      <button type="submit" class="btn primary">Add Custom Test Case</button>
    </form>
    <div class="drill-hint u-my-block-a">${existing.length} custom case${existing.length===1?'':'s'} in this engagement</div>
    <div class="scan-results">
      ${existing.length ? existing.map(c=>`
        <div class="scan-result-row">
          <span class="sev-badge sev-chip" data-sev="${c.severity}">${escapeHtml(c.severityLabel||c.severity)}</span>
          <div class="scan-result-body">
            <div class="scan-result-title">${escapeHtml(c.id)} — ${escapeHtml(c.title)}</div>
            <div class="scan-result-evidence">${escapeHtml(c.domain)}</div>
          </div>
          <button class="btn" data-action="custom-remove" data-id="${escapeHtml(c.id)}">Remove</button>
        </div>
      `).join('') : '<div class="palette-empty">No custom cases yet.</div>'}
    </div>
  `;
}
function bindCustomCasesTab(pane){
  const form = pane.querySelector('#customCaseForm');
  if(form){
    form.addEventListener('submit', (e)=>{
      e.preventDefault();
      const title = pane.querySelector('#ccTitle').value.trim();
      const whatItIs = pane.querySelector('#ccWhatItIs').value.trim();
      if(!title || !whatItIs){ showToast('Title and "What it is" are required.'); return; }
      addCustomCase({
        title,
        domain: pane.querySelector('#ccDomain').value,
        severity: pane.querySelector('#ccSeverity').value,
        cwe: pane.querySelector('#ccCwe').value,
        whatItIs,
        rootCause: pane.querySelector('#ccRootCause').value,
        impact: pane.querySelector('#ccImpact').value,
        prerequisites: pane.querySelector('#ccPrereqs').value,
        stepsToIdentify: pane.querySelector('#ccSteps').value,
        exploitationSteps: pane.querySelector('#ccExploit').value,
        mitigation: pane.querySelector('#ccMitigation').value,
      });
      renderToolkitPane();
      renderAll();
      showToast('Custom test case added.');
    });
  }
  pane.querySelectorAll('[data-action="custom-remove"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      /* A custom case is analyst-authored content that cannot be recovered,
         and removing it also deletes any attack chains referencing it. Name
         the case in the prompt so it is clear which one is going. */
      const target = allData.find(d=>d.id===btn.dataset.id);
      const label = target ? `"${target.title}"` : 'this custom test case';
      if(!confirm(`Delete ${label}? It cannot be recovered, and any attack chains using it will also be removed.`)) return;
      removeCustomCase(btn.dataset.id);
      renderToolkitPane();
      renderAll();
      showToast('Custom test case removed.');
    });
  });
}

/* =========================================================
   COVERAGE & RISK — answers the two questions an assessor gets asked at
   the end of an engagement: "what did you actually cover?" and "how bad
   is it?". Both are computed from the live data rather than tracked
   separately, so they cannot drift out of date.
========================================================= */

/* Severity weights for the risk score. Roughly order-of-magnitude spaced so
   one critical finding cannot be offset by a pile of lows — which matches how
   risk is actually communicated to a client. */
const RISK_WEIGHTS = { critical:40, high:15, medium:5, low:1, info:0 };

function computeCoverage(){
  const perDomain = DOMAIN_META.map(c=>{
    const items = allData.filter(d=>d.domain===c.code);
    const tested = items.filter(d=>d.status==='tested-pass'||d.status==='tested-fail');
    const na = items.filter(d=>d.status==='not-applicable');
    const failed = items.filter(d=>d.status==='tested-fail');
    /* N/A cases are deliberate scope decisions, not gaps — exclude them from
       the denominator so marking something out of scope raises coverage
       rather than permanently capping it below 100%. */
    const applicable = items.length - na.length;
    const pct = applicable > 0 ? Math.round((tested.length/applicable)*100) : 100;
    const untestedHigh = items.filter(d=>
      d.status==='not-tested' && (d.severity==='critical'||d.severity==='high')).length;
    return { code:c.code, name:c.name, total:items.length, tested:tested.length,
             na:na.length, failed:failed.length, applicable, pct, untestedHigh };
  }).filter(d=>d.total>0);

  const all = allData;
  const naAll = all.filter(d=>d.status==='not-applicable').length;
  const testedAll = all.filter(d=>d.status==='tested-pass'||d.status==='tested-fail').length;
  const applicableAll = all.length - naAll;
  const overallPct = applicableAll>0 ? Math.round((testedAll/applicableAll)*100) : 100;

  return { perDomain, overallPct, tested:testedAll, applicable:applicableAll, total:all.length };
}

function computeRisk(){
  const failed = allData.filter(d=>d.status==='tested-fail');
  const bySev = {critical:0,high:0,medium:0,low:0,info:0};
  let score = 0;
  failed.forEach(d=>{
    const s = d.severity || 'info';
    if(s in bySev) bySev[s]++;
    /* A verified fix or formally accepted risk should stop inflating the
       current risk picture — otherwise the score never improves as the
       client remediates, which makes it useless for retest reporting. */
    const rem = (d.assessorNotes && d.assessorNotes.remediation) || {};
    const resolved = rem.state==='fixed' || rem.state==='risk-accepted';
    if(!resolved) score += (RISK_WEIGHTS[s] || 0);
  });
  const openFindings = failed.filter(d=>{
    const rem=(d.assessorNotes&&d.assessorNotes.remediation)||{};
    return rem.state!=='fixed' && rem.state!=='risk-accepted';
  });
  let band = 'Low';
  if(score >= 120) band = 'Critical';
  else if(score >= 60) band = 'High';
  else if(score >= 20) band = 'Medium';
  return { failed:failed.length, open:openFindings.length, bySev, score, band };
}

function computeRemediationBreakdown(){
  const failed = allData.filter(d=>d.status==='tested-fail');
  const counts = {};
  REMEDIATION_VALUES.forEach(r=>counts[r.key]=0);
  failed.forEach(d=>{
    const st = ((d.assessorNotes&&d.assessorNotes.remediation)||{}).state || 'open';
    if(st in counts) counts[st]++;
  });
  return counts;
}

function renderCoverageTab(){
  const cov = computeCoverage();
  const risk = computeRisk();
  const rem = computeRemediationBreakdown();
  const gaps = cov.perDomain.filter(d=>d.untestedHigh>0).sort((a,b)=>b.untestedHigh-a.untestedHigh);

  return `
    <div class="drill-hint u-mb-14">
      Computed live from your current engagement — coverage excludes cases you marked N/A,
      and the risk score discounts findings you have verified as fixed or risk-accepted.
    </div>

    <div class="cov-summary">
      <div class="cov-stat">
        <b>${cov.overallPct}%</b>
        <span>Coverage</span>
        <i>${cov.tested} of ${cov.applicable} applicable</i>
      </div>
      <div class="cov-stat">
        <b class="sev-text" data-sev="${risk.band.toLowerCase()}">${risk.band}</b>
        <span>Risk Level</span>
        <i>weighted score ${risk.score}</i>
      </div>
      <div class="cov-stat">
        <b>${risk.open}</b>
        <span>Open Findings</span>
        <i>${risk.failed} confirmed total</i>
      </div>
    </div>

    <div class="cov-sev-row">
      ${['critical','high','medium','low'].map(s=>`
        <div class="cov-sev"><b class="sev-${s}">${risk.bySev[s]}</b><span>${s}</span></div>
      `).join('')}
    </div>

    ${gaps.length ? `
      <h4 class="cov-head">Coverage gaps — untested high &amp; critical cases</h4>
      <div class="cov-gaps">
        ${gaps.map(g=>`<div class="cov-gap"><b>${g.untestedHigh}</b> untested in <span>${escapeHtml(g.code)}</span> ${escapeHtml(g.name)}</div>`).join('')}
      </div>
    ` : `<div class="primer-note tip u-mt-16"><b>No gaps</b>Every high and critical case has been tested or marked N/A.</div>`}

    <h4 class="cov-head">Coverage by domain</h4>
    <div class="cov-bars">
      ${cov.perDomain.sort((a,b)=>a.pct-b.pct).map(d=>`
        <div class="cov-bar-row">
          <span class="cov-bar-code">${escapeHtml(d.code)}</span>
          <div class="cov-bar-track"><div class="cov-bar-fill csp-w" data-pct="${d.pct}"></div></div>
          <span class="cov-bar-pct">${d.pct}%</span>
          <span class="cov-bar-meta">${d.tested}/${d.applicable}${d.failed?` · ${d.failed} failed`:''}</span>
        </div>
      `).join('')}
    </div>

    ${risk.failed ? `
      <h4 class="cov-head">Remediation status</h4>
      <div class="cov-rem">
        ${REMEDIATION_VALUES.filter(r=>rem[r.key]>0).map(r=>`
          <div class="cov-rem-item"><b class="rem-text" data-rem="${r.key}">${rem[r.key]}</b><span>${escapeHtml(r.label)}</span></div>
        `).join('')}
      </div>
    ` : ''}
  `;
}

let activeToolkitTab = 'cvss';
/* Tabs that read fields living in the lazily-fetched detail files (payloads,
   descriptions, references) rather than the light startup index. */
/* Only the report renders full descriptions, mitigations and references, so
   it alone needs the complete detail set. The payload and drill tabs use the
   much smaller toolkit bundle instead. */
const TABS_NEEDING_DETAIL = new Set(['report']);
const TABS_NEEDING_TOOLKIT_BUNDLE = new Set(['payloads', 'drills']);
let toolkitDetailAttempted = false;
let toolkitBundleAttempted = false;

function renderToolkitPane(){
  const pane = document.getElementById('toolkitPane');
  if(!pane) return;

  /* Payload and drill tabs need only the light bundle. Same single-attempt
     guard as below: never re-enter this path from its own callback. */
  if(TABS_NEEDING_TOOLKIT_BUNDLE.has(activeToolkitTab) && typeof ensureToolkitData === 'function'){
    if(!toolkitData && !toolkitBundleAttempted){
      toolkitBundleAttempted = true;
      pane.innerHTML = '<div class="palette-empty">Loading payload library…</div>';
      const tabAtRequest = activeToolkitTab;
      ensureToolkitData()
        .then(()=>{ if(activeToolkitTab === tabAtRequest) renderToolkitPane(); })
        .catch(()=>{
          toolkitBundleAttempted = false;
          if(activeToolkitTab === tabAtRequest){
            pane.innerHTML = '<div class="palette-empty">Could not load the payload library. Check your connection and reopen this tab.</div>';
          }
        });
      return;
    }
  }

  if(TABS_NEEDING_DETAIL.has(activeToolkitTab) && typeof ensureAllDetail === 'function'){
    const stillLoading = allData.some(d => !hasDetail(d));
    /* toolkitDetailAttempted stops the same re-entry loop guarded against in
       renderAssessCard: if even one item's id is missing from its detail file,
       stillLoading stays true forever, the cached promise resolves instantly,
       and this re-renders itself without bound until the tab freezes. One
       attempt, then render with whatever arrived. */
    if(stillLoading && !toolkitDetailAttempted){
      toolkitDetailAttempted = true;
      pane.innerHTML = '<div class="palette-empty" role="status" aria-live="polite">'
        + 'Loading full test case detail — about 2.5 MB.<br>'
        + '<span class="palette-progress">Starting…</span></div>';
      const tabAtRequest = activeToolkitTab;
      const onDetailProgress = (done, total) => {
        if(activeToolkitTab !== tabAtRequest) return;
        const el = pane.querySelector('.palette-progress');
        if(el) el.textContent = `${done} of ${total} domains loaded`;
      };
      ensureAllDetail(onDetailProgress)
        .then(()=>{ if(activeToolkitTab === tabAtRequest) renderToolkitPane(); })
        .catch(()=>{
          toolkitDetailAttempted = false;   // permit a genuine retry later
          if(activeToolkitTab === tabAtRequest){
            pane.innerHTML = '<div class="palette-empty">Could not load test case detail. Check your connection and reopen this tab.</div>';
          }
        });
      return;
    }
  }

  if(activeToolkitTab === 'cvss'){ pane.innerHTML = renderCvssTab(); bindCvssTab(pane); }
  else if(activeToolkitTab === 'payloads'){ pane.innerHTML = renderPayloadCheatSheetTab(); bindPayloadCheatSheetTab(pane); }
  else if(activeToolkitTab === 'drills'){ pane.innerHTML = renderDrillsTab(); bindDrillsTab(pane); }
  else if(activeToolkitTab === 'report'){ pane.innerHTML = renderReportTab(); bindReportTab(pane); }
  else if(activeToolkitTab === 'scanimport'){ pane.innerHTML = renderScanImportTab(); bindScanImportTab(pane); }
  else if(activeToolkitTab === 'chains'){ pane.innerHTML = renderChainsTab(); bindChainsTab(pane); }
  else if(activeToolkitTab === 'customcases'){ pane.innerHTML = renderCustomCasesTab(); bindCustomCasesTab(pane); }
  else if(activeToolkitTab === 'coverage'){ pane.innerHTML = renderCoverageTab(); }
  if(typeof applyCspStyles==="function") applyCspStyles(pane);
}
function openToolkit(){
  document.getElementById('toolkitOverlay').classList.add('open');
  renderToolkitPane();
}
function closeToolkit(){
  document.getElementById('toolkitOverlay').classList.remove('open');
}
document.getElementById('toolkitBtn').addEventListener('click', openToolkit);
document.getElementById('toolkitClose').addEventListener('click', closeToolkit);
document.getElementById('toolkitOverlay').addEventListener('click', (e)=>{ if(e.target.id==='toolkitOverlay') closeToolkit(); });
document.getElementById('toolkitTabs').addEventListener('click', (e)=>{
  const tab = e.target.closest('.ttab'); if(!tab) return;
  document.querySelectorAll('#toolkitTabs .ttab').forEach(t=>t.classList.remove('active'));
  tab.classList.add('active');
  activeToolkitTab = tab.dataset.tab;
  renderToolkitPane();
});

