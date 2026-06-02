# 매크로 치트시트

:::tldr
빠른 참조용. 각 매크로의 출처/상세는 Track A 해당 챕터에.
:::

## 등록 (factory)

```sv
`uvm_component_utils(my_comp)              // component 등록
`uvm_object_utils(my_obj)                  // object 등록
`uvm_component_utils_begin(my_comp)        // + field 자동화
  `uvm_field_int(addr, UVM_ALL_ON)
`uvm_component_utils_end
`uvm_object_param_utils(my_obj#(W))        // 파라미터화 클래스
```

## field 자동화

| 매크로 | 용도 |
|---|---|
| `uvm_field_int(f, FLAG)` | 정수/벡터 |
| `uvm_field_enum(T, f, FLAG)` | enum |
| `uvm_field_object(f, FLAG)` | sub-object |
| `uvm_field_string(f, FLAG)` | string |
| `uvm_field_array_int(f, FLAG)` | dynamic array |
| `uvm_field_queue_object(f, FLAG)` | queue of object |
| `uvm_field_aa_int_string(f, FLAG)` | assoc array |

flags: `UVM_ALL_ON`, `UVM_NOCOMPARE`, `UVM_NOPACK`, `UVM_NOPRINT`, `UVM_HEX`, `UVM_DEC`.

## 리포트

```sv
`uvm_info("ID", "msg", UVM_MEDIUM)
`uvm_warning("ID", "msg")
`uvm_error("ID", "msg")
`uvm_fatal("ID", "msg")
```

verbosity: `UVM_NONE < UVM_LOW < UVM_MEDIUM < UVM_HIGH < UVM_FULL < UVM_DEBUG`.

## sequence 실행

```sv
`uvm_do(seq)                               // create+start_item+rand+finish_item
`uvm_do_with(seq, { addr == 0; })          // 인라인 제약
`uvm_do_on(seq, sequencer)                 // 특정 sequencer에
`uvm_do_on_with(seq, sqr, { ... })
`uvm_create(seq)  `uvm_send(seq)           // 분리 실행
`uvm_declare_p_sequencer(my_vseqr)         // p_sequencer 타입
```

## callback

```sv
`uvm_register_cb(my_driver, my_cb)
`uvm_do_callbacks(my_driver, my_cb, hook(this, t))
```

:::gotcha
field 자동화 매크로는 편하지만 reflection 오버헤드가 있습니다. 고성능 환경은 `do_copy`/`do_compare`를 직접 구현(Part 2 참고).
:::

```check
Q: `uvm_do`, `uvm_do_with`, `uvm_do_on`의 차이는?
A: `uvm_do(seq)`는 기본 sequencer에 create+randomize+전송. `uvm_do_with(seq, {제약})`는 인라인 제약을 추가. `uvm_do_on(seq, sqr)`는 지정한 sequencer에 올린다(virtual sequence에서 하위 sqr 지정에 사용).
H: 제약 추가 vs sequencer 지정
```
