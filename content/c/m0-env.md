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
