# Field Automation 매크로

:::tldr
- `uvm_field_*` 매크로로 필드를 등록하면 copy/compare/print/pack/record가 **자동** 구현된다.
- `uvm_object_utils_begin/end` 블록 안에 필드를 나열.
- 편하지만 **런타임 오버헤드 + 디버그 난도**가 있어, 실무 다수 팀은 `do_copy`/`do_compare` 직접 구현을 표준으로 삼는다 — 양쪽 다 읽고 쓸 줄 알아야 한다.
- 로그 출력용으로는 `convert2string()` 직접 구현이 사실상 표준.
:::

:::note 용어 빠른 정리 (한국어 ↔ English)
| 한국어 | English | 뜻 |
|---|---|---|
| 필드 자동화 | field automation | 매크로 기반 copy/compare/print 자동 생성 |
| 직접 구현 | do_* hooks | `do_copy/do_compare/do_print` 수동 작성 |
| 정책 객체 | policy object | 비교/출력 방식을 담은 uvm_comparer/uvm_printer |
| 직렬화 | pack / unpack | 필드 ↔ 비트스트림 변환 |
| 깊은/얕은 복사 | deep / shallow copy | 객체 필드를 복제하나, 핸들만 복사하나 |
:::

## 0. 먼저 — 왜 transaction마다 이 메서드들이 필요한가

transaction은 TB 안에서 끊임없이 **복사되고(monitor→scoreboard 배달), 비교되고(scoreboard 채점), 출력된다(디버그 로그)**. 즉 모든 tx 클래스가 copy/compare/print를 갖춰야 하는데, 필드가 늘 때마다 세 메서드를 손으로 갱신하는 건 지루하고 누락이 잦다. 여기서 두 학파가 갈린다:

1. **자동화파** — 필드를 매크로로 등록하면 라이브러리가 알아서: `uvm_field_*`
2. **명시파** — 보일러플레이트라도 직접 짠다: `do_copy`/`do_compare`/`do_print`

UVM은 둘 다 지원한다. 결론부터: **학습·프로토타입은 매크로, 성능·디버그가 중요한 실무 코드는 do_* 직접 구현**이 업계의 대체적 합의다(Mentor/Doulos 가이드라인도 field 매크로 비권장). 단, 남의 코드(레거시·VIP)에서 매크로를 읽을 일은 반드시 생기므로 양쪽 다 알아야 한다.

## 1. 기본 사용 (자동화파)

```sv
class bus_txn extends uvm_sequence_item;
  rand bit [31:0] addr;
  rand bit [31:0] data;
  rand bit        is_write;

  `uvm_object_utils_begin(bus_txn)
    `uvm_field_int(addr,     UVM_ALL_ON)
    `uvm_field_int(data,     UVM_ALL_ON)
    `uvm_field_int(is_write, UVM_ALL_ON | UVM_NOCOMPARE)
  `uvm_object_utils_end

  function new(string name="bus_txn"); super.new(name); endfunction
endclass
```

이제 공짜로:

```sv
bus_txn b = bus_txn::type_id::create("b");
b.copy(a);                 // 필드별 복사
if (!b.compare(a)) ...     // 필드별 비교
b.print();                 // 보기 좋은 출력
```

### flag

| flag | 효과 |
|---|---|
| UVM_ALL_ON | copy/compare/print/pack 모두 |
| UVM_NOCOMPARE | compare에서 제외 |
| UVM_NOPACK | pack에서 제외 |
| UVM_NOPRINT | print에서 제외 |
| UVM_REFERENCE | (object 필드) 핸들만 복사 — 깊은 복사 금지 |
| UVM_DEC / UVM_HEX | print 진법 |

필드 종류별 매크로: `uvm_field_int`, `uvm_field_object`, `uvm_field_string`, `uvm_field_enum`, `uvm_field_array_int`, `uvm_field_queue_object` 등.

### 내부 동작 — 왜 느린가

매크로는 컴파일 시 거대한 필드 순회 함수(`__m_uvm_field_automation`)로 펼쳐진다. copy/compare/print가 모두 이 **한 개의 범용 순회 함수**를 mode 인자로 재사용하는 구조라, 매 호출마다 필드 메타데이터 해석·policy 객체 경유·문자열 처리가 따라온다. 필드 몇 개의 단순 비교가 수백 줄의 라이브러리 코드를 통과하는 셈 — 이것이 성능과 "디버거 스택이 라이브러리 속에서 헤매는" 문제의 근원이다.

## 2. do_* 직접 구현 (명시파, 실무 권장)

<div class="diff2">
<div class="before">
<div class="diff-label">매크로 (자동화파)</div>

```sv
// 짧다. 그러나 동작이 안 보인다
`uvm_object_utils_begin(bus_txn)
  `uvm_field_int(addr, UVM_ALL_ON)
  `uvm_field_int(data, UVM_ALL_ON)
`uvm_object_utils_end
```

</div>
<div class="after">
<div class="diff-label">do_* 직접 구현 (명시파)</div>

```sv
// do_*: 길다. 그러나 전부 보인다
`uvm_object_utils(bus_txn)   // 등록만

function void do_copy(uvm_object rhs);
  bus_txn t; super.do_copy(rhs);
  if (!$cast(t, rhs)) `uvm_fatal("CAST","do_copy type mismatch")
  addr = t.addr; data = t.data; is_write = t.is_write;
endfunction

function bit do_compare(uvm_object rhs, uvm_comparer comparer);
  bus_txn t; if (!$cast(t, rhs)) return 0;
  return super.do_compare(rhs, comparer)
      && (addr == t.addr) && (data == t.data);   // is_write 비교 제외도 명시적
endfunction
```

</div>
</div>

호출 규약: 사용자는 여전히 `b.copy(a)` / `b.compare(a)`를 부른다 — base의 copy()가 내부에서 `do_copy()`를 불러주는 **hook 구조**(part0 다형성의 활용 예: 라이브러리가 흐름을, 내가 내용물을).

### convert2string — 로그 출력의 사실상 표준

`print()`는 테이블 포맷이라 길다. 한 줄 로그엔 직접 만든 문자열이 낫다:

```sv
function string convert2string();
  return $sformatf("%s addr=%0h data=%0h", is_write ? "WR" : "RD", addr, data);
endfunction
// 사용:  `uvm_info("MON", t.convert2string(), UVM_HIGH)
```

field 매크로를 안 쓰는 팀도 convert2string은 전 tx 클래스에 짠다 — 디버그 체감 효율이 가장 큰 한 함수다.

:::gotcha
field 매크로는 범용 순회 기반이라 **느립니다**. transaction이 초당 수십만 개 흐르는 환경에선 비교/복사가 병목이 될 수 있어, 산업 현장에선 `do_copy`/`do_compare`/`do_print`를 손으로 짜는 경우가 많습니다. 학습·소규모엔 매크로가 편리.
:::

:::gotcha
`UVM_ALL_ON`엔 compare가 포함된다 — **비교하면 안 되는 필드**(타임스탬프, 디버그용 id, 발생 시각)까지 scoreboard 비교에 들어가 가짜 mismatch를 양산하는 게 단골 사고다. 그런 필드는 `UVM_NOCOMPARE`를 명시하거나, do_compare에서 빼고 짠다. "compare 정책은 우연이 아니라 설계"여야 한다.
:::

:::gotcha
`uvm_field_object`의 기본은 **깊은 복사**(가리키는 객체까지 복제). 공유 참조여야 하는 핸들(예: config object)을 깊은 복사하면 "분명 같은 cfg인데 값이 따로 논다"는 미스터리가 생긴다 — 그런 필드는 `UVM_REFERENCE`로.
:::

:::analogy
codec scoreboard에서 프레임을 비교할 때 픽셀 데이터만 비교하고 **타임스탬프·시퀀스 번호 같은 메타데이터는 빼던 것**과 같다 — 무엇이 "동일성"의 기준인지는 데이터마다 다르고, 그걸 결정하는 게 검증 엔지니어의 일이다. UVM_NOCOMPARE/do_compare는 그 결정을 코드로 적는 자리다.
:::

```check
Q: `uvm_field_int(addr, UVM_ALL_ON)`를 선언하면 어떤 메서드들이 자동 생성되나?
A: copy/clone, compare, print, pack/unpack, record 등이 그 필드를 포함해 자동 구현된다. 즉 직접 do_copy/do_compare를 짜지 않아도 transaction 복사·비교·출력이 동작한다.
H: copy/compare/print/pack
```

```check
Q: 대규모 고성능 환경에서 field 자동화 매크로 대신 do_copy/do_compare를 직접 구현하는 이유는?
A: field 매크로는 모든 연산이 범용 필드 순회 함수를 통과하는 구조라 런타임 오버헤드가 크고, 문제 발생 시 디버그 스택이 라이브러리 내부를 헤매게 된다. 직접 구현하면 필요한 필드만 명시적으로 다뤄 빠르고, 동작이 코드에 그대로 보인다.
```

```check
Q: 사용자는 `copy()`를 부르는데 내가 구현하는 건 `do_copy()`다. 이 구조의 이름과 이점은?
A: hook(템플릿 메서드) 패턴. base의 copy()가 공통 절차(null 체크 등)를 처리하고 사용자 정의 지점인 do_copy()를 virtual 호출한다. 라이브러리가 흐름을 보장하면서 내용은 파생 클래스가 채우는 구조 — part0 다형성의 실전 활용이다.
H: 누가 흐름을, 누가 내용을 갖나
```

```check
Q: scoreboard에서 분명 같은 transaction인데 compare가 계속 실패한다. field 매크로 관점의 1순위 용의자는?
A: 비교 대상이 아니어야 할 필드(타임스탬프, 디버그 id 등)가 `UVM_ALL_ON`에 휩쓸려 compare에 포함된 것. `UVM_NOCOMPARE`로 빼거나 do_compare를 직접 구현해 동일성 기준을 명시해야 한다.
H: "같다"의 기준에 들어가면 안 되는 필드
```
