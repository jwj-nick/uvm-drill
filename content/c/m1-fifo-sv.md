<!-- filename: content/c/m1-fifo-sv.md · created 2026-06-12 -->
# M1 — sync FIFO + 순수 SystemVerilog TB

:::tldr
- UVM을 쓰기 **전에**, class 기반 테스트벤치를 직접 짠다 — generator·driver·monitor·scoreboard를 mailbox로 잇는 고전 구조.
- DUT는 작은 **synchronous FIFO**(write/read, full/empty). M2에서 이 TB를 그대로 UVM으로 이주한다.
- 목표: `svcheck` 컴파일 PASS → (시뮬레이터) 랜덤 트랜잭션 self-check 통과.
:::

:::note 🚧 이 챕터는 만들며 채워진다
이 트랙은 **직접 만드는 실습**이다. 아래 "만들 것"과 "공부할 것"이 로드맵이고, 실제 코드·설계 결정·막힌 지점의 해법은 **내가 M1을 만들면서** 이 챕터에 기록된다. (선보강 금지 — 이해한 것만 콘텐츠로.)
:::

## 만들 것 (build spec)
- **DUT:** parameterized sync FIFO — `WIDTH`, `DEPTH`, 신호 `wr/rd/din/dout/full/empty`.
- **TB (순수 SV class):**
  - `transaction` — op(WR/RD), data
  - `generator` — 랜덤 transaction 생성 → mailbox로 전달
  - `driver` — transaction을 DUT 핀으로 구동
  - `monitor` — DUT 관측 → scoreboard로 전달
  - `scoreboard` — **참조 모델(queue)** 로 기대값 계산·비교
  - `environment` — 컴포넌트 생성 + mailbox 연결
  - `top` — clk/rst 생성, interface, 실행
- **검증 목표:** 랜덤 write/read 섞어 100+ 트랜잭션, scoreboard self-check 0 mismatch.

## 왜 이렇게 (설계 의도)
이 골격(generator→driver→monitor→scoreboard + mailbox)은 정확히 **UVM 이전의 검증 TB**다.
직접 짜봐야 M2에서 "UVM이 이 중 무엇을 표준화했는지"가 보인다.

## 이걸 위해 공부할 것 (study map)
- [OOP: class·상속·다형성](#/a/part0/sv-oop) — TB 전체가 class
- [Interface & Clocking Block](#/a/part0/sv-interface) — DUT 연결
- [Virtual Interface](#/a/part0/sv-vif) — class에서 핀 접근
- [fork-join · mailbox · event](#/a/part0/sv-processes) — 컴포넌트 연결(mailbox)
- [Randomization & Constraints](#/a/part0/sv-random) — generator 자극
- (이주 그림 미리보기) [Track B · 출발점: Legacy SV TB](#/b/mig/legacy-tb)

```check
Q: M1을 UVM 없이 순수 SV로 먼저 짜는 이유는?
A: 같은 TB를 M2에서 UVM으로 이주하며 "UVM이 무엇을 표준화했는지"(생성=factory, 연결=config_db, mailbox=TLM 등)를 대조로 체득하기 위해서. 먼저 손으로 겪어야 UVM의 간접화가 왜 필요한지 와닿는다.
H: M2와의 관계
```
