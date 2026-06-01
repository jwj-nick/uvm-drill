# OOP: class · 상속 · 다형성

:::tldr
- UVM은 **클래스 기반** 방법론이다. class/상속/virtual/다형성/parameterization을 모르면 UVM 코드가 마법처럼 보인다.
- 핵심 4가지: **상속**(extends), **다형성**(virtual + base handle), **캡슐화**(local/protected), **parameterization**(`#(type)`).
- factory override가 "런타임에 타입을 바꾸는" 마법은 결국 **다형성**일 뿐이다.
:::

## class와 handle

SV class는 동적 객체입니다. 변수는 객체 자체가 아니라 **handle**(포인터)입니다.

```sv
class packet;
  rand bit [7:0] addr;
  rand bit [7:0] data;
  function void print();
    $display("addr=%0h data=%0h", addr, data);
  endfunction
endclass

packet p;          // handle (null)
p = new();         // 객체 생성
p.addr = 8'hA0;
```

## 상속 — extends

base class를 확장해 재사용/특화합니다.

```sv
class base_packet;
  rand bit [7:0] addr;
  virtual function void show();   // virtual!
    $display("base addr=%0h", addr);
  endfunction
endclass

class err_packet extends base_packet;
  rand bit corrupt;
  function void show();           // override
    $display("err addr=%0h corrupt=%0b", addr, corrupt);
  endfunction
endclass
```

## 다형성 — virtual + base handle

**base handle로 derived 객체를 가리키고, virtual 메서드를 호출하면 derived 버전이 실행됩니다.** 이게 UVM 재사용의 심장입니다.

```sv
base_packet bp;
err_packet  ep = new();
bp = ep;          // base handle이 derived 객체를 가리킴 (upcasting)
bp.show();        // virtual라서 err_packet::show() 실행!
```

:::gotcha
메서드에 `virtual`을 붙이지 않으면 **컴파일 타임 타입**(base)으로 호출이 고정됩니다. UVM 컴포넌트의 `build_phase`, `run_phase`, `do_compare` 등이 전부 virtual인 이유 — 파생 클래스가 갈아끼울 수 있어야 하기 때문.
:::

## 캡슐화 — local / protected

```sv
class agent_cfg;
  local int unsigned secret;          // 외부 접근 불가
  protected bit active;               // 자식만 접근
  function void set_secret(int s); secret = s; endfunction
endclass
```

## Parameterization — generic 재사용

```sv
class fifo #(type T = int, int DEPTH = 16);
  T mem[$];
  function void push(T item);
    if (mem.size() < DEPTH) mem.push_back(item);
  endfunction
endclass

fifo #(packet, 32) pkt_fifo;   // packet 32-deep fifo
```

UVM의 `uvm_driver #(REQ)`, `uvm_sequencer #(REQ)` 가 모두 이 parameterization입니다.

:::analogy
다형성 = "리모컨(base handle)의 전원 버튼을 누르면, 꽂혀 있는 기기(derived 객체)에 맞는 동작이 실행된다." 리모컨은 바꾸지 않고 기기만 교체 → factory override.
:::

```check
Q: base handle로 derived 객체를 가리킨 뒤 메서드를 호출했더니 base 버전이 실행됐다. 무엇을 빠뜨렸나?
A: 메서드 선언에 **`virtual`** 키워드. virtual이 없으면 호출이 핸들의 컴파일 타임 타입(base)으로 정적 바인딩된다. virtual을 붙여야 런타임 객체 타입(derived)으로 dynamic dispatch 된다.
H: UVM 메서드가 죄다 virtual인 이유와 같다.
```

```check
Q: `uvm_driver #(my_item)`에서 `#(my_item)`은 OOP의 어떤 개념인가? 왜 필요한가?
A: **Parameterization(파라미터화)**. driver가 어떤 transaction 타입을 다룰지를 타입 파라미터로 받아 하나의 generic driver 코드를 여러 프로토콜에 재사용한다.
```
