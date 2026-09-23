const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const {JSDOM}=require('jsdom');
test('UI renders the complete five-stage workflow and restores session data',async()=>{const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8').replace('<script src="/app.js"></script>','');const dom=new JSDOM(html,{url:'http://localhost/',runScripts:'outside-only'});dom.window.sessionStorage.setItem('ict-review-state',JSON.stringify({query:'저장된 질의',reviewer:{name:'검토자',department:'평가팀',finalComment:''}}));dom.window.eval(fs.readFileSync(path.join(__dirname,'../public/assist.js'),'utf8'));dom.window.eval(fs.readFileSync(path.join(__dirname,'../public/app.js'),'utf8'));dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));assert.equal(dom.window.document.querySelectorAll('.steps button').length,5);assert.equal(dom.window.document.querySelectorAll('#eligibilityBody tr').length,8);assert.equal(dom.window.document.querySelectorAll('#preferenceBody tr').length,4);assert.equal(dom.window.document.querySelectorAll('[data-dim]').length,8);assert.equal(dom.window.document.querySelector('#query').value,'저장된 질의');assert.equal(dom.window.document.querySelector('#reviewerName').value,'검토자');assert.equal(dom.window.document.querySelectorAll('.downloads button').length,3);});
test('UI displays additive confidence metadata and preserves it on edits',()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'});
 const w=dom.window;
 w.sessionStorage.setItem('ict-review-state',JSON.stringify({fields:{purpose:{value:'현장 대응',evidence:'proposal.txt · 현장 대응',confidence:0.9,evidenceType:'section',evidenceDetails:[{source:'proposal.txt',line:2,text:'현장 대응'}]}}}));
 w.eval(fs.readFileSync('public/assist.js','utf8'));w.eval(fs.readFileSync('public/app.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const input=w.document.querySelector('[data-field="purpose"]');
 assert.match(input.parentElement.textContent,/추출 신뢰도 90% · 문서 구역/);
 input.value='수정';input.dispatchEvent(new w.Event('input'));
 assert.equal(w.IctReview.getState().fields.purpose.edited,true);
 assert.equal(w.IctReview.getState().fields.purpose.evidenceDetails[0].line,2);
 dom.window.close();
});

test('UI labels inferred fields with confidence and source evidence, including legacy state',()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'});
 const w=dom.window;
 const {fields}=require('../src/analyzer').analyzeDocuments([{name:'proposal.pdf',text:'최종목표: 센서 플랫폼을 개발한다.',pages:[{page:4,text:'최종목표: 센서 플랫폼을 개발한다.'}]}]);
 fields.institution={value:'기관',evidence:'기존 저장값'};
 w.sessionStorage.setItem('ict-review-state',JSON.stringify({fields}));
 w.eval(fs.readFileSync('public/assist.js','utf8'));w.eval(fs.readFileSync('public/app.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const label=w.document.querySelector('[data-field="purpose"]').parentElement.textContent;
 assert.match(label,/추출 신뢰도 65% · 문맥 연결 추론/);
 assert.match(label,/proposal.pdf · p. 4/);
 assert.match(label,/finalGoal/);
 assert.equal(w.document.querySelector('[data-field="institution"]').value,'기관');
 dom.window.close();
});

test('preference opinions render before editable final selections with source and confidence',()=>{
 const dom=new JSDOM(fs.readFileSync('public/index.html','utf8'),{url:'http://localhost/',runScripts:'outside-only'});
 const w=dom.window;
 const preferenceAnalysis=require('../src/analyzer').analyzePreferences([{name:'evidence.pdf',category:'가점사항 증빙서류',text:'기술이전 계약 체결 완료 <img src=x>',pages:[{page:5,text:'기술이전 계약 체결 완료 <img src=x>'}]}]);
 w.sessionStorage.setItem('ict-review-state',JSON.stringify({preferenceAnalysis}));
 w.eval(fs.readFileSync('public/assist.js','utf8'));w.eval(fs.readFileSync('public/app.js','utf8'));w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const row=w.document.querySelector('#preferenceBody tr');const opinion=row.querySelector('.preference-ai-rationale');const select=row.querySelector('select');
 assert.match(opinion.textContent,/본문 근거 확인/);assert.match(opinion.textContent,/evidence.pdf · p. 5/);assert.match(opinion.textContent,/85%/);assert.equal(row.querySelector('img'),null);
 assert.ok(opinion.compareDocumentPosition(select)&w.Node.DOCUMENT_POSITION_FOLLOWING);
 assert.equal(select.value,'확인 필요');select.value='불인정';select.dispatchEvent(new w.Event('input'));
 assert.equal(w.IctReview.getState().preferenceEvidence[0].status,'불인정');
 assert.equal(JSON.parse(w.sessionStorage.getItem('ict-review-state')).preferenceEvidence[0].status,'불인정');
 assert.match(w.document.querySelectorAll('.preference-ai-rationale')[1].textContent,/증빙 근거 부족/);
 dom.window.close();
});
