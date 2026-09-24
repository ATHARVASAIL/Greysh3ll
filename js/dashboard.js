/* =========================================================
   VAPT CONSOLE — dashboard.js
   Progress computation (overall/severity/domain coverage), the
   XP/level/streak/badge gamification layer, and the Stats
   dashboard overlay.
========================================================= */

/* =========================================================
   COMPUTED STATS
========================================================= */
function computeStats(){
  const total = allData.length;
  const counts = {};
  STATUS_VALUES.forEach(s => counts[s.key] = 0);
  allData.forEach(d => { counts[d.status] = (counts[d.status]||0) + 1; });
  const flagged = allData.filter(d=>d.flagged).length;
  const pct = total ? Math.round(counts['tested-pass'] / total * 100) : 0;
  return { total, completed: counts['tested-pass'], inProgress: counts['in-progress'],
    failed: counts['tested-fail'], na: counts['not-applicable'], remaining: counts['not-tested'],
    flagged, pct, counts };
}

function computeSevCounts(){
  const counts = {};
  SEVERITIES.forEach(s=> counts[s.key]={total:0,done:0,pass:0,fail:0,na:0});
  allData.forEach(d=>{
    counts[d.severity].total++;
    if(d.status==='tested-pass') counts[d.severity].pass++;
    else if(d.status==='tested-fail') counts[d.severity].fail++;
    else if(d.status==='not-applicable') counts[d.severity].na++;
    else if(d.status==='in-progress') counts[d.severity].done++;
  });
  return counts;
}

function computeDomainCounts(){
  const counts = {};
  DOMAIN_META.forEach(c=>{
    counts[c.code] = { total: 0, pass: 0, fail: 0, na: 0, inProgress: 0, notTested: 0 };
  });
  allData.forEach(d=>{
    const c = counts[d.domain]; if(!c) return;
    c.total++;
    if(d.status==='tested-pass') c.pass++;
    else if(d.status==='tested-fail') c.fail++;
    else if(d.status==='not-applicable') c.na++;
    else if(d.status==='in-progress') c.inProgress++;
    else c.notTested++;
  });
  return counts;
}

function getDomainNextItem(domainCode){
  return allData.filter(d => d.domain === domainCode && d.status === 'not-tested')
    .sort((a,b) => a.sequence - b.sequence)[0] || null;
}

/* =========================================================
   XP / BADGES
========================================================= */
const XP_WEIGHTS = {critical:25, high:15, medium:10, low:5, info:2};
const BADGE_DEFS = [
  {id:'first-blood', label:'First Blood', icon:'🩸', desc:'Complete your first test case.', check:()=> allData.some(d=>d.status==='tested-pass')},
  {id:'quarter', label:'Quarter Coverage', icon:'🥉', desc:'Reach 25% overall coverage.', check:(s)=> s.pct>=25},
  {id:'halfway', label:'Halfway Hero', icon:'🥈', desc:'Reach 50% overall coverage.', check:(s)=> s.pct>=50},
  {id:'three-quarter', label:'Home Stretch', icon:'🥇', desc:'Reach 75% overall coverage.', check:(s)=> s.pct>=75},
  {id:'full-coverage', label:'Full Coverage', icon:'🏆', desc:'Complete all test cases.', check:(s)=> s.pct>=100},
  {id:'crit-crusher', label:'Crit Crusher', icon:'💥', desc:'Complete every Critical test case.', check:()=> allData.filter(d=>d.severity==='critical').every(d=>d.status==='tested-pass') && allData.some(d=>d.severity==='critical')},
  {id:'flag-5', label:'Retest Tracker', icon:'🚩', desc:'Flag 5 test cases for retest.', check:()=> allData.filter(d=>d.flagged).length>=5},
  {id:'streak-3', label:'3-Day Streak', icon:'🔥', desc:'Log progress 3 days in a row.', check:()=> activeProfile().streak>=3},
  {id:'streak-7', label:'Week Warrior', icon:'🔥', desc:'Log progress 7 days in a row.', check:()=> activeProfile().streak>=7},
  {id:'note-taker', label:'Note Taker', icon:'📝', desc:'Add assessor notes to 10 test cases.', check:()=> allData.filter(d=>d.assessorNotes && d.assessorNotes.findings && d.assessorNotes.findings.trim()).length>=10},
  {id:'hour-one', label:'Deep Focus', icon:'⏱️', desc:'Log 1 hour of active testing time.', check:()=> (activeProfile().totalSeconds||0)>=3600},
];

function categoryBadgeDefs(){
  return DOMAIN_META.map(c=>({
    id:'cat-'+c.code, label:c.code+' Cleared', icon:'✅',
    desc:`Complete every test case in ${c.name}.`,
    check:()=> allData.filter(d=>d.domain===c.code).every(d=>d.status==='tested-pass') && allData.some(d=>d.domain===c.code),
  }));
}
function allBadgeDefs(){ return BADGE_DEFS.concat(categoryBadgeDefs()); }

function computeXP(){ return allData.filter(d=>d.status==='tested-pass').reduce((sum,d)=> sum + (XP_WEIGHTS[d.severity]||5), 0); }
function levelForXp(xp){ return Math.max(1, Math.floor(Math.sqrt(xp/40)) + 1); }
function xpForLevel(lvl){ return Math.pow(lvl-1,2)*40; }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function updateStreak(prof){
  const today = todayStr();
  if(prof.lastActiveDate === today) return;
  if(!prof.lastActiveDate){ prof.streak = 1; }
  else {
    const prev = new Date(prof.lastActiveDate), now = new Date(today);
    const diffDays = Math.round((now-prev)/86400000);
    prof.streak = diffDays === 1 ? prof.streak + 1 : 1;
  }
  prof.lastActiveDate = today;
}
function updateGamification(){
  const prof = activeProfile(); if(!prof) return;
  prof.xp = computeXP();
  updateStreak(prof);
  const stats = computeStats();
  const newlyUnlocked = [];
  allBadgeDefs().forEach(b=>{
    const already = prof.badges.includes(b.id);
    let earned = false;
    try{ earned = !!b.check(stats); }catch(e){ earned = false; }
    if(earned && !already){ prof.badges.push(b.id); newlyUnlocked.push(b); }
  });
  saveProfiles();
  renderXpBar();
  if(newlyUnlocked.length){
    newlyUnlocked.forEach(b=> showToast(`${b.icon} Badge unlocked: ${b.label}`));
    burstConfetti();
  }
}
function renderXpBar(){
  const prof = activeProfile(); if(!prof) return;
  const lvl = levelForXp(prof.xp);
  const curFloor = xpForLevel(lvl), nextFloor = xpForLevel(lvl+1);
  const pct = Math.min(100, Math.round(((prof.xp-curFloor)/(nextFloor-curFloor))*100));
  const lvlEl = document.getElementById('xpLevelTag');
  const streakEl = document.getElementById('xpStreakTag');
  const numEl = document.getElementById('xpNumTag');
  const fillEl = document.getElementById('xpFill');
  const timeEl = document.getElementById('xpTimeTag');
  if(timeEl) timeEl.innerHTML = `${svgIcon('clock')} ${formatDuration(prof.totalSeconds||0)}`;
  if(lvlEl) lvlEl.textContent = `LVL ${lvl}`;
  if(streakEl) streakEl.innerHTML = `${svgIcon('flame')} ${prof.streak} day streak`;
  if(numEl) numEl.textContent = `${prof.xp} XP`;
  if(fillEl) fillEl.style.width = pct + '%';
}
function renderBadges(){
  const prof = activeProfile();
  const body = document.getElementById('badgesBody'); if(!body) return;
  const lvl = levelForXp(prof.xp);
  const curFloor = xpForLevel(lvl), nextFloor = xpForLevel(lvl+1);
  const pct = Math.min(100, Math.round(((prof.xp-curFloor)/(nextFloor-curFloor))*100));
  const defs = allBadgeDefs();
  const unlockedCount = defs.filter(b=>prof.badges.includes(b.id)).length;
  body.innerHTML = `
    <div class="stats-panel u-mb-16">
      <h4>Level ${lvl} · ${prof.xp} XP · ${svgIcon('flame')} ${prof.streak} day streak</h4>
      <div class="bar-row"><span class="label">To level ${lvl+1}</span><div class="track"><div class="fill csp-w bar-accent" data-pct="${pct}"></div></div><span class="val">${pct}%</span></div>
      <div class="u-note u-mt-8">${unlockedCount}/${defs.length} badges unlocked for <b class="u-bright">${escapeHtml(prof.name)}</b></div>
    </div>
    <div class="badge-grid">
      ${defs.map(b=>{
        const unlocked = prof.badges.includes(b.id);
        return `<div class="badge-card ${unlocked?'unlocked':'locked'}">
          <div class="badge-icon">${unlocked ? b.icon : svgIcon('lock')}</div>
          <div class="badge-label">${escapeHtml(b.label)}</div>
          <div class="badge-desc">${escapeHtml(b.desc)}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}
document.getElementById('badgesBtn').addEventListener('click', ()=>{ renderBadges(); document.getElementById('badgesOverlay').classList.add('open'); });
document.getElementById('xpBarWrap').addEventListener('click', ()=>{ renderBadges(); document.getElementById('badgesOverlay').classList.add('open'); });
document.getElementById('badgesClose').addEventListener('click', ()=> document.getElementById('badgesOverlay').classList.remove('open'));
document.getElementById('badgesOverlay').addEventListener('click', (e)=>{ if(e.target.id==='badgesOverlay') document.getElementById('badgesOverlay').classList.remove('open'); });

/* =========================================================
   CATEGORY CELEBRATIONS
========================================================= */
let lastCatPctMap = {};
function checkCategoryCelebrations(catCounts){
  DOMAIN_META.forEach(c=>{
    const cc = catCounts[c.code]; if(!cc || !cc.total) return;
    const pct = Math.round((cc.pass + cc.na) / cc.total * 100);
    const prevPct = lastCatPctMap[c.code];
    if(pct >= 100 && prevPct !== undefined && prevPct < 100){
      showToast(`✅ ${c.name} — phase complete!`);
      burstConfetti();
    }
    lastCatPctMap[c.code] = pct;
  });
}

/* =========================================================
   ANIMATED NUMBER COUNTER
========================================================= */
function animateNumber(el, to, suffix){
  if(!el) return;
  suffix = suffix || '';
  const from = parseInt(el.dataset.val || '0', 10);
  if(from === to){ el.textContent = to + suffix; return; }
  el.dataset.val = to;
  const dur = 450, start = performance.now();
  function step(now){
    const t = Math.min(1, (now-start)/dur);
    const eased = 1 - Math.pow(1-t, 3);
    el.textContent = Math.round(from + (to-from)*eased) + suffix;
    if(t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* =========================================================
   STATS DASHBOARD
========================================================= */
function openStats(){
  const sevCounts = computeSevCounts();
  const domainCounts = computeDomainCounts();
  const prof = activeProfile();

  const sevHtml = SEVERITIES.map(s=>{
    const c = sevCounts[s.key];
    const pct = c.total ? Math.round(c.pass/c.total*100) : 0;
    return `<div class="bar-row"><span class="label">${s.label}</span><div class="track"><div class="fill csp-w csp-sevbar" data-pct="${pct}" data-sev="${s.key}"></div></div><span class="val">${c.pass}/${c.total}</span></div>`;
  }).join('');

  const catHtml = DOMAIN_META.map((c,i)=>{
    const cc = domainCounts[c.code];
    const pct = cc.total ? Math.round((cc.pass+cc.na)/cc.total*100) : 0;
    return `<div class="bar-row"><span class="label">${i+1}. ${c.code}</span><div class="track"><div class="fill csp-w bar-accent" data-pct="${pct}"></div></div><span class="val">${pct}%</span></div>`;
  }).join('');

  const timeRows = DOMAIN_META.map((c,i)=>{
    const secs = (prof.timeSpent||{})[c.code] || 0;
    const maxSecs = Math.max(1, ...DOMAIN_META.map(cc=> (prof.timeSpent||{})[cc.code] || 0));
    const pct = Math.round(secs/maxSecs*100);
    return `<div class="bar-row"><span class="label">${i+1}. ${c.code}</span><div class="track"><div class="fill csp-w bar-accent-2" data-pct="${pct}"></div></div><span class="val">${formatDuration(secs)}</span></div>`;
  }).join('');

  const stats = computeStats();
  document.getElementById('statsGrid').innerHTML = `
    <div class="stats-panel"><h4>Coverage by severity</h4>${sevHtml}</div>
    <div class="stats-panel"><h4>Coverage by phase / category</h4>${catHtml}</div>
    <div class="stats-panel"><h4>Active testing time — ${escapeHtml(prof.name)}</h4>${timeRows}
      <div class="u-note u-mt-10">Total logged: <b class="u-bright">${formatDuration(prof.totalSeconds||0)}</b></div>
    </div>
    <div class="stats-panel">
      <h4>Summary</h4>
      <div class="u-legend-row">
        <div><b class="u-text-bright-lg">${stats.total}</b>total</div>
        <div><b class="u-text-low-lg">${stats.completed}</b>passed</div>
        <div><b class="u-text-med-lg">${stats.inProgress}</b>in progress</div>
        <div><b class="u-text-fail-lg">${stats.failed}</b>failed</div>
        <div><b class="u-text-na-lg">${stats.na}</b>N/A</div>
        <div><b class="u-text-dim-lg">${stats.remaining}</b>remaining</div>
      </div>
    </div>
  `;
  document.getElementById('statsOverlay').classList.add('open');
}
function closeStats(){
  document.getElementById('statsOverlay').classList.remove('open');
}
document.getElementById('statsBtn').addEventListener('click', openStats);
document.getElementById('statsClose').addEventListener('click', closeStats);
document.getElementById('statsOverlay').addEventListener('click', (e)=>{ if(e.target.id === 'statsOverlay') closeStats(); });
