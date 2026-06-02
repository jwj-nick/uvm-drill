# Phase 순서표

:::tldr
build/connect만 방향이 특수(top-down/bottom-up), 나머지는 bottom-up. run만 task.
:::

## 공통 phase

| # | phase | 종류 | 방향 |
|---|---|---|---|
| 1 | build_phase | function | **top-down** |
| 2 | connect_phase | function | bottom-up |
| 3 | end_of_elaboration_phase | function | bottom-up |
| 4 | start_of_simulation_phase | function | bottom-up |
| 5 | **run_phase** | **task** | parallel |
| 6 | extract_phase | function | bottom-up |
| 7 | check_phase | function | bottom-up |
| 8 | report_phase | function | bottom-up |
| 9 | final_phase | function | top-down |

## run-time sub-phases (run_phase와 병행)

```
pre_reset → reset → post_reset
→ pre_configure → configure → post_configure
→ pre_main → main → post_main
→ pre_shutdown → shutdown → post_shutdown
```

모두 task, 모든 컴포넌트에서 동기화.

## 무엇을 어디에

| 작업 | phase |
|---|---|
| create, config get | build |
| TLM connect, vseqr 배선 | connect |
| topology 점검 | end_of_elaboration |
| 시작 메시지/초기화 | start_of_simulation |
| stimulus, objection | run (또는 main) |
| 결과 수집 | extract |
| pass/fail 판정 | check |
| 결과 출력, coverage % | report |

:::gotcha
phase 메서드는 항상 `super.<phase>_phase(phase)` 먼저. build에서 빠뜨리면 field/config 자동화가 깨집니다.
:::

```check
Q: 9개 공통 phase 중 top-down은 무엇인가?
A: **build_phase**(부모가 자식을 create)와 **final_phase**가 top-down. 나머지(connect, end_of_elaboration, start_of_simulation, extract, check, report)는 bottom-up이고, run_phase는 parallel task다.
H: 생성과 마무리
```
