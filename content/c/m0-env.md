<!-- filename: content/c/m0-env.md · created 2026-06-12 -->
# M0 — Home Lab 환경 (컴파일 게이트)

:::tldr
- 시뮬레이터가 없어도, 내가 짠 SV/UVM 코드가 **올바른지 1초에 거르는 컴파일 게이트**를 집에 깐다.
- 도구: **pyslang**(오픈소스 SystemVerilog 컴파일러) + **uvm-core**(Accellera 공식 UVM 소스) → 묶은 스크립트 **svcheck**.
- 실제 동작(파형·randomize)은 별도 **시뮬레이터**(Vivado xsim/회사 VCS)가 본다 — 컴파일과 실행은 다른 도구.
:::

## 두 층 — "컴파일 되나" vs "돌리면 맞나"
```
[내 코드.sv] ─▶ svcheck (pyslang + uvm-core) ─▶ PASS/FAIL + 에러위치   ← 매 저장마다, 1초
[내 코드.sv] ─▶ 시뮬레이터(xsim/VCS) ────────▶ 실행·파형·randomize    ← 가끔, 동작 확인
```
**컴파일러는 문법·타입·연결을 검사하고, 시뮬레이터는 시간을 흘려 동작을 본다.** 둘 다 필요하다.

## 도구 셋업

### 1) pyslang — 오픈소스 SV 컴파일러
```bash
pip install pyslang        # Windows/Mac/Linux 휠 제공
python -c "import pyslang; print(pyslang.__version__)"
```
**pyslang**은 slang(가장 표준 준수율 높은 오픈소스 SV 프론트엔드)의 Python 패키지다. **시뮬레이터가 아니라
컴파일러** — 코드를 읽고 타입 검사·elaboration까지 해서 "선언 안 한 신호, 타입 불일치, UVM 매크로 오용"
같은 **의미 에러**를 잡는다.

### 2) uvm-core — UVM 라이브러리 소스
```bash
git clone https://github.com/accellera-official/uvm-core
```
내 코드가 `uvm_driver`를 쓰면 컴파일러는 그 정의를 알아야 한다. 그 정의가 **Accellera 공식 UVM 소스**
(uvm-core, Apache-2.0)에 있다. 시뮬레이터는 UVM을 내장하지만, 순수 컴파일러인 slang엔 소스를 직접 줘야 한다.

### 3) svcheck — 둘을 묶은 게이트
`pyslang`으로 "내 코드 + uvm-core"를 함께 컴파일해 에러를 **위치(file:line:col)** 와 함께 출력하는 작은 스크립트.
```
> svcheck hello_world.sv
[svcheck] PASS (errors=0, warnings=0)

> svcheck broken.sv
broken.sv:27:14: error: use of undeclared identifier 'undeclared_signal'
  assign a = undeclared_signal;
             ^~~~~~~~~~~~~~~~~
[svcheck] FAIL (errors=1, warnings=0)
```
> svcheck 코드/한계/발전은 실습 repo(`uvm-exercises/tools/`)에 정리.

---

## 🔬 LAB — 직접 해보기 (5분 워크북)

> "NCC가 됐다더라"가 아니라 **내가 직접 PASS/FAIL을 눈으로** 본다.
> 터미널(PowerShell)에 그대로 복붙. 각 스텝 = **명령 → 기대 출력 → 무엇을 관측 → 왜.**

### STEP 0 · 도구가 깔려 있나
```bat
python -c "import pyslang; print(pyslang.__version__)"
dir C:\Nick\80_Toolchain\uvm-core\src\uvm_pkg.sv
```
- **기대:** `11.0.0` 같은 버전 + `uvm_pkg.sv` 파일이 보임.
- **관측:** 컴파일러(pyslang)와 UVM 소스(uvm-core)가 둘 다 자리에 있다.
- **왜:** svcheck = 이 둘의 조합. 하나라도 없으면 게이트가 못 선다.

### STEP 1 · PASS 보기 — 정상 코드는 통과하나
```bat
cd C:\Nick\30_Apps\uvm-exercises
tools\svcheck.bat m0_hello\hello_world.sv
```
- **기대:** `[svcheck] PASS (errors=0, warnings=0)`
- **관측:** UVM 라이브러리 전체 + 내 hello_world가 에러 0으로 컴파일됨. (첫 실행 몇 초, 이후 빠름)
- **왜:** "내 코드가 UVM 위에서 문법·타입·연결이 성립한다"를 1초에 증명.

### STEP 2 · FAIL 보기 — 일부러 틀리면 정말 잡나 ★가장 중요
> 게이트가 "항상 PASS하는 깡통"이 아님을 내 손으로 증명하는 단계.

`m0_hello\hello_world.sv`에서 `run_test("hello_test");` 를 `run_tset` 으로 오타 → 저장 → 재실행:
```bat
tools\svcheck.bat m0_hello\hello_world.sv
```
- **기대(대략):**
```
m0_hello\hello_world.sv:NN:CC: error: ... 'run_tset' ...
                                          ^~~~~~~~
[svcheck] FAIL (errors=1, warnings=0)
```
- **관측:** 틀린 곳을 **줄:열 + 캐럿(^)** 으로 짚어준다.
- **왜:** 검증 도구의 가치는 "틀렸다"가 아니라 **"어디가 왜 틀렸다"** — 이게 디버그 루프의 속도다.
- **복구:** `run_test` 로 되돌리고 STEP 1 재실행 → PASS 복귀 확인.

### STEP 3 · 코드 읽기 — UVM 첫 구문
`m0_hello\hello_world.sv`의 주석 `[A]`~`[H]`를 따라 읽는다. 특히:
- `[A]` `` `include `` vs `[C]` `import` — 매크로 vs class, **왜 둘 다** 필요한가.
- `[E]` `` `uvm_component_utils `` — factory 등록 (왜 중요한지는 Part 2에서).
- `[G-1]/[G-4]` raise/drop objection — 짝이 안 맞으면 테스트가 0초에 끝나거나 영원히 안 끝난다.

> ✅ STEP 1에서 PASS, STEP 2에서 FAIL+위치를 **두 눈으로** 봤다면 M0 핵심(L1 게이트)을 내가 검증한 것.
> → 주간 체크리스트 `W01`의 **"나" 열**을 채운다(환경=`svcheck`/`read`, 날짜).

---

## 실행 시뮬레이터 (실제 동작 볼 때)
컴파일이 통과해도 "돌리면 맞는지"는 별개다. 무료 옵션:
- **Vivado xsim** (AMD) — 무료, Windows, **UVM 공식 지원**(UG900). 집 1순위.
- 회사 **VCS/Questa** — 무거운 regression·coverage.

> ⚠️ DSim(과거 무료 후보)은 Siemens 인수 후 무료 Cloud 라인이 정리되어 제외.

:::gotcha
**svcheck PASS ≠ 테스트 통과.** 컴파일 게이트는 "문법·타입·연결이 맞다"까지만 보증한다. null 핸들
역참조, objection 누수로 인한 hang, scoreboard mismatch 같은 **런타임 문제는 시뮬레이터에서만** 드러난다.
"컴파일 됐으니 됐다"는 검증의 흔한 착각.
:::

:::tip
**표준 문서는 무료다.** SystemVerilog(IEEE 1800)와 UVM(IEEE 1800.2)은 Accellera 후원으로 IEEE GET
프로그램에서 무료 다운로드된다. 막히는 정의는 추측 말고 표준의 해당 §를 펴라 — 그게 기초를 권위로 만든다.
:::

```check
Q: pyslang(컴파일러)과 시뮬레이터의 역할 차이는?
A: pyslang은 코드를 **읽고 검사**한다 — 문법·타입·elaboration(연결). 실행은 안 한다(0 time). 시뮬레이터는 코드를 **실제로 돌려** randomize 값·phase 진행·파형 등 시간에 따른 동작을 본다. svcheck로 빠르게 거르고, 통과한 것만 시뮬레이터로 확인한다.
H: 읽고 검사 vs 돌려서 관찰
```

```check
Q: svcheck가 내 코드만이 아니라 uvm-core 소스도 함께 컴파일해야 하는 이유는?
A: 내 코드가 `uvm_component` 등 UVM 클래스를 상속/사용하므로, 컴파일러가 그 정의를 알아야 검사할 수 있다. 그 정의는 Accellera uvm-core 소스에 있고, 순수 컴파일러(slang)는 UVM을 내장하지 않으므로 소스를 직접 줘야 한다.
H: `uvm_driver`가 무엇인지 컴파일러가 어떻게 아나
```

```check
Q: M0 LAB에서 정상 코드 PASS만 보지 않고, 일부러 오타를 내 FAIL까지 확인하는 이유는?
A: PASS 하나만으로는 게이트가 "무조건 PASS하는 깡통"인지 진짜 검사하는 도구인지 구분 못 한다. 일부러 틀린 코드가 **FAIL + 정확한 위치(줄:열)** 로 잡히는 걸 봐야 게이트가 실제로 동작함을 증명할 수 있다. (음성 대조군 = negative control.)
H: PASS만 보면 무엇을 증명 못 하나
```
