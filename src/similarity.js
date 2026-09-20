const { projects } = require('./data');
const DIMS = ['objective','problem','technology','method','target','application','deliverable','differentiation'];
function tokens(v='') { return new Set(String(v).toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || []); }
function score(a,b) {
  const A=tokens(a), B=tokens(b); if (!A.size || !B.size) return 0;
  let common=0; A.forEach(x => { if (B.has(x) || [...B].some(y => x.includes(y)||y.includes(x))) common++; });
  return Math.min(1, common / Math.max(1, Math.min(A.size,B.size)));
}
function normalizeManual(input='') {
  if (!input.trim()) return [];
  try { const j=JSON.parse(input); return (Array.isArray(j)?j:[j]).map((p,i)=>({id:p.id||`MANUAL-${i+1}`,name:p.name||p.projectName||'수동 입력 과제',institution:p.institution||'수동 입력',...p})); }
  catch { return input.split(/\n\s*\n/).filter(Boolean).map((block,i)=>({id:`MANUAL-${i+1}`,name:block.split('\n')[0].slice(0,80),institution:'수동 입력',objective:block,problem:block,technology:block,method:block,target:block,application:block,deliverable:block,differentiation:block})); }
}
function search(proposal={}, query='', manualInput='') {
  const pool=[...projects,...normalizeManual(manualInput)];
  return pool.map(p => {
    const dimensions={}; let sum=0;
    DIMS.forEach(d => { const s=score(`${proposal[d]||''} ${query}`,p[d]); dimensions[d]=Math.round(s*100); sum+=s; });
    const similarity=Math.round((sum/DIMS.length)*100);
    return {...p,similarity,dimensions,reason: similarity>=60?'핵심 목적·기술의 중복 가능성이 높음':similarity>=30?'일부 기술·적용영역이 유사함':'직접 중복 근거가 제한적임'};
  }).sort((a,b)=>b.similarity-a.similarity).slice(0,8);
}
module.exports={search,DIMS};
