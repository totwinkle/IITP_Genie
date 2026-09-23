const path = require('path');
const JSZip = require('jszip');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');

const FIELD_RULES = {
  projectName: ['과제명','사업명','프로젝트명'], institution: ['주관기관','기관명','수행기관'],
  pi: ['연구책임자','책임자','PI'], period: ['연구기간','수행기간','사업기간'],
  purpose: ['연구목적','연구 목표','연구목표','개발목적','개발 목표','목적'], contents: ['연구내용','주요내용','연구 내용','내용'],
  coreTechnology: ['핵심기술','기술'], keywords: ['키워드','핵심어'],
  finalGoal: ['최종목표','최종 목표'], deliverables: ['성과물','주요성과','산출물']
};

function cleanText(text='') { return text.replace(/\u0000/g,' ').replace(/[ \t]+/g,' ').replace(/\r/g,'').trim(); }
async function extractFile(file) {
  const ext = path.extname(file.originalname).toLowerCase();
  try {
    if (ext === '.pdf') return (await extractDocument(file)).text;
    if (ext === '.docx') return cleanText((await mammoth.extractRawText({buffer:file.buffer})).value);
    if (ext === '.xlsx' || ext === '.xls') {
      if (ext === '.xls') return '';
      const zip=await JSZip.loadAsync(file.buffer);
      const sharedFile=zip.file('xl/sharedStrings.xml');
      const shared=sharedFile ? [...(await sharedFile.async('string')).matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m=>m[1]) : [];
      const sheets=Object.keys(zip.files).filter(n=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(n));
      const rows=[]; for(const name of sheets){const xml=await zip.file(name).async('string');for(const row of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)){const cells=[];for(const cell of row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)){const value=(cell[2].match(/<v>([\s\S]*?)<\/v>/)||cell[2].match(/<t[^>]*>([\s\S]*?)<\/t>/)||[])[1]||'';cells.push(/t="s"/.test(cell[1])?(shared[Number(value)]||''):value);}rows.push(cells.join(' '));}}
      return cleanText(rows.join('\n').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
    }
    if (ext === '.hwpx') {
      const zip = await JSZip.loadAsync(file.buffer);
      const parts = Object.keys(zip.files).filter(n => /Contents\/section.*\.xml$/i.test(n));
      const xml = (await Promise.all(parts.map(n => zip.file(n).async('string')))).join('\n');
      return cleanText(xml.replace(/<\/(?:[\w-]+:)?p\s*>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'));
    }
    if (['.txt','.json','.csv'].includes(ext)) return cleanText(file.buffer.toString('utf8'));
    return '';
  } catch { return ''; }
}


// Page numbers originate only from PDF.js page objects, never from text offsets.
async function extractDocument(file) {
  if (path.extname(file.originalname).toLowerCase() !== '.pdf') {
    return { text: await extractFile(file), pages: [], warnings: [] };
  }
  const pages = [];
  const warnings = [];
  try {
    const data = new Uint8Array(file.buffer);
    await pdfParse(data, { pagerender: async page => {
      try {
        const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
        let y, text = '';
        for (const item of content.items) {
          text += (y === undefined || y === item.transform[5] ? (text ? ' ' : '') : '\n') + item.str;
          y = item.transform[5];
        }
        text = cleanText(text);
        pages.push({ page: page.pageNumber, text });
        return text;
      } catch {
        warnings.push('PDF 일부 페이지의 텍스트를 추출하지 못했습니다.');
        return '';
      }
    }});
    pages.sort((a,b) => a.page - b.page);
    return { text: pages.map(p => p.text).join('\n'), pages, warnings };
  } catch {
    // Raw PDF literals may be metadata or compressed syntax, not document evidence.
    return { text: '', pages: [], warnings: ['PDF 텍스트 추출 실패: 원문과 페이지 근거를 확인할 수 없습니다.'] };
  }
}

const SECTION_ALIASES = {
  purpose: ['연구개발 목적', '추진 목적', '추진 배경 및 필요성', '연구 필요성'],
  period: ['연구개발 기간', '총 연구기간', '추진 일정'],
  finalGoal: ['연구개발 최종목표', '최종 개발목표', '최종 성능목표'],
  contents: ['연구개발 내용', '세부 연구내용', '개발 내용', '추진 내용', '연구 방법'],
  deliverables: ['최종 성과물', '예상 산출물', '연구개발 산출물']
};
const compact = s => s.replace(/\s/g, '').toLowerCase();
const labelEntries = Object.entries(FIELD_RULES).flatMap(([field, labels]) =>
  [...labels, ...(SECTION_ALIASES[field] || [])].map(label => ({field, label})))
  .sort((a,b) => b.label.length - a.label.length);
const narrativeFields = new Set(['purpose','contents','finalGoal','deliverables','period']);
function heading(line) {
  // Dates and durations are content, even when they begin with dotted numbers.
  if (/^\d{4}(?:[.년/-]|\s*(?:~|–|—))/.test(line)) return null;
  const decorated = /^(?:#{1,6}\s|\d+(?:\.\d+)*[.)]?\s|[가-힣][.)]\s|[□■○]\s|\[)/.test(line);
  const title = line.replace(/^(?:#{1,6}\s*|\d+(?:\.\d+)*[.)]?\s+|[가-힣][.)]\s+|[□■○]\s*)/, '').replace(/^\[([^\]]+)\]/, '$1');
  for (const {field,label} of labelEntries) {
    if (compact(title) === compact(label)) return {field, title: line, inline: ''};
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s*');
    const match = title.match(new RegExp(`^${escaped}\\s*[:：|]\\s*(.*)$`, 'i'));
    if (match) return {field, title: line, inline: match[1]};
  }
  // Unknown numbered/Markdown headings still terminate the preceding section.
  if (decorated || /^[^:：]{1,40}[:：]$/.test(title)) return {field: null, title: line, inline: ''};
  return null;
}
function missing() {
  return {value:'확인 필요', evidence:'문서에서 명시적 근거를 찾지 못함', confidence:0, evidenceType:'missing', evidenceDetails:[]};
}
// Conservative sentence rules require intent/action, not a mention of a field name.
function contextualField(text) {
  if (/예시|작성요령|기재|입력|확인 필요|미정|언급|목차/.test(text)) return null;
  if (/(?:최종적으로|최종 목표는).*(?:달성|확보|실증|개발)/.test(text)) return 'finalGoal';
  if (/(?:산출물|성과물)(?:은|로는).*(?:제출|제공|구축|제작)|(?:시제품|보고서|데이터셋)을.*(?:제출|제공)한다/.test(text)) return 'deliverables';
  if (/(?:본 연구|본 과제|연구개발).*(?:목적으로 한다|위해 추진|위하여 추진)/.test(text)) return 'purpose';
  if (/(?:본 연구|본 과제|연구개발).*(?:수행된다|수행한다|진행된다)/.test(text) && /\d{4}.*(?:~|부터|–|—).*\d{4}/.test(text)) return 'period';
  if (/(?:본 연구에서는|본 과제에서는).*(?:설계|구현|분석|개발|검증)한다/.test(text)) return 'contents';
  return null;
}
// Fallbacks copy document wording; they never generate a new goal or product.
const inferenceNoise = /예시|작성요령|기재|입력|확인 필요|미정|미기재|언급|목차|없음|없다|아니|않|제외|검토|가능성|여부|기존|타 기관/;
const intent = /개발|구축|구현|제작|제공|제출|완성|확보|달성|향상|개선|저감|지원|실증/;
const output = /시제품|제품|시스템|소프트웨어|플랫폼|데이터셋|보고서|산출물|성과물|결과물|프로토타입|모듈|애플리케이션|앱\b|\b(?:software|platform|system|prototype|dataset)\b/i;
const keywordStops = new Set(('본 본연구 본과제 연구 과제 연구개발 개발 구축 구현 제작 제공 제출 완성 확보 달성 향상 개선 저감 지원 실증 분석 설계 검증 수행 최종 목표 목적 내용 주요 핵심 기술 기반 활용 통한 위한 통해 위해 및 또는 등 관련 결과 성과 성과물 산출물 결과물 시스템 소프트웨어 플랫폼 제품 시제품 보고서 서비스 사업 한다 하고 하여 대한 있는 위한 이를 the and for with from this that system platform software project research development').split(' '));
function inferFields(fields) {
  const records = keys => keys.flatMap(sourceField => fields[sourceField].evidenceDetails.map(d => ({...d, sourceField})))
    .filter(d => !inferenceNoise.test(d.text));
  const sentences = keys => records(keys).flatMap(d => d.text.split(/(?<=[.!?])\s+|[;；]/).map(text => ({...d, text:text.trim()}))).filter(d => d.text);
  function infer(key, value, details, confidence) {
    if (fields[key].confidence || !value || !details.length) return;
    fields[key] = {value, confidence, evidenceType:'inferred',
      evidence:`문맥 연결 추론 · ${[...new Set(details.map(d => `${d.sourceField} (${FIELD_RULES[d.sourceField][0]})`))].join(', ')}: ${details.map(d => `“${d.text}”`).join(' / ')}`,
      evidenceDetails:details};
  }
  const goals = sentences(['finalGoal','contents']).filter(d => intent.test(d.text));
  if (goals.length) infer('purpose', goals[0].text, [goals[0]], 0.65);
  const products = sentences(['contents','finalGoal']).filter(d => {
    const match = output.exec(d.text);
    if (!match) return false;
    // The output noun must be tied to production, not merely used as an input.
    const tail = d.text.slice(match.index + match[0].length);
    return /^(?:을|를|의|인|과|와|및|\s|[,·])*(?:(?:시제품|제품|시스템|소프트웨어|플랫폼|모듈|보고서|데이터셋|산출물|성과물|결과물)(?:을|를|과|와|및|\s|[,·])*)*(?:개발|구축|구현|제작|제공|제출|완성|산출|출시)/.test(tail);
  });
  infer('deliverables', [...new Set(products.map(d => d.text))].join('\n'), products, 0.65);

  // Count original evidence only: an inferred purpose must not double a term's frequency.
  const sources = records(['projectName','purpose','contents','coreTechnology','finalGoal'])
    .filter(d => fields[d.sourceField].evidenceType !== 'inferred');
  const candidates = new Map();
  for (const d of sources) {
    const tokens = (d.text.match(/[가-힣A-Za-z][가-힣A-Za-z0-9+-]*/g) || []).map(word =>
      word.replace(/(?:에서는|으로|에서|을|를|은|는|이|가|의|와|과|에|로)$/, ''));
    const meaningful = word => word.length >= 2 && !keywordStops.has(word.toLowerCase()) && !/(?:한다|하고|하여|된다|하는|적인|적으로)$/.test(word);
    for (let i=0; i<tokens.length; i++) {
      for (const size of [1,2,3]) {
        const words = tokens.slice(i,i+size);
        if (words.length !== size || !words.every(meaningful)) continue;
        const term = words.join(' '), key = term.toLowerCase();
        const entry = candidates.get(key) || {term, count:0, details:[]};
        entry.count++;
        if (!entry.details.includes(d)) entry.details.push(d);
        candidates.set(key, entry);
      }
    }
  }
  const ranked = [...candidates.values()].filter(x => x.count >= 2)
    .sort((a,b) => b.count-a.count || b.term.length-a.term.length || a.term.localeCompare(b.term,'ko'));
  const selected = ranked.filter(x => !ranked.some(y => y !== x && y.term.toLowerCase().includes(x.term.toLowerCase()) && y.count >= x.count)).slice(0,8);
  infer('keywords', selected.map(x => x.term).join(', '), [...new Set(selected.flatMap(x => x.details))], 0.6);
}

function analyzeLines(lines) {
  const fields = Object.fromEntries(Object.keys(FIELD_RULES).map(k => [k, missing()]));
  function add(field, selected, type, confidence, section) {
    const useful = selected.filter(x => x.text.trim() && !/작성요령|기재하세요|입력하세요/.test(x.text));
    const value = useful.map(x => x.text).join('\n').trim();
    if (!value || /^(?:확인 필요|미정|미기재|N\/A|[-—])$/i.test(value)) return;
    if (fields[field].confidence >= confidence) return;
    const details = useful.map(x => ({text:x.text, line:x.line, ...(x.page ? {page:x.page} : {})}));
    fields[field] = { value, evidence: `${type === 'contextual' ? '문맥 연결 · ' : ''}“${value}”`, confidence, evidenceType:type,
      ...(section ? {section} : {}), evidenceDetails:details };
  }
  let active = null;
  const flush = () => {
    if (active?.field) add(active.field, active.lines, active.inline ? 'explicit_label' : 'section', active.inline ? 0.95 : 0.9, active.title);
    active = null;
  };
  for (const line of lines) {
    const h = heading(line.text);
    if (h) {
      flush();
      active = {...h, lines:h.inline ? [{...line, text:h.inline}] : []};
    } else if (active) {
      if (active.field && (narrativeFields.has(active.field) || !active.lines.length) && line.text) active.lines.push(line);
    } else {
      const field = contextualField(line.text);
      if (field) add(field, [line], 'contextual', 0.7);
    }
  }
  flush();
  inferFields(fields);
  return fields;
}
function analyzeText(text, files=[]) {
  const lines = cleanText(text).split('\n').map((text,i) => ({text:text.trim(), line:i+1}));
  return { fields:analyzeLines(lines), sourceFiles:files, textLength:text.length,
    warnings:text.trim() ? [] : ['추출 가능한 텍스트가 없습니다. 레거시 HWP 등은 수동 입력으로 보완해 주세요.'] };
}
function analyzeDocuments(documents) {
  const result = analyzeText('');
  result.warnings = [];
  result.textLength = 0;
  for (const doc of documents) {
    const lines = [];
    const blocks = doc.pages?.length ? doc.pages : [{text:doc.text}];
    for (const block of blocks) for (const text of block.text.split('\n')) {
      lines.push({text:text.trim(), line:lines.length+1, page:block.page});
    }
    const fields = analyzeLines(lines);
    for (const [key,field] of Object.entries(fields)) {
      if (field.confidence <= result.fields[key].confidence) continue;
      field.evidenceDetails = field.evidenceDetails.map(d => ({...d, source:doc.name}));
      const pages = [...new Set(field.evidenceDetails.map(d => d.page).filter(Boolean))];
      field.evidence = `${doc.name}${pages.length ? ` · p. ${pages.join(', ')}` : ''} · ${field.evidence}`;
      result.fields[key] = field;
    }
    result.textLength += doc.text.length;
    result.sourceFiles.push({name:doc.name, extracted:!!doc.text, characters:doc.text.length});
    result.warnings.push(...(doc.warnings || []));
    if (!doc.text) result.warnings.push(`${doc.name}: 텍스트를 추출하지 못했습니다. 해당 항목을 직접 확인해 주세요.`);
  }
  return result;
}
module.exports = { extractFile, extractDocument, analyzeText, analyzeDocuments, cleanText };
