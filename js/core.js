/* =========================================================
   VAPT CONSOLE — core.js
   Shared state, constants, and small render/format helpers used
   by every other module. Load this file first.

   Module map (load order matters — plain scripts share one scope):
     storage.js           persistence, constants, identity/profile storage
     filters.js           pure filter/sort logic over test-case data
     search.js            search box + command palette
     dashboard.js          stats + gamification (XP/streaks/badges)
     core.js               (this file) state, constants, helpers
     rendering.js          profile bar, time tracker, sidebar, detail panel
     interactions.js       event binding, actions, results list, theme,
                            keyboard shortcuts, scroll reveal
     assessment.js         Assessment Mode, toast, export/import,
                            domain context editor
     toolkit.js             Analyst Toolkit — CVSS calculator, payload
                            cheat-sheet, OSCP-style drills, report builder
     effects-identity.js   particles/confetti + the hero identity block
     boot.js                boot() — synchronous first render, called last
========================================================= */

/* =========================================================
   STATE
========================================================= */
let state = {
  search:'', status:'all', sort:'default', activeDomain:null,
  activeSevs: new Set(), collapsed: new Set(), expanded: new Set(),
};
let assessIndex = 0;
let lastPct = -1;

/* =========================================================
   HELPERS
========================================================= */
function escapeHtml(str){ const d=document.createElement('div'); d.textContent = str==null?'':str; return d.innerHTML; }
function checkSvg(){ return '<svg class="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5L9.5 18L20 6"/></svg>'; }
function chevSvg(){ return '<svg class="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9L12 15L18 9"/></svg>'; }

const ICONS = {
  book:'<path d="M4 5.5C4 4.7 4.7 4 5.5 4H12v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5C20 4.7 19.3 4 18.5 4H12v16h6.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
  menu:'<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>',
  sun:'<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="1.8" x2="12" y2="4.2"/><line x1="12" y1="19.8" x2="12" y2="22.2"/><line x1="4.4" y1="4.4" x2="6.1" y2="6.1"/><line x1="17.9" y1="17.9" x2="19.6" y2="19.6"/><line x1="1.8" y1="12" x2="4.2" y2="12"/><line x1="19.8" y1="12" x2="22.2" y2="12"/><line x1="4.4" y1="19.6" x2="6.1" y2="17.9"/><line x1="17.9" y1="6.1" x2="19.6" y2="4.4"/>',
  moon:'<path d="M20.4 14.7A8.5 8.5 0 1 1 9.3 3.6a7 7 0 0 0 11.1 11.1z"/>',
  search:'<circle cx="11" cy="11" r="7.2"/><line x1="20.8" y1="20.8" x2="16.4" y2="16.4"/>',
  trophy:'<path d="M7 4h10v4.2a5 5 0 0 1-10 0V4z"/><path d="M7 5.2H4.3a1 1 0 0 0-1 1.1c.2 2.4 1.7 3.9 4.1 4.2M17 5.2h2.7a1 1 0 0 1 1 1.1c-.2 2.4-1.7 3.9-4.1 4.2"/><line x1="12" y1="13.2" x2="12" y2="17.5"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="9.5" y1="17.5" x2="14.5" y2="17.5"/>',
  toolbox:'<rect x="3" y="9.5" width="18" height="10.5" rx="2"/><path d="M8.5 9.5V6.8a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2.7"/><line x1="3" y1="14.2" x2="21" y2="14.2"/><line x1="10.7" y1="14.2" x2="10.7" y2="16"/><line x1="13.3" y1="14.2" x2="13.3" y2="16"/>',
  barchart:'<line x1="5" y1="20" x2="5" y2="10.5"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="19" y1="20" x2="19" y2="14.5"/>',
  upload:'<path d="M12 15.5V4.5"/><path d="M7.2 9.2 12 4.5l4.8 4.7"/><path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
  download:'<path d="M12 4.5v11"/><path d="M7.2 11.3 12 15.5l4.8-4.2"/><path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
  table:'<rect x="3.3" y="4.5" width="17.4" height="15" rx="1.8"/><line x1="3.3" y1="10" x2="20.7" y2="10"/><line x1="9.2" y1="4.5" x2="9.2" y2="19.5"/>',
  printer:'<path d="M6.5 8.7V4.2a.8.8 0 0 1 .8-.8h9.4a.8.8 0 0 1 .8.8v4.5"/><rect x="3.8" y="8.7" width="16.4" height="7.6" rx="1.4"/><path d="M6.5 15.5v4.5a.8.8 0 0 0 .8.8h9.4a.8.8 0 0 0 .8-.8v-4.5"/>',
  x:'<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  play:'<polygon points="6.2,4.2 19.5,12 6.2,19.8" fill="currentColor" stroke="none"/>',
  skipforward:'<polygon points="5,4.2 15,12 5,19.8" fill="currentColor" stroke="none"/><line x1="19" y1="4.2" x2="19" y2="19.8" stroke-width="2.4"/>',
  maximize:'<path d="M8.5 3.5H5.8a2.3 2.3 0 0 0-2.3 2.3v2.7"/><path d="M15.5 3.5h2.7a2.3 2.3 0 0 1 2.3 2.3v2.7"/><path d="M20.5 15.5v2.7a2.3 2.3 0 0 1-2.3 2.3h-2.7"/><path d="M3.5 15.5v2.7a2.3 2.3 0 0 0 2.3 2.3h2.7"/>',
  rotateccw:'<path d="M3.5 3.5v5.2h5.2"/><path d="M4.3 14a8.5 8.5 0 1 0 2.2-8.7L3.5 8.7"/>',
  pencil:'<path d="M16.8 3.5a2.5 2.5 0 0 1 3.5 3.5L8.2 19.1l-4.2 1 1-4.2L16.8 3.5z"/><line x1="14.9" y1="5.4" x2="18.4" y2="8.9"/>',
  trash:'<line x1="4" y1="6.5" x2="20" y2="6.5"/><path d="M8 6.5V4.8a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 1 1.5 1.5v1.7m2.5 0-.8 12.8a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 6.5"/><line x1="10.2" y1="10.5" x2="10.2" y2="16.5"/><line x1="13.8" y1="10.5" x2="13.8" y2="16.5"/>',
  chevronleft:'<polyline points="15,18.5 8.5,12 15,5.5"/>',
  chevron:'<polyline points="5.5,9 12,15.5 18.5,9"/>',
  chevronright:'<polyline points="9,18.5 15.5,12 9,5.5"/>',
  flag:'<line x1="5" y1="21" x2="5" y2="3.5"/><path d="M5 4.2h12.5l-2.6 4.4 2.6 4.4H5"/>',
  refresh:'<path d="M20.5 8.5A9 9 0 1 0 21 12"/><polyline points="20.3,3.5 20.5,8.5 15.5,8.3"/>',
  shuffle:'<polyline points="16.5,3.5 21,3.5 21,8"/><line x1="3.5" y1="20.5" x2="21" y2="3.5"/><polyline points="21,16 21,20.5 16.5,20.5"/>',
  flame:'<path d="M12 2.7c1 3.6-3.4 4.9-3.6 8.7a3.7 3.7 0 0 0 7.4.2c.2-1.5-.6-2.4-.6-2.4s1.6 1 1.5 3.4a5.6 5.6 0 0 1-11.2.3c-.4-4.6 2.8-6 3.3-8.6.2 1.6 1 2.5 1.7 2.5-.1-1.7 0-2.9 1.5-4.1z"/>',
  clock:'<circle cx="12" cy="12" r="8.7"/><polyline points="12,7.2 12,12 15.5,13.8"/>',
  lock:'<rect x="5.2" y="10.8" width="13.6" height="9" rx="2"/><path d="M8 10.8V7.3a4 4 0 0 1 8 0v3.5"/>',
  file:'<path d="M4 4.5h16v15H4z" fill="none"/><path d="M4 4.5l8 8 8-8" fill="none"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};
function svgIcon(name){
  return `<svg class="icn" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]||''}</svg>`;
}
function listHtml(arr, cls){ if(!arr||!arr.length) return ''; return `<ul class="detail-list ${cls}">${arr.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`; }
function formatDuration(totalSeconds){
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if(h>0) return `${h}h ${m}m`;
  if(m>0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
function getStatusObj(key){ return STATUS_VALUES.find(s => s.key === key) || STATUS_VALUES[0]; }

