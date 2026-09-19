/* VAPT CONSOLE — interactions.js: event binding, item actions, the results list, theme toggle, keyboard shortcuts, scroll reveal. Depends on core.js + rendering.js. */

/* =========================================================
   EVENT BINDING
========================================================= */
function bindResultEvents(root){
  root.querySelectorAll('.cat-head').forEach(el=>{
    el.addEventListener('click', ()=>{
      const section = el.closest('.cat-section');
      const cat = section.dataset.cat;
      if(state.collapsed.has(cat)){
        state.collapsed.delete(cat);
        ensureCategoryBodyRendered(section);
        section.classList.remove('collapsed');
      } else {
        state.collapsed.add(cat);
        section.classList.add('collapsed');
      }
    });
  });

  root.querySelectorAll('.detail-chapter-head').forEach(el=>{
    el.addEventListener('click', ()=>{
      el.closest('.detail-chapter').classList.toggle('open');
    });
  });

  root.querySelectorAll('[data-action="toggle"]').forEach(el=>{
    el.addEventListener('click', (e)=>{ e.stopPropagation(); toggleItem(el.dataset.id); });
  });
  root.querySelectorAll('[data-action="flag"]').forEach(el=>{
    el.addEventListener('click', (e)=>{ e.stopPropagation(); toggleFlag(el.dataset.id); });
  });

  root.querySelectorAll('[data-action="expand"]').forEach(el=>{
    el.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const id = el.dataset.id;
      const item = allData.find(d=>d.id===id);
      if(item) markInteraction(item.domain);
      const itemEl = root.querySelector(`.test-item[data-id="${CSS.escape(id)}"]`);
      if(!itemEl) return;
      const holder = itemEl.querySelector('.detail-panel');
      if(state.expanded.has(id)){
        state.expanded.delete(id);
        itemEl.classList.remove('expanded');
      } else {
        state.expanded.add(id);
        itemEl.classList.add('expanded');
        if(!holder.innerHTML){
          /* Detail fields are fetched per domain on first use. Expand
             immediately with a placeholder so the panel feels responsive,
             then swap in the real content once it arrives. */
          if(item && !hasDetail(item)){
            holder.innerHTML = '<div class="detail-loading">Loading test case detail…</div>';
            try{
              await ensureDetail(item.domain);
            }catch(err){
              holder.innerHTML = '<div class="detail-loading detail-error">Could not load this test case. Check your connection and try again.</div>';
              return;
            }
            // The panel may have been collapsed again while loading.
            if(!state.expanded.has(id)) return;
          }
          holder.innerHTML = getDetailHtml(item);
        }
        bindResultEvents(holder);
      }
    });
  });

  root.querySelectorAll('.status-btn').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      const row = el.closest('.status-toggle-row');
      setItemStatus(row.dataset.id, el.dataset.status);
    });
  });

  bindNotesEvents(root);
  bindCopyEvents(root);
  bindAttachmentEvents(root);
  bindRemediationEvents(root);
}

/* Remediation state buttons, retest date and retest note. Kept separate from
   bindNotesEvents because the state buttons re-render their own block on
   click (to restyle the active button) while the text inputs must not. */
function bindRemediationEvents(root){
  root.querySelectorAll('[data-action="remediation-state"]').forEach(btn=>{
    if(btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const item = allData.find(d=>d.id===btn.dataset.id);
      if(!item) return;
      if(!item.assessorNotes.remediation) item.assessorNotes.remediation = normalizeRemediation(null);
      item.assessorNotes.remediation.state = btn.dataset.state;
      /* Recording a verification outcome without a date is a gap in an audit
         trail, so default it to today — still editable afterwards. */
      const verifying = btn.dataset.state === 'fixed' || btn.dataset.state === 'not-fixed';
      if(verifying && !item.assessorNotes.remediation.retestedAt){
        item.assessorNotes.remediation.retestedAt = new Date().toISOString().slice(0,10);
      }
      detailCache.delete(item.id);
      markInteraction(item.domain);
      saveProgress();
      const block = btn.closest('.remediation-block');
      if(block){
        block.outerHTML = renderRemediationBlock(item);
        const fresh = root.querySelector(`.remediation-block [data-id="${CSS.escape(item.id)}"]`);
        if(fresh) bindRemediationEvents(fresh.closest('.notes-form') || root);
      }
      showToast(`Marked ${getRemediationObj(btn.dataset.state).label.toLowerCase()}.`);
    });
  });

  [['remediation-date','retestedAt'], ['remediation-note','note']].forEach(([action, key])=>{
    root.querySelectorAll(`[data-action="${action}"]`).forEach(el=>{
      if(el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('input', (e)=>{
        e.stopPropagation();
        const item = allData.find(d=>d.id===el.dataset.id);
        if(!item) return;
        if(!item.assessorNotes.remediation) item.assessorNotes.remediation = normalizeRemediation(null);
        item.assessorNotes.remediation[key] = el.value;
        detailCache.delete(item.id);
        markInteraction(item.domain);
        /* Same per-element debounce the other notes fields use — saving on
           every keystroke would rewrite localStorage far too often. */
        clearTimeout(el._timer);
        el._timer = setTimeout(()=>{ saveProgress(); }, 500);
      });
      el.addEventListener('click', e=>e.stopPropagation());
    });
  });
}

/* =========================================================
   EVIDENCE ATTACHMENTS — downscale images client-side before
   storing (localStorage has a hard ~5-10MB per-origin cap shared
   across every engagement profile + all its notes, so a handful of
   full-resolution phone screenshots would blow the budget fast).
   Downscaling to a max 900px edge at JPEG q=.72 keeps a typical
   screenshot in the 60-150KB range instead of several MB.
========================================================= */
const ATTACHMENT_MAX_EDGE = 900;
const ATTACHMENT_JPEG_QUALITY = 0.72;
function downscaleImageFile(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = ()=> reject(new Error('Could not read file'));
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = ()=> reject(new Error('Could not decode image'));
      img.onload = ()=>{
        let { width, height } = img;
        if(width > ATTACHMENT_MAX_EDGE || height > ATTACHMENT_MAX_EDGE){
          const scale = ATTACHMENT_MAX_EDGE / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', ATTACHMENT_JPEG_QUALITY));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function bindAttachmentEvents(root){
  root.querySelectorAll('[data-action="attachment-add"]').forEach(input=>{
    if(input.dataset.bound) return;
    input.dataset.bound = '1';
    input.addEventListener('change', async (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      const id = input.dataset.id;
      const item = allData.find(d=>d.id===id);
      if(!item) return;
      if(!item.assessorNotes.attachments) item.assessorNotes.attachments = [];
      if(item.assessorNotes.attachments.length >= MAX_ATTACHMENTS){ showToast(`Max ${MAX_ATTACHMENTS} attachments per finding.`); return; }
      if(!file.type.startsWith('image/')){ showToast('Only image attachments are supported.'); return; }
      try{
        const dataUrl = await downscaleImageFile(file);
        item.assessorNotes.attachments.push({ name:file.name, dataUrl, addedAt:new Date().toISOString() });
        detailCache.delete(id);
        const grid = document.querySelector(`[data-role="attachment-grid-${CSS.escape(id)}"]`);
        if(grid) grid.outerHTML = renderAttachmentGrid(item);
        bindAttachmentEvents(document.querySelector(`[data-role="attachment-grid-${CSS.escape(id)}"]`)?.closest('.notes-field') || document);
        markInteraction(item.domain);
        saveProgress();
        showToast('Attachment added.');
      }catch(err){
        showToast('Could not process that image.');
      }
    });
  });
  root.querySelectorAll('[data-action="attachment-remove"]').forEach(btn=>{
    if(btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      const id = btn.dataset.id;
      const idx = parseInt(btn.dataset.idx, 10);
      const item = allData.find(d=>d.id===id);
      if(!item || !item.assessorNotes.attachments) return;
      item.assessorNotes.attachments.splice(idx, 1);
      detailCache.delete(id);
      const grid = document.querySelector(`[data-role="attachment-grid-${CSS.escape(id)}"]`);
      if(grid){
        grid.outerHTML = renderAttachmentGrid(item);
        bindAttachmentEvents(document.querySelector(`[data-role="attachment-grid-${CSS.escape(id)}"]`)?.closest('.notes-field') || document);
      }
      markInteraction(item.domain);
      saveProgress();
    });
  });
}

function bindNotesEvents(root){
  const fields = [
    { action:'notes-findings', key:'findings' },
    { action:'notes-evidence', key:'evidenceLinks', multiline: true },
    { action:'notes-poc', key:'pocDetails' },
    { action:'notes-endpoints', key:'affectedEndpoints', multiline: true },
  ];
  fields.forEach(f => {
    root.querySelectorAll(`[data-action="${f.action}"]`).forEach(el=>{
      if(el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('input', (e)=>{
        e.stopPropagation();
        const id = el.dataset.id;
        const item = allData.find(d=>d.id===id);
        if(!item) return;
        if(!item.assessorNotes) item.assessorNotes = {};
        if(f.multiline){
          item.assessorNotes[f.key] = el.value.split('\n').map(l=>l.trim()).filter(Boolean);
        } else {
          item.assessorNotes[f.key] = el.value;
        }
        markInteraction(item.domain);
        detailCache.delete(id);
        clearTimeout(el._timer);
        el._timer = setTimeout(()=>{
          saveProgress();
          const indicator = document.querySelector(`[data-role="notes-saved-${CSS.escape(id)}"]`);
          if(indicator){ indicator.classList.add('show'); setTimeout(()=>indicator.classList.remove('show'), 1200); }
        }, 500);
      });
    });
  });
}

function bindCopyEvents(root){
  root.querySelectorAll('[data-action="copy-payload"]').forEach(el=>{
    if(el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      const item = allData.find(d=>d.id===el.dataset.id); if(!item) return;
      const idx = parseInt(el.dataset.idx||'0',10);
      const p = item.examplePayloads?.[idx];
      const text = p ? (p.command || p.code || '') : '';
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(text).then(()=>{
          el.textContent='Copied'; setTimeout(()=> el.textContent='Copy', 1200);
        }).catch(()=> showToast('Could not copy to clipboard.'));
      }
    });
  });
}

/* =========================================================
   ACTIONS
========================================================= */
function setItemStatus(id, newStatus){
  const item = allData.find(d=>d.id===id); if(!item) return;
  item.status = newStatus;
  markInteraction(item.domain);
  detailCache.delete(id);
  persist();
  refreshAfterItemChange(id);
}

function toggleItem(id){
  const item = allData.find(d=>d.id===id); if(!item) return;
  item.status = item.status === 'tested-pass' ? 'not-tested' : 'tested-pass';
  markInteraction(item.domain);
  detailCache.delete(id);
  persist();
  refreshAfterItemChange(id);
}

function toggleFlag(id){
  const item = allData.find(d=>d.id===id); if(!item) return;
  item.flagged = !item.flagged;
  detailCache.delete(id);
  persist();
  refreshAfterItemChange(id);
}

function persist(){ saveProgress(); updateGamification(); }
function renderAll(){ renderProfileBar(); renderSidebar(); renderResults(); renderXpBar(); }

/* =========================================================
   IN-PLACE ITEM UPDATE
   A full renderResults() destroys and rebuilds the entire 507-item
   list on every single status/flag click — expensive, and it was
   the cause of the "screen refreshes and I have to click again"
   report: focus is lost, the scroll-reveal animation replays for
   everything on screen, and it's needlessly slow. Marking a status
   or flag almost never needs to change *which* items are visible or
   *what order* they're in, so we patch just the one item (and its
   category header's counts) instead, and only fall back to a full
   render for the rare cases where the item must actually move or
   disappear from the current view.
========================================================= */
function refreshAfterItemChange(id){
  renderProfileBar();
  renderSidebar();
  renderXpBar();
  if(!patchItemInPlace(id)) renderResults();
}

function patchItemInPlace(id){
  const item = allData.find(d=>d.id===id);
  if(!item) return false;
  // Item no longer belongs in the current filtered/sorted view (e.g. a
  // status filter now excludes it, or the active sort mode depends on
  // status) — a full re-render is required to move or remove it.
  if(!matchesFilters(item)) return false;
  if(state.sort === 'unchecked') return false;

  const resultsEl = document.getElementById('results');
  const oldEl = resultsEl && resultsEl.querySelector(`.test-item[data-id="${CSS.escape(id)}"]`);
  if(!oldEl) return false;

  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderItemSummary(item).trim();
  const newEl = wrapper.firstElementChild;
  if(!newEl) return false;
  oldEl.replaceWith(newEl);
  bindResultEvents(newEl);

  refreshCategoryHeader(item.domain);
  return true;
}

function refreshCategoryHeader(domainCode){
  const section = document.querySelector(`.cat-section[data-cat="${CSS.escape(domainCode)}"]`);
  if(!section) return;
  const items = allData.filter(d => d.domain === domainCode && matchesFilters(d));
  const total = items.length;
  if(!total) return;
  const pass = items.filter(i=>i.status==='tested-pass').length;
  const fail = items.filter(i=>i.status==='tested-fail').length;
  const na = items.filter(i=>i.status==='not-applicable').length;
  const sevSegs = SEVERITIES.map(s=>{
    const n = items.filter(i=>i.severity===s.key).length;
    if(!n) return ''; return `<div style="width:${(n/total*100)}%; background:${s.color}"></div>`;
  }).join('');
  const nextItem = items.find(i => i.status === 'not-tested');
  const nextHint = nextItem
    ? `<div class="cat-next-label" title="Next: ${escapeHtml(nextItem.title)}">Next: ${escapeHtml(nextItem.id)}</div>`
    : (pass === total ? '<div class="cat-next-label cat-done">Complete</div>' : '');

  const miniStack = section.querySelector('.mini-stack');
  const catCount = section.querySelector('.cat-count');
  const nextBar = section.querySelector('.cat-next-bar');
  if(miniStack) miniStack.innerHTML = sevSegs;
  if(catCount) catCount.innerHTML = `${pass}/${total} ${fail?`<span style="color:var(--fail)">${fail}f</span>`:''} ${na?`<span style="color:var(--na)">${na}na</span>`:''}`;
  if(nextBar) nextBar.innerHTML = nextHint ? svgIcon('skipforward') + ' ' + nextHint : '';
}

/* =========================================================
   RENDER: RESULTS
========================================================= */
function renderResults(){
  const filtered = allData.filter(matchesFilters);
  const resultsEl = document.getElementById('results');
  const summaryEl = document.getElementById('filterSummary');
  summaryEl.textContent = `Showing ${filtered.length} of ${allData.length} test cases`;

  if(filtered.length === 0){
    resultsEl.innerHTML = `<div class="empty-state"><div class="glyph">∅</div>No test cases match your current filters.</div>`;
    return;
  }

  const byDomainMap = {};
  filtered.forEach(item=>{
    const code = item.domain || 'UNK';
    (byDomainMap[code] = byDomainMap[code] || []).push(item);
  });

  const catsToRender = DOMAIN_META.filter(c => byDomainMap[c.code]);

  let html = '';
  catsToRender.forEach((c, catIdx)=>{
    let items = sortItems(byDomainMap[c.code].slice(), state.sort);

    const total = items.length;
    const pass = items.filter(i=>i.status==='tested-pass').length;
    const fail = items.filter(i=>i.status==='tested-fail').length;
    const na = items.filter(i=>i.status==='not-applicable').length;
    const sevSegs = SEVERITIES.map(s=>{
      const n = items.filter(i=>i.severity===s.key).length;
      if(!n) return ''; return `<div style="width:${(n/total*100)}%; background:${s.color}"></div>`;
    }).join('');

    const nextItem = items.find(i => i.status === 'not-tested');
    const nextHint = nextItem
      ? `<div class="cat-next-label" title="Next: ${escapeHtml(nextItem.title)}">Next: ${escapeHtml(nextItem.id)}</div>`
      : (pass === total ? '<div class="cat-next-label cat-done">Complete</div>' : '');

    // Collapsed sections (the default) skip building the item-row HTML
    // entirely — for NET (150 cases) / WEB (146 cases) that's the
    // difference between instantly rendering a header and building
    // ~150 DOM nodes nobody can even see yet. It's rendered lazily the
    // first time the section is actually expanded (see bindResultEvents).
    const isCollapsed = state.collapsed.has(c.code);
    const bodyHtml = isCollapsed ? '' : items.map(item=>renderItemSummary(item)).join('');

    html += `<div class="cat-section ${isCollapsed?'collapsed':''}" data-cat="${c.code}" data-catidx="${catIdx}">
      <div class="cat-head">
        <span class="chev">${chevSvg()}</span>
        <div class="title-block">
          <span class="code-tag">Phase ${catIdx+1} · ${c.code}</span><h3>${escapeHtml(c.name)}</h3>
          <div class="desc">${escapeHtml(c.desc)}</div>
        </div>
        <div class="mini-stack">${sevSegs}</div>
        <div class="cat-count">${pass}/${total} ${fail?`<span style="color:var(--fail)">${fail}f</span>`:''} ${na?`<span style="color:var(--na)">${na}na</span>`:''}</div>
      </div>
      <div class="cat-next-bar">${nextHint ? svgIcon('skipforward') + ' ' + nextHint : ''}</div>
      <div class="cat-body">
        <div class="cat-body-inner" data-rendered="${isCollapsed ? '0' : '1'}">
          ${isCollapsed ? '' : renderDomainPrimer(c.code)}
          ${bodyHtml}
        </div>
      </div>
    </div>`;
  });

  resultsEl.innerHTML = html;
  bindResultEvents(resultsEl);
}

/* Builds and inserts a collapsed section's item rows the first time it's
   actually expanded, then marks it rendered so later toggles are free. */
function ensureCategoryBodyRendered(section){
  const inner = section.querySelector('.cat-body-inner');
  if(!inner || inner.dataset.rendered === '1') return;
  const code = section.dataset.cat;
  const items = sortItems(allData.filter(d => d.domain === code && matchesFilters(d)), state.sort);
  inner.innerHTML = renderDomainPrimer(code) + items.map(item => renderItemSummary(item)).join('');
  inner.dataset.rendered = '1';
  bindResultEvents(inner);
}

/* =========================================================
   TOOLBAR EVENTS (search input lives in search.js)
========================================================= */
document.getElementById('statusChips').addEventListener('click', (e)=>{
  const chip = e.target.closest('.chip'); if(!chip) return;
  document.querySelectorAll('#statusChips .chip').forEach(c=>c.classList.remove('active'));
  chip.classList.add('active');
  state.status = chip.dataset.status;
  renderResults();
});
document.getElementById('sortSelect').addEventListener('change', (e)=>{ state.sort = e.target.value; renderResults(); });
document.getElementById('expandBtn').addEventListener('click', (e)=>{
  const btn = e.currentTarget;
  const allCollapsed = state.collapsed.size >= CATEGORIES.length;
  if(allCollapsed){ state.collapsed.clear(); btn.querySelector('.lbl').textContent='Collapse all'; }
  else { CATEGORIES.forEach(c=>state.collapsed.add(c.code)); btn.querySelector('.lbl').textContent='Expand all'; }
  renderResults();
});
document.getElementById('resetBtn').addEventListener('click', ()=>{
  if(confirm('Reset the entire checklist? All statuses, flags, and notes will be cleared.')){
    allData.forEach(d=>{ d.status='not-tested'; d.assessorNotes={findings:'',evidenceLinks:[],pocDetails:'',affectedEndpoints:[]}; d.flagged=false; });
    detailCache.clear();
    saveProgress();
    lastPct = -1;
    renderAll();
    showToast('Checklist reset.');
  }
});
function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarBackdrop').classList.add('open');
  document.body.classList.add('sidebar-locked');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarBackdrop').classList.remove('open');
  document.body.classList.remove('sidebar-locked');
}
document.getElementById('menuBtn').addEventListener('click', ()=>{
  document.getElementById('sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
});
document.getElementById('sidebarCloseBtn').addEventListener('click', closeSidebar);
document.getElementById('sidebarBackdrop').addEventListener('click', closeSidebar);
window.addEventListener('resize', ()=>{
  if(window.innerWidth > 980) closeSidebar();
});
document.getElementById('testerName').addEventListener('input', ()=> saveProgress());

/* =========================================================
   SIDEBAR RAIL COLLAPSE (desktop) — the "three dots" collapsed view
========================================================= */
const SIDEBAR_RAIL_KEY = 'vapt_console_sidebar_rail';
function setSidebarRail(collapsed){
  const layoutEl = document.querySelector('.layout');
  const btn = document.getElementById('sidebarCollapseBtn');
  if(layoutEl) layoutEl.classList.toggle('sidebar-rail', collapsed);
  if(btn){
    btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  }
  try{ localStorage.setItem(SIDEBAR_RAIL_KEY, collapsed ? '1' : '0'); }catch(e){}
}
(function initSidebarRail(){
  const btn = document.getElementById('sidebarCollapseBtn');
  if(!btn) return;
  let saved = null;
  try{ saved = localStorage.getItem(SIDEBAR_RAIL_KEY); }catch(e){}
  // Collapsed by default on first visit — expand explicitly to see full labels.
  setSidebarRail(saved === null ? true : saved === '1');
  btn.addEventListener('click', ()=>{
    const layoutEl = document.querySelector('.layout');
    setSidebarRail(!(layoutEl && layoutEl.classList.contains('sidebar-rail')));
  });
})();

/* =========================================================
   THEME TOGGLE
========================================================= */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.innerHTML = theme === 'light' ? svgIcon('sun') : svgIcon('moon');
  try{ localStorage.setItem(THEME_KEY, theme); }catch(e){}
}
document.getElementById('themeToggle').addEventListener('click', ()=>{
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
});
(function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem(THEME_KEY); }catch(e){}
  applyTheme(saved || 'dark');
})();

/* =========================================================
   KEYBOARD SHORTCUTS
========================================================= */
document.addEventListener('keydown', (e)=>{
  const tag = document.activeElement.tagName;
  if(e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA'){
    e.preventDefault();
    const el = document.getElementById('searchInput'); if(el) el.focus();
  }
  if(e.key === 'Escape'){
    const assessEl = document.getElementById('assessOverlay');
    const statsEl = document.getElementById('statsOverlay');
    const paletteEl = document.getElementById('paletteOverlay');
    const badgesEl = document.getElementById('badgesOverlay');
    const toolkitEl = document.getElementById('toolkitOverlay');
    const sidebarEl = document.getElementById('sidebar');
    // The palette's own input shows a "esc" hint, so it must take priority
    // here too — this was previously unwired (see js/search.js comment).
    if(paletteEl && paletteEl.classList.contains('open')) closePalette();
    else if(assessEl && assessEl.classList.contains('open')) closeAssessMode();
    else if(statsEl && statsEl.classList.contains('open')) closeStats();
    else if(badgesEl && badgesEl.classList.contains('open')) badgesEl.classList.remove('open');
    else if(toolkitEl && toolkitEl.classList.contains('open')) closeToolkit();
    else if(sidebarEl && sidebarEl.classList.contains('open')) closeSidebar();
    else if(tag === 'INPUT' || tag === 'TEXTAREA') document.activeElement.blur();
  }
  if(assessModeOpen){
    if(e.key === 'ArrowRight') assessNext();
    if(e.key === 'ArrowLeft') assessPrev();
  }
});

/* =========================================================
   FLOATING ACTION: JUMP TO NEXT
========================================================= */
document.getElementById('fabNext').addEventListener('click', ()=>{
  const next = [...allData].sort((a,b)=>a.sequence-b.sequence).find(d=>d.status==='not-tested');
  if(!next){ showToast('Every test case is already complete!'); return; }
  state.search=''; state.status='all'; state.activeDomain=null; state.activeSevs.clear();
  document.getElementById('searchInput').value='';
  document.querySelectorAll('#statusChips .chip').forEach(c=>c.classList.remove('active'));
  document.querySelector('#statusChips .chip[data-status="all"]').classList.add('active');
  state.collapsed.delete(next.domain);
  state.expanded.add(next.id);
  renderAll();
  requestAnimationFrame(()=>{
    const el = document.querySelector(`.test-item[data-id="${CSS.escape(next.id)}"]`);
    if(el){
      el.scrollIntoView({behavior:'smooth', block:'center'});
      el.classList.add('highlight-next');
      setTimeout(()=> el.classList.remove('highlight-next'), 3300);
    }
  });
});

