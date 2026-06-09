# OOP: class · 상속 · 다형성 (Polymorphism)

:::tldr
- UVM은 **클래스 기반(class-based)** 방법론이다. class·상속(inheritance)·virtual·다형성(polymorphism)·parameterization을 모르면 UVM 코드가 마법처럼 보인다.
- 핵심 4가지: **상속(inheritance)**`extends` · **다형성(polymorphism)**`virtual` + base handle · **캡슐화(encapsulation)**`local/protected` · **parameterization**`#(type)`.
- factory override가 "런타임에 타입을 바꾸는" 마법은 결국 **다형성(polymorphism)** 일 뿐이다.
:::

:::note 용어 빠른 정리 (한국어 ↔ English)
| 한국어 | English | 뜻 |
|---|---|---|
| 객체 | object | new()로 메모리에 생성된 실체 |
| 핸들 | handle | 객체를 가리키는 참조(≈pointer) |
| 속성/멤버 변수 | property / data member | class 안의 **변수** |
| 메서드 | method | class 안의 **function/task** |
| 상속 | inheritance | base를 확장(`extends`) |
| 다형성 | polymorphism | 같은 호출, 객체마다 다른 동작 |
| 재정의 | override | 자식이 부모 메서드를 다시 정의 |
| 캡슐화 | encapsulation | 접근 제어(`local/protected`) |
:::

## 0. 먼저 — object · handle · class · method

SV를 "코드는 쓰는데 언어로 배운 적은 없다" 싶으면 여기부터.

- **class** = 설계도(blueprint). **object(객체)** = 그 설계도로 `new()` 해서 만든 실체.
- **handle(핸들)** = 객체를 가리키는 **참조**(C의 pointer와 비슷, 단 산술은 없음). 변수 자체는 객체가 아니라 핸들이다. 생성 전엔 `null`.
- class 안의 **변수**는 **property(속성, = data member)**, class 안의 **function/task**는 **method(메서드, = member function/task)**.
  → 그래서 "class 내부 function을 method라고 부르나?" → **맞다.**
- **member(멤버)** = property와 method를 통칭. (`p.addr`도 멤버 접근, `p.print()`도 멤버 접근)

```sv
class packet;
  rand bit [7:0] addr;          // property (data member)
  rand bit [7:0] data;          // property
  function void print();        // method (member function)
    $display("addr=%0h data=%0h", addr, data);
  endfunction
endclass

packet p;          // handle — 아직 null (객체 없음)
p = new();         // 객체 생성(instantiate), 생성자 new() 호출
p.addr = 8'hA0;    // 멤버(property) 접근
p.print();         // 멤버(method) 호출
```

:::gotcha
`packet p;` 만으로는 객체가 없다(핸들만 null). `p = new();` 안 하고 `p.addr` 접근하면 **null handle dereference** 런타임 에러. RTL의 wire 선언과 다르다 — class는 **반드시 new()** 해야 실체가 생긴다.
:::

## 1. 상속 — extends (inheritance)

base class(부모, parent/superclass)를 확장해 derived class(자식, child/subclass)를 만든다. 재사용/특화.

```sv
class base_packet;
  rand bit [7:0] addr;
  virtual function void show();   // virtual!
    $display("base addr=%0h", addr);
  endfunction
endclass

class err_packet extends base_packet;   // base_packet 상속
  rand bit corrupt;                      // 필드 추가
  function void show();                  // override (재정의)
    super.show();                        // 부모 버전 호출도 가능
    $display("  + corrupt=%0b", corrupt);
  endfunction
endclass
```

- 자식은 부모의 property·method를 **물려받고**, 새로 **추가**하거나 기존을 **override(재정의)** 한다.
- `super.<member>` = 부모 버전 접근. `super.new()` = 부모 생성자 호출.

## 2. 다형성 — virtual + base handle (Polymorphism)

**polymorphism = "poly(여럿) + morph(형태)"**: *같은 호출이 객체의 실제 타입에 따라 다른 동작을 한다.*

**base handle로 derived 객체를 가리키고 virtual 메서드를 호출하면 derived 버전이 실행된다.** 이게 UVM 재사용의 심장.

```sv
base_packet bp;
err_packet  ep = new();
bp = ep;          // upcast: base handle이 derived 객체를 가리킴 (항상 안전)
bp.show();        // virtual라서 err_packet::show() 실행!
```

핵심은 **무엇을 보고 어느 버전을 부르나**:

| | 기준 | 시점 | 용어 |
|---|---|---|---|
| `virtual` **없음** | 핸들의 **선언 타입**(base) | 컴파일 타임 | static binding (정적 바인딩, early binding) |
| `virtual` **있음** | 객체의 **실제 타입**(derived) | 런타임 | dynamic dispatch (동적 디스패치, late binding) |

내부적으로 virtual 메서드는 객체마다 **vtable**(실제 타입의 함수 주소표)을 거쳐 호출되므로 런타임에 진짜 버전으로 점프한다. non-virtual은 컴파일 시점에 주소가 박힌다.

- **upcast** (derived→base): 자동·안전.
- **downcast** (base→derived): 안전하지 않아 `$cast(child, parent)` 로 런타임 체크 필요.

## 3. 왜 override가 필요한가? (이 페이지만으론 와닿지 않는 게 정상)

override 단독으론 "그래서?" 싶다. **payoff는 base handle로 일반화한 코드를 재사용할 때** 나온다:

- scoreboard/driver/base_test 같은 **공통 코드는 base 타입에 대고** 작성한다.
- 실제로는 프로젝트·테스트마다 다른 derived 객체를 끼워 넣고, **override한 부분만 다르게** 동작시킨다.
- 즉 *공통 코드는 한 번 쓰고, 차이는 override로*. copy-paste 재작성이 사라진다.

> 완전한 그림은 **Part 2 Factory**(런타임에 타입 바꿔치기)와 **Part 3 Sequences**에서 잡힌다. 지금은 "base handle + virtual + override = 나중에 갈아끼우기 위한 장치"로 받아두면 충분하다. 따라가다 보면 자연스레 연결된다.

:::gotcha
메서드에 `virtual`을 안 붙이면 호출이 **컴파일 타임 타입(base)으로 고정**된다. UVM 컴포넌트의 `build_phase`/`run_phase`/`do_compare`/`do_copy`가 전부 virtual인 이유 — 파생 클래스가 갈아끼울 수 있어야 하니까. (`virtual` 빠뜨리면 override가 조용히 무시된다.)
:::

:::analogy
다형성 = "리모컨(base handle)의 전원 버튼을 누르면 꽂혀 있는 기기(derived 객체)에 맞는 동작이 실행된다." 리모컨 코드는 그대로, 기기만 교체 → 이게 factory override. (codec 검증으로 치면: 같은 scoreboard 골격에 코덱별 비교 모델만 갈아끼우던 것과 같은 발상.)
:::

## 4. 캡슐화 — local / protected (Encapsulation)

```sv
class agent_cfg;
  local int unsigned secret;     // 이 class 안에서만 접근
  protected bit active;          // 이 class + 자식(derived)만 접근
  function void set_secret(int s); secret = s; endfunction   // 통제된 통로
endclass
```
- 기본은 public(접근 제한 없음). `local`/`protected`로 내부를 숨겨 의도치 않은 수정·결합을 막는다.

## 5. Parameterization — generic 재사용

타입/크기를 **파라미터로** 받아 하나의 generic 코드를 여러 곳에 재사용.

```sv
class fifo #(type T = int, int DEPTH = 16);
  T mem[$];                                  // T 타입의 queue
  function void push(T item);
    if (mem.size() < DEPTH) mem.push_back(item);
  endfunction
endclass

fifo #(packet, 32) pkt_fifo = new();   // packet 32-deep fifo
```
UVM의 `uvm_driver #(REQ)`, `uvm_sequencer #(REQ)` 가 모두 이 parameterization이다.

### `mem[$]` · `.size()` · `.push_back()` 은 뭔가?
- `T mem[$];` 의 `[$]` 는 **queue(큐)** 선언. SV 내장 가변 자료구조다.
- `.size()`, `.push_back()`, `.pop_front()` … 는 **queue의 built-in method(언어 내장 메서드)** — 사용자가 정의한 게 아니라 **SV 언어가 정의**해 둔 것. (member 맞다 — 단, 사용자 class 멤버가 아니라 *내장 타입의 메서드*)
- 비슷한 가변 자료구조 3종:
  - **queue** `q[$]` — 양끝 push/pop 빠름 (대기열/버퍼)
  - **dynamic array** `d[]` — `d = new[n]` 으로 크기 결정 (가변 payload)
  - **associative array** `a[key]` — 키 기반/희소 (주소→데이터 메모리 모델)

:::note SV 내장(built-in) 것들을 어떻게 아나? — 레퍼런스
"이런 예약된 것들"의 출처는 **IEEE 1800 LRM**(SystemVerilog 표준 문서)이다.
- **queue/array methods:** LRM §7.10(Queues), §7.12(Array manipulation methods) — `size, insert, delete, push_back/front, pop_back/front` 및 `find, find_index, unique, sum, min, max, sort, reverse, shuffle` 등.
- **빠른 참조(무료):** ChipVerify, Verification Academy, Doulos *SystemVerilog Golden Reference*, Sutherland HDL *SV Quick Reference*.
- **실무 팁:** 시뮬레이터 에러/경고가 메서드명을 알려주고, 에디터 자동완성(Verdi/Visualizer, VS Code SV 확장)이 내장 메서드 목록을 띄워준다.
:::

```check
Q: class 안의 변수와 함수는 각각 OOP 용어로 뭐라 부르나?
A: 변수 = **property(속성, data member)**, 함수/태스크 = **method(메서드, member function/task)**. 둘을 통칭해 **member(멤버)**.
H: `p.addr` vs `p.print()`
```

```check
Q: base handle로 derived 객체를 가리킨 뒤 메서드를 호출했더니 base 버전이 실행됐다. 무엇을 빠뜨렸나?
A: 메서드 선언의 **`virtual`**. 없으면 핸들의 컴파일 타임 타입(base)으로 **static binding**. `virtual`을 붙여야 런타임 객체 타입(derived)으로 **dynamic dispatch** 된다.
H: UVM 메서드가 죄다 virtual인 이유와 같다.
```

```check
Q: `mem[$]` 의 `.size()` / `.push_back()` 은 누가 정의한 것이며 무슨 타입의 메서드인가?
A: **SV 언어가 정의한 queue의 built-in method**(내장 메서드). 사용자 class 멤버가 아니라 내장 자료구조 타입(queue)의 메서드다. 출처는 IEEE 1800 LRM.
H: `[$]` 가 무슨 자료구조인지 떠올려라.
```

```check
Q: `uvm_driver #(my_item)` 에서 `#(my_item)` 은 OOP의 어떤 개념이고 왜 쓰나?
A: **Parameterization(파라미터화)**. driver가 다룰 transaction 타입을 타입 파라미터로 받아, 하나의 generic driver 코드를 여러 프로토콜에 재사용한다.
```
