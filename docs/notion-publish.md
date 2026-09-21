# 외부 공개 및 Notion 게시

## 중요한 운영 원칙

Notion은 Node.js 서버를 실행하는 호스팅 서비스가 아니므로 이 애플리케이션을 Notion에 직접 업로드할 수는 없습니다. 외부 HTTPS 주소에 먼저 배포한 뒤 Notion에 `Embed` 또는 `Bookmark`로 게시해야 합니다.

## 외부 배포

이 저장소는 Docker/Render 배포에 필요한 파일을 포함합니다.

- `Dockerfile`
- `render.yaml`
- `GET /api/health` 헬스체크
- `PORT` 환경변수 지원

Render에서 이 저장소를 연결하고 `render.yaml`로 배포하면 HTTPS 주소가 생성됩니다. 생성된 주소에서 다음을 확인합니다.

```text
https://배포주소.onrender.com/
https://배포주소.onrender.com/api/health
```

## Notion에 게시

1. 배포된 HTTPS 주소를 복사합니다.
2. Notion 페이지에서 `/embed`를 입력합니다.
3. 배포 URL을 붙여넣습니다.
4. 공개 공유가 필요하면 해당 Notion 페이지의 공유 권한과 외부 링크 공개 정책을 확인합니다.

대화형 앱을 임베드할 수 없는 Notion 환경에서는 URL을 `Bookmark`로 넣으면 됩니다.

## 보안 주의

- 공개 배포 시 신청서 원문과 개인 식별정보를 `/opt/data/Eval`에서 그대로 노출하지 않습니다.
- 실제 운영 배포에서는 로그인·권한·파일 저장소·감사로그를 추가해야 합니다.
- 외부 검색 시스템의 ID/PW는 저장하지 않습니다.
- 공개 데모에는 샘플 또는 비식별 자료만 포함합니다.
