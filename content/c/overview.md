<!-- filename: content/c/overview.md · created 2026-06-12 -->
# Track C 개요 — 직접 만드는 UVM (Home Lab)

:::tldr
- 이 트랙은 **읽기가 아니라 만들기**다. 집에서 **무료 도구만으로** 실제 UVM 검증 환경을 FIFO부터 RAL까지 손으로 짓는다.
- Track A(개념)·Track B(이주 개념)에서 배운 것을 **실행 가능한 프로젝트**로 구현 — "안다"를 "만들 수 있다"로.
- 상용 EDA 라이선스 없이: **컴파일 게이트(svcheck)** + **무료 시뮬레이터(Vivado xsim)** 또는 회사 시뮬.
:::

:::analogy
악기 교본을 다 읽어도 손가락은 안 움직인다. 검증도 같다 — driver/scoreboard를 "읽어서" 아는 것과 직접 짜서 돌려본 것은 다른 능력이다. codec 검증 20년이 책이 아니라 현장에서 쌓였듯, 이 트랙은 **현장을 집에 만든다.**
:::

## 왜 직접 만드나
- UVM은 **손으로 익히는 기술**이다. 컴포넌트 연결, sequencer-driver handshake, scoreboard 비교는 직접 짜다 막혀봐야 체화된다.
- 면접·현업에서 통하는 것은 "설명할 수 있다"가 아니라 **"환경을 세울 수 있다"**.
- 그리고 직접 만든 것은 **포트폴리오**가 된다(공개 repo).

## 무료 도구 스택 (집 환경)
| 층 | 도구 | 역할 | 비용 |
|---|---|---|---|
| 컴파일 게이트 | **svcheck** (pyslang + Accellera uvm-core) | "문법·타입·UVM 사용이 맞나"를 1초에 검사 | 무료 |
| 실행 시뮬레이터 | **Vivado xsim**(무료) 또는 회사 VCS | randomize·phase·파형 등 실제 동작 | 무료/회사 |

> 자세한 셋업은 다음 챕터(**M0 — Home Lab 환경**)에서.

## 프로젝트 아크 (M0 → M4)
| M | 만드는 것 | 배우는 것 |
|---|---|---|
| **M0** | 환경(컴파일 게이트 + 시뮬레이터) | 도구 체인·표준 |
| **M1** | sync FIFO + **순수 SV class TB**(UVM 없이) | SV 토대 총정리 |
| **M2** | 같은 FIFO를 **UVM으로 이주** | UVM 기초~stimulus (Track B 실사판) |
| **M3** | **RLE 인코더** + full UVM env(scoreboard+coverage) | analysis·agent·env·coverage |
| **M4** | RLE + APB config 레지스터 + **RAL** | 레지스터 검증 |

각 단계는 앞 단계 위에 쌓인다. M1의 FIFO는 M2에서 UVM이 되고, M2의 env 골격은 M3·M4로 자란다.

## 끝나면 갖게 되는 것
- 무료 도구로 도는 **재현 가능한 UVM 검증 환경** 4종 (FIFO 2버전 · RLE · RLE+RAL)
- "집에서 UVM 실습 환경 세우기"를 처음부터 해본 경험
- 공개 코드(repo) + 각 단계의 설계 결정 기록

```check
Q: 이 트랙(C)이 Track A·B와 다른 점은?
A: A·B는 개념을 **읽고** 이해하는 트랙이고, C는 그 개념으로 실제 검증 환경을 **손으로 만들어 돌리는** 실습 트랙이다. 특히 M1→M2는 Track B(이주)를 실제 코드로 해보는 것이다.
H: 읽기 vs 만들기
```

```check
Q: 상용 시뮬레이터 라이선스 없이 집에서 UVM을 검증하려면 최소 무엇이 필요한가?
A: ① 컴파일 게이트(svcheck = pyslang + uvm-core 소스) — 문법/타입/UVM 사용 검사, ② 실행 시뮬레이터(무료 Vivado xsim 등) — 실제 동작 확인. 컴파일과 실행은 다른 도구가 필요하다.
H: "컴파일 되나"와 "돌리면 맞나"는 다른 질문
```
