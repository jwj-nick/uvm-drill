# Randomization & Constraints

:::tldr
- **constrained random** = 제약 안에서 자동으로 자극을 생성 → directed test가 놓치는 corner case를 긁어냄.
- `rand`/`randc` 변수 + `constraint` 블록 + `randomize()` 호출이 3요소.
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

- `rand` : 매번 균등 랜덤.
- `randc` : cyclic — 가능한 값을 모두 소진한 뒤에야 반복(순열).

## constraint

```sv
class bus_txn;
  rand bit [31:0] addr;
  rand bit [11:0] len;
  rand bit        is_write;

  constraint c_addr  { addr inside {[32'h1000:32'h1FFF]}; addr % 4 == 0; }
  constraint c_len   { len inside {[1:64]}; }
  constraint c_dist  { is_write dist { 1 := 70, 0 := 30 }; }  // 70:30 가중치
  constraint c_imp   { is_write -> len <= 16; }               // implication
endclass
```

호출:

```sv
bus_txn t = new();
if (!t.randomize()) `uvm_error("RND", "randomize failed")
// 인라인 제약 추가
assert(t.randomize() with { addr == 32'h1000; len inside {[1:4]}; });
```

## soft constraint & 제어

```sv
constraint c_def { soft len == 8; }       // 다른 제약과 충돌 시 양보
t.randomize() with { len == 32; };        // soft를 덮어씀

t.addr.rand_mode(0);     // addr를 이번엔 랜덤화에서 제외
t.c_len.constraint_mode(0); // c_len 제약 비활성화
```

## pre/post_randomize 훅

```sv
function void post_randomize();
  crc = compute_crc(data);   // 랜덤 후 파생 필드 계산
endfunction
```

:::gotcha
`randomize()`의 **반환값을 항상 확인**하세요. 제약이 모순이면 0을 반환하고 값은 갱신되지 않습니다. UVM에서는 보통 `assert(... .randomize())` 또는 `if(!...) `uvm_fatal`.
:::

:::analogy
directed test는 "주소 0x1000, 0x1004를 직접 써라"라고 일일이 지시. constrained random은 "0x1000~0x1FFF 사이 4의 배수 아무거나 수천 번"이라고 규칙만 주고 시뮬레이터가 시나리오를 발굴.
:::

```check
Q: `rand`와 `randc`의 차이는?
A: `rand`는 매 호출마다 독립적으로 균등 랜덤. `randc`는 cyclic — 가능한 모든 값을 한 번씩 다 뽑은 뒤에야 다시 반복한다. 모든 조합을 빠짐없이 훑고 싶은 작은 필드(예: opcode)에 유용.
H: cyclic = 순환/순열
```

```check
Q: `is_write -> len <= 16` 제약의 의미는?
A: **implication**. is_write가 1일 때만 `len <= 16`을 강제한다. is_write가 0이면 len에는 이 제약이 적용되지 않는다. 조건부 제약을 표현.
```
