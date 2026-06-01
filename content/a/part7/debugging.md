# UVM 디버깅

:::tldr
- UVM 환경의 "안 보이는" 문제(생성 안 됨, 연결 안 됨, config 안 옴, 안 끝남)를 진단하는 내장 도구들.
- topology print, factory print, config_db dump, objection trace가 4대 무기.
- 대부분 **플래그 하나**로 켜진다 — 코드 수정 없이.
:::

## topology / factory / config

```sv
// build/connect 후 계층 출력
uvm_top.print_topology();
factory.print();                 // 등록된 타입 + override 목록

// config_db 추적
uvm_config_db#(int)::dump();
```

플래그:

```
+UVM_CONFIG_DB_TRACE            # 모든 set/get 추적 (config 안 옴 디버깅)
+UVM_OBJECTION_TRACE           # raise/drop 추적 (안 끝남 디버깅)
+UVM_PHASE_TRACE               # phase 진행 추적
+UVM_RESOURCE_DB_TRACE
```

## 증상 → 도구 매핑

| 증상 | 1순위 도구 |
|---|---|
| 컴포넌트가 없다/엉뚱한 타입 | `factory.print()`, `print_topology()` |
| vif/cfg가 null | `+UVM_CONFIG_DB_TRACE` |
| 시뮬이 안 끝난다(hang) | `+UVM_OBJECTION_TRACE` |
| 0 time에 끝난다 | objection 누락 — trace 확인 |
| phase가 안 넘어간다 | `+UVM_PHASE_TRACE`, heartbeat |
| transaction 안 옴 | port connect 확인(topology), get_next_item/item_done |

## transaction 출력

```sv
`uvm_info("DRV", t.sprint(), UVM_HIGH)     // field 자동화 기반 보기 좋은 출력
`uvm_info("DRV", t.convert2string(), UVM_LOW)
```

## verbosity 빠른 토글

```
+UVM_VERBOSITY=UVM_HIGH
+uvm_set_verbosity=env.apb_agt.drv,_ALL_,UVM_DEBUG,time,0
```

:::gotcha
"vif가 null"의 99%는 config_db set/get **경로나 타입 불일치**입니다. `+UVM_CONFIG_DB_TRACE`를 켜면 set이 어떤 키로 저장됐고 get이 어떤 키로 조회했는지 나란히 보여 즉시 원인이 드러납니다.
:::

:::tip
새 환경을 처음 띄울 때 `print_topology()`를 한 번 찍어보세요. 컴포넌트 트리·연결이 의도대로인지 한눈에 확인되어, 잘못된 build/connect를 초기에 잡습니다.
:::

```check
Q: 시뮬레이션이 끝나지 않고 멈춰 있다. 가장 먼저 켤 디버그 플래그와 그 이유는?
A: `+UVM_OBJECTION_TRACE`. 누가 objection을 raise하고 아직 drop하지 않았는지 추적해, drop을 빠뜨린 컴포넌트/시퀀스를 바로 찾는다. (반대로 0 time에 끝나면 raise 누락을 같은 트레이스로 확인.)
H: 안 끝남 = objection 문제
```

```check
Q: driver에서 virtual interface가 null로 잡힌다. 원인 후보와 진단 도구는?
A: 원인은 대개 config_db의 set/get **경로 또는 타입 불일치**다. `+UVM_CONFIG_DB_TRACE`로 set이 저장한 키와 get이 조회한 키/타입을 비교하면 즉시 드러난다. (set이 get보다 늦게 실행된 타이밍 문제도 함께 확인.)
```
