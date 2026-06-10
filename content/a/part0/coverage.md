# Functional Coverage — 완벽 가이드

:::tldr
- functional coverage = "검증이 **얼마나** 됐는가"를 정량화하는 잣대. constrained random의 짝꿍.
- 3계층: **covergroup**(샘플 단위 컨테이너) ⊃ **coverpoint**(관심 변수) ⊃ **bins**(값/전이 분류함) + **cross**(조합).
- bins 종류를 정확히 알아야 한다: 값/범위 bins, `array bins[]`/`[N]`, open range `$`, `with`, `default`, `illegal_bins`, `ignore_bins`, transition bins(`=>`, `[*] [-> ] [=]`), `wildcard bins`.
- 출처는 전부 **IEEE 1800 LRM §19 (Functional coverage)**.
:::

:::note 용어 빠른 정리 (한국어 ↔ English)
| 한국어 | English | 뜻 |
|---|---|---|
| 커버그룹 | covergroup | coverpoint·cross를 묶는 단위, sample 가능 |
| 커버포인트 | coverpoint | 추적할 **변수/식** 하나 |
| 빈 | bin | 값(또는 전이)을 담는 **분류함**. 한 번이라도 채워지면 "hit" |
| 자동 빈 | auto bins | bins를 안 적으면 도구가 자동 생성 |
| 교차 | cross | 두 개 이상 coverpoint의 **조합** |
| 전이 | transition | 연속 샘플의 값 변화(`a => b`) |
| 목표 | goal | covered로 칠 목표 % |
| 가중치 | weight | 상위 coverage 계산 시 비중 |
:::

## 1. functional vs code coverage

| | functional coverage | code coverage |
|---|---|---|
| 누가 정의 | **사람**(검증 의도) | 도구가 자동 |
| 무엇을 본다 | "의도한 시나리오/조합이 실제로 발생했나" | line/toggle/branch/FSM/cond 실행 여부 |
| 100%의 의미 | 의도한 시나리오 달성 | 모든 코드 한 번씩 실행 |
| 한계 | 사람이 안 적은 건 안 보임 | 시나리오/순서/조합은 모름 |

:::gotcha
**code coverage 100% ≠ 검증 완료.** 모든 라인을 한 번씩 토글해도 "write 직후 같은 주소 read", "reset 중 burst" 같은 의도한 **시나리오**가 일어났는지는 모른다. 둘은 경쟁이 아니라 **보완**. 진짜 closure 기준은 functional(특히 cross).
:::

## 2. covergroup — 선언 · 생성 · 샘플링

```sv
class apb_cov;
  bit [31:0] addr;
  bit        is_write;

  covergroup cg;                       // 1) 선언
    cp_addr : coverpoint addr { bins lo={[0:'hFFF]}; bins hi={['h1000:$]}; }
    cp_dir  : coverpoint is_write;
    x       : cross cp_addr, cp_dir;
  endgroup

  function new();
    cg = new();                        // 2) ⚠ 반드시 인스턴스화
  endfunction

  function void do_sample(bit[31:0] a, bit w);
    addr = a; is_write = w;
    cg.sample();                       // 3) 샘플 → 현재 값을 bin에 반영
  endfunction
endclass
```

샘플링 방법 3가지:

```sv
// (a) 명시적 호출
cg.sample();

// (b) 인자로 직접 전달 (SV-2012) — 멤버 변수 없이도 됨
covergroup cg2 with function sample(bit[31:0] a, bit w);
  cp_a: coverpoint a;
  cp_w: coverpoint w;
endgroup
cg2.sample(addr, is_write);

// (c) 이벤트/클록에 자동 샘플
covergroup cg3 @(posedge clk);   // clk마다 자동 sample
  coverpoint state;
endgroup
```

:::gotcha
covergroup은 클래스 멤버로 두고 **`new()`에서 `cg = new();`** 해야 sample이 동작한다. 빠뜨리면 null이라 coverage가 영원히 0%. 또 sample 직전에 coverpoint가 보는 변수를 **갱신**해야 올바른 값이 들어간다.
:::

## 3. coverpoint — 식 · auto bins · iff

```sv
cp_len : coverpoint len;                       // bins 없으면 auto bins 생성
cp_sum : coverpoint (a + b);                   // 식도 가능
cp_addr: coverpoint addr iff (!reset);         // reset 중엔 샘플 제외 (guard)
```

- **auto bins**: bins를 안 적으면 도구가 자동으로 만든다. 개수 = `min(2^width, auto_bin_max)`, `auto_bin_max` 기본 **64**. enum이면 값마다 1개.
- **`iff (cond)`**: 조건이 참일 때만 그 coverpoint를 샘플(가드). reset/idle 구간 제외에 흔히 사용.

## 4. bins — 모든 종류 완전 정리

### 4-1. 값 / 범위 bins

```sv
coverpoint len {                  // len: 8bit 가정
  bins one    = {1};              // 단일 값
  bins few    = {2, 3, 5, 7};     // 값 집합 → 하나의 bin (이 중 아무거나 hit면 covered)
  bins mid    = {[8:15]};         // 범위 (양끝 포함) → 하나의 bin
  bins hi     = {[200:$]};        // open range: $ = 그 타입의 최대값(8bit면 255)
  bins lo     = {[$:5]};          // $ = 최소값(0)
}
```

- `{a, b, c}` 나 `{[lo:hi]}` 를 하나의 `bins`에 주면 그 전체가 **한 개의 bin**. 안의 값 중 **하나라도** 나오면 그 bin은 covered.
- `$` = 해당 coverpoint **타입의 최소/최대값**. 위치(왼쪽/오른쪽)로 의미가 갈린다.

### 4-2. array bins — `[]` 와 `[N]`

```sv
coverpoint len {
  bins each[]  = {[0:7]};         // [] : 값마다 별도 bin → 8개 bin (each[0]..each[7])
  bins grp[4]  = {[0:255]};       // [N]: 정확히 4개 bin에 값들을 분배 (각 ~64개 값)
  bins names[3]= {10, 20, 30};    // 값 3개를 3개 bin에 → names[0]=10 ...
}
```

| 표기 | 만들어지는 bin 수 | 용도 |
|---|---|---|
| `bins b = {[0:7]}` | **1개** (범위 전체가 한 함) | "이 범위 안 아무거나" |
| `bins b[] = {[0:7]}` | **값 개수만큼**(=8) | 각 값을 개별 추적 |
| `bins b[N] = {[0:255]}` | **정확히 N개**(값 분배) | 큰 공간을 N구간으로 |

### 4-3. `with` 절 — 조건으로 값 선별 (SV-2012)

```sv
coverpoint val {
  bins mult4[]  = {[0:255]} with (item % 4 == 0);   // 4의 배수만 각각 bin
  bins prime[]  = {[0:99]}  with (is_prime(item));   // 함수도 사용 가능
}
```
- `item` = 후보 값을 가리키는 키워드. 식이 참인 값만 bin이 된다.

### 4-4. `default` bins

```sv
coverpoint opcode {
  bins known[] = {[0:5]};
  bins others  = default;          // 위 어디에도 안 든 값 전부
}
```

:::gotcha
`default` bin은 **coverage 계산에 포함되지 않는다**(정보용). "예상 못한 값이 들어왔다"를 잡는 디버그 용도지, 채운다고 % 가 오르지 않는다. 또 transition에는 `bins others = default sequence;` 를 쓴다.
:::

### 4-5. `illegal_bins` vs `ignore_bins`

```sv
coverpoint len {
  bins legal[] = {[1:64]};
  illegal_bins bad  = {0};          // 발생하면 즉시 런타임 에러 (불법 값)
  ignore_bins  skip = {[100:$]};    // coverage에서 완전히 제외 (도달 불가/무의미)
}
```

| | illegal_bins | ignore_bins |
|---|---|---|
| 값이 나오면 | **에러 발생** | 조용히 무시 |
| coverage 포함 | 제외 + 위반 보고 | 제외만 |
| 용도 | "절대 나오면 안 되는 값" | "도달 불가/세지 말 값" |
| 우선순위 | **가장 높음**(다른 bin과 겹쳐도 illegal) | normal보다 우선 |

### 4-6. transition bins — 연속 샘플의 변화

```sv
coverpoint state {
  bins i2b   = (IDLE => BUSY);            // 한 스텝 전이
  bins seq   = (IDLE => BUSY => DONE);    // 다단계 전이
  bins multi = (IDLE => BUSY), (BUSY => DONE);  // 여러 전이를 한 bin에
  bins fanin = (1,2 => 3);                // (1=>3) 또는 (2=>3)
}
```

반복(repetition) 연산자:

| 표기 | 이름 | 의미 |
|---|---|---|
| `a[*3]` | consecutive | `a => a => a` (연속 3회) |
| `a[*2:4]` | consecutive 범위 | 연속 2~4회 |
| `a[->3]` | goto | a가 **3번째** 나오는 지점에서 성립(사이에 다른 값 허용). 예: `(a[->3] => b)` |
| `a[=3]` | nonconsecutive | a가 비연속 3회, 이후 다른 전이 계속 가능 |

```sv
bins burst   = (REQ [*4]);              // REQ 연속 4번
bins retry   = (NAK [->2] => ACK);      // NAK 두 번째 뒤 ACK
```

:::note `[->]` 와 `[=]` 차이
`[->n]`(goto)는 시퀀스가 **n번째 발생에서 끝난다** → 바로 다음 전이를 이어 붙일 때(`a[->3] => b`). `[=n]`(nonconsecutive)는 n회 채운 뒤에도 **다른 샘플이 더 와도 됨**. 미묘하지만 프로토콜 retry/handshake 모델링에서 갈린다. (LRM §19.5)
:::

### 4-7. `wildcard bins` — don't-care 비트

```sv
coverpoint addr {
  wildcard bins even  = {8'b???????0};   // LSB=0 인 모든 값 (?=0/1/x/z don't care)
  wildcard bins page0 = {16'h00??};      // 상위 바이트 0x00 인 모든 주소
}
```
- `?` 는 0·1·x·z를 모두 매칭하는 와일드카드. 비트 패턴으로 값을 묶을 때.

## 5. cross — 조합 커버리지

가장 가치 있는 건 보통 cross다. "write이면서 high 주소이면서 len=64"가 한 번이라도 일어났나?

```sv
cp_dir : coverpoint is_write { bins rd={0}; bins wr={1}; }
cp_len : coverpoint len { bins s={[1:15]}; bins l={[16:255]}; }
cp_addr: coverpoint addr { bins lo={[0:'hFFF]}; bins hi={['h1000:$]}; }

x_all : cross cp_dir, cp_len, cp_addr;     // 2 × 2 × 2 = 8 cross bin
```

### cross 안에서 bin 걸러내기 — `binsof` / `intersect`

```sv
x_dl : cross cp_dir, cp_len {
  // read에는 len 의미 없음 → read × len 조합 전부 제외
  ignore_bins rd_no_len = binsof(cp_dir.rd);

  // write × large 만 따로 묶어 이름 부여
  bins wr_large = binsof(cp_dir.wr) && binsof(cp_len.l);

  // 특정 값 교집합으로 불법 조합 표시
  illegal_bins bad = binsof(cp_len) intersect {0};
}
```

- `binsof(cp.bin)` = 그 bin이 관여하는 cross 조합들.
- `&&` `||` `!` 로 조합, `intersect {값}` 으로 값 기준 선택.
- cross 안에서도 `bins`/`ignore_bins`/`illegal_bins` 를 정의해 조합을 정제한다.

:::gotcha
cross bin 수는 **곱셈**으로 폭발한다(coverpoint 3개 × 각 8 bin = 512). 의미 없는 조합은 `ignore_bins binsof(...)` 로 적극 쳐내야 closure가 현실적이 된다. 안 그러면 영원히 100% 못 친다.
:::

## 6. options & type_options — 동작 조절

```sv
covergroup cg;
  option.per_instance = 1;     // 인스턴스별로 따로 집계 (기본 0=타입 통합)
  option.at_least     = 2;     // bin이 covered 되려면 최소 2번 hit
  option.weight       = 5;     // 상위 coverage에서 이 cg의 비중
  option.goal         = 90;    // covered로 칠 목표 %
  option.auto_bin_max = 16;    // auto bins 최대 개수
  option.comment      = "APB main coverage";
  type_option.weight  = 10;    // 타입 전체(모든 instance)에 적용
  type_option.goal    = 100;
  cp_a : coverpoint a { option.weight = 3; }   // coverpoint별로도 가능
endgroup
```

| 옵션 | 기본값 | 의미 |
|---|---|---|
| `weight` | 1 | 상위 합산 시 비중 |
| `goal` | 90 | 목표 커버리지 %(LRM §19) |
| `at_least` | 1 | bin covered 판정 최소 hit 수 |
| `auto_bin_max` | 64 | auto bins 최대 개수 |
| `per_instance` | 0 | 인스턴스별 분리 집계 여부 |
| `cross_num_print_missing` | 0 | 리포트에 미커버 cross 표시 수 |
| `detect_overlap` | 0 | bin 값 겹침 경고 |
| `comment` | "" | 리포트 주석 |

- **`option.*`** = 인스턴스 단위. **`type_option.*`** = 타입(모든 인스턴스 합산) 단위.
- **`at_least`** 가 핵심 함정: 1로 두면 한 번만 나와도 covered. "충분히 봤다"를 원하면 올린다.

## 7. coverage 조회

```sv
real c1 = cg.get_coverage();          // 이 covergroup 타입 coverage %
real c2 = cg.get_inst_coverage();     // 이 인스턴스만
real c3 = cg.cp_addr.get_coverage();  // 특정 coverpoint
real c4 = $get_coverage();            // 전체 functional coverage (system)
```

리포트:
```sv
function void report_phase(uvm_phase phase);
  `uvm_info("COV", $sformatf("APB coverage = %.2f%%", cg.get_coverage()), UVM_LOW)
endfunction
```

## 8. UVM 통합 — subscriber에서 sample

```sv
class apb_cov extends uvm_subscriber #(apb_txn);  // analysis_imp 내장
  `uvm_component_utils(apb_cov)
  apb_txn tr;
  covergroup cg;
    cp_dir : coverpoint tr.is_write;
    cp_addr: coverpoint tr.addr { bins lo={[0:'hFFF]}; bins hi={['h1000:$]}; }
    x: cross cp_dir, cp_addr;
  endgroup
  function new(string n, uvm_component p); super.new(n,p); cg=new(); endfunction
  function void write(apb_txn t); tr=t; cg.sample(); endfunction  // monitor가 publish한 것
endclass
```

:::tip
coverage는 **monitor가 publish한 transaction**을 subscriber에서 sample하는 것이 정석. driver에서 sample하면 "실제 DUT에 들어간 것"이 아니라 "보내려던 의도"를 세게 된다. agent를 `cfg.has_cov` 로 켜고 끌 수 있게 분리하면 재사용에 유리.
:::

## 9. 종합 예제 문제 (풀이)

### 예제 A — 무엇이 covered/missing 인가?

```sv
bit [3:0] len;  // 0..15
covergroup cg with function sample(bit[3:0] l);
  cp : coverpoint l {
    bins zero    = {0};
    bins small[] = {[1:3]};        // small[1],small[2],small[3]
    bins big     = {[8:$]};        // 8..15 전체가 한 bin
    ignore_bins ig = {[4:7]};
  }
endgroup
// 샘플된 값들: 0, 2, 2, 9, 9, 9
```

**풀이:** 추적 대상 bin = `zero, small[1], small[2], small[3], big` 총 **5개**(ig 제외).
- 0 → zero ✓
- 2 → small[2] ✓ (small[1], small[3]은 안 옴 ✗)
- 9 → big ✓ (8~15 중 하나라도면 big covered)
→ covered 3 / 5 = **60%**. 미커버: `small[1]`, `small[3]`. (4~7은 ignore라 분모에 없음)

### 예제 B — transition

```sv
covergroup cg @(posedge clk);
  cp : coverpoint st {   // st ∈ {IDLE,REQ,ACK}
    bins normal = (IDLE => REQ => ACK);
    bins retry  = (REQ [->2] => ACK);   // REQ 두 번째 뒤 ACK
  }
endgroup
// st 시퀀스: IDLE, REQ, ACK,  IDLE, REQ, NAKwait, REQ, ACK
```

**풀이:**
- 첫 구간 `IDLE=>REQ=>ACK` → `normal` ✓
- 둘째 구간 `REQ ... REQ => ACK` (REQ 2회 발생 후 ACK) → `retry` ✓
→ 둘 다 covered = **100%**. (goto `[->2]`라 두 REQ 사이에 다른 값이 끼어도 성립)

### 예제 C — cross 폭발 줄이기

```sv
cp_dir: coverpoint is_write { bins rd={0}; bins wr={1}; }
cp_len: coverpoint len { bins s={[1:7]}; bins m={[8:63]}; bins l={[64:255]}; }
x: cross cp_dir, cp_len {
  ignore_bins rd_len = binsof(cp_dir.rd);   // read엔 길이 무의미
}
```
**풀이:** 원래 cross = 2 × 3 = 6 bin. `binsof(cp_dir.rd)` 가 read 관련 3 조합(rd×s, rd×m, rd×l)을 제거 → 추적 대상 **3 bin**(wr×s, wr×m, wr×l)만 남는다. 의미 없는 절반을 쳐내 closure가 빨라진다.

## 10. Cheat Sheet — bins 한눈에

| 문법 | 종류 | 한 줄 의미 |
|---|---|---|
| `bins b = {v}` | 단일 | 값 v |
| `bins b = {a,b,[c:d]}` | 집합/범위 | 묶음 전체가 1 bin |
| `bins b[] = {[lo:hi]}` | array | 값마다 bin |
| `bins b[N] = {...}` | array(고정) | N개로 분배 |
| `bins b = {[lo:$]}` | open range | $=타입 max/min |
| `bins b[] = {...} with (item%4==0)` | with | 조건 맞는 값만 |
| `bins b = default` | default | 나머지(계산 제외) |
| `illegal_bins b = {...}` | illegal | 나오면 에러 |
| `ignore_bins b = {...}` | ignore | 계산 제외 |
| `bins b = (a => b)` | transition | 전이 |
| `bins b = (a[*3])` | consecutive | 연속 반복 |
| `bins b = (a[->3])` | goto | n번째 발생 |
| `bins b = (a[=3])` | nonconsec | 비연속 반복 |
| `wildcard bins b = {4'b1??0}` | wildcard | ?=don't care |
| `cross a, b` | cross | 조합 |
| `binsof(a.x) && binsof(b.y)` | cross select | 조합 선택/제외 |

```check
Q: `bins a = {[0:7]}` 와 `bins a[] = {[0:7]}` 는 각각 몇 개의 bin을 만드나?
A: `bins a = {[0:7]}` 는 범위 전체가 **1개** bin(0~7 중 아무거나 나오면 covered). `bins a[] = {[0:7]}` 는 값마다 별도 → **8개** bin(a[0]..a[7], 각 값을 개별 추적). `bins a[4]={[0:7]}` 였다면 4개로 분배된다.
H: `[]`는 "값마다", 그냥 `{}`는 "묶음 하나"
```

```check
Q: `illegal_bins` 와 `ignore_bins` 의 차이는?
A: `ignore_bins`는 그 값을 coverage 계산에서 **조용히 제외**(도달 불가/무의미). `illegal_bins`는 그 값이 나오면 **런타임 에러**를 발생시키고 제외한다(절대 나오면 안 되는 값). 우선순위는 illegal이 가장 높다.
H: 무시 vs 위반
```

```check
Q: `default` bin을 채우면 coverage %가 올라가나?
A: 아니다. `default` bin은 "다른 어느 bin에도 안 든 값"을 모으는 **정보/디버그용**이며 coverage 계산에 **포함되지 않는다**. 예상 못한 값 유입을 감지하는 용도지 분모/분자에 들어가지 않는다.
H: 분모에 안 들어간다
```

```check
Q: transition `(a[*3])` 와 `(a[->3])` 의 의미 차이는?
A: `a[*3]` = **연속** 3회(`a=>a=>a`, 사이에 다른 값 불가). `a[->3]` = **goto**, a가 (사이에 다른 값이 끼어도) **3번째** 나오는 지점에서 성립 — 보통 `(a[->3] => b)`처럼 다음 전이를 이어 붙일 때 쓴다.
H: 연속 vs "n번째 발생까지"
```

```check
Q: cross의 bin이 너무 많아 100%를 못 친다. 줄이는 표준 방법은?
A: cross 안에서 `ignore_bins`와 `binsof()`(필요시 `&&`/`intersect`)로 **의미 없는 조합을 제거**한다. 예: read에 길이가 무의미하면 `ignore_bins x = binsof(cp_dir.rd);`로 read×len 조합 전부를 제외한다. cross bin은 곱셈으로 폭발하므로 무의미 조합 제거가 closure의 핵심.
H: binsof + ignore_bins
```

```check
Q: `option.at_least = 1`(기본값)일 때의 함정과, 어떻게 조정하나?
A: bin이 **단 한 번만** hit돼도 covered로 친다. "그 시나리오를 충분히 많이 봤다"를 보장하려면 `option.at_least`를 더 큰 값(예: 10)으로 올려, 그만큼 hit돼야 covered로 인정하게 한다.
H: 1회로 충분한가?
```

```check
Q: covergroup을 선언하고 coverpoint도 적었는데 coverage가 계속 0%다. 가장 흔한 두 원인은?
A: ① 생성자에서 `cg = new();`를 빠뜨려 covergroup 인스턴스가 없음(또는 `cg.sample()` 미호출). ② sample 직전에 coverpoint가 참조하는 변수(tr 등)를 **갱신하지 않아** 항상 같은/엉뚱한 값만 샘플. 둘 다 실제 값이 bin에 들어가지 못하게 만든다.
H: new() 했나, sample 전에 값 갱신했나
```
