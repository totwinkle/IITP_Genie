const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const {JSDOM}=require('jsdom');
const assist=require('../public/assist');
const request=require('supertest');
const app=require('../src/server');
test('assistance distinguishes evidence, manual edits and missing dimensions deterministically',()=>{
 const s={fields:{projectName:{value:'도시 침수 AI',evidence:'신청서: 도시 침수 AI'},pi:{value:'김연구',evidence:'사용자 수정',edited:true}},eligibility:[{item:'참여제한',status:'확인 필요'}]};
 const a=assist.analyze(s);assert.deepEqual(a,assist.analyze(s));assert.equal(a.confidence,10);assert.equal(a.checks.length,8);assert.equal(a.risks.length,8);assert.ok(a.risks.every(x=>x.score===null));assert.match(a.draft,/담당자 최종확인/);assert.ok(a.unresolved.some(x=>x.includes('수정값')));assert.ok(assist.expand('엣지 AI 침수').includes('홍수 예측'));
});
test('existing analysis endpoint provides source-grounded evidence and handles missing information',async()=>{
 const r=await request(app).post('/api/analyze').attach('documents',Buffer.from('과제명: 테스트 과제\n핵심기술: 엣지 AI'),{filename:'proposal.txt'}).expect(200);
 assert.match(r.body.fields.projectName.evidence,/proposal.txt/);const a=assist.analyze(r.body);assert.equal(a.confidence,20);assert.ok(a.missing.includes('pi'));
 const search=await request(app).post('/api/search').send({query:'AI 침수',proposal:{technology:'AI'}}).expect(200);assert.ok(search.body.candidates.every(c=>c.dimensions.differentiation===0));
});
test('workflow assistance renders, escapes evidence, preserves editable decisions and drafts',()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'http://localhost',runScripts:'outside-only'});const w=dom.window;
 w.sessionStorage.setItem('ict-review-state',JSON.stringify({query:'엣지 AI 침수',fields:{projectName:{value:'<img src=x onerror=alert(1)>',evidence:'source.txt · <img src=x>'}}}));
 w.eval(fs.readFileSync('public/assist.js','utf8'));w.eval(fs.readFileSync('public/app.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const d=w.document;assert.match(d.querySelector('#aiAnalysisSummary').textContent,/근거 신뢰도/);assert.equal(d.querySelector('#aiAnalysisSummary img'),null);assert.equal(d.querySelectorAll('.ai-rationale').length,8);assert.equal(d.querySelectorAll('.assist-risk-grid>div').length,8);assert.match(d.querySelector('#aiExpandedQuery').textContent,/홍수 예측/);assert.equal(d.querySelector('#evalMaterials').hidden,true);assert.doesNotMatch(d.querySelector('#preferenceBody').textContent,/쿼드마이너/);
 const status=d.querySelector('[data-estatus="0"]');status.value='부적합';status.dispatchEvent(new w.Event('input'));assert.equal(w.IctReview.getState().eligibility[0].status,'부적합');
 const draft=d.querySelector('#aiOpinionDraft');draft.value='담당자 수정 초안';draft.dispatchEvent(new w.Event('input'));const checklist=d.querySelector('#aiConfirmationChecklist');checklist.value='□ 증빙 요청';checklist.dispatchEvent(new w.Event('input'));w.IctReview.generateQuery();assert.equal(draft.value,'담당자 수정 초안');assert.equal(checklist.value,'□ 증빙 요청');d.querySelector('#applyAiDraftBtn').click();assert.match(d.querySelector('#finalComment').value,/담당자 수정 초안/);assert.match(d.querySelector('#finalComment').value,/증빙 요청/);dom.window.close();
});
