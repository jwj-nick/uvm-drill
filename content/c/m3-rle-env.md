<!-- filename: content/c/m3-rle-env.md · created 2026-06-12 -->
# M3 — RLE 인코더 + full UVM env

:::tldr
- codec 결의 DUT(**RLE 인코더**, 입력당 출력이 가변)로 **본격 UVM 환경**을 처음부터 짓는다.
- scoreboard 참조 모델 + functional coverage로 **coverage-driven 루프**를 한 바퀴 돈다.
- 가변 길이 출력·스트림 비교가 핵심 난점 — codec 검증 직관이 그대로 scoreboard 설계 문제가 된다.
:::

:::note 🚧 이 챕터는 만들며 채워진다
M2를 마친 뒤 착수. RLE 스펙·참조 인코더·covergroup 설계와 coverage hole을 메운 과정이 여기 기록된다.
:::

## 만들 것 (build spec)
- **DUT:** RLE 인코더 — 연속 동일 심볼 스트림 → (symbol, count). count 포화(max) 경계 처리.
- **UVM env:** active agent(sequencer/driver/monitor) + scoreboard(**참조 인코더 모델**) + **coverage collector**.
- **자극:** constrained random — 런 길이 분포 제어(`dist`, `solve...before`).
- **coverage:** 런 길이·count 포화 경계·심볼 전이 커버.
- **검증 목표:** self-check 통과 + coverage 리포트로 hole 확인·자극 조정.

## 왜 RLE (해자)
입력 1개당 출력 개수가 가변 → codec(가변 비트레이트 스트림)의 본질적 검증 난점(스트림 비교, 경계, flush)을 작게 재현. 20년 codec 검증 직관이 scoreboard·coverage 설계로 직결된다.

## 이걸 위해 공부할 것 (study map)
- [Sequences](#/a/part3/sequences) · [Virtual Sequences](#/a/part3/virtual-sequences)
- [Monitor](#/a/part4/monitor) · [Scoreboard 패턴](#/a/part4/scoreboard) · [Coverage Collector](#/a/part4/coverage-collector)
- [Agent](#/a/part5/agent) · [Environment](#/a/part5/env) · [Test](#/a/part5/test)
- [Functional Coverage](#/a/part0/sv-coverage) · [Randomization](#/a/part0/sv-random)

```check
Q: M3에서 처음으로 Nick이 직접 세우는 "검증 계획"의 핵심 산출물 둘은?
A: ① scoreboard의 **참조 모델**(기대 출력을 독립 계산) ② **coverage 모델**(무엇을 어디까지 봤는지 측정할 covergroup). 자극이 랜덤이면 이 둘 없이는 "맞았는지"도 "다 봤는지"도 모른다.
H: 랜덤 자극에 반드시 따라붙는 두 가지
```
