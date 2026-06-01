# Scoreboard 패턴

:::tldr
- scoreboard = **expected vs actual**을 비교해 pass/fail을 내리는 최종 심판.
- expected는 reference model(또는 예측 함수)이 만들고, actual은 output monitor가 준다.
- 핵심 난점은 **순서**: in-order면 큐 매칭, out-of-order면 ID/주소 기반 연관 매칭.
:::

## 입력 받기 (analysis_imp)

여러 스트림(입력측/출력측)을 받을 땐 매크로로 이름 있는 imp를 만듭니다.

```sv
`uvm_analysis_imp_decl(_inp)
`uvm_analysis_imp_decl(_out)

class apb_scoreboard extends uvm_scoreboard;
  `uvm_component_utils(apb_scoreboard)
  uvm_analysis_imp_inp #(apb_txn, apb_scoreboard) inp_export;
  uvm_analysis_imp_out #(apb_txn, apb_scoreboard) out_export;

  apb_txn exp_q[$];   // 예상 큐 (또는 모델 메모리)

  function void write_inp(apb_txn t);   // 입력 관측 → 예상 갱신
    if (t.is_write) mem[t.addr] = t.data;          // ref model
    else begin apb_txn e = t; e.data = mem[t.addr]; exp_q.push_back(e); end
  endfunction

  function void write_out(apb_txn t);   // 출력 관측 → 비교
    apb_txn e = exp_q.pop_front();
    if (t.data !== e.data)
      `uvm_error("SCB", $sformatf("addr=%0h exp=%0h act=%0h", t.addr, e.data, t.data))
    else `uvm_info("SCB","MATCH", UVM_HIGH)
  endfunction
endclass
```

## in-order vs out-of-order

| | in-order | out-of-order |
|---|---|---|
| 매칭 | 큐 front끼리 | ID/tag/주소로 연관 |
| 자료구조 | queue | associative array(key=id) |
| 예 | 단순 버스 | AXI(여러 ID outstanding) |

out-of-order:

```sv
apb_txn exp_by_id[bit[3:0]];   // id로 인덱싱
function void write_out(axi_txn t);
  axi_txn e = exp_by_id[t.id];
  if (e == null) `uvm_error("SCB","unexpected id")
  else begin compare(e,t); exp_by_id.delete(t.id); end
endfunction
```

## end_of_test 검증 (check_phase)

```sv
function void check_phase(uvm_phase phase);
  if (exp_q.size() != 0)
    `uvm_error("SCB", $sformatf("%0d expected txns never matched", exp_q.size()))
endfunction
```

:::gotcha
시뮬 종료 시 **매칭 안 된 잔여 expected**를 반드시 check_phase에서 검사하세요. 안 그러면 "DUT가 응답을 누락"했는데도 통과로 보입니다. 큐가 비어 있어야 진짜 통과.
:::

:::tip
비교 전에 transaction을 **clone**해서 보관하세요. monitor가 같은 객체를 재사용하면(권장 안 함) 보관해 둔 expected가 덮어써질 수 있습니다.
:::

```check
Q: AXI처럼 여러 ID가 outstanding인 환경에서 in-order 큐 매칭이 깨지는 이유와 대안은?
A: 응답이 요청 순서와 다르게(out-of-order) 돌아오므로 front-to-front 큐 매칭이 틀린다. 대안은 **ID/tag(또는 주소)를 key로 한 associative array**에 expected를 저장하고, 응답이 오면 그 id로 연관 매칭한다.
H: 순서가 보장되지 않으면 무엇으로 짝을 찾나
```

```check
Q: scoreboard의 check_phase에서 꼭 확인해야 하는 것은?
A: 매칭되지 않고 남은 expected(잔여 큐/맵)가 0인지. 잔여가 있으면 DUT가 응답을 누락했다는 뜻이므로 에러. 이걸 검사하지 않으면 누락 버그가 "통과"로 잘못 보고된다.
```
