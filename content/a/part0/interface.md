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

:::gotcha
clocking block을 통하지 않고 interface 신호에 **직접** `vif.paddr <= ...` 하면 race가 생깁니다. driver는 항상 `vif.cb.paddr <= ...` 처럼 clocking block 핸들을 통해 구동하세요.
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
