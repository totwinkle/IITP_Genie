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
