# Field Automation 매크로

:::tldr
- `uvm_field_*` 매크로로 필드를 등록하면 copy/compare/print/pack/record가 **자동** 구현된다.
- `uvm_object_utils_begin/end` 블록 안에 필드를 나열.
- 편하지만 **런타임 오버헤드**가 있어, 성능 민감하거나 복잡한 필드는 `do_copy`/`do_compare`를 직접 구현하는 추세.
:::

## 기본 사용

```sv
class bus_txn extends uvm_sequence_item;
  rand bit [31:0] addr;
  rand bit [31:0] data;
  rand bit        is_write;

  `uvm_object_utils_begin(bus_txn)
    `uvm_field_int(addr,     UVM_ALL_ON)
    `uvm_field_int(data,     UVM_ALL_ON)
    `uvm_field_int(is_write, UVM_ALL_ON | UVM_NOCOMPARE)
  `uvm_object_utils_end

  function new(string name="bus_txn"); super.new(name); endfunction
endclass
```

이제 공짜로:

```sv
bus_txn b = bus_txn::type_id::create("b");
b.copy(a);                 // 필드별 복사
if (!b.compare(a)) ...     // 필드별 비교
b.print();                 // 보기 좋은 출력
bit[] stream = b.pack();   // 직렬화
```

## flag

| flag | 효과 |
|---|---|
| UVM_ALL_ON | copy/compare/print/pack 모두 |
| UVM_NOCOMPARE | compare에서 제외 |
| UVM_NOPACK | pack에서 제외 |
| UVM_NOPRINT | print에서 제외 |
| UVM_DEC / UVM_HEX | print 진법 |

필드 종류별 매크로: `uvm_field_int`, `uvm_field_object`, `uvm_field_string`, `uvm_field_enum`, `uvm_field_array_int`, `uvm_field_queue_object` 등.

## 직접 구현(권장되는 큰 프로젝트)

```sv
function void do_copy(uvm_object rhs);
  bus_txn t; super.do_copy(rhs);
  $cast(t, rhs);
  addr = t.addr; data = t.data; is_write = t.is_write;
endfunction

function bit do_compare(uvm_object rhs, uvm_comparer comparer);
  bus_txn t; if (!$cast(t, rhs)) return 0;
  return super.do_compare(rhs, comparer)
       && addr == t.addr && data == t.data;
endfunction
```

:::gotcha
field 매크로는 reflection 기반이라 **느립니다**. transaction이 초당 수백만 개 흐르는 환경에선 비교/복사가 병목이 될 수 있어, 산업 현장에선 `do_copy`/`do_compare`/`do_print`를 손으로 짜는 경우가 많습니다. 학습·소규모엔 매크로가 편리.
:::

:::tip
`is_write` 같은 제어 필드를 비교에서 빼고 싶으면 `UVM_NOCOMPARE`. payload만 scoreboard 비교 대상으로 두는 식의 미세 조정에 유용.
:::

```check
Q: `uvm_field_int(addr, UVM_ALL_ON)`를 선언하면 어떤 메서드들이 자동 생성되나?
A: copy/clone, compare, print, pack/unpack, record 등이 그 필드를 포함해 자동 구현된다. 즉 직접 do_copy/do_compare를 짜지 않아도 transaction 복사·비교·출력이 동작한다.
H: copy/compare/print/pack
```

```check
Q: 대규모 고성능 환경에서 field 자동화 매크로 대신 do_copy/do_compare를 직접 구현하는 이유는?
A: field 매크로는 reflection(필드 메타데이터 순회) 기반이라 런타임 오버헤드가 크다. 초당 수많은 transaction을 처리할 때 비교/복사가 병목이 되므로, 직접 구현해 필요한 필드만 명시적으로 다루는 편이 빠르다.
```
