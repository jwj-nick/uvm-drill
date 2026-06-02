# Command-line 인자

:::tldr
재컴파일 없이 런타임에 동작을 바꾸는 `+UVM_*` 플래그 모음. 회귀·디버깅의 핵심.
:::

## 테스트 선택 / verbosity

```
+UVM_TESTNAME=my_test
+UVM_VERBOSITY=UVM_HIGH
+uvm_set_verbosity=<comp>,<id>,<verbosity>,<phase>
+uvm_set_verbosity=uvm_test_top.env.agt.drv,_ALL_,UVM_DEBUG,run
```

## 종료 / 에러 제어

```
+UVM_MAX_QUIT_COUNT=10          # error 10개면 중단
+UVM_TIMEOUT=10ms,YES           # 전역 timeout
```

## factory override (코드 없이)

```
+uvm_set_type_override=bus_driver,err_bus_driver
+uvm_set_inst_override=bus_driver,err_bus_driver,uvm_test_top.env.agt.drv
```

## config 주입

```
+uvm_set_config_int=uvm_test_top.env.agt,is_active,1
+uvm_set_config_string=uvm_test_top,mode,"fast"
```

## 디버그 trace

```
+UVM_CONFIG_DB_TRACE            # config_db set/get 추적
+UVM_OBJECTION_TRACE           # raise/drop 추적
+UVM_PHASE_TRACE               # phase 진행
+UVM_RESOURCE_DB_TRACE
```

## 시드 (시뮬레이터별)

```
+ntb_random_seed=12345          # (VCS)
-svseed 12345                   # (Questa)
```

:::tip
회귀 인프라는 보통 `+UVM_TESTNAME`과 시드만 바꿔가며 같은 바이너리를 수백 번 돌립니다. 그래서 test 선택을 하드코딩하지 않고 플래그로 빼는 게 중요(Part 5).
:::

```check
Q: 코드를 수정/재컴파일하지 않고 특정 driver를 에러 주입 버전으로 바꾸는 런타임 플래그는?
A: `+uvm_set_type_override=<original>,<override>` (예: `+uvm_set_type_override=bus_driver,err_bus_driver`). 특정 인스턴스만 바꾸려면 `+uvm_set_inst_override=...,<path>`. factory override를 커맨드라인에서 거는 것.
H: set_type_override의 CLI 버전
```

```check
Q: "config_db로 넣은 vif가 driver에서 null"일 때 켜면 가장 도움이 되는 플래그는?
A: `+UVM_CONFIG_DB_TRACE`. 모든 set/get을 키와 함께 출력해, set이 저장한 경로/타입과 get이 조회한 경로/타입의 불일치(또는 타이밍 문제)를 즉시 드러낸다.
```
