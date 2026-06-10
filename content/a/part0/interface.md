# Interface & Clocking Block

:::tldr
- **interface** = 신호 묶음 + 방향(modport) + 타이밍(clocking block)을 하나로 캡슐화한 SV 구조물.
- **clocking block** = "이 신호들을 어느 clock의 어느 edge에서 샘플/드라이브하라"를 규정 → race condition 제거.
- UVM driver/monitor가 DUT 핀에 닿는 **유일한 통로**가 바로 virtual interface(다음 챕터) → 그래서 interface를 먼저 제대로 알아야 한다.
:::

## 왜 interface인가

테스트벤치가 DUT와 수십 개의 신호로 연결될 때, 포트를 하나하나 나열하면 연결 실수가 나고 재사용이 안 됩니다. `interface`는 이 신호 다발을 **이름 하나로** 묶습니다.

```sv
interface apb_if (input logic pclk, input logic presetn);
  logic [31:0] paddr;
  logic        psel;
  logic        penable;
  logic        pwrite;
  logic [31:0] pwdata;
  logic [31:0] prdata;
  logic        pready;
  logic        pslverr;
endinterface
```

DUT와 TB는 이제 `apb_if`라는 한 덩어리로 연결됩니다.

## modport — 방향 캡슐화

같은 interface라도 DUT 입장과 TB 입장에서 신호 방향이 반대입니다. `modport`가 이를 정의합니다.

```sv
interface apb_if (input logic pclk, input logic presetn);
  logic [31:0] paddr; logic psel, penable, pwrite;
  logic [31:0] pwdata, prdata; logic pready, pslverr;

  modport dut (input paddr, psel, penable, pwrite, pwdata,
               output prdata, pready, pslverr);
  modport tb  (output paddr, psel, penable, pwrite, pwdata,
               input  prdata, pready, pslverr);
endinterface
```

## clocking block — 타이밍 + race-free 샘플링

클래스 기반 TB의 고질병은 **clock edge와 동시에** 신호를 읽으면 0/1이 들쭉날쭉(race)하는 것입니다. clocking block은 샘플/드라이브 시점을 못 박습니다.

```sv
interface apb_if (input logic pclk, input logic presetn);
  logic [31:0] paddr; logic psel, penable, pwrite;
  logic [31:0] pwdata, prdata; logic pready, pslverr;

  clocking cb @(posedge pclk);
    default input #1step output #1ns;   // 입력은 edge 직전값, 출력은 edge 후 1ns
    output paddr, psel, penable, pwrite, pwdata;
    input  prdata, pready, pslverr;
  endclocking

  modport tb (clocking cb, input pclk, presetn);
endinterface
```

- `input #1step` : clock edge **직전**의 안정된 값을 샘플 → race 없음.
- `output #1ns` : edge 후 1ns에 구동 → hold 위반 회피.

### cb 동작을 좀 더 뜯어보기

cb의 핵심은 **두 개의 skew**입니다. 이 둘이 "TB가 신호를 읽고 쓰는 시점"을 DUT와 어긋나게 만들어 race를 없앱니다.

| 구문 | 의미 | 효과 |
|---|---|---|
| `input #1step` | clock edge **직전**(preponed region)의 값을 샘플 | DUT가 같은 edge에 갱신한 새 값이 아니라, edge 직전의 **확정된 값**을 읽음 |
| `output #1ns` | clock edge **후 1ns**에 구동 | DUT의 hold 시간을 침범하지 않고 안정적으로 driving |
| `input #0` | edge와 같은 시각에 샘플(비권장) | race 재발 위험 |

```sv
// driver / monitor에서의 사용
@(vif.cb);                 // posedge pclk 동기화
vif.cb.psel  <= 1;          // output → edge 후 1ns에 실제 반영
data = vif.cb.prdata;       // input  → edge 직전값 샘플
```

- `@(vif.cb)` 는 `@(posedge pclk)` 와 같되, cb의 skew 규칙이 함께 적용됩니다.
- `<=`(nonblocking) 로 구동하면 cb의 output skew를 타고 정확한 시점에 핀이 움직입니다.
- 읽기는 `vif.cb.prdata` 처럼 cb를 통해야 preponed 샘플(race-free)이 됩니다.

## clocking block, 항상 써야 하나?

결론부터: **동기 인터페이스의 기본값으로는 권장**되지만, "모든 신호에 항상"은 아닙니다. 진짜 목표는 cb 사용 자체가 아니라 **TB↔DUT race 제거**이고, cb는 그걸 이루는 가장 표준적인 한 도구일 뿐입니다.

**cb가 잘 맞는 경우 (권장)**
- APB/AHB 같은 **동기·edge-aligned 프로토콜**의 데이터/제어 신호.
- skew·샘플 시점을 인터페이스 한 곳에 모아 관리하고 싶을 때.

**cb를 강요하면 곤란한 경우 (직접 접근이 나음)**
- **비동기 신호** — interrupt, async reset, combinational handshake는 본질적으로 clock-synchronous가 아니라 cb에 억지로 넣으면 어색합니다. (그래서 IRQ/reset은 보통 별도 경로로 다룹니다 — Track B 참고)
- **첫 clock 이전 / reset 구간** — cb는 자기 clock edge에서만 활성이라 초기 구간 제어가 불편.
- **고주파·빠듯한 타이밍** — 고정 skew(`#1ns`)가 실제 RTL 타이밍과 안 맞을 수 있음.
- **파형 디버깅** — cb를 거친 신호는 skew만큼 밀려 보여 "실제 핀 값 vs cb 샘플값"이 헷갈릴 수 있음.

:::tip
한 인터페이스 안에서도 **섞어** 쓸 수 있습니다 — 동기 데이터/제어 신호는 cb를 통해, 비동기 신호(irq, async reset)는 cb 밖에서 직접 접근. "동기 신호는 cb, 비동기 신호는 직접"이 실무 기본 가이드입니다.
:::

:::gotcha
동기 신호를 cb를 통하지 않고 `vif.paddr <= ...` 처럼 **직접** 구동/샘플하면 race가 생기기 쉽습니다. 동기 프로토콜 신호는 `vif.cb.paddr <= ...` 처럼 cb 핸들을 통하세요. (단, async reset/irq 같은 비동기 신호는 예외 — 이들은 cb 밖에서 다룹니다.)
:::

:::analogy
interface는 멀티탭(여러 신호를 한 묶음), modport는 콘센트의 정해진 방향(플러그 모양), clocking block은 "정전 안 나게 정해진 박자에만 꽂고 빼라"는 규칙입니다.
:::

```check
Q: clocking block의 `default input #1step`가 막아주는 문제는 무엇인가?
A: clock edge와 동시에 신호를 읽을 때 발생하는 **read/write race condition**. `#1step`은 edge **직전**의 확정된 값을 샘플하게 하여, driver가 같은 edge에 구동한 새 값과 monitor가 읽는 값이 섞이는 것을 막는다.
H: 같은 시각에 쓰고 읽으면?
```

```check
Q: DUT용 modport와 TB용 modport에서 같은 신호의 방향이 반대인 이유는?
A: 한쪽이 구동(output)하면 다른 쪽은 수신(input)해야 하기 때문. 예) `paddr`는 TB가 output, DUT가 input. modport로 방향을 못 박아 잘못된 구동을 컴파일 단계에서 잡는다.
```

```check
Q: clocking block은 "모든 신호에 항상" 쓰는 것이 정답인가?
A: 아니다. cb의 목적은 그 자체가 아니라 **TB↔DUT race 제거**다. 동기·edge-aligned 신호(APB/AHB 데이터·제어)에는 기본값으로 권장되지만, **비동기 신호**(interrupt, async reset, combinational handshake)나 첫 clock 이전 구간은 cb에 억지로 넣으면 어색하므로 cb 밖에서 직접 다룬다. 한 인터페이스에서 동기 신호는 cb, 비동기 신호는 직접 — 섞어 쓰는 것이 실무 기본.
H: cb는 목적이 아니라 수단
```
