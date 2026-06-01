# Reporting & Verbosity

:::tldr
- `uvm_info / uvm_warning / uvm_error / uvm_fatal` 4종. error는 카운트되고, fatal은 즉시 종료.
- **verbosity**(UVM_LOW/MEDIUM/HIGH/DEBUG)로 출력량을 런타임에 조절 → 코드 수정 없이 로그 상세도 변경.
- `uvm_info`의 verbosity는 "이 메시지의 중요도"이고, 시뮬의 verbosity 임계값보다 같거나 낮아야 출력된다.
:::

## 4종 매크로

```sv
`uvm_info("DRV",  $sformatf("driving addr=%0h", t.addr), UVM_MEDIUM)
`uvm_warning("CFG", "unusual config detected")
`uvm_error("SCB", $sformatf("mismatch exp=%0h act=%0h", e, a))
`uvm_fatal("NOVIF", "virtual interface not set")   // 즉시 $finish
```

| 매크로 | 카운트 | 시뮬 중단 | 용도 |
|---|---|---|---|
| uvm_info | - | - | 정보/디버그 |
| uvm_warning | warning++ | - | 의심스럽지만 진행 가능 |
| uvm_error | error++ | - | 실패(누적, 임계 초과 시 중단) |
| uvm_fatal | - | 즉시 | 진행 불가 |

## verbosity

```sv
`uvm_info("ID", "msg", UVM_HIGH)   // 상세 로그. 기본 임계값(MEDIUM)에선 안 보임
```

런타임 조절:

```
+UVM_VERBOSITY=UVM_HIGH                       # 전역
```

```sv
// 코드에서 특정 컴포넌트만
set_report_verbosity_level_hier(UVM_HIGH);
uvm_top.set_report_verbosity_level_hier(UVM_DEBUG);
```

verbosity 레벨: `UVM_NONE(0) < UVM_LOW(100) < UVM_MEDIUM(200) < UVM_HIGH(300) < UVM_FULL(400) < UVM_DEBUG(500)`. 메시지의 verbosity가 임계값 **이하**면 출력.

## error 임계값과 종료

```sv
set_report_max_quit_count(10);   // error 10개면 중단
```

`+UVM_MAX_QUIT_COUNT=10` 으로도 설정.

:::gotcha
`uvm_error`는 시뮬을 멈추지 않습니다(누적만). "왜 에러가 떴는데 계속 돌지?"는 정상 — 임계(max_quit_count)에 도달해야 멈춥니다. 즉시 멈춰야 하는 치명적 상황은 `uvm_fatal`.
:::

:::tip
메시지 ID(`"DRV"`, `"SCB"`)를 일관되게 쓰면 ID별로 verbosity/action을 조절할 수 있습니다: `set_report_id_verbosity("DRV", UVM_HIGH)`.
:::

```check
Q: `uvm_info(..., UVM_HIGH)`로 찍었는데 로그에 안 보인다. 이유와 해결은?
A: 시뮬의 verbosity 임계값이 기본 UVM_MEDIUM이라, 그보다 상세한 UVM_HIGH 메시지는 필터링된다. `+UVM_VERBOSITY=UVM_HIGH`(또는 set_report_verbosity_level_hier)로 임계값을 올리면 보인다.
H: 메시지 중요도 vs 시뮬 임계값
```

```check
Q: uvm_error와 uvm_fatal의 동작 차이는?
A: `uvm_error`는 에러 카운트를 1 증가시키고 **계속 진행**한다(max_quit_count 도달 시에만 중단). `uvm_fatal`은 즉시 `$finish`로 시뮬을 종료한다. 진행 자체가 불가능한 상황(vif null 등)에만 fatal을 쓴다.
```
