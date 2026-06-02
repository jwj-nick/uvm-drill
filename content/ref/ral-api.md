# RAL API 요약

:::tldr
frontdoor=버스, backdoor=HDL. mirror=예상 현재값. 주요 메서드: write/read/peek/poke/mirror/update.
:::

## 접근 메서드

| 메서드 | 설명 |
|---|---|
| `reg.write(status, value)` | frontdoor write, mirror 갱신 |
| `reg.read(status, value)` | frontdoor read |
| `reg.write(status, v, UVM_BACKDOOR)` | backdoor write(0 time) |
| `reg.peek(status, value)` | backdoor read |
| `reg.poke(status, value)` | backdoor write |
| `reg.mirror(status, UVM_CHECK)` | mirror vs HW 비교 |
| `reg.update(status)` | desired≠mirror면 write |
| `reg.predict(value)` | mirror 강제 설정 |
| `reg.get()` / `reg.get_mirrored_value()` | desired / mirror 읽기(버스 없음) |
| `reg.reset()` | 모델을 reset value로 |

## field 단위

```sv
reg_model.CTRL.enable.write(status, 1);
val = reg_model.CTRL.mode.get();
```

## 모델 구성 (build)

```sv
field.configure(parent_reg, size, lsb_pos, access, volatile, reset, has_reset, is_rand, individually_accessible);
reg.configure(parent_block, hdl_path);
map = create_map(name, base, n_bytes, endian);
map.add_reg(reg, offset, access);
add_hdl_path_slice(rtl_signal, lsb, size);   // backdoor
lock_model();
```

## built-in sequences

| 시퀀스 | 검사 |
|---|---|
| `uvm_reg_hw_reset_seq` | reset value |
| `uvm_reg_bit_bash_seq` | bit별 접근정책 |
| `uvm_reg_access_seq` | front vs backdoor 일치 |
| `uvm_mem_walk_seq` | 메모리 walking |

:::gotcha
`write`/`read`(frontdoor)는 시간 소비 + 프로토콜 검증. `peek`/`poke`(backdoor)는 0 time + 버스 우회(부작용 검증 불가). 목적에 맞게 선택(Part 6).
:::

```check
Q: `reg.mirror(status, UVM_CHECK)`는 무엇을 하나?
A: 레지스터를 HW에서 읽어(frontdoor 또는 backdoor) 모델의 mirror(예상 현재값)와 **자동 비교**한다. 불일치면 에러를 낸다. 별도 레지스터 scoreboard 없이 정합성을 검증하는 핵심 API.
H: 읽어서 예상값과 대조
```
