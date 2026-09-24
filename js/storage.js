/* =========================================================
   VAPT CONSOLE — storage.js
   Shared constants, test-case data loading, and every piece of
   localStorage persistence (engagement profiles, per-profile
   progress, per-domain assessment context). All localStorage keys
   are namespaced with `vapt_console_` and every read/write is
   wrapped in try/catch so a corrupt or disabled localStorage never
   crashes the app.
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */
const CATEGORIES = [
  {
    "code": "NET",
    "name": "Network & Infrastructure Security",
    "desc": "External & internal network reconnaissance, protocol, and infrastructure testing — typically the first phase of any assessment."
  },
  {
    "code": "WEB",
    "name": "Web Application Security",
    "desc": "Web application testing across configuration, authentication, access control, injection, and business logic."
  },
  {
    "code": "API",
    "name": "API Security",
    "desc": "REST/GraphQL API authorization, abuse resistance, and OWASP API Top 10 risk, tested alongside or after the web application."
  },
  {
    "code": "LLM",
    "name": "LLM / AI Application Security",
    "desc": "Security testing of LLM-integrated applications — prompt injection, sensitive data disclosure, supply chain, output handling, and agentic risk, per the OWASP Top 10 for LLM Applications (2025)."
  },
  {
    "code": "CLOUD",
    "name": "Cloud Security",
    "desc": "Cloud infrastructure, IAM, storage, and container/orchestration configuration review."
  },
  {
    "code": "MOBILE",
    "name": "Mobile Application Security",
    "desc": "iOS/Android application testing: local storage, binary protection, network communication, and platform misuse."
  },
  {
    "code": "THICK",
    "name": "Thick Client Security",
    "desc": "Desktop/native client binaries, local storage, and inter-process communication surfaces."
  },
  {
    "code": "WIFI",
    "name": "Wireless (Wi-Fi) Security",
    "desc": "Wi-Fi and short-range RF layer attacks against wireless infrastructure, typically tested on-site."
  },
  {
    "code": "SRC",
    "name": "Source Code Review",
    "desc": "White-box source code review, run in parallel with or after black-box testing where code access is in scope."
  },
  {
    "code": "SOCIAL",
    "name": "Social Engineering & Physical Security",
    "desc": "Human-layer and physical security testing — phishing, vishing, and physical access control assessment."
  }
];
const DOMAIN_META = CATEGORIES.map(c => ({ code: c.code, name: c.name, desc: c.desc }));

const STATUS_VALUES = [
  { key:'not-tested',    label:'Not Tested',    color:'var(--text-dim)' },
  { key:'in-progress',   label:'In Progress',   color:'#FFB000' },
  { key:'tested-pass',   label:'Pass',          color:'#00FF66' },
  { key:'tested-fail',   label:'Fail',          color:'#FF5C5C' },
  { key:'not-applicable',label:'N/A',           color:'#849489' },
];
const SEV_ORDER = {critical:0, high:1, medium:2, low:3, info:4};

/* =========================================================
   REMEDIATION TRACKING
   A finding's lifecycle does not end when it is confirmed. Real engagements
   report it, the client fixes (or accepts) it, and it gets retested — often
   weeks later. That is a separate axis from the test status above: an item
   stays 'tested-fail' historically while its remediation state moves on.
   Only meaningful for items that actually failed.
========================================================= */
const REMEDIATION_VALUES = [
  { key:'open',          label:'Open',            color:'#FF5C5C', desc:'Reported, not yet addressed by the client.' },
  { key:'in-remediation',label:'In Remediation',  color:'#FFB000', desc:'Client has confirmed a fix is in progress.' },
  { key:'retest-pending',label:'Ready to Retest', color:'#2FD9FF', desc:'Client says it is fixed; awaiting verification.' },
  { key:'fixed',         label:'Fixed (Verified)',color:'#00FF66', desc:'Retested and confirmed resolved.' },
  { key:'risk-accepted', label:'Risk Accepted',   color:'#B08CFF', desc:'Client has formally accepted this risk.' },
  { key:'not-fixed',     label:'Still Vulnerable',color:'#FF4D4D', desc:'Retested and the issue is still present.' },
];
function getRemediationObj(key){
  return REMEDIATION_VALUES.find(r => r.key === key) || REMEDIATION_VALUES[0];
}
/* Remediation only applies to confirmed findings — everything else has
   nothing to remediate. */
function supportsRemediation(item){
  return !!item && item.status === 'tested-fail';
}

const SEVERITIES = [
  {key:'critical', label:'Critical', color:'var(--crit)'},
  {key:'high',     label:'High',     color:'var(--high)'},
  {key:'medium',   label:'Medium',   color:'var(--med)'},
  {key:'low',      label:'Low',      color:'var(--low)'},
  {key:'info',     label:'Info',     color:'var(--info)'},
];

const STATUS_KEY = 'vapt_console_progress_v8';
const THEME_KEY  = 'vapt_console_theme';
const PROFILES_KEY = 'vapt_console_profiles_v2';
const DOMAIN_CONTEXT_KEY = 'vapt_console_domain_context_v1';
const CUSTOM_CASES_KEY = 'vapt_console_custom_cases_v1';
const CHAINS_KEY = 'vapt_console_chains_v1';

/* =========================================================
   DATA — fetched from data/*.json (one file per domain)
========================================================= */
/* Remediation sub-record, kept inside assessorNotes so it rides along with
   every existing save, export and import path without touching them. */
function normalizeRemediation(r){
  r = (r && typeof r === 'object') ? r : {};
  return {
    state: REMEDIATION_VALUES.some(v=>v.key===r.state) ? r.state : 'open',
    retestedAt: r.retestedAt || '',
    note: r.note || '',
  };
}

function normalizeItem(item){
  if(item.assessorNotes && typeof item.assessorNotes === 'object'){
    return {
      ...item,
      status: item.status || item.assessorNotes.status || 'not-tested',
      assessorNotes: {
        findings: item.assessorNotes.findings || '',
        evidenceLinks: Array.isArray(item.assessorNotes.evidenceLinks) ? item.assessorNotes.evidenceLinks : [],
        pocDetails: item.assessorNotes.pocDetails || '',
        affectedEndpoints: Array.isArray(item.assessorNotes.affectedEndpoints) ? item.assessorNotes.affectedEndpoints : [],
        attachments: Array.isArray(item.assessorNotes.attachments) ? item.assessorNotes.attachments : [],
        remediation: normalizeRemediation(item.assessorNotes.remediation),
        status: item.status || item.assessorNotes.status || 'not-tested',
      }
    };
  }
  return {
    ...item,
    status: item.done ? 'tested-pass' : 'not-tested',
    assessorNotes: {
      findings: item.notes || '',
      evidenceLinks: [],
      pocDetails: '',
      affectedEndpoints: [],
      attachments: [],
      remediation: normalizeRemediation(null),
      status: item.done ? 'tested-pass' : 'not-tested',
    },
    flagged: item.flagged || false,
  };
}

let allData = [];
let domainData = {};
const detailCache = new Map();

/* Fetches data/<domain>.json for every category (in phase order) and
   merges their `items` arrays into `allData`. Each domain file also
   carries a `context` block (scopeNotes/targetDetails/etc.) which is
   kept in `domainData` for reference, though engagement context itself
   is still persisted separately via localStorage (DOMAIN_CONTEXT_KEY).

   All 9 domain files are loaded together at boot. This app's stats,
   badges, command palette, and Assessment Mode all operate across the
   full 503-case set from the moment the page loads, so splitting that
   into a per-domain lazy fetch would change what those features show
   on first load — this restore keeps the original eager-load behavior
   so every feature works exactly as it did before. */
/* =========================================================
   DATA LOADING — light index up front, heavy detail on demand.

   Startup fetches data/index.json (~86 KB) which carries only the fields
   needed to render list rows, search, filters, sidebar counts, dashboard
   stats and Assessment Mode ordering. The remaining ~2.6 MB of detail
   lives in data/detail/<domain>.json and is fetched the first time
   something actually needs it. Previously all 3 MB blocked first paint.

   Both files are generated by tools/build-data.py from the editable
   sources in data/*.json.
========================================================= */
/* Set once when a save fails, so the user is told a single time rather than on
   every keystroke; cleared by the next successful save. */
let storageWarningShown = false;

/* =========================================================
   SAFE STORAGE
   Every localStorage write in this app was previously wrapped in an empty
   catch. That hid the failure that matters most: a full quota, which silently
   discards the analyst's work — custom test cases, attack chains, evidence.
   These helpers keep the app running when storage is unavailable (private
   browsing, disabled storage) while making sure a real failure is surfaced
   exactly once rather than never.
========================================================= */
function isQuotaError(e){
  return !!e && (e.name === 'QuotaExceededError'
    || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || e.code === 22 || e.code === 1014);
}

function safeStorageSet(key, value, label){
  try{
    localStorage.setItem(key, value);
    /* Re-arm the warning. Without this, the first failure suppresses every
       later one for the rest of the session — so a user who frees space,
       keeps working and then fills it again would lose data in silence. */
    storageWarningShown = false;
    return true;
  }catch(e){
    if(!storageWarningShown){
      storageWarningShown = true;
      const what = label ? `${label} was NOT saved` : 'Recent changes were NOT saved';
      const msg = isQuotaError(e)
        ? `Browser storage is full — ${what}. Export your progress (Save), then remove some evidence screenshots.`
        : `${what}. Export your progress (Save) to avoid losing work.`;
      if(typeof showToast === 'function') showToast(msg);
    }
    console.error(`GreySh3ll: failed to save ${label || key}`, e);
    return false;
  }
}

/* Reads never warn — a missing or unreadable value is a normal first-run
   state, not a failure worth interrupting the user for. */
function safeStorageGet(key){
  try{ return localStorage.getItem(key); }
  catch(e){ console.warn(`GreySh3ll: could not read ${key}`, e); return null; }
}

function safeStorageRemove(key){
  try{ localStorage.removeItem(key); return true; }
  catch(e){ console.warn(`GreySh3ll: could not remove ${key}`, e); return false; }
}

/* Cosmetic preferences (theme, sidebar state). Losing these costs the user
   nothing but a re-toggle, so a failure here must never raise a warning —
   interrupting someone because their theme choice did not persist would be
   noise that trains them to ignore the genuinely important storage warning. */
function safeStoragePref(key, value){
  try{ localStorage.setItem(key, value); return true; }
  catch(e){ return false; }
}

const detailLoaded = new Map();   // domain code -> Promise, so concurrent
                                  // callers share one in-flight request

async function loadAllData(){
  const res = await fetch('data/index.json');
  if(!res.ok) throw new Error(`Failed to load data/index.json: ${res.status} ${res.statusText}`);
  const index = await res.json();

  domainData = index.domains || {};
  const items = Array.isArray(index.items) ? index.items : [];
  allData = items.map(normalizeItem);
  mergeCustomCases();
}

/* Fetches and merges one domain's detail fields into the existing allData
   objects. Idempotent and safe to call from multiple places at once —
   repeat calls return the same promise rather than refetching. */
function ensureDetail(domainCode){
  if(!domainCode) return Promise.resolve();
  if(detailLoaded.has(domainCode)) return detailLoaded.get(domainCode);

  const p = (async () => {
    const res = await fetch(`data/detail/${String(domainCode).toLowerCase()}.json`);
    if(!res.ok) throw new Error(`Failed to load detail for ${domainCode}: ${res.status}`);
    const detail = await res.json();
    allData.forEach(item => {
      const heavy = detail[item.id];
      // Custom cases already carry their full content and are not in the
      // generated detail files, so they are simply skipped here.
      if(heavy) Object.assign(item, heavy);
    });
  })().catch(err => {
    // Drop the cached promise so a transient failure can be retried rather
    // than permanently poisoning this domain.
    detailLoaded.delete(domainCode);
    throw err;
  });

  detailLoaded.set(domainCode, p);
  return p;
}

/* For features that read across every domain at once — the report builder
   needs genuinely everything, so it still pulls the full detail set. */
function ensureAllDetail(onProgress){
  /* The report builder is the one feature that genuinely needs every domain,
     which is ~2.5 MB of JSON. On a slow connection that is long enough for a
     bare "Loading…" to read as a hang, so callers can pass a progress
     callback and show how far along it actually is. */
  const total = DOMAIN_META.length;
  let done = 0;
  const report = () => { if(typeof onProgress === 'function') onProgress(done, total); };
  report();
  return Promise.all(DOMAIN_META.map(c =>
    ensureDetail(c.code).then(res => { done++; report(); return res; })
  ));
}

/* =========================================================
   TOOLKIT BUNDLE — the payload cheat-sheet and drill tabs read across all
   domains, but only need payloads and a short description excerpt. Loading
   the full detail set for that meant parsing ~2.5 MB to render a fraction
   of it, which is enough to kill a tab on a memory-constrained phone. This
   bundle is ~485 KB and carries exactly what those two tabs display.
========================================================= */
let toolkitData = null;
let toolkitDataPromise = null;

function ensureToolkitData(){
  if(toolkitData) return Promise.resolve(toolkitData);
  if(toolkitDataPromise) return toolkitDataPromise;

  toolkitDataPromise = (async () => {
    const res = await fetch('data/toolkit.json');
    if(!res.ok) throw new Error(`Failed to load data/toolkit.json: ${res.status}`);
    const rows = await res.json();
    /* Custom cases live only in this browser and are absent from the generated
       bundle, so fold them in here — otherwise a user's own payloads would be
       missing from the cheat-sheet. */
    const custom = allData.filter(d => d.custom).map(d => ({
      id: d.id, domain: d.domain, title: d.title, severity: d.severity,
      cwe: d.cwe, examplePayloads: d.examplePayloads || [],
      whatItIs: (d.whatItIs || '').slice(0, 240),
    }));
    toolkitData = rows.concat(custom);
    return toolkitData;
  })().catch(err => {
    toolkitDataPromise = null;   // allow a genuine retry
    throw err;
  });

  return toolkitDataPromise;
}

/* Custom cases are added after the bundle may already be cached, so drop the
   cache when the custom set changes rather than serving a stale cheat-sheet. */
function invalidateToolkitData(){
  toolkitData = null;
  toolkitDataPromise = null;
}

/* True when an item still only has its index-level fields. */
function hasDetail(item){
  return !!(item && (item.custom || typeof item.whatItIs === 'string'));
}

/* =========================================================
   CUSTOM TEST CASES — user-authored cases layered on top of the
   built-in 524, scoped per engagement profile so different clients/
   engagements don't mix custom entries. Stored separately from
   allData's own persistence (progress) since these are content,
   not status — they need to exist before status can even apply.
========================================================= */
function customCasesKeyFor(id){ return CUSTOM_CASES_KEY + '::' + id; }
function loadCustomCases(){
  try{
    const raw = localStorage.getItem(customCasesKeyFor(profilesState.activeId));
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveCustomCases(list){
  safeStorageSet(customCasesKeyFor(profilesState.activeId), JSON.stringify(list), 'Your custom test cases');
}
function nextCustomId(domain){
  const existing = loadCustomCases().filter(c=>c.domain===domain);
  let n = existing.length + 1;
  let id = `${domain}-CUSTOM-${String(n).padStart(2,'0')}`;
  while(existing.some(c=>c.id===id)){ n++; id = `${domain}-CUSTOM-${String(n).padStart(2,'0')}`; }
  return id;
}
/* Builds a full-schema item from the minimal custom-case form input,
   filling every field the rest of the app (detail panel, report,
   CSV export) expects, so a custom case never needs special-casing
   downstream. */
function buildCustomCaseItem(input){
  const domain = input.domain;
  const catMeta = DOMAIN_META.find(c=>c.code===domain);
  const maxSeq = Math.max(0, ...allData.filter(d=>d.domain===domain).map(d=>d.sequence||0));
  return {
    id: nextCustomId(domain),
    domain, custom: true,
    phase: maxSeq + 1, sequence: maxSeq + 1,
    title: input.title.trim(),
    severity: input.severity,
    severityLabel: input.severity.charAt(0).toUpperCase()+input.severity.slice(1),
    cwe: input.cwe.trim() || 'N/A',
    prerequisites: input.prerequisites.trim() || 'Not specified.',
    whatItIs: input.whatItIs.trim(),
    rootCause: input.rootCause.trim() || 'Not specified.',
    impact: input.impact.trim() || 'Not specified.',
    stepsToIdentify: input.stepsToIdentify.split('\n').map(s=>s.trim()).filter(Boolean),
    exploitationSteps: input.exploitationSteps.split('\n').map(s=>s.trim()).filter(Boolean),
    examplePayloads: [],
    variants: [],
    mitigation: input.mitigation.split('\n').map(s=>s.trim()).filter(Boolean),
    reference: { standard: catMeta ? catMeta.name : domain, cwe: input.cwe.trim() || 'N/A', tools: [], links: [] },
    assessorNotes: { findings:'', evidenceLinks:[], pocDetails:'', affectedEndpoints:[], attachments:[], status:'not-tested' },
    flagged: false, status: 'not-tested',
  };
}
function addCustomCase(input){
  const item = buildCustomCaseItem(input);
  const list = loadCustomCases();
  list.push(item);
  saveCustomCases(list);
  allData.push(normalizeItem(item));
  invalidateToolkitData();
  return item;
}
function removeCustomCase(id){
  saveCustomCases(loadCustomCases().filter(c=>c.id!==id));
  allData = allData.filter(d=>d.id!==id);
  saveChains(loadChains().filter(ch=>ch.fromId!==id && ch.toId!==id));
  invalidateToolkitData();
}
function mergeCustomCases(){
  const custom = loadCustomCases();
  custom.forEach(c => allData.push(normalizeItem(c)));
}

/* =========================================================
   ATTACK CHAINS — links between two findings ("A enables B"),
   scoped per engagement profile. Deliberately a flat edge list
   rather than a graph structure: with realistic chain counts
   (a handful per engagement) a flat list is simpler to store,
   render, and export than a graph model, and chains-of-chains
   are reconstructed at render time by following fromId/toId.
========================================================= */
function chainsKeyFor(id){ return CHAINS_KEY + '::' + id; }
function loadChains(){
  try{
    const raw = localStorage.getItem(chainsKeyFor(profilesState.activeId));
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function saveChains(list){
  safeStorageSet(chainsKeyFor(profilesState.activeId), JSON.stringify(list), 'Your attack chains');
}
function addChain(fromId, toId, note){
  if(fromId === toId) return null;
  const list = loadChains();
  if(list.some(c=>c.fromId===fromId && c.toId===toId)) return null; // no duplicate edges
  const chain = { id:'chain-'+Date.now()+'-'+Math.floor(Math.random()*1000), fromId, toId, note:(note||'').trim(), createdAt:new Date().toISOString() };
  list.push(chain);
  saveChains(list);
  return chain;
}
function removeChain(chainId){
  saveChains(loadChains().filter(c=>c.id!==chainId));
}
/* Groups the flat edge list into linear sequences (A→B→C→…) for
   display, by walking forward from every node that is never a
   target itself (i.e. every chain's starting point). */
function buildChainSequences(){
  const list = loadChains();
  if(!list.length) return [];
  const byFrom = new Map();
  list.forEach(c => { if(!byFrom.has(c.fromId)) byFrom.set(c.fromId, []); byFrom.get(c.fromId).push(c); });
  const targets = new Set(list.map(c=>c.toId));
  const sequences = [];
  const visited = new Set();

  /* Walks forward from one edge until it runs out of unvisited
     successors. `visited` is checked before stepping, so a cycle
     terminates the walk instead of looping forever. */
  function walkFrom(start){
    const seq = [start]; visited.add(start.id);
    let cursor = start;
    while(true){
      const nexts = (byFrom.get(cursor.toId)||[]).filter(c=>!visited.has(c.id));
      if(!nexts.length) break;
      const next = nexts[0];
      seq.push(next); visited.add(next.id); cursor = next;
    }
    return seq;
  }

  // Pass 1: walk from every natural starting point (an edge whose
  // source is never itself a target), which covers all acyclic chains.
  list.filter(c => !targets.has(c.fromId)).forEach(start => {
    if(!visited.has(start.id)) sequences.push(walkFrom(start));
  });

  // Pass 2: anything still unvisited is part of a cycle (every node in a
  // loop is a target, so a loop has no natural start and pass 1 skips it
  // entirely). Without this, a cyclic chain would be stored but render as
  // nothing — the user would see "no chains" right after adding one, with
  // no way to delete it since the remove button only exists on a rendered
  // edge. Enter each remaining loop at an arbitrary edge instead.
  list.forEach(edge => {
    if(!visited.has(edge.id)) sequences.push(walkFrom(edge));
  });

  return sequences;
}

/* =========================================================
   PERSISTENCE — multi-engagement profiles
========================================================= */
function loadProfiles(){
  try{ const raw = localStorage.getItem(PROFILES_KEY); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}
function saveProfiles(){
  safeStorageSet(PROFILES_KEY, JSON.stringify(profilesState), 'Your engagement profiles');
}
function newProfileObj(name){
  return { id:'eng-'+Date.now()+'-'+Math.floor(Math.random()*1000), name: name||'New Engagement',
    createdAt:new Date().toISOString(), xp:0, streak:0, lastActiveDate:null, badges:[],
    totalSeconds:0, timeSpent:{}, drillsCompleted:0 };
}
function ensureProfiles(){
  let p = loadProfiles();
  if(!p || !p.profiles || !p.profiles.length){
    const prof = newProfileObj('Default Engagement');
    p = { activeId: prof.id, profiles:[prof] };
    try{
      const legacy = localStorage.getItem('vapt_console_progress_v3');
      if(legacy){
        localStorage.setItem('vapt_console_progress_v3::' + prof.id, legacy);
        localStorage.removeItem('vapt_console_progress_v3');
      }
      localStorage.setItem(PROFILES_KEY, JSON.stringify(p));
    }catch(e){
      /* One-time migration of pre-profiles saved data. A failure here is not
         worth warning about: the user still gets a working default profile,
         and the legacy key is left untouched so a later attempt can succeed.
         Logged rather than surfaced, because there is no action to take. */
      console.warn('GreySh3ll: legacy progress migration skipped', e);
    }
  }
  return p;
}
let profilesState = ensureProfiles();
function activeProfile(){ return profilesState.profiles.find(p=>p.id===profilesState.activeId) || profilesState.profiles[0]; }
function progressKeyFor(id){ return STATUS_KEY + '::' + id; }

function loadProgress(){
  try{ const raw = localStorage.getItem(progressKeyFor(profilesState.activeId)); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}
function saveProgress(){
  try{
    const payload = {
      tester: (document.getElementById('testerName')||{}).value || '',
      savedAt: new Date().toISOString(),
      statuses: Object.fromEntries(allData.filter(d=>d.status && d.status !== 'not-tested').map(d=>[d.id, d.status])),
      /* Must check every notes field, not just `findings`. Filtering on
         findings alone meant an item where the assessor had only attached
         a screenshot (or filled in endpoints/PoC) was treated as empty and
         never persisted — silently losing that evidence on page reload. */
      notes: Object.fromEntries(allData.filter(d=>{
        const n = d.assessorNotes;
        if(!n) return false;
        return !!(n.findings || n.pocDetails
          || (n.evidenceLinks && n.evidenceLinks.length)
          || (n.affectedEndpoints && n.affectedEndpoints.length)
          || (n.attachments && n.attachments.length)
          || (n.remediation && (n.remediation.state !== 'open' || n.remediation.retestedAt || n.remediation.note)));
      }).map(d=>[d.id, JSON.stringify(d.assessorNotes)])),
      flagged: allData.filter(d=>d.flagged).map(d=>d.id),
    };
    localStorage.setItem(progressKeyFor(profilesState.activeId), JSON.stringify(payload));
    storageWarningShown = false;   // a successful save clears the warning state
  }catch(e){
    /* Previously this swallowed every error. That silently discarded the
       analyst's work — most often when evidence screenshots pushed the profile
       past the browser's ~5 MB localStorage quota. Losing engagement evidence
       without any warning is far worse than an interruption, so surface it
       once rather than failing quietly. */
    const quotaHit = e && (e.name === 'QuotaExceededError'
      || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || e.code === 22 || e.code === 1014);
    if(!storageWarningShown){
      storageWarningShown = true;
      const msg = quotaHit
        ? 'Browser storage is full — recent changes were NOT saved. Export your progress now (Save), then remove some evidence screenshots.'
        : 'Could not save progress to browser storage. Export your progress (Save) to avoid losing work.';
      if(typeof showToast === 'function') showToast(msg);
      else console.error('GreySh3ll: progress save failed —', e);
    }
    console.error('GreySh3ll: saveProgress failed', e);
  }
}
/* =========================================================
   IMPORT VALIDATION
   A file that parses as JSON is not necessarily a GreySh3ll export. Without
   this check, picking the wrong file produced no error and no visible change
   — the user reasonably concluded the import had worked. Validate the shape
   first, and report precisely what is wrong when it does not match.
========================================================= */
function validateProgressPayload(payload){
  const errors = [];
  if(payload === null || typeof payload !== 'object' || Array.isArray(payload)){
    return { ok:false, errors:['This file does not contain a GreySh3ll progress export.'], summary:null };
  }

  const known = ['statuses','notes','flagged','customCases','chains','tester','exportedAt'];
  if(!known.some(k => k in payload)){
    return { ok:false, errors:['This JSON file is not a GreySh3ll progress export — none of the expected fields are present.'], summary:null };
  }

  const isPlainObject = v => v && typeof v === 'object' && !Array.isArray(v);
  if('statuses' in payload && !isPlainObject(payload.statuses)) errors.push('"statuses" is malformed.');
  if('notes' in payload && !isPlainObject(payload.notes)) errors.push('"notes" is malformed.');
  if('flagged' in payload && !Array.isArray(payload.flagged)) errors.push('"flagged" is malformed.');
  if('customCases' in payload && !Array.isArray(payload.customCases)) errors.push('"customCases" is malformed.');
  if('chains' in payload && !Array.isArray(payload.chains)) errors.push('"chains" is malformed.');

  const statusKeys = isPlainObject(payload.statuses) ? Object.keys(payload.statuses) : [];
  const validStatuses = new Set(STATUS_VALUES.map(s=>s.key));
  const badStatus = statusKeys.filter(k => !validStatuses.has(payload.statuses[k]));
  if(badStatus.length) errors.push(`${badStatus.length} test case(s) have an unrecognised status value.`);

  /* Count how much of this file refers to cases that actually exist. A file
     from an older, smaller dataset still imports — the user is told how many
     entries will be skipped rather than having them disappear silently. */
  const knownIds = new Set(allData.map(d=>d.id));
  const customIds = new Set((Array.isArray(payload.customCases) ? payload.customCases : [])
    .map(c => c && c.id).filter(Boolean));
  const unmatched = statusKeys.filter(id => !knownIds.has(id) && !customIds.has(id));

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      statuses: statusKeys.length,
      notes: isPlainObject(payload.notes) ? Object.keys(payload.notes).length : 0,
      flagged: Array.isArray(payload.flagged) ? payload.flagged.length : 0,
      customCases: customIds.size,
      chains: Array.isArray(payload.chains) ? payload.chains.length : 0,
      unmatched: unmatched.length,
      tester: typeof payload.tester === 'string' ? payload.tester : '',
      exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : '',
    },
  };
}

function applyProgress(payload){
  if(!payload) return;
  /* Restore analyst-authored content BEFORE applying statuses/notes, so
     that progress recorded against a custom case has an item to attach to
     — otherwise the loop below would skip those IDs entirely because they
     don't exist in allData yet. */
  if(Array.isArray(payload.customCases) && payload.customCases.length){
    const existing = loadCustomCases();
    const existingIds = new Set(existing.map(c=>c.id));
    const incoming = payload.customCases.filter(c=>c && c.id && !existingIds.has(c.id));
    if(incoming.length){
      saveCustomCases(existing.concat(incoming));
      incoming.forEach(c=>{ if(!allData.some(d=>d.id===c.id)) allData.push(normalizeItem(c)); });
    }
  }
  if(Array.isArray(payload.chains) && payload.chains.length){
    const existing = loadChains();
    const seen = new Set(existing.map(c=>c.fromId+'>'+c.toId));
    const incoming = payload.chains.filter(c=>c && c.fromId && c.toId && !seen.has(c.fromId+'>'+c.toId));
    if(incoming.length) saveChains(existing.concat(incoming));
  }
  const statusMap = payload.statuses || {};
  const notesMap = payload.notes || {};
  const flagSet = new Set(payload.flagged || []);
  allData.forEach(d=>{
    if(statusMap[d.id]) d.status = statusMap[d.id];
    if(flagSet.has(d.id)) d.flagged = true;
    if(notesMap[d.id]){
      try{ d.assessorNotes = JSON.parse(notesMap[d.id]); }
      catch(e){ d.assessorNotes.findings = notesMap[d.id]; }
    }
  });
  if(payload.tester){
    const el = document.getElementById('testerName');
    if(el && !el.value) el.value = payload.tester;
  }
}

function loadDomainContext(){
  try{ const raw = localStorage.getItem(DOMAIN_CONTEXT_KEY); return raw ? JSON.parse(raw) : {}; }
  catch(e){ return {}; }
}
function saveDomainContext(ctx){
  safeStorageSet(DOMAIN_CONTEXT_KEY, JSON.stringify(ctx), 'Engagement scope notes');
}

/* =========================================================
   PERSISTENCE — editable hero identity (name/subtitle/tagline/avatar)
========================================================= */
const IDENTITY_KEY = 'vapt_console_identity';
function loadIdentity(){
  try{ const raw = localStorage.getItem(IDENTITY_KEY); return raw ? JSON.parse(raw) : null; }
  catch(e){ return null; }
}
function saveIdentity(identity){
  safeStorageSet(IDENTITY_KEY, JSON.stringify(identity), 'Your tester details');
}
