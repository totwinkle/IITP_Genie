const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const {analyzePreferences,analyzeDocuments} = require('../src/analyzer');
const app = require('../src/server');
const evidence = (text, extra={}) => ({name:'증빙.pdf', category:'가점사항 증빙서류',text,pages:[{page:7,text}],...extra});
test('four preferences inspect content and preserve PDF page provenance with bounded snippets', () => {
  const texts=['기술이전 계약 체결일: 2026.01.01','전체 연구자 20명\n여성 연구자 3명', 'ICT R&D 혁신 클러스터 참여기관: 테스트 기관\n협약 체결 완료','ISMS 인증번호: TEST-123\n유효기간: 2026~2027'];
  const result=analyzePreferences(texts.map(t=>evidence(t)));
  assert.equal(result.length,4);
  for(const r of result){assert.equal(r.status,'evidence_found',r.item);assert.ok(r.confidence>0);assert.equal(r.sources[0].page,7);assert.equal(r.sources[0].filename,'증빙.pdf');assert.ok(r.sources[0].snippet.length<=240);}
});
test('missing and requirement mentions cannot be promoted by filenames',()=>{
  const docs=[evidence('기술이전 계약 체결 완료',{category:'RFP',name:'기술이전 계약서.pdf'}),evidence('ISMS 인증번호 TEST',{category:'공고문'}),evidence('여성 연구자 30%',{category:'사업계획서',name:'계획서.pdf'})];
  assert.ok(analyzePreferences(docs).every(r=>r.status==='missing'));
  assert.equal(analyzePreferences([evidence('',{name:'기술이전 계약서.pdf',pages:[]})])[0].status,'needs_confirmation');
  assert.ok(analyzePreferences([]).every(r=>r.status==='missing'));
  assert.equal(analyzePreferences([evidence('여성 연구자 10% 이상인 경우 가점 부여')])[1].status,'missing');
});
test('partial content, ratios below threshold, conflicting and negative evidence need confirmation',()=>{
  for(const text of ['여성 연구자 재직증명서','여성 연구자 5%','전체 연구자 20명\n여성 연구자 1명','여성 연구자 15%\n전체 연구자 20명\n여성 연구자 1명']) assert.equal(analyzePreferences([evidence(text)])[1].status,'needs_confirmation',text);
  for(const text of ['기술이전 계획','기술이전 계약 체결 예정','기술이전 계약 체결 사실 없음']) assert.equal(analyzePreferences([evidence(text)])[0].status,'needs_confirmation');
  assert.equal(analyzePreferences([evidence('ISMS 인증번호 TEST\n인증 만료')])[3].status,'needs_confirmation');
});
test('explicit evidence filenames permit uncategorized evidence; pages never guessed',()=>{
  const out=analyzePreferences([{name:'기술이전 계약서.txt',text:'기술이전 계약 체결 완료'}])[0];
  assert.equal(out.status,'evidence_found');assert.equal(out.sources[0].page,null);
});
test('API returns short evidence only, excluding reference text and evidence from proposal fields',async()=>{
  const privateText='PRIVATE_UNRELATED_DOCUMENT_CONTENT';
  const res=await request(app).post('/api/analyze').field('documentCategories',JSON.stringify(['가점사항 증빙서류','RFP']))
    .attach('documents',Buffer.from('기술이전 계약 체결 완료\n\n\n연구내용: '+privateText.repeat(40)),{filename:'evidence.txt'})
    .attach('documents',Buffer.from(privateText),{filename:'reference.txt'}).expect(200);
  assert.equal(res.body.preferenceAnalysis[0].status,'evidence_found');
  assert.equal(res.body.referenceDocuments,undefined);assert.ok(!JSON.stringify(res.body).includes(privateText));
  assert.equal(analyzeDocuments([evidence('연구내용: '+privateText)]).fields.contents.confidence,0);
});
test('uploaded PDF evidence cites the real extracted page, not a text offset',async()=>{
  const PDFDocument=require('pdfkit');
  const buffer=await new Promise(resolve=>{
    const pdf=new PDFDocument();const chunks=[];
    pdf.on('data',chunk=>chunks.push(chunk));pdf.on('end',()=>resolve(Buffer.concat(chunks)));
    pdf.text('Unrelated cover page');pdf.addPage().text('ISMS-P certificate TEST-123');pdf.end();
  });
  const res=await request(app).post('/api/analyze').field('documentCategories',JSON.stringify(['가점사항 증빙서류']))
    .attach('documents',buffer,{filename:'evidence.pdf',contentType:'application/pdf'}).expect(200);
  const opinion=res.body.preferenceAnalysis[3];
  assert.equal(opinion.status,'needs_confirmation');assert.equal(opinion.sources[0].page,2);
  assert.match(opinion.sources[0].snippet,/ISMS-P certificate/);
  assert.ok(!JSON.stringify(res.body).includes('Unrelated cover page'));
});
