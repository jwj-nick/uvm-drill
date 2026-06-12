<!-- filename: content/c/m2-fifo-uvm.md · created 2026-06-12 -->
# M2 — 같은 FIFO를 UVM으로 이주

:::tldr
- M1의 순수 SV TB를 **UVM 컴포넌트로 단계 이주**한다. DUT는 그대로, TB만 UVM화.
- M1의 각 조각이 UVM의 무엇이 되는지 1:1로 매핑하며 UVM 기초~stimulus를 손으로 체득.
- 이것이 **Track B(이주)를 실제 코드로 해보는 것** — 개념(Track B)과 실습(여기)이 만난다.
:::

:::note 🚧 이 챕터는 만들며 채워진다
M1을 마친 뒤 착수. 실제 이주 과정·막힌 지점(특히 sequencer-driver handshake, config_db 전환)의 해법이 여기 기록된다.
:::

## 만들 것 — 이주 매핑 (M1 → M2)
| M1 (순수 SV) | M2 (UVM) |
|---|---|
| transaction class | `uvm_sequence_item` (+ field/utils) |
| generator | `uvm_sequence` |
| mailbox (gen→drv) | sequencer ↔ driver handshake (get_next_item/item_done) |
| driver | `uvm_driver #(txn)` |
| monitor | `uvm_monitor` + `analysis_port` |
| scoreboard | `uvm_scoreboard` + `analysis_export` |
| env 수동 연결 | `uvm_env` + connect_phase |
| top의 직접 실행 | `run_test()` + `uvm_test` |
| vif 직접 전달 | `uvm_config_db` |

- **검증 목표:** 이주 후 **M1과 동일한 self-check 결과** → 이주가 동작을 바꾸지 않았음을 증명.

## 이걸 위해 공부할 것 (study map)
- [Why UVM](#/a/part1/why-uvm) · [Class Hierarchy](#/a/part1/class-hierarchy) · [UVM Phases](#/a/part1/phases) · [Objections](#/a/part1/objections)
- [Factory & create()](#/a/part2/factory) · [Config DB](#/a/part2/config-db)
- [Sequence Item](#/a/part3/sequence-item) · [Driver–Sequencer Handshake](#/a/part3/driver-sequencer) · [Sequences](#/a/part3/sequences)
- [TLM 1.0 Ports](#/a/part4/tlm) · [Monitor](#/a/part4/monitor) · [Scoreboard](#/a/part4/scoreboard)
- **개념 대조:** [Track B · 매핑](#/b/mig/mapping)

```check
Q: 이주(M2)가 "성공"했다고 어떻게 확인하나?
A: 이주 후 TB가 M1과 **동일한 self-check 결과**(같은 자극에 0 mismatch)를 내면, UVM화가 동작을 바꾸지 않고 구조만 표준화했음이 증명된다. 리팩터링의 정당성은 "동작 불변"으로 확인한다.
H: 무엇이 바뀌면 안 되나
```
