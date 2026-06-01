# TLM 1.0 Ports

:::tldr
- TLM = 컴포넌트끼리 **transaction 단위**로 통신하는 표준 인터페이스. 느슨한 결합 → 재사용.
- **port**(요청하는 쪽) — **export**(서비스 제공) — **imp**(실제 구현). 1:1 연결.
- monitor→scoreboard 같은 broadcast는 **analysis_port → analysis_imp**(1:多, non-blocking).
:::

## port / export / imp

```mermaid
flowchart LR
  A["producer<br/>uvm_blocking_put_port"] -->|connect| B["consumer<br/>uvm_blocking_put_imp"]
  B --> IMP["put() 실제 구현"]
```

- **port**: "나는 put/get을 호출하고 싶다"(호출자).
- **imp**: "내가 put/get을 실제로 구현한다"(피호출자, implementation).
- **export**: 하위 imp를 상위로 노출(중계).

```sv
// consumer가 put을 구현
class consumer extends uvm_component;
  uvm_blocking_put_imp #(apb_txn, consumer) put_export;
  function void build_phase(uvm_phase phase);
    put_export = new("put_export", this);
  endfunction
  task put(apb_txn t);   // imp가 요구하는 메서드 이름
    `uvm_info("CONS", t.convert2string(), UVM_LOW)
  endtask
endclass

// producer가 port로 호출
class producer extends uvm_component;
  uvm_blocking_put_port #(apb_txn) put_port;
  task run_phase(uvm_phase phase);
    apb_txn t = apb_txn::type_id::create("t");
    put_port.put(t);   // consumer.put 실행
  endtask
endclass

// connect
prod.put_port.connect(cons.put_export);
```

## blocking vs non-blocking

| | blocking | non-blocking |
|---|---|---|
| 예 | `put`/`get`/`peek` | `try_put`/`can_put` |
| 시간 | 소비 가능(완료까지 대기) | 0 time, 성공 여부 반환 |

## analysis port — broadcast (1:多)

monitor는 관측한 transaction을 **여러 구독자**(scoreboard, coverage)에 동시에 뿌립니다. analysis_port는 non-blocking이며 연결된 imp 수에 상관없이 `write()`를 호출.

```sv
// monitor
uvm_analysis_port #(apb_txn) ap;
ap = new("ap", this);
ap.write(t);            // 연결된 모든 imp의 write() 호출 (0개여도 OK)

// scoreboard
uvm_analysis_imp #(apb_txn, scoreboard) analysis_export;
function void write(apb_txn t); /* 비교 */ endfunction

// connect (1:多 가능)
mon.ap.connect(scb.analysis_export);
mon.ap.connect(cov.analysis_export);
```

## analysis_fifo

write를 받아 큐잉했다가 get으로 꺼내고 싶을 때:

```sv
uvm_tlm_analysis_fifo #(apb_txn) fifo;
mon.ap.connect(fifo.analysis_export);
// 소비측: fifo.get(t);
```

:::gotcha
`put_port`는 정확히 **하나의** imp에만 연결됩니다(1:1). 여러 곳에 뿌리려면 `analysis_port`(1:多)를 쓰세요. 반대로 analysis_port는 응답/backpressure가 없습니다(non-blocking, fire-and-forget).
:::

```check
Q: monitor가 scoreboard와 coverage collector **양쪽**에 transaction을 보내려면 어떤 TLM을 쓰나? 그 이유는?
A: `uvm_analysis_port`(→ 각 구독자의 `uvm_analysis_imp`). analysis_port는 1:多 broadcast이고 non-blocking이라, 연결된 구독자 수에 무관하게 `write()`로 동시에 뿌릴 수 있다. 일반 put_port는 1:1이라 부적합.
H: 1:多 + fire-and-forget
```

```check
Q: TLM에서 port, export, imp의 역할을 한 줄씩으로?
A: **port** = 메서드를 호출하는 쪽(요청자). **imp**(implementation) = 그 메서드를 실제로 구현하는 쪽(제공자). **export** = 하위 컴포넌트의 imp를 상위 계층으로 중계·노출. port는 궁극적으로 imp에 연결된다.
```
