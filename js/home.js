/* GREYSH3LL — home.js: Dashboard page logic (index.html only).
   Depends on storage.js + core.js + effects-identity.js. Deliberately
   does NOT load dashboard.js/rendering.js/interactions.js/assessment.js/
   toolkit.js/search.js — those assume the full Assessment Workspace DOM
   (assessment.html) and are not safe to run here. */

const IDENTITY_COLLAPSED_KEY = 'vapt_console_identity_collapsed';

function computeDashboardStats(){
  const total = allData.length;
  const completed = allData.filter(d=>d.status==='tested-pass').length;
  const pct = total ? Math.round(completed/total*100) : 0;
  const remaining = allData.filter(d=>d.status==='not-tested').length;
  const critOpen = allData.filter(d=>d.severity==='critical' && d.status!=='tested-pass').length;
  return { total, completed, remaining, pct, critOpen };
}

/* Lightweight local count-up — kept self-contained rather than reusing
   dashboard.js's animateNumber, since this page deliberately doesn't
   load dashboard.js (see file header). */
function animateDashNumber(el, to, suffix){
  if(!el) return;
  suffix = suffix || '';
  const from = parseInt(el.dataset.val || '0', 10);
  el.dataset.val = to;
  if(from === to){ el.textContent = to + suffix; return; }
  const dur = 650, start = performance.now();
  function step(now){
    const t = Math.min(1, (now-start)/dur);
    const eased = 1 - Math.pow(1-t, 3);
    el.textContent = Math.round(from + (to-from)*eased) + suffix;
    if(t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderDashboardStats(){
  const s = computeDashboardStats();
  animateDashNumber(document.getElementById('dashTotal'), s.total);
  animateDashNumber(document.getElementById('dashDone'), s.completed);
  animateDashNumber(document.getElementById('dashLeft'), s.remaining);
  animateDashNumber(document.getElementById('dashCrit'), s.critOpen);
  animateDashNumber(document.getElementById('dashPct'), s.pct, '%');

  const ring = document.getElementById('dashRingFill');
  if(ring){
    const r = 60, circumference = 2 * Math.PI * r;
    ring.style.strokeDasharray = circumference.toFixed(1);
    ring.style.strokeDashoffset = circumference.toFixed(1);
    requestAnimationFrame(()=>{
      ring.style.transition = 'stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)';
      ring.style.strokeDashoffset = (circumference * (1 - s.pct/100)).toFixed(1);
    });
  }
  if(typeof applyCspStyles==="function") applyCspStyles();
}

function renderSeverityBreakdown(){
  const wrap = document.getElementById('dashSevRow');
  if(!wrap) return;
  wrap.innerHTML = SEVERITIES.map(sev=>{
    const items = allData.filter(d=>d.severity===sev.key);
    const total = items.length;
    const done = items.filter(d=>d.status==='tested-pass').length;
    const pct = total ? Math.round(done/total*100) : 0;
    return `<div class="bar-row">
      <span class="label sev-text" data-sev="${sev.key}"><span class="sev-dot sev-badge" data-sev="${sev.key}"></span>${escapeHtml(sev.label)}</span>
      <span class="track"><span class="fill csp-w csp-sevbar" data-pct="${pct}" data-sev="${sev.key}"></span></span>
      <span class="val">${done}/${total}</span>
    </div>`;
  }).join('');
}

const DOMAIN_ICONS = {
  NET:    '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="6" r="2.4"/><circle cx="12" cy="18" r="2.4"/><path d="M7.9 7.2L11 15.5M16.1 7.2L13 15.5M8.4 6h7.2"/>',
  WEB:    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5a13 13 0 0 1 0 17M12 3.5a13 13 0 0 0 0 17"/>',
  API:    '<rect x="3.5" y="9" width="6" height="6" rx="1"/><rect x="14.5" y="9" width="6" height="6" rx="1"/><path d="M9.5 12h5"/>',
  LLM:    '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3.5v2.5M15 3.5v2.5M9 18v2.5M15 18v2.5M3.5 9H6M3.5 15H6M18 9h2.5M18 15h2.5"/><circle cx="10" cy="12" r="1"/><circle cx="14" cy="12" r="1"/>',
  CLOUD:  '<path d="M7 18.5a4.3 4.3 0 0 1-.6-8.5 5.5 5.5 0 0 1 10.7-1.8A4 4 0 0 1 17 18.5H7z"/>',
  MOBILE: '<rect x="7" y="2.8" width="10" height="18.4" rx="2"/><line x1="10" y1="18.2" x2="14" y2="18.2"/>',
  THICK:  '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
  WIFI:   '<path d="M4 8.5a12 12 0 0 1 16 0M7 12a7.5 7.5 0 0 1 10 0M10.2 15.4a3 3 0 0 1 3.6 0"/><circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none"/>',
  SRC:    '<polyline points="8.5,7 3.5,12 8.5,17"/><polyline points="15.5,7 20.5,12 15.5,17"/><line x1="13.5" y1="4.5" x2="10.5" y2="19.5"/>',
  SOCIAL: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><circle cx="17" cy="8.5" r="2.4"/><path d="M15.5 14.2c2.4.3 4 2 4 4.8"/>'
};

function domainStatusBadge(pct, done, total){
  if(done === total) return `<span class="domain-card-badge domain-badge-complete">Complete</span>`;
  if(done === 0) return `<span class="domain-card-badge domain-badge-idle">Not started</span>`;
  return `<span class="domain-card-badge domain-badge-progress">${pct}% done</span>`;
}

function renderDomainCards(){
  const grid = document.getElementById('domainGrid');
  if(!grid) return;
  grid.innerHTML = CATEGORIES.map((c, idx)=>{
    const items = allData.filter(d=>d.domain===c.code);
    const total = items.length;
    const done = items.filter(d=>d.status==='tested-pass').length;
    const pct = total ? Math.round(done/total*100) : 0;
    const icon = DOMAIN_ICONS[c.code] || '<circle cx="12" cy="12" r="8"/>';
    return `<a class="domain-card" href="assessment.html?domain=${encodeURIComponent(c.code)}" data-idx="${idx}">
      <div class="domain-card-head">
        <span class="domain-card-icn"><svg class="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>
        <span class="domain-card-code">${idx+1}. ${escapeHtml(c.code)}</span>
        ${domainStatusBadge(pct, done, total)}
      </div>
      <div class="domain-card-name">${escapeHtml(c.name)}</div>
      <div class="domain-card-desc">${escapeHtml(c.desc)}</div>
      <div class="domain-card-bar"><div class="domain-card-bar-fill csp-w" data-pct="${pct}"></div></div>
      <div class="domain-card-foot">
        <span>${done}/${total} complete</span>
        <span class="domain-card-link">Assess
          <svg class="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12,5 19,12 12,19"/></svg>
        </span>
      </div>
    </a>`;
  }).join('');
}

/* =========================================================
   SMART "CONTINUE TESTING" CTA
   Routes to wherever the person actually left off, instead of
   always pointing at a generic "open the workspace" link.
========================================================= */
function findContinueDomain(){
  const perDomain = CATEGORIES.map(c=>{
    const items = allData.filter(d=>d.domain===c.code);
    const total = items.length;
    const done = items.filter(d=>d.status==='tested-pass').length;
    return { code:c.code, name:c.name, total, done };
  });
  // Prefer a domain that's partway done — that's "where you left off".
  const inProgress = perDomain.find(d => d.done > 0 && d.done < d.total);
  if(inProgress) return inProgress;
  // Otherwise the first not-yet-complete domain, in testing order.
  const notStarted = perDomain.find(d => d.done < d.total);
  if(notStarted) return notStarted;
  return null; // everything complete
}

function renderContinueCta(){
  const label = document.getElementById('dashCtaLabel');
  const link = document.getElementById('dashCtaLink');
  if(!label || !link) return;
  const target = findContinueDomain();
  if(!target){
    label.textContent = 'Every test case is complete. ';
    link.textContent = 'Review the Workspace →';
    link.href = 'assessment.html';
    return;
  }
  const verb = target.done > 0 ? 'Continue' : 'Start';
  label.textContent = `${verb} where you left off — ${target.name} (${target.done}/${target.total}). `;
  link.textContent = `${verb} ${target.code} →`;
  link.href = `assessment.html?domain=${encodeURIComponent(target.code)}`;
}

/* =========================================================
   DASHBOARD SEARCH — jumps straight into the workspace,
   pre-filtered, instead of making the person open it blank
   and search again.
========================================================= */
function initDashSearch(){
  const form = document.getElementById('dashSearchForm');
  const input = document.getElementById('dashSearchInput');
  if(!form || !input) return;
  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const q = input.value.trim();
    window.location.href = q
      ? `assessment.html?search=${encodeURIComponent(q)}`
      : 'assessment.html';
  });
}

/* =========================================================
   COLLAPSIBLE HERO — collapses once identity info is already
   saved from a previous visit, or right after the user finishes
   editing it. A manual toggle always overrides the auto behavior.
========================================================= */
function setIdentityCollapsed(collapsed){
  const card = document.getElementById('identityCard');
  const btn = document.getElementById('identityCollapseBtn');
  if(card) card.classList.toggle('identity-collapsed', collapsed);
  if(btn) btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
  safeStoragePref(IDENTITY_COLLAPSED_KEY, collapsed ? '1' : '0');
}
function initIdentityCollapse(){
  const btn = document.getElementById('identityCollapseBtn');
  const editBtn = document.getElementById('identityEditBtn');
  if(!btn) return;

  let savedPref = null;
  savedPref = safeStorageGet(IDENTITY_COLLAPSED_KEY);

  if(savedPref !== null){
    setIdentityCollapsed(savedPref === '1');
  } else {
    // No explicit preference yet — auto-collapse only if identity was
    // already written in a previous session; first-ever visit stays open.
    const saved = loadIdentity();
    setIdentityCollapsed(!!(saved && saved.name));
  }

  btn.addEventListener('click', ()=>{
    const card = document.getElementById('identityCard');
    setIdentityCollapsed(!(card && card.classList.contains('identity-collapsed')));
  });

  // Auto-collapse right after the user clicks "Done" on the edit button
  // (effects-identity.js's own listener already ran and flipped
  // aria-pressed to 'false' by the time this fires).
  if(editBtn){
    editBtn.addEventListener('click', ()=>{
      if(editBtn.getAttribute('aria-pressed') === 'false'){
        setTimeout(()=> setIdentityCollapsed(true), 250);
      }
    });
  }
}

/* =========================================================
   THEME TOGGLE (duplicated minimal copy — interactions.js isn't
   loaded on this page)
========================================================= */
function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if(btn) btn.innerHTML = theme === 'light' ? svgIcon('sun') : svgIcon('moon');
  safeStoragePref(THEME_KEY, theme);
}
(function initTheme(){
  let saved = null;
  saved = safeStorageGet(THEME_KEY);
  applyTheme(saved || 'dark');
})();
document.getElementById('themeToggle').addEventListener('click', ()=>{
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
});

/* =========================================================
   BOOT
========================================================= */
function bootHome(){
  const bootLoader = document.getElementById('bootLoader');
  applyProgress(loadProgress());
  initIdentity();
  initIdentityCollapse();
  renderDashboardStats();
  renderSeverityBreakdown();
  renderDomainCards();
  renderContinueCta();
  initDashSearch();
  if(bootLoader) bootLoader.classList.add('hidden');

  // Hero typewriter (same touch as the Workspace boot, kept here since
  // the hero itself now lives only on this page)
  const el = document.getElementById('typedName');
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(el && el.textContent.trim() && !reduceMotion){
    const text = el.textContent.trim();
    el.textContent = '';
    el.classList.add('typing-cursor');
    let i = 0;
    (function step(){
      el.textContent = text.slice(0, i);
      if(i <= text.length){ i++; setTimeout(step, 42); }
      else { el.classList.remove('typing-cursor'); }
    })();
  }
}

loadAllData()
  .then(bootHome)
  .catch(err => {
    console.error('GreySh3ll: failed to load test-case data', err);
    const bootLoader = document.getElementById('bootLoader');
    if(bootLoader){
      bootLoader.innerHTML = '<span class="u-text-fail">Failed to load test-case data from /data. '
        + 'If you opened this file directly, serve the folder over HTTP (e.g. <code>python3 -m http.server</code>) '
        + 'and reload — browsers block fetch() on file:// URLs.</span>';
    }
  });
