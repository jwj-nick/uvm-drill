# Reporting & Verbosity

:::tldr
- `uvm_info / uvm_warning / uvm_error / uvm_fatal` 4종. error는 카운트되고, fatal은 즉시 종료.
- **severity**(심각도: 4종 중 무엇)와 **verbosity**(상세도: info를 얼마나 보여줄지)는 **다른 축**이다.
- verbosity(UVM_LOW/MEDIUM/HIGH/…)로 출력량을 런타임에 조절 → 코드 수정 없이 로그 상세도 변경.
- severity별 **action**(카운트/종료/로그)도 런타임에 바꿀 수 있다 — 에러 주입 테스트의 demote가 대표 활용.
:::

:::note 용어 빠른 정리 (한국어 ↔ English)
| 한국어 | English | 뜻 |
|---|---|---|
| 심각도 | severity | info / warning / error / fatal 구분 |
| 상세도 | verbosity | info 메시지의 필터 레벨 (LOW~DEBUG) |
| 동작 | action | 메시지 처리 방식 (DISPLAY/COUNT/EXIT…) |
| 메시지 ID | message ID | 첫 인자 문자열("DRV") — 필터/추적 단위 |
| 강등/승격 | demote / promote | error→warning 등 severity 바꾸기 |
:::

## 0. 먼저 — 왜 $display를 안 쓰나

`$display`도 출력은 된다. 하지만 UVM reporting을 쓰는 순간 메시지마다 다음이 공짜로 붙는다:

- **누가**(계층 경로 `uvm_test_top.env.agt.drv`) **언제**(시뮬 시간) 찍었는지 자동 기록
- **ID·severity·verbosity 기반 필터링** — 재컴파일 없이 런타임 스위치로 켜고 끔
- **error 카운트와 종료 정책** 연동 — 회귀(regression)에서 pass/fail 판정의 근거

회귀 수백 개를 돌리는 환경에서 "로그를 구조화된 데이터로 다루는" 인프라다. TB 코드에서 `$display`는 사실상 금지 관습이라고 생각하면 된다.

가장 헷갈리는 것부터 분리하자 — **severity와 verbosity는 다른 축이다**:

| 축 | 질문 | 값 |
|---|---|---|
| severity | 이 메시지는 *무엇*인가 | info / warning / error / fatal |
| verbosity | (info에 한해) *얼마나 상세한* 정보인가 | NONE(0)~LOW(100)~MEDIUM(200)~HIGH(300)~FULL(400)~DEBUG(500) |

**verbosity 필터는 info에만 적용된다.** warning/error/fatal은 verbosity 인자 자체가 없다 — 항상 나온다(action으로만 제어).

## 1. 4종 매크로

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

ID("DRV", "SCB")는 아무 문자열이지만 **일관된 체계**(컴포넌트 약어 또는 기능 단위)로 — ID 단위로 verbosity/action을 조절하고 로그를 grep하는 단위가 된다.

## 2. verbosity

```sv
`uvm_info("ID", "msg", UVM_HIGH)   // 상세 로그. 기본 임계값(MEDIUM)에선 안 보임
```

메시지의 verbosity가 임계값 **이하**면 출력. 즉 숫자가 낮을수록 중요한 메시지다(LOW = "거의 항상 보여라").

런타임 조절:

```
+UVM_VERBOSITY=UVM_HIGH                       # 전역 (재컴파일 불필요)
```

```sv
// 코드에서 특정 컴포넌트 계층만
env.agt.set_report_verbosity_level_hier(UVM_HIGH);
// 특정 ID만
set_report_id_verbosity("DRV", UVM_HIGH);
```

실무 운용 감각: 평소 회귀는 MEDIUM(로그 크기·속도), 디버그 들어갈 때 해당 컴포넌트만 HIGH/DEBUG로. **"필요할 때 켤 수 있게 충분히 심어두고, 평소엔 잠가두는"** 게 verbosity 설계다.

## 3. action — 메시지가 일으키는 일

severity마다 기본 action이 묶여 있다: `UVM_DISPLAY`(콘솔 출력), `UVM_COUNT`(카운트 증가), `UVM_EXIT`(즉시 종료), `UVM_LOG`(파일), `UVM_NO_ACTION`. 기본값이 곧 위 표다 — error = DISPLAY|COUNT, fatal = DISPLAY|EXIT.

이걸 런타임에 바꿀 수 있다는 게 강력하다:

```sv
// error 10개면 중단 (기본은 무제한 진행)
set_report_max_quit_count(10);          // 또는 +UVM_MAX_QUIT_COUNT=10

// 특정 ID의 error를 종료 사유로 승격
set_report_id_action("PROTO", UVM_DISPLAY | UVM_COUNT | UVM_EXIT);
```

### demote — 에러 주입 테스트의 필수 기술

에러 주입 테스트에선 DUT가 에러를 **내는 게 정답**이다. 그때 모니터/체커가 찍는 `uvm_error`를 그대로 두면 테스트가 fail로 집계된다. 기대된 에러를 강등(demote)한다:

```sv
// 이 ID의 error를 warning으로 강등 → fail 집계에서 제외
set_report_severity_id_override(UVM_ERROR, "CRC_ERR", UVM_WARNING);
```

(정석은 demote보다 scoreboard가 "기대된 에러"를 모델링하는 것이지만, demote는 빠르고 흔한 실전 도구다.)

:::analogy
codec 에러 콘실먼트 검증과 같은 구도다 — corrupt stream을 넣으면 디코더가 에러를 보고하는 게 **정상 동작**이다. 그 보고를 "fail"로 세면 테스트를 만들 수 없다. "기대된 에러"를 채점 체계에서 분리하는 장치가 demote/override다.
:::

:::gotcha
`uvm_error`는 시뮬을 멈추지 않습니다(누적만). "왜 에러가 떴는데 계속 돌지?"는 정상 — 임계(max_quit_count)에 도달해야 멈춥니다. 즉시 멈춰야 하는 치명적 상황은 `uvm_fatal`. 반대로 fatal 남용도 금물 — 회귀에서 한 번에 한 원인밖에 못 보게 된다.
:::

:::gotcha
verbosity를 올렸는데도 안 보인다? 점검 순서: ① 그 메시지가 info인가(warning/error는 verbosity 무관) ② 전역이 아니라 특정 컴포넌트에만 설정했나(`_hier` 빠뜨림) ③ 명령행 `+UVM_VERBOSITY` 오타. 반대로 **UVM_NONE으로 찍은 info는 어떤 설정으로도 못 끈다**(0이라 항상 임계 이하) — "반드시 보여야 할 info"에만 아껴 쓸 것.
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

```check
Q: severity와 verbosity의 차이를 한 문장으로? verbosity 필터가 적용되는 severity는?
A: severity는 메시지의 **종류/심각도**(info/warning/error/fatal), verbosity는 **info 메시지에만 적용되는 상세도 필터**(LOW~DEBUG)다. warning/error/fatal은 verbosity와 무관하게 항상 처리되며 action으로만 제어한다.
H: 두 축은 직교한다
```

```check
Q: 에러 주입 테스트에서 모니터가 찍는 기대된 `uvm_error` 때문에 테스트가 fail로 집계된다. 대처 두 가지는?
A: ① `set_report_severity_id_override(UVM_ERROR, "<ID>", UVM_WARNING)`로 해당 ID를 demote — 빠른 실전 대응. ② 정석은 scoreboard/체커가 "기대된 에러"를 모델링해 그 상황에선 error를 찍지 않게 하는 것. 에러가 정답인 테스트에선 채점 체계와 에러 보고를 분리해야 한다.
```
