const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const {analyzeText, analyzeDocuments, extractDocument, extractFile} = require('../src/analyzer');

test('numbered, Markdown and bracket headings isolate multiline sections', () => {
  const text = '1. 연구개발 목적\n재난 피해를 줄인다.\n현장 대응을 지원한다.\n\n## 연구개발 기간\n2026.01 ~ 2028.12\n[최종 목표]\n정확도 90% 달성\n현장 실증 완료\n2. 연구개발 내용\n센서를 연계한다.\n모델을 검증한다.\n3. 최종 성과물\n소프트웨어\n실증 보고서\n4. 예산\n10억원';
  const {fields} = analyzeText(text);
  assert.equal(fields.purpose.value, '재난 피해를 줄인다.\n현장 대응을 지원한다.');
  assert.equal(fields.period.value, '2026.01 ~ 2028.12');
  assert.equal(fields.finalGoal.value, '정확도 90% 달성\n현장 실증 완료');
  assert.equal(fields.contents.value, '센서를 연계한다.\n모델을 검증한다.');
  assert.equal(fields.deliverables.value, '소프트웨어\n실증 보고서');
  assert.equal(fields.purpose.evidenceType, 'section');
  assert.equal(fields.purpose.confidence, 0.9);
  assert.equal(fields.purpose.evidenceDetails[0].line, 2);
  assert.deepEqual(analyzeText(text), analyzeText(text));
});

test('empty sections and noisy keyword mentions never become field values', () => {
  const {fields} = analyzeText('연구목적\n연구내용\n내용은 작성요령을 참고하세요.\n최종목표\n성과물: 확인 필요\n5. 참고사항\n연구기간은 별도 확인 필요\n연구목표라는 단어가 언급됨\nPICTURE 설명');
  for (const key of ['purpose','period','finalGoal','deliverables','pi']) {
    assert.equal(fields[key].value, '확인 필요', key);
    assert.equal(fields[key].evidenceType, 'missing');
    assert.equal(fields[key].confidence, 0);
    assert.deepEqual(fields[key].evidenceDetails, []);
  }
});

test('unlabelled intent sentences classify context conservatively', () => {
  const {fields} = analyzeText('본 연구는 재난 피해 저감을 목적으로 한다.\n본 과제는 2026년부터 2028년까지 수행된다.\n최종적으로 정확도 95%를 달성한다.\n본 연구에서는 센서 융합 모델을 구현한다.\n성과물은 시제품을 제출한다.');
  for (const key of ['purpose','period','finalGoal','contents','deliverables']) {
    assert.notEqual(fields[key].value, '확인 필요');
    assert.equal(fields[key].confidence, 0.7);
    assert.equal(fields[key].evidenceType, 'contextual');
    assert.ok(fields[key].evidence.includes(fields[key].value));
  }
  const scoped = analyzeText('연구내용\n최종적으로 모델을 개발한다.');
  assert.equal(scoped.fields.finalGoal.value, '확인 필요');
});

test('explicit evidence outranks context without crossing document boundaries', () => {
  const out = analyzeDocuments([
    {name:'empty.txt', text:'연구목적', pages:[]},
    {name:'context.txt', text:'본 연구는 재난 저감을 목적으로 한다.', pages:[]},
    {name:'explicit.txt', text:'연구목적: 현장 대응 지원', pages:[]}
  ]);
  assert.equal(out.fields.purpose.value, '현장 대응 지원');
  assert.equal(out.fields.purpose.confidence, 0.95);
  assert.equal(out.fields.purpose.evidenceType, 'explicit_label');
  assert.equal(out.fields.purpose.evidenceDetails[0].source, 'explicit.txt');
  assert.equal('page' in out.fields.purpose.evidenceDetails[0], false);
  assert.equal(analyzeDocuments([{name:'a',text:'연구목적'}, {name:'b',text:'관련 없는 내용'}]).fields.purpose.value, '확인 필요');
});

test('PDF page provenance is obtained from actual page text including continuation', async () => {
  const buffer = await new Promise(resolve => {
    const pdf = new PDFDocument();
    const chunks = [];
    pdf.on('data', b => chunks.push(b));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.text('PI: Alice');
    pdf.addPage().text('PI: Bob');
    pdf.end();
  });
  const doc = await extractDocument({originalname:'pages.pdf',buffer});
  assert.equal(doc.pages.length, 2);
  assert.match(doc.pages[1].text, /Bob/);
  const out = analyzeDocuments([{name:'pages.pdf', ...doc}]);
  assert.equal(out.fields.pi.value, 'Alice');
  assert.equal(out.fields.pi.evidenceDetails[0].page, 1);
  assert.match(out.fields.pi.evidence, /p\. 1/);
  const continued = analyzeDocuments([{name:'sections.pdf',text:'연구목적\n첫 문단\n둘째 문단',pages:[{page:2,text:'연구목적\n첫 문단'},{page:3,text:'둘째 문단'}]}]);
  assert.deepEqual(continued.fields.purpose.evidenceDetails.map(d=>d.page), [2,3]);
});

test('invalid PDF literals cannot fabricate evidence or pages; string extraction stays compatible', async () => {
  const bad = await extractDocument({originalname:'bad.pdf',buffer:Buffer.from('%PDF-1.4\n(PI: Fake)')});
  assert.equal(bad.text, '');
  assert.deepEqual(bad.pages, []);
  assert.ok(bad.warnings.length);
  const file = {originalname:'sample.pdf',buffer:fs.readFileSync('samples/sample-proposal.pdf')};
  assert.equal(typeof await extractFile(file), 'string');
});
