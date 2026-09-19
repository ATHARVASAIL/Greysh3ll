/* =========================================================
   VAPT CONSOLE — search.js
   Toolbar search (debounced, filters the visible list via
   matchesFilters in filters.js) and the command palette
   (Ctrl/Cmd+K — jump straight to any test case by title, ID, or CWE).
========================================================= */

/* --- toolbar search --- */
let searchDebounce;
document.getElementById('searchInput').addEventListener('input', (e)=>{
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(()=>{ state.search = e.target.value; renderResults(); }, 150);
});

/* --- command palette --- */
function openPalette(){
  document.getElementById('paletteOverlay').classList.add('open');
  const input = document.getElementById('paletteInput');
  if(input){ input.value = ''; input.focus(); }
}
function closePalette(){
  document.getElementById('paletteOverlay').classList.remove('open');
}
document.getElementById('paletteBtn').addEventListener('click', openPalette);
document.getElementById('paletteOverlay').addEventListener('click', (e)=>{ if(e.target.id==='paletteOverlay') closePalette(); });
// The button's own tooltip promises "Command palette (Ctrl/Cmd+K)" — wire it up.
document.addEventListener('keydown', (e)=>{
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){
    e.preventDefault();
    openPalette();
  }
});
document.getElementById('paletteInput').addEventListener('input', (e)=>{
  const q = e.target.value.toLowerCase().trim();
  const results = document.getElementById('paletteResults');
  if(!q){ results.innerHTML = ''; return; }
  const matches = allData.filter(d =>
    d.title.toLowerCase().includes(q) ||
    d.id.toLowerCase().includes(q) ||
    (d.cwe||'').toLowerCase().includes(q)
  ).slice(0, 20);

  if(!matches.length){
    results.innerHTML = `<div class="palette-empty">No test cases match "${escapeHtml(e.target.value)}"</div>`;
    return;
  }

  results.innerHTML = matches.map(d=>`
    <div class="palette-item" data-jump-id="${d.id}">
      <span class="palette-cat">${d.id}</span>
      <span class="palette-title">${escapeHtml(d.title)}</span>
      <span class="palette-cat" style="color:${SEV_COLOR[d.severity]}">${d.severityLabel||d.severity}</span>
    </div>
  `).join('');

  results.querySelectorAll('.palette-item').forEach(el=>{
    el.addEventListener('click', ()=>{
      const id = el.dataset.jumpId;
      closePalette();
      state.search=''; state.status='all'; state.activeDomain=null; state.activeSevs.clear();
      document.getElementById('searchInput').value='';
      document.querySelectorAll('#statusChips .chip').forEach(c=>c.classList.remove('active'));
      document.querySelector('#statusChips .chip[data-status="all"]').classList.add('active');
      state.expanded.add(id);
      renderAll();
      requestAnimationFrame(()=>{
        const el2 = document.querySelector(`.test-item[data-id="${CSS.escape(id)}"]`);
        if(el2){
          el2.scrollIntoView({behavior:'smooth', block:'center'});
          el2.classList.add('highlight-next');
          setTimeout(()=> el2.classList.remove('highlight-next'), 3300);
        }
      });
    });
  });
});
