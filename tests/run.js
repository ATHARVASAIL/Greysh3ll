const files = process.argv.slice(2);
(async()=>{
  let total=0, pass=0; const allFail=[];
  for(const f of files){
    const s = require('./'+f);
    const r = await s.run();
    total+=r.total; pass+=r.pass;
    const mark = r.failures.length? 'FAIL':'PASS';
    console.log(`${mark}  ${r.name.padEnd(12)} ${r.pass}/${r.total}`);
    r.failures.forEach(([d,e])=>{ allFail.push(`  [${r.name}] ${d}\n      ${e.message}`); });
  }
  if(allFail.length){ console.log('\nFailures:\n'+allFail.join('\n')); }
  console.log(`\nTOTAL ${pass}/${total}`);
  process.exit(allFail.length?1:0);
})();
