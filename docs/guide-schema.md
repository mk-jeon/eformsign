# 안내 가이드 데이터 형식 — guide.json v1

한 가이드 = 폴더 하나. 폴더 안에 `guide.json`(내용) + `assets/`(단계별 캡처 이미지)가 들어가고, 뷰어(`index.html` / `app.js` / `app.css`)는 모든 가이드가 동일한 파일을 씁니다. 내용을 바꿀 때는 `guide.json`과 `assets/`만 교체하면 됩니다.

```
eformsign/
├─ guide.json          ← 내용(아래 형식)
├─ assets/s01.jpg …    ← 단계별 이미지 (810px 폭 권장, JPEG)
├─ index.html          ← 뷰어(공통, 수정하지 않음)
├─ app.js / app.css    ← 뷰어(공통)
├─ manifest.json / sw.js / icons/   ← 홈 화면 추가·오프라인(공통)
```

## 최상위 필드

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `version` | number | ✔ | 항상 `1` |
| `id` | string | ✔ | 폴더명 = URL 경로. 영문·숫자·`-`·`_` |
| `brand` | string |  | 상단 작은 표기 (예: `EFORMSIGN · 전자계약`) |
| `title` | string | ✔ | 가이드 제목 |
| `subtitle` | string |  | 제목 아래 한 줄 (단계 수는 자동으로 붙음) |
| `cover` | object |  | 표지. `heading`, `body`, `duration`, `button`, `hint`, `show`(기본 true) |
| `end` | object |  | 종료 모달. `heading`, `body`, `restart`, `exit` |
| `notice` | string |  | 진행 순서 패널 하단 고지 문구 |
| `autoplayMs` | number |  | 자동재생 한 단계 시간(ms). 2000~60000, 기본 7000 |
| `highlightColor` | string |  | 강조색 `#rrggbb`, 기본 `#ff3b30` |
| `dim` | number |  | "강조 영역만 밝게" 어둡기 0~0.9, 기본 0.5 |
| `imageSize` | [w,h] |  | 참고용. 뷰어는 이미지 비율을 자동으로 맞춤 |
| `steps` | array | ✔ | 단계 목록 (1개 이상) |

## 단계(`steps[]`)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `image` | string | ✔ | `assets/파일명.jpg` 형식만 허용 (다른 경로·URL 거부) |
| `phase` | string | ✔ | 구간 이름. 같은 값끼리 진행 순서에서 묶임 (예: `2. 본인인증`) |
| `title` | string | ✔ | 진행 순서에 표시되는 짧은 제목 |
| `caption` | string | ✔ | 화면 아래 설명 문구 |
| `note` | string |  | 붉은 주의 문구 |
| `highlights` | array |  | 강조 박스. `{x,y,w,h,label?,soft?}` |
| `blurs` | array |  | 블러 박스. `{x,y,w,h}` (제작 도구로 내보내면 이미지 자체에도 픽셀화가 적용됨) |
| `tap` | object |  | 탭 애니메이션 위치 `{x,y}` |

좌표는 모두 **이미지 기준 비율(0~1)** 입니다. `x,y`는 좌상단, `w,h`는 크기. 이미지 해상도가 달라도 그대로 씁니다.

- `highlights[].soft: true` → 붉은 테두리·펄스 대신 흰 얇은 테두리(넓은 영역 안내용)
- `highlights`의 **마지막 박스**가 "강조 확대" 버튼의 확대 중심이 됩니다.

## 예시(축약)

```json
{
  "version": 1,
  "id": "eformsign",
  "brand": "EFORMSIGN · 전자계약",
  "title": "전자서명 진행 안내 가이드",
  "subtitle": "알림톡 수신부터 서명 완료까지",
  "cover": { "heading": "전자서명 진행\n안내 가이드입니다", "body": "순차적으로 확인 부탁드립니다.", "duration": "약 3분", "button": "시작하기" },
  "end": { "heading": "안내가 모두 끝났습니다", "body": "이 순서대로 진행하시면 전자서명이 완료됩니다." },
  "autoplayMs": 7000,
  "steps": [
    {
      "image": "assets/s01.jpg",
      "phase": "1. 알림톡 확인",
      "title": "알림톡에서 서명 시작",
      "caption": "카카오톡 알림톡의 [문서 서명하기] 버튼을 누릅니다.",
      "note": "서명 기한 내에 진행해 주세요.",
      "highlights": [ { "x": 0.176, "y": 0.821, "w": 0.606, "h": 0.048, "label": "문서 서명하기" } ],
      "tap": { "x": 0.479, "y": 0.845 }
    }
  ]
}
```

## 뷰어의 검증 규칙

뷰어는 `guide.json`을 읽을 때 위 형식을 검증하고, 벗어나는 값은 기본값으로 대체하거나(색·숫자) 무시합니다(좌표 범위 밖 박스). `version`이 1이 아니거나 `steps`가 비어 있거나 `image` 경로가 형식에 맞지 않으면 화면에 오류를 표시하고 렌더링하지 않습니다.

## 만드는 방법

- **제작 도구**: `studio/index.html` (웹 서버로 열기). 캡처 이미지를 넣고 문구·강조 박스를 그린 뒤 「내보내기」를 누르면 뷰어 파일까지 포함된 배포용 zip이 나옵니다. 상세는 `docs/studio.md`.
- **직접 작성**: 위 형식대로 `guide.json`을 쓰고 `assets/`에 이미지를 넣어도 됩니다.
