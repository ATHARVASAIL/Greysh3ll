/* VAPT CONSOLE — effects-identity.js: decorative particle/confetti canvases and the hero identity block (name/subtitle/tagline edit toggle, avatar). Depends on core.js + storage.js. */

/* =========================================================
   PARTICLES BACKGROUND
========================================================= */
(function particles(){
  const canvas = document.getElementById('particleCanvas');
  if(!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ctx = canvas.getContext('2d');
  let w,h,pts, running = true;
  function resize(){ w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; }
  function init(){
    resize();
    const count = Math.min(40, Math.floor((w*h)/40000));
    pts = Array.from({length:count}, ()=>({
      x: Math.random()*w, y: Math.random()*h,
      vx:(Math.random()-0.5)*0.22, vy:(Math.random()-0.5)*0.22, r:Math.random()*1.5+0.4,
    }));
  }
  function tick(){
    if(!running) return;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = 'rgba(47,140,255,0.3)';
    pts.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy;
      if(p.x<0)p.x=w; if(p.x>w)p.x=0; if(p.y<0)p.y=h; if(p.y>h)p.y=0;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    });
    ctx.strokeStyle='rgba(47,140,255,0.055)'; ctx.lineWidth=1;
    for(let i=0;i<pts.length;i++){
      for(let j=i+1;j<pts.length;j++){
        const dx=pts[i].x-pts[j].x, dy=pts[i].y-pts[j].y, dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<100){ ctx.beginPath(); ctx.moveTo(pts[i].x,pts[i].y); ctx.lineTo(pts[j].x,pts[j].y); ctx.stroke(); }
      }
    }
    requestAnimationFrame(tick);
  }
  document.addEventListener('visibilitychange', ()=>{
    running = !document.hidden;
    if(running) requestAnimationFrame(tick);
  });
  window.addEventListener('resize', resize);
  init(); requestAnimationFrame(tick);
})();

/* =========================================================
   CONFETTI
========================================================= */
function burstConfetti(){
  const canvas = document.getElementById('confettiCanvas'); if(!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  const colors = ['#2F8CFF','#FFB000','#2FD9FF','#FFD866','#FF3B3B'];
  const pieces = Array.from({length:120}, ()=>({
    x: Math.random()*canvas.width, y: -20-Math.random()*canvas.height*0.3,
    vx:(Math.random()-0.5)*3, vy:2+Math.random()*4, size:4+Math.random()*5,
    color: colors[Math.floor(Math.random()*colors.length)], rot:Math.random()*360, vr:(Math.random()-0.5)*10,
  }));
  let frame=0;
  function tick(){
    frame++;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    let anyVisible=false;
    pieces.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.03; p.rot+=p.vr;
      if(p.y<canvas.height+20) anyVisible=true;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
      ctx.fillStyle=p.color; ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6);
      ctx.restore();
    });
    if(anyVisible && frame<380) requestAnimationFrame(tick); else ctx.clearRect(0,0,canvas.width,canvas.height);
  }
  requestAnimationFrame(tick);
}

/* =========================================================
   HERO IDENTITY — avatar + explicit edit-button toggle for name/subtitle/tagline
========================================================= */
function computeInitials(name){
  const parts = (name||'').trim().split(/\s+/).filter(Boolean);
  if(!parts.length) return '??';
  if(parts.length===1) return parts[0].slice(0,2).toUpperCase();
  return (parts[0][0]+parts[1][0]).toUpperCase();
}
function initIdentity(){
  const nameEl = document.getElementById('typedName');
  const subEl = document.getElementById('identitySubtitle');
  const tagEl = document.getElementById('identityTagline');
  const initialsEl = document.getElementById('avatarInitials');
  const identityEl = document.querySelector('.identity');
  const editBtn = document.getElementById('identityEditBtn');
  if(!nameEl || !subEl || !tagEl || !initialsEl) return;

  const saved = loadIdentity();
  if(saved){
    if(saved.name) nameEl.textContent = saved.name;
    if(saved.subtitle) subEl.textContent = saved.subtitle;
    if(saved.tagline) tagEl.textContent = saved.tagline;
  }
  initialsEl.textContent = computeInitials(nameEl.textContent);

  const editableFields = [nameEl, subEl, tagEl];

  function persistIdentity(){
    saveIdentity({
      name: nameEl.textContent.trim(),
      subtitle: subEl.textContent.trim(),
      tagline: tagEl.textContent.trim(),
    });
  }

  function setEditing(on){
    editableFields.forEach(el => { el.contentEditable = on ? 'true' : 'false'; });
    if(identityEl) identityEl.classList.toggle('editing', on);
    if(editBtn){
      editBtn.classList.toggle('active', on);
      editBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const lbl = editBtn.querySelector('.lbl');
      if(lbl) lbl.textContent = on ? 'Done' : 'Edit';
    }
    if(on){
      nameEl.focus();
    } else {
      persistIdentity();
    }
  }

  if(editBtn){
    editBtn.addEventListener('click', ()=>{
      const isOn = identityEl && identityEl.classList.contains('editing');
      setEditing(!isOn);
    });
  }

  editableFields.forEach(el=>{
    el.addEventListener('blur', ()=>{
      if(el === nameEl) initialsEl.textContent = computeInitials(nameEl.textContent || 'AS');
    });
    el.addEventListener('keydown', (e)=>{
      if(e.key === 'Enter' && el !== tagEl){ e.preventDefault(); el.blur(); }
      if(e.key === 'Escape'){ e.preventDefault(); setEditing(false); }
    });
  });

  // start locked (not editable) — the edit button is the only way in
  setEditing(false);
}

