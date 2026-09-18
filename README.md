# 전자서명 진행 안내 가이드 (eformsign)

이폼사인 전자계약 서명 절차를 알림톡 수신부터 완료까지 15단계로 안내하는 인터랙티브 가이드입니다.

- 고정 URL: https://mk-jeon.github.io/eformsign/
- 특정 단계 링크: `https://mk-jeon.github.io/eformsign/#step-5`
- 모바일: 화면을 좌우로 밀어 이동, 왼쪽 탭에서 진행 순서 열람
- PWA: 홈 화면에 추가하면 오프라인에서도 열람 가능

정적 페이지 하나로 동작하며 서버가 필요 없습니다. `main` 브랜치 루트가 GitHub Pages로 자동 배포됩니다.

## 수정 방법
- 단계 문구·강조 영역: `index.html`의 `STEPS` 배열
- 스크린샷: `assets/sNN.jpg` (810×1801, 개인정보는 이미지 자체에 블러 적용)
- 배포 갱신 후 `sw.js`의 `CACHE` 버전을 올리면 기존 설치 기기도 새 버전을 받습니다.
