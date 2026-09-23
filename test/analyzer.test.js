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

test('PDF scenario connects goals and outputs and derives repeated technical keywords with provenance', () => {
  const pages = [
    {page:2, text:'과제명: 엣지 AI 이상 탐지\n연구내용\n엣지 AI 이상 탐지 플랫폼을 개발한다.'},
    {page:3, text:'핵심기술: 엣지 AI 이상 탐지\n최종목표\n엣지 AI 이상 탐지 시스템을 구축한다.'}
  ];
  const documents = [{name:'proposal.pdf', text:pages.map(p=>p.text).join('\n'), pages}];
  const {fields} = analyzeDocuments(documents);
  assert.equal(fields.purpose.value, '엣지 AI 이상 탐지 시스템을 구축한다.');
  assert.match(fields.purpose.evidence, /finalGoal/);
  assert.match(fields.keywords.value, /엣지 AI|이상 탐지/);
  assert.doesNotMatch(fields.keywords.value, /개발|구축|플랫폼|시스템/);
  assert.match(fields.deliverables.value, /플랫폼을 개발한다/);
  assert.match(fields.deliverables.value, /시스템을 구축한다/);
  for (const key of ['purpose','keywords','deliverables']) {
    assert.equal(fields[key].evidenceType, 'inferred');
    assert.ok(fields[key].confidence > 0 && fields[key].confidence < 0.7);
    assert.match(fields[key].evidence, /문맥 연결|추론/);
    assert.match(fields[key].evidence, /proposal.pdf · p\./);
    assert.ok(fields[key].evidenceDetails.every(d => d.source === 'proposal.pdf' && [2,3].includes(d.page) && d.sourceField));
  }
  assert.equal(fields.purpose.evidenceDetails[0].page, 3);
  assert.deepEqual(analyzeDocuments(documents).fields, fields);
});

test('contents-only inference is grounded and does not count its inferred purpose twice', () => {
  const {fields} = analyzeText('연구내용: 양자 센서 모듈을 제작한다.');
  assert.equal(fields.purpose.value, '양자 센서 모듈을 제작한다.');
  assert.equal(fields.deliverables.value, fields.contents.value);
  assert.match(fields.purpose.evidence, /contents/);
  assert.equal(fields.keywords.value, '확인 필요');
  assert.ok(fields.purpose.evidenceDetails.every(d => !('page' in d) && !('source' in d)));
});

test('missing, generic, tentative and negative context cannot fabricate fields', () => {
  for (const text of ['', '연구내용: 일정 안내\n최종목표: 미정',
    '연구내용: 플랫폼 개발 여부 검토\n최종목표: 시스템을 개발하지 않는다.',
    '연구내용: 기존 플랫폼을 활용한다.\n최종목표: 보고서 제출은 제외한다.',
    '과제명: 연구 개발\n핵심기술: 연구 개발']) {
    const {fields} = analyzeText(text);
    for (const key of ['purpose','keywords','deliverables']) assert.equal(fields[key].value, '확인 필요', `${key}: ${text}`);
  }
  const {fields} = analyzeText('최종목표: 탐지 정확도 95% 달성');
  assert.notEqual(fields.purpose.value, '확인 필요');
  assert.equal(fields.deliverables.value, '확인 필요');
  assert.equal(analyzeText('연구내용: 플랫폼을 활용하여 탐지 알고리즘을 개발한다.').fields.deliverables.value, '확인 필요');
});

test('direct fields retain priority and inference never combines separate documents', () => {
  const explicit = '연구목적: 명시 목적\n키워드: 명시 핵심어\n성과물: 명시 산출물\n연구내용: 센서 플랫폼을 개발한다.\n최종목표: 센서 플랫폼을 구축한다.';
  for (const key of ['purpose','keywords','deliverables']) {
    const field = analyzeText(explicit).fields[key];
    assert.equal(field.confidence, 0.95);
    assert.equal(field.evidenceType, 'explicit_label');
  }
  const out = analyzeDocuments([{name:'a',text:'과제명: 양자 센서'}, {name:'b',text:'핵심기술: 양자 센서'}]);
  assert.equal(out.fields.keywords.value, '확인 필요');
});
