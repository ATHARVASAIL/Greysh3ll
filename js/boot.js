/* VAPT CONSOLE — boot.js: boot() performs the synchronous first render and must be loaded last, after every other module. */

/* =========================================================
   BOOT — synchronous, instant render
========================================================= */
function boot(){
  const bootLoader = document.getElementById('bootLoader');

  applyProgress(loadProgress());
  lastPct = computeStats().pct;
  activeProfile().xp = computeXP();

  let domainParam = '';
  try{
    const params = new URLSearchParams(window.location.search);
    domainParam = (params.get('domain') || '').toUpperCase();
    if(domainParam && CATEGORIES.some(c => c.code === domainParam)){
      state.activeDomain = domainParam;
    }
    const searchParam = params.get('search') || '';
    if(searchParam){
      state.search = searchParam;
      const searchInput = document.getElementById('searchInput');
      if(searchInput) searchInput.value = searchParam;
    }
  }catch(e){}

  // All sections start collapsed — this is what keeps big domains like
  // NET (150 cases) and WEB (146 cases) fast to render, since a
  // collapsed section's item rows aren't built until it's expanded.
  // Exceptions: a domain reached via a Dashboard link opens pre-expanded
  // (that's clearly what the user came here to work on), and if arriving
  // via a Dashboard search, every domain with a matching result opens
  // pre-expanded too — otherwise search would just show a wall of
  // collapsed, seemingly-empty headers.
  const searchMatchDomains = state.search
    ? new Set(allData.filter(matchesFilters).map(d => d.domain))
    : null;
  CATEGORIES.forEach(c=>{
    const keepOpen = c.code === domainParam || (searchMatchDomains && searchMatchDomains.has(c.code));
    if(!keepOpen) state.collapsed.add(c.code);
  });
  const expandBtn = document.getElementById('expandBtn');
  if(expandBtn){
    const lbl = expandBtn.querySelector('.lbl');
    if(lbl) lbl.textContent = state.collapsed.size >= CATEGORIES.length ? 'Expand all' : 'Collapse all';
  }

  bindDomainContextEvents();
  renderDomainContext();
  initIdentity();

  renderAll();
  updateGamification();

  // Belt-and-braces: if we arrived via a Dashboard link (?domain=CODE),
  // make absolutely sure that domain's section is visibly expanded and
  // in view, regardless of collapsed-state bookkeeping above.
  if(domainParam && state.activeDomain === domainParam){
    const section = document.querySelector(`.cat-section[data-cat="${CSS.escape(domainParam)}"]`);
    if(section){
      state.collapsed.delete(domainParam);
      ensureCategoryBodyRendered(section);
      section.classList.remove('collapsed');
      section.scrollIntoView({block:'start'});
    }
  }

  if(bootLoader) bootLoader.classList.add('hidden');
  if(loadProgress()) showToast('Welcome back — your saved progress was restored.');

  // Hero typewriter
  (function heroTypewriter(){
    const el = document.getElementById('typedName');
    if(!el) return;
    const text = el.textContent.trim();
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!text || reduceMotion) return;
    el.textContent = '';
    el.classList.add('typing-cursor');
    let i = 0;
    (function step(){
      el.textContent = text.slice(0, i);
      if(i <= text.length){ i++; setTimeout(step, 42); }
      else { el.classList.remove('typing-cursor'); }
    })();
  })();

  // Hero spotlight
  (function heroSpotlight(){
    const card = document.querySelector('.identity');
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!card || reduceMotion) return;
    card.addEventListener('mousemove', (e)=>{
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX-rect.left)/rect.width*100)+'%');
      card.style.setProperty('--my', ((e.clientY-rect.top)/rect.height*100)+'%');
    });
  })();
}

/* =========================================================
   FAB SCROLL DIMMING
   The action button is fixed over the bottom-right of the content column, so
   while reading long passages it sits on top of the text — screenshots showed
   it cutting a sentence mid-word. Fading it while the page is actually moving
   keeps the text legible without removing the control: it returns to full
   opacity as soon as scrolling stops, and stays clickable throughout.
========================================================= */
(function initFabScrollDim(){
  const stack = document.querySelector('.fab-stack');
  if(!stack) return;
  // Honour reduced-motion: no opacity animation, no dimming at all.
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  let idleTimer = null;
  const clear = () => { stack.classList.remove('scrolling'); };

  window.addEventListener('scroll', () => {
    // Never dim while the user is interacting with the button itself.
    if(stack.matches(':hover') || stack.contains(document.activeElement)) return;
    stack.classList.add('scrolling');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(clear, 450);
  }, { passive: true });

  // Any direct engagement restores it immediately.
  ['mouseenter','focusin','touchstart'].forEach(evt =>
    stack.addEventListener(evt, () => { clearTimeout(idleTimer); clear(); }, { passive: true }));
})();

loadAllData()
  .then(boot)
  .catch(err => {
    console.error('GreySh3ll: failed to load test-case data', err);
    const bootLoader = document.getElementById('bootLoader');
    if(bootLoader){
      bootLoader.innerHTML = '<span style="color:#FF5C5C">Failed to load test-case data from /data. '
        + 'If you opened this file directly, serve the folder over HTTP (e.g. <code>python3 -m http.server</code>) '
        + 'and reload — browsers block fetch() on file:// URLs.</span>';
    }
  });
