# UVM Lab

**읽고 · 이해하고 · 그 자리에서 확인하는** UVM 학습 플랫폼.
의존성 없는 정적 웹앱(바닐라 JS + CDN 라이브러리). GitHub Pages로 호스팅.

> 이전의 "퀴즈만 있던 drill"을 폐기하고, 지식을 먼저 쌓는 learning-first 구조로 재설계했습니다.

## 구성

- **Track A · Learn A–Z** — SystemVerilog 선수지식(Part 0)부터 UVM 기초/factory/stimulus/analysis/agent·env·test/RAL/advanced/방법론(Part 1–8)까지 순서대로.
- **Track B · SV → UVM Migration** — APB·AXI·IRQ·clock·reset·debug가 있는 가상 DMA DUT의 레거시 SV TB를 UVM으로 단계별 이주(before/after diff 포함).
- **Reference** — 매크로·phase·TLM·RAL·CLI 치트시트.

각 챕터: `TL;DR → 본문 → 코드 → Gotcha → 다이어그램 → 체크포인트`.
체크포인트를 풀면 그 항목만 **복습(Review)** 큐(읽은 내용 한정 간격반복, SM-2)에 들어갑니다.

## 실행

이 앱은 markdown을 `fetch`로 불러오므로 **정적 서버에서** 열어야 합니다 (`file://` 직접 열기는 동작하지 않습니다).

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```

## 구조

```
index.html              # 셸: 사이드바 + 콘텐츠 영역
css/style.css           # 다크/라이트 테마, 타이포, 콜아웃, 체크포인트
js/app.js               # 라우터 · 사이드바 · 마크다운 렌더 · 진도 · SR
content/
  manifest.json         # 사이드바 트리(트랙/파트/챕터) 정의
  a/part0..8/*.md        # Track A
  b/*.md                 # Track B (migration)
  ref/*.md               # Reference
```

### 콘텐츠 작성 규약 (markdown 확장)

- 콜아웃: `:::tldr` / `:::gotcha` / `:::tip` / `:::note` / `:::analogy` … 본문 … `:::`
- 체크포인트:
  ````
  ```check
  Q: 질문
  A: 정답(여러 줄 가능)
  H: 힌트(선택)
  ```
  ````
- 다이어그램: ```` ```mermaid ```` 코드펜스 (mermaid CDN으로 렌더)
- before/after diff: `<div class="diff2"><div class="before">…</div><div class="after">…</div></div>`

새 챕터는 `content/manifest.json`에 항목을 추가하고 해당 `.md`를 만들면 사이드바에 자동 노출됩니다.

## 사용 라이브러리 (CDN)

marked(마크다운) · highlight.js(SystemVerilog 하이라이트) · mermaid(다이어그램).

## 배포

`main` 브랜치 push 시 `.github/workflows/deploy.yml`이 GitHub Pages로 배포합니다.
