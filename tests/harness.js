/* =========================================================
   GreySh3ll test harness
   Loads the real browser sources into a jsdom window built from the real
   assessment.html, with localStorage and fetch replaced by controllable
   mocks. Scripts are plain (non-module) and share one scope in the browser,
   so they are evaluated in order into the same window — same as production.
========================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

/* tests/ lives inside the app directory, so the app is one level up.
   Override with GS_APP to test a build unpacked somewhere else. */
const APP = process.env.GS_APP || path.resolve(__dirname, '..');

function read(rel){ return fs.readFileSync(path.join(APP, rel), 'utf8'); }
function exists(rel){ return fs.existsSync(path.join(APP, rel)); }

/* ---------- controllable localStorage ---------- */
function makeStorage(){
  const map = new Map();
  const st = {
    _map: map,
    failNext: 0,          // number of upcoming setItem calls that should throw
    failMode: 'quota',    // 'quota' | 'other'
    failAlways: false,
    setCalls: 0,
    getItem(k){ return map.has(k) ? map.get(k) : null; },
    setItem(k, v){
      st.setCalls++;
      if(st.failAlways || st.failNext > 0){
        if(st.failNext > 0) st.failNext--;
        const e = new Error('mock storage failure');
        if(st.failMode === 'quota'){ e.name = 'QuotaExceededError'; e.code = 22; }
        else { e.name = 'SecurityError'; }
        throw e;
      }
      map.set(k, String(v));
    },
    removeItem(k){ map.delete(k); },
    clear(){ map.clear(); },
    key(i){ return Array.from(map.keys())[i] ?? null; },
    get length(){ return map.size; },
  };
  return st;
}

/* ---------- fetch that serves the real data files from disk ---------- */
function makeFetch(win){
  return async function(url){
    const rel = String(url).replace(/^\.?\//, '');
    const full = path.join(APP, rel);
    if(!fs.existsSync(full)){
      return { ok:false, status:404, statusText:'Not Found',
               json: async () => { throw new Error('404'); } };
    }
    const body = fs.readFileSync(full, 'utf8');
    win.__fetchLog.push(rel);
    return { ok:true, status:200, statusText:'OK',
             json: async () => JSON.parse(body), text: async () => body };
  };
}

/* ---------- boot a window with the chosen scripts loaded ---------- */
function boot(opts){
  opts = opts || {};
  const page = opts.page || 'assessment.html';
  const scripts = opts.scripts || [];
  const dom = new JSDOM(read(page), {
    url: 'https://example.test/' + page,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.__fetchLog = [];
  win.__toasts = [];
  win.__confirms = [];
  win.__confirmReply = true;

  const storage = makeStorage();
  Object.defineProperty(win, 'localStorage', { value: storage, configurable: true });
  win.fetch = makeFetch(win);
  win.confirm = (msg) => { win.__confirms.push(String(msg)); return win.__confirmReply; };
  win.alert = () => {};
  win.__promptReply = null;   // default: user cancels
  win.prompt = (msg, def) => (win.__promptReply === undefined ? def : win.__promptReply);
  win.print = () => {};
  win.matchMedia = win.matchMedia || (() => ({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }));
  win.scrollTo = () => {};
  win.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  win.console = { log(){}, warn(){}, error(){}, info(){} };

  /* jsdom has no 2D canvas without the native `canvas` package. Decorative
     canvases are not what these tests are about, so give them a no-op
     context rather than pulling in a binary dependency. */
  const noopCtx = new Proxy({}, {
    get(t, k){
      if(k === 'canvas') return null;
      if(k === 'measureText') return () => ({ width: 0 });
      if(k === 'createLinearGradient' || k === 'createRadialGradient')
        return () => ({ addColorStop(){} });
      return () => {};
    },
    set(){ return true; },
  });
  win.HTMLCanvasElement.prototype.getContext = function(){ return noopCtx; };
  /* jsdom implements no layout, so these are absent. They are called for
     their visual effect only; a no-op is faithful enough for behaviour. */
  win.Element.prototype.scrollIntoView = function(){};
  /* jsdom has no blob URL support; downloads are exercised for their
     handler logic, not for the file the browser would write. */
  win.__objectUrls = [];
  win.URL.createObjectURL = (blob) => {
    const u = 'blob:mock/' + win.__objectUrls.length;
    win.__objectUrls.push(u);
    return u;
  };
  win.URL.revokeObjectURL = (u) => {
    const i = win.__objectUrls.indexOf(u);
    if(i !== -1) win.__objectUrls.splice(i, 1);
  };
  win.Element.prototype.scrollTo = function(){};
  win.HTMLElement.prototype.focus = win.HTMLElement.prototype.focus || function(){};

  if(opts.noIntersectionObserver){
    delete win.IntersectionObserver;
  } else if(typeof win.IntersectionObserver !== 'function'){
    win.__observed = [];
    win.IntersectionObserver = class {
      constructor(cb){ this.cb = cb; win.__ios = win.__ios || []; win.__ios.push(this); }
      observe(el){ this.el = el; win.__observed.push(el); }
      disconnect(){ this.disconnected = true; }
      /* test hook: pretend the sentinel scrolled into view */
      trigger(){ this.cb([{ isIntersecting: true, target: this.el }], this); }
    };
  }

  for(const rel of scripts){
    const code = read('js/' + rel);
    try{
      vm.runInContext(code, dom.getInternalVMContext(), { filename: 'js/' + rel });
    }catch(e){
      e.message = `while loading js/${rel}: ${e.message}`;
      throw e;
    }
  }

  /* showToast is defined in assessment.js; when that file isn't loaded,
     provide a recorder so safeStorageSet's warning path is observable. */
  if(typeof win.showToast !== 'function'){
    vm.runInContext('function showToast(m){ __toasts.push(String(m)); }',
      dom.getInternalVMContext(), { filename: 'harness:showToast' });
  }

  win.__storage = storage;
  win.__eval = (code) => vm.runInContext(code, dom.getInternalVMContext(), { filename: 'harness:eval' });
  /* Top-level const/let/function in a classic script live in script scope,
     not on window — so reach them by evaluating in that same context. */
  win.$ = (expr) => win.__eval('(' + expr + ')');
  win.$fn = (name) => (...args) => {
    win.__eval('globalThis.__args = null;');
    win.__args = args;
    return win.__eval(`(${name})(...__args)`);
  };
  return win;
}

/* ---------- tiny assertion runner ---------- */
function Suite(name){
  const tests = [];
  return {
    name,
    test(desc, fn){ tests.push([desc, fn]); },
    async run(){
      let pass = 0; const failures = [];
      for(const [desc, fn] of tests){
        try{ await fn(); pass++; }
        catch(e){ failures.push([desc, e]); }
      }
      return { name, total: tests.length, pass, failures };
    },
  };
}

function eq(actual, expected, msg){
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if(a !== b) throw new Error(`${msg || 'equality'}: expected ${b}, got ${a}`);
}
function ok(v, msg){ if(!v) throw new Error(msg || `expected truthy, got ${JSON.stringify(v)}`); }
function notOk(v, msg){ if(v) throw new Error(msg || `expected falsy, got ${JSON.stringify(v)}`); }
function includes(hay, needle, msg){
  if(String(hay).indexOf(needle) === -1) throw new Error(`${msg || 'includes'}: ${JSON.stringify(needle)} not found`);
}
function excludes(hay, needle, msg){
  if(String(hay).indexOf(needle) !== -1) throw new Error(`${msg || 'excludes'}: ${JSON.stringify(needle)} unexpectedly present`);
}

module.exports = { APP, read, exists, boot, Suite, eq, ok, notOk, includes, excludes };
