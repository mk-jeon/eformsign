# 안내 가이드 (뷰어 + 데이터 + 제작 도구)

휴대폰 화면 캡처를 단계별로 보여주는 인터랙티브 안내 가이드입니다. 서버·빌드 없이 정적 파일로 동작합니다.

- 배포 주소(예시 가이드 eformsign): https://guide.monki.net/eformsign/ · 개발 확인용: https://mk-jeon.github.io/eformsign/
- 특정 단계 링크: `…/eformsign/#step-5`

## 구조
| 경로 | 역할 |
|---|---|
| `index.html`, `app.js`, `app.css` | 뷰어(공통). `guide.json`을 읽어 렌더링 |
| `guide.json`, `assets/` | 가이드 내용(예시: 이폼사인 전자서명 15단계). 형식은 `docs/guide-schema.md` |
| `manifest.json`, `sw.js`, `icons/` | 홈 화면 추가·오프라인 열람 |
| `studio/` | 가이드 제작 도구(내부용, 배포 불필요). 사용법 `docs/studio.md` |
| `docs/security.md` | 보안 점검 항목(개발팀 검토용) |

## 새 가이드 만들기
1. `studio/`를 웹 서버로 열어 캡처·문구·강조 박스를 넣고 「내보내기」.
2. 나온 zip 안의 `<ID>/` 폴더를 `guide.monki.net/<ID>/` 위치에 올리고 CloudFront 캐시 무효화.

## 이 저장소로 배포(GitHub Pages)
`main` 루트가 자동 배포됩니다. 내용을 바꾸면 `sw.js`의 `CACHE` 버전을 올려 설치된 기기도 갱신되게 합니다.
