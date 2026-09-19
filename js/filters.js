/* =========================================================
   VAPT CONSOLE — filters.js
   Pure filter-matching and sort logic. No DOM access except
   reading the shared `state` object (defined in core.js).
========================================================= */
function matchesFilters(item){
  if(state.activeDomain){
    if(item.domain !== state.activeDomain) return false;
  }
  if(state.activeSevs.size && !state.activeSevs.has(item.severity)) return false;
  if(state.status === 'open'){
    if(item.status==='tested-pass' || item.status==='tested-fail' || item.status==='not-applicable') return false;
  }
  if(state.status === 'done'){
    if(item.status !== 'tested-pass') return false;
  }
  if(state.status === 'in-progress' && item.status !== 'in-progress') return false;
  if(state.status === 'tested-fail' && item.status !== 'tested-fail') return false;
  if(state.status === 'not-applicable' && item.status !== 'not-applicable') return false;
  if(state.status === 'flagged' && !item.flagged) return false;
  if(state.search){
    const q = state.search.toLowerCase();
    const ref = item.reference || {};
    const tools = Array.isArray(ref.tools) ? ref.tools.join(' ') : (ref.tools || '');
    const links = Array.isArray(ref.links) ? ref.links.join(' ') : (ref.links || '');
    const notes = item.assessorNotes || {};
    const hay = `${item.title} ${item.id} ${item.cwe||''} ${tools} ${ref.standard||''} ${links} ${item.domain} ${notes.findings||''}`;
    if(!hay.toLowerCase().includes(q)) return false;
  }
  return true;
}

/* Sorts a list of items in-place per the toolbar's "Sort" select. Pulled
   out of renderResults() as a named function so the sort mode logic
   lives in one place instead of being re-implemented per caller. */
function sortItems(items, mode){
  if(mode==='severity') items.sort((a,b)=> SEV_ORDER[a.severity]-SEV_ORDER[b.severity]);
  else if(mode==='az') items.sort((a,b)=> a.title.localeCompare(b.title));
  else if(mode==='unchecked') items.sort((a,b)=>(a.status==='tested-pass')-(b.status==='tested-pass'));
  else items.sort((a,b)=> a.sequence - b.sequence);
  return items;
}
