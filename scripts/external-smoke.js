#!/usr/bin/env node
const base=(process.argv[2]||'').replace(/\/$/,'');
if(!/^https:\/\//i.test(base)){console.error('사용법: node scripts/external-smoke.js https://배포주소');process.exit(2);}
async function get(path){const res=await fetch(base+path,{redirect:'manual'});const text=await res.text();return {status:res.status,text};}
(async()=>{
  const home=await get('/');
  const health=await get('/api/health');
  const materials=await get('/api/eval-materials');
  const failures=[];
  if(home.status!==200) failures.push(`홈페이지 HTTP ${home.status}`);
  if(health.status!==200) failures.push(`health HTTP ${health.status}`);
  else {try{const data=JSON.parse(health.text);if(data.ok!==true) failures.push('health ok=false');}catch{failures.push('health JSON 오류');}}
  if(materials.status!==200) failures.push(`검토자료 API HTTP ${materials.status}`);
  else {try{const data=JSON.parse(materials.text);if(data.rfpSummary?.managementNumber!=='2026-사이버보안-5') failures.push('RFP 관리번호 불일치');}catch{failures.push('검토자료 JSON 오류');}}
  console.log(JSON.stringify({base,home:home.status,health:health.status,materials:materials.status,failures},null,2));
  process.exit(failures.length?1:0);
})().catch(err=>{console.error(err.message);process.exit(1);});
