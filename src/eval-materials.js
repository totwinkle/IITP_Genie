const fs = require('fs');
const path = require('path');

const EVAL_ROOT = '/opt/data/Eval';
const TEXT_CAPABLE_EXTENSIONS = new Set(['.txt', '.csv', '.json', '.pdf', '.docx', '.xlsx', '.hwpx']);
const CONTENT_TYPES = {
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.hwp': 'application/x-hwp',
  '.hwpx': 'application/vnd.hancom.hwpx'
};

const RFP_FILE = '신규지원 RFP_사이버보안 부문.hwpx';
const RFP_TEXT_FILE = 'rfp_extracted.txt';
const ELIGIBILITY_FILE = '적격성 검토표_양식.xlsx';

const rfpSummary = Object.freeze({
  managementNumber: '2026-사이버보안-5',
  technologyClassification: '사이버보안-공통 보안-인공지능 보안-AI모델 보호',
  title: 'LMM(Large Multimodal Model) 생태계의 보안 위협 및 취약점 분석과 안전성 검증 기술개발',
  period: '4년 이내 / 총 45개월',
  governmentFunding: '총 4,500백만원 이내',
  trl: 'TRL 4~7',
  metrics: ['멀티모달 위협 탐지율 95% 이상', 'LMM 안전성 평가 자동화율 90% 이상'],
  specialRequirement: '산·학·연 협력체계를 구성하고 상용화·기술이전 계획을 구체적으로 제시',
  sourceFiles: [RFP_FILE, RFP_TEXT_FILE]
});

const coreEligibility = Object.freeze([
  '공고 내용과의 부합성',
  '기개발',
  '기지원',
  '의무사항 불이행',
  '참여제한',
  '채무불이행 및 부실위험',
  '과제기획위원회 참여',
  '연구책임자 3책 5공'
]);

const preferenceEvidence = Object.freeze([
  { item: '기술이전', evidence: '09. 연구개발계획서_v1.1(26.02.10)_쿼드마이너_RFP11.pdf.pLDH' },
  { item: '여성 연구자 10% 이상', evidence: '09_2. 우대사항 증빙서류_여성참여인력 재직증명서_(주)쿼드마이너_수정(26.02.23.).pdf' },
  { item: 'ICT R&D 혁신 클러스터', evidence: '09_1.우대사항 증빙서류_ICT R&D 혁신 클러스터 운영 계획_(주)쿼드마이너_RFP11.pdf' },
  { item: '정보보호 인증', evidence: '제출자료 목록에서 직접 확인 필요' }
]);

function safeInventory(root = EVAL_ROOT) {
  const files = [];
  if (!fs.existsSync(root)) return files;

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      const extension = path.extname(entry.name).toLowerCase();
      const stat = fs.statSync(absolute);
      files.push({
        name: relative,
        size: stat.size,
        type: CONTENT_TYPES[extension] || 'application/octet-stream',
        extractedTextAvailable: TEXT_CAPABLE_EXTENSIONS.has(extension)
      });
    }
  }

  visit(root);
  return files.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

function demoReview() {
  const rfpEvidence = `${RFP_FILE} · ${RFP_TEXT_FILE}`;
  return {
    fields: {
      projectName: { value: rfpSummary.title, evidence: rfpEvidence },
      institution: { value: '확인 필요', evidence: '신청기관은 신청서 원문에서 확인 필요' },
      pi: { value: '확인 필요', evidence: '연구책임자는 신청서 원문에서 확인 필요' },
      period: { value: rfpSummary.period, evidence: rfpEvidence },
      purpose: { value: 'LMM 신뢰성 검증 및 능동 방어 프레임워크 구축', evidence: rfpEvidence },
      contents: { value: 'LMM 위협 벡터·취약점 식별, 멀티모달 레드팀 시스템, 능동 방어·가드레일 기술 개발', evidence: rfpEvidence },
      coreTechnology: { value: rfpSummary.technologyClassification, evidence: rfpEvidence },
      keywords: { value: 'LMM, 멀티모달 보안, 레드팀, 가드레일, 프롬프트 인젝션', evidence: rfpEvidence },
      finalGoal: { value: `${rfpSummary.metrics.join(', ')} · ${rfpSummary.trl}`, evidence: rfpEvidence },
      deliverables: { value: 'LMM 신뢰성 검증·방어 프레임워크 및 안전성 평가 자동화 솔루션', evidence: rfpEvidence }
    },
    eligibility: coreEligibility.map(item => ({ item, status: '확인 필요', note: `${ELIGIBILITY_FILE} 및 신청서 증빙 대조 필요` })),
    preferenceEvidence: preferenceEvidence.map(entry => ({ ...entry, status: '확인 필요', note: '증빙의 충족 여부를 검토하세요.' }))
  };
}

module.exports = { EVAL_ROOT, coreEligibility, demoReview, preferenceEvidence, rfpSummary, safeInventory };
