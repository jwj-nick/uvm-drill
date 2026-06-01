# Sequence Item / Transaction

:::tldr
- sequence_item = DUT에 가할 **한 건의 트랜잭션**(주소/데이터/방향 등)을 담는 데이터 객체.
- `uvm_sequence_item`을 extends, `rand` 필드 + constraint + field 자동화.
- driver가 이 item을 받아 핀-레벨로 변환한다. 응답이 필요하면 같은 item에 결과를 채워 돌려보낸다.
:::

## 정의

```sv
class apb_txn extends uvm_sequence_item;
  rand bit [31:0] addr;
  rand bit [31:0] data;     // write data 또는 read 결과
  rand bit        is_write;
  bit             slverr;   // DUT 응답(랜덤 아님)

  constraint c_align { addr[1:0] == 2'b00; }     // word aligned

  `uvm_object_utils_begin(apb_txn)
    `uvm_field_int(addr,     UVM_ALL_ON)
    `uvm_field_int(data,     UVM_ALL_ON)
    `uvm_field_int(is_write, UVM_ALL_ON)
    `uvm_field_int(slverr,   UVM_ALL_ON | UVM_NOCOMPARE)
  `uvm_object_utils_end

  function new(string name="apb_txn"); super.new(name); endfunction

  function string convert2string();
    return $sformatf("%s addr=%0h data=%0h", is_write?"WR":"RD", addr, data);
  endfunction
endclass
```

## request vs response

같은 item을 양방향으로 쓰는 게 일반적입니다. read의 경우 driver가 `data`/`slverr`를 채워 `item_done(rsp)`로 돌려줍니다(다음 챕터).

## 좋은 transaction 설계

- **추상화 레벨**: 핀이 아니라 "의미 단위"(한 번의 read/write, 한 burst). 핀 토글은 driver의 일.
- **constraint를 item에**: 항상 참이어야 하는 규칙(word align)은 item에, 시나리오별 제약은 sequence에.
- **convert2string**: 로그 가독성 핵심.

:::gotcha
transaction에 `virtual interface`나 시간 소비 코드를 넣지 마세요. item은 **순수 데이터**입니다. "어떻게 핀을 흔드나"는 driver, "무엇을 보내나"는 item — 역할 분리가 재사용의 기반.
:::

:::analogy
sequence_item = 택배 송장(받는 주소, 내용물, 착불 여부). 트럭(driver)이 송장을 보고 실제 배송(핀 토글)을 한다. 송장에 "트럭 모는 법"을 적지 않는다.
:::

```check
Q: transaction(sequence_item)에 절대 넣지 말아야 할 것과, 그 이유는?
A: virtual interface 접근이나 시간 소비(핀 토글) 코드. item은 "무엇을 보낼지"를 담는 **순수 데이터**이고, "어떻게 핀으로 구동할지"는 driver의 책임이다. 둘을 섞으면 재사용성과 추상화가 깨진다.
H: 무엇 vs 어떻게
```

```check
Q: "항상 참이어야 하는 제약"(예: word-align)과 "이 테스트에서만의 제약"은 각각 어디에 두나?
A: 항상 참인 규칙은 **sequence_item의 constraint**에, 특정 시나리오 제약은 **sequence**에서 인라인(`randomize() with`)으로 둔다. 그래야 item은 어디서나 재사용되고 sequence가 시나리오를 특화한다.
```
