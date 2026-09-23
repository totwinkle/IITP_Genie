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
    if (ext === '.pdf') {
      // Multipart PDF buffers can trigger parser-specific byte-range errors.
      // Keep a deterministic text fallback so the MVP still exposes evidence.
      const pdfData = new Uint8Array(file.buffer.buffer, file.buffer.byteOffset, file.buffer.byteLength);
      try {
        return cleanText((await pdfParse(pdfData)).text);
      } catch {
        const raw = Buffer.from(pdfData).toString('latin1');
        const literals = [...raw.matchAll(/\\(([^()\\]*(?:\\.[^()\\]*)*)\\)/g)]
          .map(m => m[1].replace(/\\([\\()\\])/g, '$1'))
          .filter(v => /[가-힣A-Za-z0-9]/.test(v));
        return cleanText(literals.join('\\n'));
      }
    }
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

function findValue(text, labels) {
  const lines=text.split(/\n+/).map(line=>line.trim()).filter(Boolean);
  const normalizedLabels=[...labels].sort((a,b)=>b.length-a.length);
  for (const label of normalizedLabels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const re = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*[:：]?\\s*([^\\n]{2,300})`, 'im');
    const hit = text.match(re);
    if (hit) return {value:hit[1].trim(), evidence:`“${label}: ${hit[1].trim().slice(0,90)}”`};
  }
  for (let i=0;i<lines.length;i++) {
    const label=normalizedLabels.find(item=>lines[i]===item || lines[i].startsWith(`${item}:`) || lines[i].startsWith(`${item}：`));
    if (!label) continue;
    const sameLine=lines[i].slice(label.length).replace(/^\s*[:：-]?\s*/,'').trim();
    const following=lines.slice(i+1,i+7).filter(line=>!FIELD_LABELS.some(item=>line===item || line.startsWith(`${item}:`) || line.startsWith(`${item}：`)));
    const value=[sameLine,...following].filter(Boolean).join(' ').trim();
    if (value.length>=2) return {value:value.slice(0,500),evidence:`“${label}: ${value.slice(0,140)}”`};
  }
  return {value:'확인 필요', evidence:'문서에서 명시적 근거를 찾지 못함'};
}
const FIELD_LABELS=Object.values(FIELD_RULES).flat();
function analyzeText(text, files=[]) {
  const fields = {};
  Object.entries(FIELD_RULES).forEach(([key,labels]) => fields[key] = findValue(text, labels));
  return { fields, sourceFiles:files, textLength:text.length, warnings: text ? [] : ['추출 가능한 텍스트가 없습니다. 레거시 HWP 등은 수동 입력으로 보완해 주세요.'] };
}

module.exports = { extractFile, analyzeText, cleanText };
