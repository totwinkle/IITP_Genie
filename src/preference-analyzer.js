// Local, conservative opinions: evidence found is never a final eligibility decision.
const rules = [
  {item:'기술이전', topic:/기술\s*이전/, filename:/기술\s*이전.*(?:계약|협약|증빙|확인|계획)/, complete:/계약\s*(?:체결|번호)|체결\s*일|이전\s*완료/},
  {item:'여성 연구자 10% 이상', topic:/여성\s*(?:연구|참여|인력)|여자\s*연구/, filename:/(?:여성|여자).*(?:재직|명부|현황|증빙|확인)/},
  {item:'ICT R&D 혁신 클러스터', topic:/ICT\s*R\s*&\s*D\s*혁신\s*클러스터/i, filename:/클러스터.*(?:증빙|확인|협약|운영|계획)/, complete:/운영\s*(?:중|한다|기관)|참여\s*(?:기관|확인|협약)|협약\s*체결/},
  {item:'정보보호 인증', topic:/정보\s*보호\s*인증|ISMS(?:-P)?|ISO\s*27001/i, filename:/(?:정보\s*보호|ISMS(?:-P)?|ISO\s*27001).*(?:인증|증빙|확인)/i, complete:/인증\s*번호|유효\s*기간|인증\s*취득/}
];
function isPreferenceEvidence(doc) {
  if (['RFP','공고문'].includes(doc.category) || /공고문|공고|announcement|(?:^|[_.\s-])RFP(?:[_.\s-]|$)/i.test(doc.name || '')) return false;
  return doc.category === '가점사항 증빙서류' || rules.some(r => r.filename.test(doc.name || ''));
}
const uncertain = /예정|계획|검토|미정|미체결|미취득|만료|취소|없음|없다|않|아니|미달|불충족|확인\s*필요/;
const instructions = /작성\s*(?:요령|방법)|예시|기재|제출\s*(?:해야|하세요)|가점\s*(?:부여|대상)|우대\s*(?:대상|조건)|10\s*%\s*이상.*(?:경우|요건)/;
function femaleRatio(text) {
  const percent = text.match(/여성\s*(?:연구자|연구원|참여인력|인력|참여율|비율)[^\n%]{0,30}?(\d+(?:\.\d+)?)\s*%/);
  const total = text.match(/(?:전체|총)\s*(?:참여\s*)?(?:연구자|연구원|인력)?\s*[:：]?\s*(\d+)\s*명/);
  const women = text.match(/여성\s*(?:연구자|연구원|참여인력|인력)?\s*[:：]?\s*(\d+)\s*명/);
  const countRatio = total && women && +total[1] > 0 && +women[1] <= +total[1] ? +women[1] / +total[1] * 100 : null;
  const ratio = percent ? +percent[1] : countRatio;
  if (ratio === null || ratio > 100 || (percent && countRatio !== null && Math.abs(ratio-countRatio)>0.1)) return null;
  return ratio;
}
function analyzePreferences(documents) {
  const docs = documents.filter(isPreferenceEvidence);
  return rules.map(rule => {
    const candidates = [];
    let unreadable = false;
    for (const doc of docs) {
      const blocks = doc.pages?.length ? doc.pages : [{text:doc.text || '',page:null}];
      if (!blocks.some(b => b.text?.trim()) && rule.filename.test(doc.name || '')) unreadable = true;
      for (const block of blocks) {
        // Small adjacent-line windows support form labels without returning whole pages.
        const lines = (block.text || '').split('\n');
        for (let i=0;i<lines.length;i++) {
          const match = rule.topic.exec(lines[i]);
          if (!match) continue;
          const start = rule.item.includes('여성') && i > 0 && /(?:전체|총).*명/.test(lines[i-1]) ? i-1 : i;
          const offset = start < i ? 0 : Math.max(0,match.index-40);
          const snippet = lines.slice(start,i+3).join(' ').slice(offset,offset+240).trim();
          if (instructions.test(snippet)) continue;
          const ratio = rule.item.includes('여성') ? femaleRatio(snippet) : null;
          const complete = !uncertain.test(snippet) && (rule.complete ? rule.complete.test(snippet) : ratio !== null && ratio >= 10);
          candidates.push({complete, source:{filename:doc.name,page:Number.isInteger(block.page) && block.page>0 ? block.page : null,snippet}});
        }
      }
    }
    const found = candidates.length > 0;
    // Mixed or negative evidence requires a person to reconcile the documents.
    const complete = found && candidates.every(c => c.complete);
    const status = complete ? 'evidence_found' : found || unreadable ? 'needs_confirmation' : 'missing';
    const sources = candidates.slice(0,3).map(c => c.source);
    return {item:rule.item,status,confidence:complete ? 0.85 : found ? 0.45 : 0,
      rationale:complete ? '본문에서 요건과 연결되는 구체적 근거를 확인했습니다. 신청기관 일치 여부·진위·유효성은 담당자가 최종 확인하세요.' : found ? '관련 본문은 있으나 비율·이행 상태·인증 등 요건 충족이 불완전하거나 상충합니다. 원문 확인이 필요합니다.' : unreadable ? '증빙 후보의 텍스트를 추출하지 못했습니다. 원문 확인이 필요합니다.' : '제출된 증빙 본문에서 해당 항목의 근거를 찾지 못했습니다.',
      evidence:sources.length ? sources.map(s => `${s.filename} · ${s.page ? `p. ${s.page}` : '페이지 확인 불가'} · “${s.snippet}”`).join(' / ') : '확인 가능한 본문 근거 없음', sources};
  });
}
module.exports = {analyzePreferences,isPreferenceEvidence};
