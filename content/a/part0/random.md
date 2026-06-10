# Randomization & Constraints

:::tldr
- **constrained random** = 제약 안에서 자동으로 자극을 생성 → directed test가 놓치는 corner case를 긁어냄.
- `rand`/`randc` 변수 + `constraint` 블록 + `randomize()` 호출이 3요소.
- 제약은 **선언적**이다 — "어떻게 풀지"가 아니라 "무엇이 참이어야 하는지"만 적고, solver가 만족하는 값을 찾는다.
- UVM의 sequence_item이 바로 이 randomize 대상이며, sequence가 제약을 덧씌운다.
:::

## rand / randc

```sv
class bus_txn;
  rand  bit [31:0] addr;
  rand  bit [31:0] data;
  randc bit [1:0]  kind;     // randc: 모든 값을 한 번씩 순회 후 반복
  rand  bit        is_write;
endclass
```

| 키워드 | 동작 | 언제 |
|---|---|---|
| `rand` | 매 호출 **독립** 균등 랜덤(값 반복 가능) | 대부분의 필드 |
| `randc` | **cyclic** — 가능한 값을 전부 한 번씩 뽑은 뒤에야 반복 | 작은 필드를 빠짐없이 훑을 때(opcode 등) |
| (없음) | 랜덤화 대상 아님 | 응답값/파생 필드 |

**풀이 예제 — randc의 순환:** `randc bit[1:0] kind` 를 6번 randomize하면 값이 가능한 값 `{0,1,2,3}`을 한 바퀴 다 돈 뒤 다음 바퀴가 시작됩니다.

```
호출1..4: 3 1 0 2   ← 0~3을 한 번씩 (순서는 랜덤)
호출5..8: 1 2 3 0   ← 새 바퀴, 다시 0~3을 한 번씩
```
→ `rand`였다면 `3 3 1 3 ...`처럼 중복이 나올 수 있습니다.

:::gotcha
`randc`는 비트폭이 크면(예: `randc bit[31:0]`) 가능한 값이 40억 개라 사실상 의미가 없고 메모리/성능만 잡아먹습니다. **작은 필드**(보통 ≤ 8bit)에만 쓰세요.
:::

## constraint — 항목별로

```sv
class bus_txn;
  rand bit [31:0] addr;
  rand bit [11:0] len;
  rand bit        is_write;

  constraint c_addr  { addr inside {[32'h1000:32'h1FFF]}; addr % 4 == 0; }
  constraint c_len   { len inside {[1:64]}; }
  constraint c_dist  { is_write dist { 1 := 70, 0 := 30 }; }
  constraint c_imp   { is_write -> len <= 16; }
endclass
```

각 줄이 무엇을 뜻하는지:

- **`addr inside {[32'h1000:32'h1FFF]}`** — `addr`가 `0x1000`~`0x1FFF` **범위 안**(양 끝 포함). `inside`는 집합/범위 멤버십.
- **`addr % 4 == 0`** — word 정렬. 같은 constraint 블록 안 여러 식은 **모두 AND**로 동시에 만족돼야 함. → 결국 `addr ∈ {0x1000, 0x1004, 0x1008, …, 0x1FFC}`.
- **`len inside {[1:64]}`** — 길이 1~64.
- **`is_write dist { 1 := 70, 0 := 30 }`** — **가중 분포**. write(1)가 70%, read(0)가 30% 확률. (합이 100일 필요는 없음 — 비율로 정규화)
- **`is_write -> len <= 16`** — **implication(함의)**. is_write가 1일 때**만** `len<=16` 강제. is_write가 0이면 len은 1~64 전체 가능.

**풀이 예제 — 위 제약을 randomize하면?**

```
가능한 결과 1: addr=0x1A40, len=9,  is_write=1   ✓ (정렬 OK, write라 len≤16 OK)
가능한 결과 2: addr=0x1004, len=50, is_write=0   ✓ (read라 len 제한 없음)
불가능:        addr=0x1A41, ...                   ✗ (4의 배수 아님 → c_addr 위반)
불가능:        ..., len=40, is_write=1            ✗ (write인데 len>16 → c_imp 위반)
```

## 더 많은 제약 연산자

### dist — `:=` vs `:/`

```sv
constraint c1 { len dist { 1 := 50, [2:9] := 50 }; }   // := 각 값에 가중치 50
constraint c2 { len dist { 1 :/ 50, [2:9] :/ 50 }; }   // :/ 범위 전체에 50을 분배
```

- `[2:9] := 50` → 2,3,…,9 **각각** 가중치 50 (범위 안 8개 값이 각각 50).
- `[2:9] :/ 50` → 범위 **전체**에 50을 나눠 가짐 (각 값 50/8 ≈ 6.25).

### if-else 제약

```sv
constraint c_mode {
  if (is_write) { len inside {[1:16]}; }
  else          { len inside {[1:64]}; data == 0; }
}
```
implication보다 분기를 명시적으로 표현할 때.

### foreach — 배열 제약

```sv
rand bit [7:0] payload [];
constraint c_arr {
  payload.size() inside {[4:8]};        // 동적 배열 길이
  foreach (payload[i]) payload[i] != 0; // 모든 원소 != 0
  foreach (payload[i]) if (i>0) payload[i] > payload[i-1]; // 오름차순
}
```

### unique

```sv
rand bit [3:0] a, b, c;
constraint c_uniq { unique {a, b, c}; }   // a,b,c 서로 다른 값
```

### solve ... before — 분포 제어

```sv
rand bit flag;
rand bit [7:0] val;
constraint c_rel  { flag -> val > 200; }
constraint c_ord  { solve flag before val; }  // flag를 먼저 뽑고 val을 정함
```
`solve A before B`는 **값의 정확도가 아니라 분포**를 바꿉니다. flag를 먼저 결정하면 flag=1과 flag=0이 50:50에 가까워집니다. (안 그러면 solver가 val 공간 크기에 끌려 flag 분포가 한쪽으로 쏠릴 수 있음)

## 인라인 제약 & 호출

```sv
bus_txn t = new();

// 1) 기본 randomize — 클래스 제약만 적용
if (!t.randomize()) `uvm_error("RND","randomize failed")

// 2) 인라인 제약 추가 (with) — 그 호출에만 덧붙음
assert(t.randomize() with { addr == 32'h1000; len inside {[1:4]}; });

// 3) 특정 필드만 randomize
assert(t.randomize(len));   // len만 랜덤, 나머지는 현재값 유지(state로 취급)
```

`with { ... }` 안의 제약은 클래스 제약과 **함께 AND**로 적용됩니다.

## soft constraint & 동적 제어

```sv
class bus_txn;
  rand bit [11:0] len;
  constraint c_def { soft len == 8; }   // 기본 8, 충돌 시 양보
endclass

t.randomize();                    // → len = 8 (soft가 살아있음)
t.randomize() with { len == 32; };// → len = 32 (soft를 덮어씀, 충돌 없음)

// 런타임 on/off
t.len.rand_mode(0);        // len을 이번엔 랜덤화에서 제외(고정값 유지)
t.c_def.constraint_mode(0);// c_def 제약 자체를 비활성화
```

- **soft** : 기본값을 주되, 다른(hard) 제약이나 with와 충돌하면 양보. 충돌 없으면 유지.
- **rand_mode(0)** : 그 변수를 랜덤화 대상에서 뺌(현재값 고정).
- **constraint_mode(0)** : 그 제약 블록을 끔.

## pre / post_randomize 훅

```sv
function void pre_randomize();
  // randomize 직전 — 예: 이전 transaction 기반으로 제약 변수 세팅
endfunction

function void post_randomize();
  crc = compute_crc(data);   // 랜덤 후 파생 필드(랜덤 아님) 계산
  if (addr == 32'h1FFC) is_last = 1;
endfunction
```

**풀이 예제 — CRC:** `data`는 rand, `crc`는 rand 아님. solver가 data를 정한 뒤 `post_randomize`에서 crc를 계산해 채웁니다. crc를 제약에 넣으려 하면 solver가 풀기 어렵거나 느려지므로, **결정적 파생값은 post_randomize**가 정석.

:::gotcha
`randomize()`의 **반환값을 항상 확인**하세요. 제약이 모순(예: `len>16` AND `len<8`)이면 0을 반환하고 변수 값은 **갱신되지 않습니다**(옛 값 유지). UVM에선 보통 `assert(item.randomize())` 또는 `if(!item.randomize()) `uvm_fatal(...)`.
:::

:::tip
제약이 자꾸 fail하면, 어떤 제약이 충돌하는지 `constraint_mode(0)`로 하나씩 꺼 보며 범위를 좁히세요. 시뮬레이터의 제약 디버그 옵션(예: `-solvefaildebug`)도 모순 제약 집합을 짚어줍니다.
:::

:::analogy
directed test는 "주소 0x1000, 0x1004를 직접 써라"라고 일일이 지시. constrained random은 "0x1000~0x1FFF 사이 4의 배수 아무거나, write는 70%로, 수천 번"이라고 **규칙만** 주고 solver가 매번 다른 시나리오를 발굴.
:::

```check
Q: `rand`와 `randc`의 차이는?
A: `rand`는 매 호출마다 독립적으로 균등 랜덤(중복 가능). `randc`는 cyclic — 가능한 모든 값을 한 번씩 다 뽑은 뒤에야 다시 반복한다. 모든 값을 빠짐없이 훑고 싶은 **작은** 필드(예: opcode)에 유용하며, 비트폭이 크면 쓰면 안 된다.
H: cyclic = 순환/순열, 단 작은 필드만
```

```check
Q: `is_write -> len <= 16` 제약의 의미와, is_write가 0일 때 len의 범위는?
A: **implication(함의)** — is_write가 1일 때만 `len<=16`을 강제한다. is_write가 0이면 이 제약은 적용되지 않으므로, len은 다른 제약(`c_len: 1~64`)만 따라 **1~64 전체**가 가능하다.
H: 전제가 거짓이면 함의는 무조건 참
```

```check
Q: `[2:9] := 50` 과 `[2:9] :/ 50` 의 분포 차이는?
A: `:=`는 범위 안 **각 값**에 가중치 50을 준다(2~9 각각 50). `:/`는 범위 **전체**에 50을 배분한다(각 값 50/8 ≈ 6.25). 즉 `:=`는 값 개수만큼 총 가중치가 커지고, `:/`는 범위 묶음의 총 가중치가 50으로 고정된다.
H: 각각 vs 전체 분배
```

```check
Q: data는 rand인데 그로부터 계산되는 crc는 어디서 채워야 하나? 그 이유는?
A: `post_randomize()`에서 채운다. crc는 data에 의해 결정되는 파생값이므로 randomize 대상이 아니다. crc를 제약으로 풀게 하면 solver가 느려지거나 못 풀 수 있어, randomize가 data를 정한 직후 post_randomize에서 결정적으로 계산하는 것이 정석이다.
H: 결정적 파생값 = solver 밖
```

```check
Q: `randomize()`가 0(fail)을 반환했다. 변수 값은 어떻게 되며 코드는 어떻게 대응해야 하나?
A: 제약이 모순이면 변수는 **갱신되지 않고 이전 값을 유지**한다(쓰레기값으로 진행할 위험). 따라서 반환값을 반드시 검사해 `assert(...)`나 `uvm_fatal/uvm_error`로 즉시 실패를 드러내야 한다. 무시하면 잘못된 자극이 조용히 흘러간다.
H: 갱신 안 됨 + 반드시 체크
```
