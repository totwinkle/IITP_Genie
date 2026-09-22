# ICT R&D 선정평가 사전검토 MVP

ICT R&D 신청 문서를 로컬에서 분석하고 적격성·중복성을 검토한 뒤 편집 가능한 보고서를 만드는 실행형 데모입니다. 외부 API나 API 키가 필요하지 않습니다.

## 실행 방식

### 로컬 실행

`localhost:3000`은 이 저장소를 내려받아 **사용자의 컴퓨터에서 Node.js 서버를 직접 실행할 때만** 사용하는 주소입니다.

```bash
npm ci
npm start
```

그 후 같은 컴퓨터의 브라우저에서 `http://localhost:3000`을 엽니다.

### 외부 공개 실행

GitHub 저장소 주소만으로는 웹앱이 실행되지 않습니다. 외부 사용자는 Render 등 Node.js 호스팅 서비스에 배포된 HTTPS 주소로 접속해야 합니다.

1. Render에서 `totwinkle/IITP_Genie` 저장소를 연결합니다.
2. 저장소의 `render.yaml` 설정으로 Web Service를 생성합니다.
3. 배포가 끝나면 생성된 `https://...onrender.com` 주소를 사용합니다.
4. 배포 주소에서 `GET /api/health`가 `ok: true`인지 확인합니다.
5. 그 검증된 HTTPS 주소를 Notion의 `/embed` 또는 `Bookmark`로 게시합니다.

배포 후 외부 검증:

```bash
node scripts/external-smoke.js https://배포주소
```

## 데모 흐름

1. 여러 문서를 업로드하고 10개 신청과제 항목 및 문서 근거를 확인합니다. 추출되지 않은 값은 `확인 필요`로 표시됩니다.
2. 5개 기본 적격성 항목의 판정과 의견을 수정합니다.
3. 자동 생성 검색 질의를 수정하고, 12건의 내장 ICT R&D 데이터 및 수동 JSON/텍스트 자료를 검색합니다.
4. 목적·해결문제·기술·방법·대상·적용분야·성과물·차별성의 8개 관점을 비교하고 중복성 판정을 수정합니다.
5. 통합 화면에서 최종 검토자 의견을 입력하고 완료한 뒤 DOCX, PDF 또는 HTML 보고서를 내려받습니다.

HWPX는 ZIP/XML 기반 본문을 지원합니다. 암호화 문서, 스캔 이미지 PDF, 레거시 HWP/XLS 및 손상 파일은 안전하게 `확인 필요`로 전환되며 수동 입력으로 보완할 수 있습니다. HWPX 보고서 생성은 포맷 호환성 위험 때문에 제공하지 않고, 편집 가능한 DOCX와 PDF/HTML 대안을 제공합니다.

## 개인정보·보안

- 입력 상태는 브라우저 `sessionStorage`에만 저장됩니다. 영구 저장소나 데이터베이스를 사용하지 않습니다.
- 업로드 파일은 메모리에서 처리되고 디스크에 저장되지 않습니다.
- 외부 연구정보 입력은 인터페이스 데모 스텁이며 네트워크 요청을 보내지 않습니다.
- 외부 URL, ID, 비밀번호는 저장하지 않습니다. 비밀번호와 요청 본문은 로그에 남기지 않습니다.
- 파일당 15MB, 요청당 12개 제한이 적용됩니다.

## 검증

```bash
npm test
npm run smoke
npm audit --omit=dev
```

테스트는 다중 포맷 분석, 누락값 처리, 8개 차원 검색, 일회성 자격증명, 세 가지 보고서, 5단계 UI 상태 복원을 검증합니다. 스모크 테스트는 실제 HTTP 서버를 띄우고 4개 파일 업로드부터 검색·비교·보고서 생성까지 전 흐름을 실행합니다.

## 구조

- `public/`: 반응형 단일 페이지 UI
- `src/analyzer.js`: 로컬 파일 추출 및 근거 기반 필드 분석
- `src/similarity.js`: 결정론적 유사도 및 8개 관점 비교
- `src/external-adapter.js`: `ExternalResearchAdapter`와 비저장 스텁
- `src/report.js`: DOCX/PDF/HTML 보고서
- `samples/`: 업로드 예제와 수동 기존과제 JSON
- `test/`: API·UI·전체 흐름 테스트

## 배포 및 외부 검증

- Docker: `docker build -t ict-rnd-pre-review . && docker run --rm -p 3000:3000 ict-rnd-pre-review`
- Render: 저장소의 `render.yaml` 사용
- GitHub Actions: `.github/workflows/ci.yml`에서 push·PR마다 테스트 실행
- 배포 후 외부 점검: `node scripts/external-smoke.js https://배포주소`

Notion은 Node.js 서버를 직접 실행하지 않으므로, 먼저 안정적인 HTTPS 주소로 배포한 뒤 Notion에서 `/embed` 또는 `Bookmark`로 링크를 게시합니다. 자세한 절차는 `docs/notion-publish.md`, 검증표는 `docs/external-access-test-pack.md`를 참고합니다.

실제 Eval 자료 패널은 공개 UI에서 숨겨져 있으며, 통제된 테스트를 위해 API 구조만 유지합니다.
