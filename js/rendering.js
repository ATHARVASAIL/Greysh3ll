/* VAPT CONSOLE — rendering.js: profile bar, time tracker, sidebar, and the detail-panel renderer. Depends on core.js. */

/* =========================================================
   MULTI-ENGAGEMENT PROFILE UI
========================================================= */
function switchToProfile(id){
  profilesState.activeId = id;
  saveProfiles();
  applyProgress(loadProgress());
  lastPct = -1;
  renderAll();
  showToast(`Switched to engagement: ${activeProfile().name}`);
}
function renderProfileBar(){
  const sel = document.getElementById('profileSelect'); if(!sel) return;
  sel.innerHTML = profilesState.profiles.map(p=> `<option value="${p.id}" ${p.id===profilesState.activeId?'selected':''}>${escapeHtml(p.name)}</option>`).join('');
}
document.getElementById('profileSelect').addEventListener('change', (e)=> switchToProfile(e.target.value));
document.getElementById('profileNewBtn').addEventListener('click', ()=>{
  const name = prompt('Name for the new engagement:', 'New Engagement');
  if(name===null) return;
  const prof = newProfileObj(name.trim()||'New Engagement');
  profilesState.profiles.push(prof);
  switchToProfile(prof.id);
});
document.getElementById('profileRenameBtn').addEventListener('click', ()=>{
  const prof = activeProfile();
  const name = prompt('Rename this engagement:', prof.name);
  if(name===null || !name.trim()) return;
  prof.name = name.trim();
  saveProfiles(); renderProfileBar();
});
document.getElementById('profileDeleteBtn').addEventListener('click', ()=>{
  if(profilesState.profiles.length<=1){ showToast('At least one engagement must remain.'); return; }
  const prof = activeProfile();
  if(!confirm(`Delete engagement "${prof.name}"? Its saved progress cannot be recovered.`)) return;
  try{ localStorage.removeItem(progressKeyFor(prof.id)); }catch(e){}
  profilesState.profiles = profilesState.profiles.filter(p=>p.id!==prof.id);
  profilesState.activeId = profilesState.profiles[0].id;
  saveProfiles();
  applyProgress(loadProgress());
  lastPct = -1;
  renderAll();
  showToast('Engagement deleted.');
});

/* =========================================================
   TIME TRACKER
========================================================= */
let lastInteractionAt = Date.now();
let lastActiveCatCode = null;
function markInteraction(domainCode){
  lastInteractionAt = Date.now();
  if(domainCode){
    const meta = DOMAIN_META.find(c => c.code === domainCode);
    if(meta) lastActiveCatCode = meta.code;
  }
}
(function timeTrackerLoop(){
  const IDLE_CUTOFF_MS = 120000;
  let lastPersistAt = Date.now();
  setInterval(()=>{
    if(document.hidden) return;
    if(Date.now() - lastInteractionAt > IDLE_CUTOFF_MS) return;
    const prof = activeProfile(); if(!prof) return;
    prof.totalSeconds = (prof.totalSeconds||0) + 1;
    if(lastActiveCatCode){
      prof.timeSpent = prof.timeSpent || {};
      prof.timeSpent[lastActiveCatCode] = (prof.timeSpent[lastActiveCatCode]||0) + 1;
    }
    const timeTag = document.getElementById('xpTimeTag');
    if(timeTag) timeTag.innerHTML = `${svgIcon('clock')} ${formatDuration(prof.totalSeconds||0)}`;
    if(Date.now() - lastPersistAt > 15000){ saveProfiles(); lastPersistAt = Date.now(); }
  }, 1000);
})();

/* =========================================================
   SIDEBAR
========================================================= */
function renderSidebar(){
  const stats = computeStats();
  animateNumber(document.getElementById('statTotal'), stats.total);
  animateNumber(document.getElementById('statDone'), stats.completed);
  animateNumber(document.getElementById('statLeft'), stats.remaining);
  animateNumber(document.getElementById('statFlagged'), stats.flagged);

  const heroTotalEl = document.getElementById('heroTotal'); if(heroTotalEl) heroTotalEl.textContent = stats.total;
  const heroCatsEl = document.getElementById('heroCats'); if(heroCatsEl) heroCatsEl.textContent = CATEGORIES.length;
  animateNumber(document.getElementById('heroCrit'), allData.filter(d=>d.severity==='critical').length);
  animateNumber(document.getElementById('heroPct'), stats.pct, '%');
  animateNumber(document.getElementById('radarPct'), stats.pct, '%');

  const circumference = 2*Math.PI*80;
  const offset = circumference - (stats.pct/100)*circumference;
  const ring = document.getElementById('radarFill');
  ring.setAttribute('stroke-dasharray', circumference.toFixed(1));
  ring.style.transition = 'stroke-dashoffset 0.8s cubic-bezier(.16,1,.3,1)';
  ring.setAttribute('stroke-dashoffset', offset.toFixed(1));
  ring.setAttribute('stroke', stats.pct===100 ? 'var(--low)' : 'var(--accent)');

  if(stats.pct === 100 && lastPct !== 100 && lastPct !== -1){
    burstConfetti();
    showToast('🎉 100% coverage — every test case marked complete!');
  }
  lastPct = stats.pct;

  const sevCounts = computeSevCounts();
  const legend = document.getElementById('sevLegend');
  legend.innerHTML = SEVERITIES.map(s=>{
    const c = sevCounts[s.key];
    const active = state.activeSevs.has(s.key)?'active':'';
    return `<div class="sev-row ${active}" data-sev="${s.key}"><span class="sev-dot" style="background:${s.color}"></span><span class="name">${s.label}</span><span class="count">${c.pass}/${c.total}</span></div>`;
  }).join('');
  legend.querySelectorAll('.sev-row').forEach(el=>{
    el.addEventListener('click', ()=>{
      const sev = el.dataset.sev;
      if(state.activeSevs.has(sev)) state.activeSevs.delete(sev); else state.activeSevs.add(sev);
      renderAll();
    });
  });

  const domainCounts = computeDomainCounts();
  checkCategoryCelebrations(domainCounts);
  const catList = document.getElementById('catList');
  catList.innerHTML = DOMAIN_META.map((c, idx)=>{
    const cc = domainCounts[c.code];
    const pct = cc.total ? Math.round((cc.pass + cc.na) / cc.total * 100) : 0;
    const active = state.activeDomain === c.code ? 'active' : '';
    const next = getDomainNextItem(c.code);
    return `<div class="cat-item ${active}" data-cat="${escapeHtml(c.code)}" title="${escapeHtml(c.name)}">
      <span class="code"><span class="code-num">${idx+1}.</span> ${c.code}</span>
      <span class="name">${escapeHtml(c.name)}</span>
      <span class="prog">${cc.pass}/${cc.total}</span>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
      ${next ? `<div class="cat-next-hint" title="Next: ${escapeHtml(next.title)}">${svgIcon('skipforward')}</div>` : ''}
    </div>`;
  }).join('');
  catList.querySelectorAll('.cat-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const cat = el.dataset.cat;
      state.activeDomain = state.activeDomain === cat ? null : cat;
      renderAll();
      renderDomainContext();
      if(typeof closeSidebar === 'function') closeSidebar();
      else document.getElementById('sidebar').classList.remove('open');
    });
  });
}

/* =========================================================
   PAYLOAD HELPERS
========================================================= */
function getPayloadList(item){
  if(Array.isArray(item.examplePayloads) && item.examplePayloads.length) return item.examplePayloads;
  if(item.payloads) return item.payloads;
  return [];
}
function renderPayloadsSection(item){
  const list = getPayloadList(item);
  if(!list.length) return '<div class="detail-payload">—</div>';
  return `<div class="payload-stack">${list.map((p,i)=>`
    <div class="payload-block">
      <div class="term-window">
        <div class="term-bar"><span class="term-dots"><i></i><i></i><i></i></span><span class="term-title">${escapeHtml(p.label||'payload')}</span></div>
        <div class="detail-payload">${escapeHtml(p.command||p.code||p)}<button class="detail-payload-copy" data-action="copy-payload" data-id="${item.id}" data-idx="${i}">Copy</button></div>
      </div>
    </div>`).join('')}</div>`;
}

/* =========================================================
   RENDER: DETAIL INNER HTML
========================================================= */
const MAX_ATTACHMENTS = 4;
function renderAttachmentGrid(item){
  const attachments = (item.assessorNotes && item.assessorNotes.attachments) || [];
  const thumbs = attachments.map((a, i) => `
    <div class="attachment-thumb">
      ${a.dataUrl && a.dataUrl.startsWith('data:image') ? `<img src="${a.dataUrl}" alt="${escapeHtml(a.name||'attachment')}">` : `<span class="file-glyph">${escapeHtml((a.name||'file').slice(0,14))}</span>`}
      <button class="attachment-remove" data-action="attachment-remove" data-id="${item.id}" data-idx="${i}" title="Remove" aria-label="Remove attachment">×</button>
    </div>
  `).join('');
  const addBtn = attachments.length < MAX_ATTACHMENTS ? `
    <label class="attachment-add-label" title="Add screenshot/evidence">
      +
      <input type="file" accept="image/*" data-action="attachment-add" data-id="${item.id}" style="display:none;">
    </label>
  ` : '';
  return `<div class="attachment-grid" data-role="attachment-grid-${item.id}">${thumbs}${addBtn}</div>`;
}

/* =========================================================
   DOMAIN BASICS — a "Learn the fundamentals" panel shown at the top
   of each domain's test-case list (primers.js has the content).
   Uses a native <details> element deliberately: no JS binding needed
   for open/close, works identically whether the section was rendered
   eagerly or lazily, and is accessible/keyboard-operable for free.
========================================================= */
function renderDomainPrimer(domainCode){
  const content = (typeof DOMAIN_PRIMERS !== 'undefined') ? DOMAIN_PRIMERS[domainCode] : null;
  if(!content) return '';
  const prepared = preparePrimerHtml(content, domainCode);
  const meta = (typeof DOMAIN_META !== 'undefined') ? DOMAIN_META.find(c=>c.code===domainCode) : null;
  const words = content.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200)); // ~200 wpm for technical reading
  return `
    <details class="domain-primer">
      <summary>
        <span class="primer-badge">${svgIcon('book')}</span>
        <span class="primer-summary-text">
          <b>Domain Basics${meta ? ` — ${escapeHtml(meta.name)}` : ''}</b>
          <i>Architecture, core concepts and vocabulary. Start here if this domain is new to you.</i>
        </span>
        <span class="primer-readtime">${mins} min read</span>
        <span class="primer-chevron">${svgIcon('chevron')}</span>
      </summary>
      <div class="domain-primer-body">${prepared}</div>
    </details>
  `;
}

/* Post-processes authored primer HTML for the browser rather than baking
   this into primers.js by hand, so the content stays readable to edit and
   every primer automatically gets the same treatment:

   1. Wraps each <table> in a horizontally scrollable container. Without
      this, a 4-column table on a phone either overflows the viewport or
      squashes columns until words break mid-character — the "text is
      cutting" problem. The wrapper scrolls independently instead.
   2. Adds ids to each <h4> and builds a chip nav at the top, so a
      ~9,000-character primer becomes navigable by tapping a section
      instead of scrolling through all of it looking for one topic. */
/* Wraps a table so it can scroll independently on medium screens. On phones
   the CSS stacks the rows instead, and this wrapper stops scrolling. */
function wrapTable(tableHtml){
  return `<div class="primer-table-wrap" tabindex="0" role="region" aria-label="Table">${tableHtml}</div>`;
}

function preparePrimerHtml(html, domainCode){
  let idx = 0;
  const sections = [];
  let out = html.replace(/<h4>([\s\S]*?)<\/h4>/g, (m, title) => {
    const id = `primer-${domainCode.toLowerCase()}-${idx++}`;
    const plain = title.replace(/<[^>]+>/g, '').trim();
    sections.push({ id, plain });
    return `<h4 id="${id}">${title}</h4>`;
  });

  /* Tag every cell with its column heading so mobile can stack each row into
     a labelled card instead of scrolling sideways.

     The previous approach — horizontal scroll with a sticky first column —
     failed badly on a phone: a four-column table left so little width that
     the sticky label column occluded the next one, slicing text mid-word.
     Stacking removes sideways scrolling entirely, so nothing is ever clipped
     and no row ever loses its heading. Done here rather than by hand in
     primers.js so authored content stays plain readable HTML. */
  out = out.replace(/<table class="primer-table">([\s\S]*?)<\/table>/g, (tableHtml) => {
    const rows = tableHtml.match(/<tr>[\s\S]*?<\/tr>/g) || [];
    if(!rows.length) return wrapTable(tableHtml);

    // Column headings come from whichever row actually declares <th> cells.
    const headerRow = rows.find(r => /<th[ >]/.test(r)) || '';
    const headings = (headerRow.match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [])
      .map(h => h.replace(/<[^>]*>/g, '').trim());
    if(!headings.length) return wrapTable(tableHtml);

    const labelled = tableHtml.replace(/<tr>([\s\S]*?)<\/tr>/g, (rowHtml) => {
      /* Tag the header row explicitly rather than relying on the CSS :has()
         selector, whose support on older mobile browsers is inconsistent — a
         missed match would leave an empty bordered card once rows stack. */
      if(/<th[ >]/.test(rowHtml)) return rowHtml.replace('<tr>', '<tr class="primer-thead-row">');
      let col = 0;
      return rowHtml.replace(/<td(\s[^>]*)?>/g, (cellTag, attrs) => {
        const label = headings[col++] || '';
        // An empty heading would render as a stray colon on mobile, so skip it.
        if(!label) return cellTag;
        return `<td${attrs || ''} data-label="${escapeHtml(label)}">`;
      });
    });
    return wrapTable(labelled);
  });

  if(sections.length > 1){
    /* Numbered because primer sections are a genuine reading sequence —
       architecture first, then how attacks work, then what to avoid — not an
       arbitrary list. The number tells a newcomer where they are in that arc. */
    const nav = `<nav class="primer-toc" aria-label="Section navigation">
      ${sections.map((s,i)=>`<a href="#${s.id}"><em>${String(i+1).padStart(2,'0')}</em>${escapeHtml(s.plain)}</a>`).join('')}
    </nav>`;
    out = nav + out;
  }
  return out;
}

/* =========================================================
   REMEDIATION BLOCK — only rendered for confirmed findings, because a
   passing or untested case has nothing to remediate. Shown inside the
   assessor notes so it saves through the same path as everything else.
========================================================= */
function renderRemediationBlock(item){
  if(!supportsRemediation(item)) return '';
  const rem = (item.assessorNotes && item.assessorNotes.remediation) || { state:'open', retestedAt:'', note:'' };
  const cur = getRemediationObj(rem.state);
  return `
    <div class="notes-field remediation-block" style="grid-column:1 / -1;">
      <label>Remediation &amp; Retest <span class="hint">tracks what happened after this was reported</span></label>
      <div class="remediation-states">
        ${REMEDIATION_VALUES.map(r=>`
          <button type="button"
            class="rem-btn${r.key===rem.state?' active':''}"
            data-action="remediation-state" data-id="${escapeHtml(item.id)}" data-state="${r.key}"
            title="${escapeHtml(r.desc)}"
            style="${r.key===rem.state?`border-color:${r.color};color:${r.color};background:${r.color}1a;`:''}">
            ${escapeHtml(r.label)}
          </button>`).join('')}
      </div>
      <div class="remediation-meta">
        <div class="rem-field">
          <span class="rem-label">Retested on</span>
          <input type="date" data-action="remediation-date" data-id="${escapeHtml(item.id)}" value="${escapeHtml(rem.retestedAt||'')}">
        </div>
        <div class="rem-field rem-field-grow">
          <span class="rem-label">Retest notes</span>
          <input type="text" data-action="remediation-note" data-id="${escapeHtml(item.id)}"
            placeholder="What changed, what you re-tested, who confirmed it"
            value="${escapeHtml(rem.note||'')}">
        </div>
      </div>
      <div class="remediation-current" style="color:${cur.color}">${escapeHtml(cur.desc)}</div>
    </div>
  `;
}

function renderDetailInner(item){
  const notes = item.assessorNotes || {};
  const findings = notes.findings || '';
  const evidenceLinks = Array.isArray(notes.evidenceLinks) ? notes.evidenceLinks : [];
  const pocDetails = notes.pocDetails || '';
  const affectedEndpoints = Array.isArray(notes.affectedEndpoints) ? notes.affectedEndpoints : [];
  const ref = item.reference || {};
  const toolsList = Array.isArray(ref.tools) ? ref.tools : (ref.tools ? [ref.tools] : []);
  const linksList = Array.isArray(ref.links) ? ref.links : (ref.links ? [ref.links] : []);

  // Collapsible "chapter" wrapper — cuts the mobile scroll length of a
  // single test case dramatically without hiding anything permanently.
  // Uses the same synchronous-click, no-observer collapse pattern as
  // the category sections, so it can't suffer the same "stuck until an
  // unrelated click" bug that pattern caused elsewhere.
  const chapter = (key, title, bodyHtml, openByDefault, count) => {
    const countLabel = count !== undefined ? `<span class="detail-chapter-count">${count} item${count !== 1 ? 's' : ''}</span>` : '';
    return `
    <div class="detail-chapter ${openByDefault ? 'open' : ''}" data-chapter="${key}">
      <button class="detail-chapter-head" type="button" data-action="chapter-toggle" data-id="${item.id}">
        <span class="chev">${chevSvg()}</span>
        <span class="detail-chapter-title">${title}</span>
        ${countLabel}
      </button>
      <div class="detail-chapter-body">
        <div class="detail-chapter-body-inner">${bodyHtml}</div>
      </div>
    </div>`;
  };

  const overviewHtml = `
    ${item.prerequisites ? `<div class="detail-section"><div class="sec-label">Prerequisites — what you need before starting</div><div class="detail-prereq"><span class="pill">NEED</span><span>${escapeHtml(item.prerequisites)}</span></div></div>` : ''}
    <div class="detail-section"><div class="sec-label">What it is</div><div class="detail-desc">${escapeHtml(item.whatItIs)}</div></div>
    <div class="detail-section"><div class="sec-label">Root cause</div><div class="detail-text" data-prefix="ROOT CAUSE">${escapeHtml(item.rootCause)}</div></div>
    <div class="detail-section"><div class="sec-label">Impact</div><div class="detail-impact">${escapeHtml(item.impact)}</div></div>
  `;
  const testStepsHtml = `
    <div class="detail-section"><div class="sec-label">Steps to identify</div>${listHtml(item.stepsToIdentify,'numbered')}</div>
    <div class="detail-section"><div class="sec-label">Exploitation steps</div>${listHtml(item.exploitationSteps,'numbered')}</div>
  `;
  const payloadsHtml = `
    <div class="detail-section"><div class="sec-label">Example payload / command</div>${renderPayloadsSection(item)}</div>
  `;
  const fixRefHtml = `
    <div class="detail-section"><div class="sec-label">Alternative exploitation / variants</div>${listHtml(item.variants,'bullets')}</div>
    <div class="detail-section"><div class="sec-label">Mitigation</div>${listHtml(item.mitigation,'mitigation')}</div>
    <div class="detail-section"><div class="sec-label">Reference &amp; tooling</div>
      <div class="detail-grid">
        <div class="detail-field"><div class="k">Standard / Reference</div><div class="v">${escapeHtml(ref.standard||'—')}</div></div>
        <div class="detail-field"><div class="k">CWE</div><div class="v">${escapeHtml(item.cwe||'—')}</div></div>
        <div class="detail-field" style="grid-column:1/-1"><div class="k">Recommended Tools</div><div class="v">${escapeHtml(toolsList.join(', ')||'—')}</div></div>
      </div>
      ${linksList.length ? `<div class="ref-list">${listHtml(linksList,'bullets')}</div>` : ''}
    </div>
  `;

  const sSteps = (item.stepsToIdentify||[]).length + (item.exploitationSteps||[]).length;
  const sPayloads = (item.examplePayloads||[]).length;
  const sVariants = (item.variants||[]).length;
  const sMitigation = (item.mitigation||[]).length;

  return `
    <div class="detail-inner">
      <div class="detail-section">
        <div class="sec-label">Status</div>
        <div class="status-toggle-row" data-id="${item.id}">
          ${STATUS_VALUES.map(s => `
            <button class="status-btn ${item.status === s.key ? 'active' : ''}"
                    data-status="${s.key}"
                    style="color:${s.color}; border-color:${s.color}40;"
                    title="${s.label}">
              <span>${s.label}</span>
            </button>
          `).join('')}
        </div>
      </div>

      ${chapter('overview', 'Overview — what it is, why it matters', overviewHtml, true)}
      ${chapter('steps', 'Test Steps — identify &amp; exploit', testStepsHtml, false, sSteps)}
      ${chapter('payloads', 'Payloads — ready-to-use commands', payloadsHtml, false, sPayloads)}
      ${chapter('fixref', 'Variants, Mitigation &amp; Reference', fixRefHtml, false, sVariants + sMitigation)}

      <div class="detail-section">
        <div class="sec-label">Assessor Notes</div>
        <div class="notes-form">
          <div class="notes-field">
            <label>Findings</label>
            <textarea data-action="notes-findings" data-id="${item.id}" placeholder="What did you find?">${escapeHtml(findings)}</textarea>
          </div>
          <div class="notes-field">
            <label>Evidence Links <span class="hint">(one per line)</span></label>
            <textarea data-action="notes-evidence" data-id="${item.id}" placeholder="https://...">${evidenceLinks.map(e=>escapeHtml(e)).join('\n')}</textarea>
          </div>
          <div class="notes-field">
            <label>PoC Details</label>
            <textarea data-action="notes-poc" data-id="${item.id}" placeholder="PoC steps, screenshots references…">${escapeHtml(pocDetails)}</textarea>
          </div>
          <div class="notes-field">
            <label>Affected Endpoints <span class="hint">(one per line)</span></label>
            <textarea data-action="notes-endpoints" data-id="${item.id}" placeholder="https://target.example.com/api/v1/…">${affectedEndpoints.map(e=>escapeHtml(e)).join('\n')}</textarea>
          </div>
          <div class="notes-field" style="grid-column:1 / -1;">
            <label>Evidence Attachments <span class="hint">(screenshots, up to 4)</span></label>
            ${renderAttachmentGrid(item)}
            <div class="attachment-hint">Images are compressed and stored locally in your browser; nothing is uploaded.</div>
          </div>
          ${renderRemediationBlock(item)}
        </div>
        <span class="notes-saved-indicator" data-role="notes-saved-${item.id}">saved</span>
      </div>

      <div class="detail-meta">
        <span>${getStatusObj(item.status)?.label || 'Not yet tested'}</span>
      </div>
    </div>
  `;
}

/* =========================================================
   RENDER: ITEM SUMMARY
========================================================= */
function renderItemSummary(item){
  const expanded = state.expanded.has(item.id) ? 'expanded' : '';
  const flaggedCls = item.flagged ? 'flagged' : '';
  const isDone = item.status === 'tested-pass';
  const hasNotes = item.assessorNotes && item.assessorNotes.findings && item.assessorNotes.findings.trim();
  const statusObj = getStatusObj(item.status || 'not-tested');

  return `
    <div class="test-item ${expanded} ${flaggedCls} ${isDone?'done':''}" data-id="${item.id}" style="--sev-c:${SEV_COLOR[item.severity]}">
      <div class="test-row">
        <div class="checkbox" data-action="toggle" data-id="${item.id}">${checkSvg()}</div>
        <div class="item-body" data-action="expand" data-id="${item.id}">
          <div class="item-top">
            <span class="order-badge">#${item.sequence}</span>
            <span class="item-id">${item.id}</span>
            <span class="sev-badge" style="background:${SEV_COLOR[item.severity]}22; color:${SEV_COLOR[item.severity]}">${escapeHtml(item.severityLabel||item.severity)}</span>
            <span class="cwe-badge">${escapeHtml(item.cwe||'—')}</span>
            ${item.custom ? '<span class="domain-card-custom-badge">Custom</span>' : ''}
          </div>
          <div class="item-title">${escapeHtml(item.title)}${hasNotes ? '<span class="notes-dot"> •</span>' : ''}</div>
          <div class="item-status-row">
            <span class="mini-status" style="color:${statusObj.color}">${statusObj.icon || '○'} ${statusObj.label}</span>
          </div>
        </div>
        <button class="flag-btn ${item.flagged?'flagged':''}" data-action="flag" data-id="${item.id}" title="Flag for retest">${svgIcon('flag')}</button>
        <button class="expand-btn" data-action="expand" data-id="${item.id}" aria-label="Toggle details">${chevSvg()}</button>
      </div>
      <div class="detail-panel" data-holder="${item.id}">${state.expanded.has(item.id) ? getDetailHtml(item) : ''}</div>
    </div>
  `;
}

/* =========================================================
   DETAIL HTML (lazy-cached)
========================================================= */
function getDetailHtml(item){
  if(detailCache.has(item.id)) return detailCache.get(item.id);
  const html = renderDetailInner(item);
  detailCache.set(item.id, html);
  return html;
}

