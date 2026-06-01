# Adapter & Predictor

:::tldr
- **adapter**: reg 모델의 추상 read/write를 실제 버스 transaction(apb_txn)으로, 또 그 반대로 **변환**.
- **predictor**: 버스에서 관측된 transaction을 보고 reg 모델의 mirror를 **자동 갱신**(explicit prediction).
- adapter 없이는 모델이 버스에 닿을 수 없고, predictor가 있어야 backdoor/외부 접근도 mirror에 반영된다.
:::

## adapter

```sv
class apb_reg_adapter extends uvm_reg_adapter;
  `uvm_object_utils(apb_reg_adapter)
  function new(string n="apb_reg_adapter"); super.new(n); endfunction

  // reg op → bus txn
  virtual function uvm_sequence_item reg2bus(const ref uvm_reg_bus_op rw);
    apb_txn t = apb_txn::type_id::create("t");
    t.is_write = (rw.kind == UVM_WRITE);
    t.addr = rw.addr;
    t.data = rw.data;
    return t;
  endfunction

  // bus txn → reg op (read 결과 회수)
  virtual function void bus2reg(uvm_sequence_item bus_item, ref uvm_reg_bus_op rw);
    apb_txn t; $cast(t, bus_item);
    rw.kind   = t.is_write ? UVM_WRITE : UVM_READ;
    rw.addr   = t.addr;
    rw.data   = t.data;
    rw.status = t.slverr ? UVM_NOT_OK : UVM_IS_OK;
  endfunction
endclass
```

## 연결 (test/env)

```sv
function void connect_phase(uvm_phase phase);
  reg_model.map.set_sequencer(apb_agt.sqr, adapter);   // 모델 → APB sequencer + adapter
  // explicit predictor
  predictor.map     = reg_model.map;
  predictor.adapter = adapter;
  apb_agt.mon.ap.connect(predictor.bus_in);            // 관측 → 예측
endfunction
```

```mermaid
flowchart LR
  RM[reg model] -->|reg2bus| ADP[adapter] --> SQR[apb_sqr] --> DRV[apb_driver] --> DUT
  DUT --> MON[apb_monitor] --> PRED[uvm_reg_predictor]
  PRED -->|bus2reg| RM2[mirror 갱신]
```

## implicit vs explicit prediction

| | implicit | explicit(predictor) |
|---|---|---|
| 누가 mirror 갱신 | reg.write/read가 직접 | predictor가 관측 기반 |
| 외부/backdoor 접근 반영 | ✗ | ✓ |
| 권장 | 단순 | 정확(표준) |

:::gotcha
explicit predictor를 안 쓰면, 다른 sequence나 DUT 자체 동작으로 바뀐 레지스터가 mirror에 반영되지 않아 **거짓 mismatch**가 납니다. 버스를 공유하거나 W1C/RC 같은 부작용 레지스터가 있으면 predictor가 사실상 필수.
:::

```check
Q: reg adapter의 `reg2bus`와 `bus2reg`는 각각 무엇을 변환하나?
A: `reg2bus`는 reg 모델의 추상 연산(uvm_reg_bus_op: kind/addr/data)을 실제 버스 transaction(apb_txn)으로 변환한다. `bus2reg`는 반대로 버스 transaction을 reg 연산으로 변환해 read 결과/status를 모델로 회수한다.
H: 모델→버스, 버스→모델
```

```check
Q: explicit predictor가 필요한 상황은?
A: 레지스터가 reg.write/read 외의 경로로 바뀔 때 — 다른 master의 버스 접근, DUT 자체 동작, W1C/RC 등 부작용. predictor가 monitor 관측을 보고 mirror를 갱신하므로, 이런 변화가 반영되어 거짓 mismatch를 막는다.
```
