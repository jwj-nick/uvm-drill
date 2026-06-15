<!-- filename: content/c/m1-fifo-sv.md · created 2026-06-12 -->
# M1 — sync FIFO + 순수 SystemVerilog TB

:::tldr
- UVM을 쓰기 **전에**, class 기반 테스트벤치를 직접 짠다 — generator·driver·monitor·scoreboard를 mailbox로 잇는 고전 구조.
- DUT는 작은 **synchronous FIFO**(write/read, full/empty). M2에서 이 TB를 그대로 UVM으로 이주한다.
- 목표: `svcheck` 컴파일 PASS → (시뮬레이터) 랜덤 트랜잭션 self-check 통과.
:::

:::note 🚧 워크북 — 지금 할 수 있는 것 / 대기 중인 것
M1은 **순수 SV**(UVM 전 단계) = Nick의 홈그라운드라, 코드 초안은 NCC가 짜고(svcheck PASS) **읽기·컴파일·망가뜨려보기는 지금** 한다(아래 🔬 LAB). 단 **랜덤 self-check 실제 동작은 시뮬레이터(Layer 2) 이후**에야 검증된다 — 그 worked example 결과는 시뮬 전까지 비워둔다(선보강 금지: 검증 안 된 것을 PASS라 단정 X).
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

---

## 🔬 LAB — 직접 해보기 (워크북)

> M1은 **순수 SystemVerilog**(UVM 아직 X) = Nick의 20년 홈그라운드.
> 지금 네 몫: **① 데이터 흐름 순서로 읽기 → ② 컴파일 게이트 직접 돌리기 → ③ 일부러 깨서 게이트 확인.**
> 실제 동작(랜덤 100+ tx self-check)은 STEP 4 = Layer 2 시뮬 대기.

### STEP 1 · 데이터 흐름 순서로 읽기 ★핵심
위치 `m1_fifo_sv/`. **신호가 흐르는 순서 = 읽는 순서.** 각 파일에서 ★ 한 가지만 잡아라:

| 순서 | 파일 | ★ 읽을 때 잡을 한 가지 |
|---|---|---|
| 1 | `rtl/sync_fifo.sv` | **DECISION C — FWFT**: `assign dout = mem[rd_ptr]`가 왜 "!empty면 head가 항상 보인다"인가 |
| 2 | `tb/fifo_if.sv` | clocking `cb`(driver=구동) vs `mon_cb`(monitor=관측 전용) — **왜 두 개**인가 |
| 3 | `tb/transaction.sv` | `rand op` + `dist{WRITE:=1,READ:=1}` — 자극의 단위 |
| 4 | `tb/generator.sv` | `randomize()` → `mailbox.put` — 자극 생성 |
| 5 | `tb/driver.sv` | `gen2drv.get` → `vif.cb`로 핀 구동(WRITE/READ 분기) |
| 6 | `tb/monitor.sv` | **수락된 것만** 관측: `wr_en && !full`, `rd_en && !empty` — 왜 drop은 안 보나 |
| 7 | `tb/scoreboard.sv` | 참조모델 `ref_q[$]`: WRITE→push_back, READ→pop_front 후 비교 |
| 8 | `tb/environment.sv` · `fifo_tb_top.sv` | `fork`로 drv/mon/sb 백그라운드 + gen 실행 / clk·rst·DUT 연결 |

- **관측:** generator→(mailbox)→driver→DUT→monitor→(mailbox)→scoreboard 가 한 줄로 그려진다.
- **왜:** 이 골격이 그대로 M2에서 UVM으로 변신한다(gen→sequence, mailbox→TLM, env→uvm_env). 지금 손으로 읽어둬야 M2 대조가 산다.

### STEP 2 · svcheck PASS — 전체가 컴파일되나
```bat
cd C:\Nick\30_Apps\uvm-exercises\m1_fifo_sv
run.bat
```
- **기대:** `[svcheck] PASS (errors=0, warnings=0)` (M1은 UVM 미사용 → run.bat이 `--no-uvm`)
- **관측:** RTL+TB 9개 파일이 함께 문법·타입·연결이 성립한다.
- **왜:** "동작이 맞나" 전에 "말이 되나"를 1초에 거른다. (동작은 STEP 4.)

### STEP 3 · 깨뜨려 보기 — 게이트가 진짜 잡나
`tb/driver.sv`에서 `t.data` → `t.dat`(없는 멤버)로 오타 → 저장 → `run.bat`:
- **기대(대략):** `driver.sv:NN:CC: error: ... 'dat' ...` + `[svcheck] FAIL (errors=1, ...)`
- **관측:** class 멤버 접근 오류까지 **컴파일 단계에서**(런타임 전에) 잡힌다.
- **복구:** `t.data`로 되돌려 STEP 2 재실행 → PASS 복귀.
> 한 번 더: `tb/transaction.sv`의 `WRITE` → `WRIT`로 깨보면 enum 미정의도 위치와 함께 잡힌다.

### STEP 4 · 시뮬 self-check (랜덤 100+ tx) — 🚧 Layer 2 대기
> svcheck는 "컴파일까지"만 본다. **실제로 돌려 scoreboard가 0 mismatch인지**는 시뮬레이터(Vivado xsim / 회사 VCS)가 필요.
> Layer 2가 정해지면 NCC가 `run_sim.bat`을 만들고, 그때 이 STEP의 기대 출력(`[SB] *** M1 SELF-CHECK PASS ***`)을 여기 채운다. **지금은 미검증 — PASS라 단정 금지.**

> ✅ STEP 1(8개 파일 읽기) + STEP 2(PASS) + STEP 3(FAIL+위치)을 직접 했다면 W01 "나" 열을 채운다(환경 `read`/`svcheck`, 날짜).

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

```check
Q: 이 FIFO가 FWFT(first-word-fall-through)라는 건 dout 동작에서 어떻게 드러나나?
A: `assign dout = mem[rd_ptr]` 가 combinational이라, `!empty`이기만 하면 rd_en을 안 줘도 head 값이 이미 dout에 보인다. rd_en은 그 값을 "꺼내는(pop = rd_ptr 전진)" 역할만 한다. (표준 sync read FIFO는 rd_en 준 다음 클럭에야 dout이 나온다.)
H: rd_en 없이도 보이나?
```

```check
Q: monitor가 `wr_en && !full`, `rd_en && !empty`처럼 status까지 봐서 "수락된" 트랜잭션만 관측하는 이유는?
A: DUT는 full일 때 write를, empty일 때 read를 **drop**한다(DECISION B). 그 drop된 자극까지 scoreboard에 넘기면 참조모델(ref_q)과 실제 FIFO가 어긋나 거짓 mismatch가 난다. monitor는 "DUT가 실제로 받아들인 것"만 기록해야 비교가 성립한다.
H: full일 때 들어온 write를 모델에 넣으면?
```
