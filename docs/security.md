# 뷰어 보안 정리 (개발팀 검토용)

정적 파일만으로 동작하는 안내 페이지입니다. 서버 코드·로그인·폼 입력·사용자 데이터 수집이 없습니다. 아래는 "HTML을 그대로 올려도 되는가"에 대한 점검 항목입니다.

## 적용된 조치

| 항목 | 내용 |
|---|---|
| CSP | `<meta http-equiv="Content-Security-Policy">`: `default-src 'none'`, 스크립트·스타일·이미지·fetch 는 같은 출처(`'self'`)만. 인라인 스크립트 금지(`script-src 'self'`). `base-uri 'none'`, `form-action 'none'`, `frame-ancestors 'self'` |
| 인라인 스크립트 없음 | 모든 JS 는 `app.js` 한 파일. HTML 에 `onclick` 등 인라인 핸들러 없음 |
| 데이터 삽입 | `guide.json` 의 문자열은 전부 `textContent` 로만 DOM 에 넣음. `innerHTML`·`insertAdjacentHTML`·`eval`·`new Function` 미사용 |
| 이미지 경로 allowlist | `image` 는 `^assets/[A-Za-z0-9_-]+\.(jpe?g|png|webp)$` 만 허용. 절대 URL·상위 경로·data: 거부. CSS `background-image` 에 넣을 때 따옴표·역슬래시 제거 |
| 스키마 검증 | 숫자 범위(좌표 0~1, 색 `#rrggbb`, 자동재생 2~60초) 검증. `version:1` 아니면 렌더링 거부 |
| 같은 출처 fetch | `guide.json` 만 `fetch(..., {credentials:'omit'})`. 다른 출처 요청 없음(`connect-src 'self'`) |
| 외부 리소스 | 웹폰트 CSS 1개(jsdelivr, `@v1.3.9` 버전 고정, `integrity` SRI + `crossorigin=anonymous`). 없어도 시스템 폰트로 정상 동작. 이 외 외부 스크립트·추적·분석 도구 없음 |
| postMessage | 제작 도구 미리보기용 수신은 `event.origin === location.origin` 이고 iframe 안일 때만 처리. blob: URL 만 이미지로 허용 |
| 저장소·쿠키 | 뷰어는 localStorage/쿠키/IndexedDB 를 쓰지 않음. Service Worker 는 같은 출처 정적 파일 캐시만(오프라인 열람용) |
| 링크 | 외부 링크 없음. `referrer no-referrer` |
| 개인정보 | 캡처의 개인정보 영역은 **이미지 파일 자체**에 픽셀화(제작 도구 내보내기 시 자동). CSS 블러만으로는 원본 파일에 남으므로 병행하지 않음 |

## 남는 사항 (호스팅 쪽)

- HTTP 응답 헤더로 `Content-Security-Policy`(meta 와 동일값)·`X-Content-Type-Options: nosniff`·`Referrer-Policy: no-referrer` 를 CloudFront 응답 헤더 정책에 넣으면 meta 방식보다 강해집니다. 없어도 meta CSP 가 동작합니다.
- 웹폰트 CDN 을 아예 끊고 싶으면 `index.html` 의 `<link rel=stylesheet ... jsdelivr ...>` 한 줄을 지우고 CSP 의 `https://cdn.jsdelivr.net` 두 곳을 빼면 됩니다(시스템 폰트로 표시).

## 제작 도구(`studio/`)

배포 대상이 아닙니다(내부용). 같은 CSP 원칙(같은 출처만, 인라인 없음). 이미지는 브라우저 안에서만 처리되고 서버로 전송되지 않으며, 초안은 사용자 브라우저의 IndexedDB 에만 저장됩니다.
