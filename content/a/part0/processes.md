# fork-join · mailbox · event · semaphore

:::tldr
- UVM run_phase는 여러 컴포넌트가 **동시에** 도는 세계 → 프로세스(process) 제어와 프로세스 간 통신/동기화를 알아야 한다.
- 병렬: `fork...join`(전부 대기) / `join_any`(하나라도) / `join_none`(대기 안 함) + `disable fork`/`wait fork`.
- 통신·동기화: **mailbox**(데이터 큐), **event**(신호), **semaphore**(자원 잠금). UVM에선 TLM·`uvm_event`로 진화하지만 뿌리는 이것.
- 출처: IEEE 1800 LRM §9(Processes), §15(Inter-process sync: semaphore/mailbox/event).
:::

:::note 용어 빠른 정리 (한국어 ↔ English)
| 한국어 | English | 뜻 |
|---|---|---|
| 프로세스 | process | 동시에 실행되는 실행 흐름 하나 |
| 분기/병렬 | fork | 자식 프로세스들을 동시에 띄움 |
| 합류 | join | 자식들이 끝나길 기다림 |
| 메일박스 | mailbox | 프로세스 간 데이터 큐(FIFO) |
| 이벤트 | event | "발생했다"는 순간 신호 |
| 세마포어 | semaphore | key로 공유 자원 잠금 |
| 블록 | block | 조건 충족까지 대기(시간 소비) |
:::

## 1. fork-join 3종 — 정확한 의미

```sv
fork  a();  b();  join        // 부모는 a,b 둘 다 끝나야 진행
fork  a();  b();  join_any    // 부모는 둘 중 하나 끝나면 진행 (나머지는 계속 실행)
fork  a();  b();  join_none   // 부모는 즉시 진행 (자식은 부모가 나중에 block될 때 실행)
```

| 구문 | 부모가 언제 진행 | 남은 자식 | 대표 용도 |
|---|---|---|---|
| `join` | **모두** 끝나면 | 없음 | 여러 채널 병렬 구동 후 동기 |
| `join_any` | **하나라도** 끝나면 | 계속 실행됨 | timeout/watchdog |
| `join_none` | **즉시** | 백그라운드로 | monitor/forever 프로세스 띄우기 |

:::gotcha
`join_none`으로 띄운 자식은 부모가 다음에 **block(`@`, `wait`, `#delay` 등)** 되는 순간부터 실행된다. 부모가 계속 0-time으로 달리면 자식이 한 줄도 안 돈다. "분명 fork했는데 안 도네?" → 부모에 동기점이 없는 경우.
:::

## 2. 프로세스 정리 — disable fork · wait fork · isolation

```sv
task run_with_timeout();
  fork : iso_blk                 // isolation: disable fork 범위를 가둠
    begin
      fork
        do_work();
        watchdog();              // 일정 시간 후 그냥 return
      join_any
      disable fork;              // ← 현재 프로세스의 "자식들" 전부 kill
    end
  join
endtask
```

- **`disable fork`** : 현재 프로세스가 띄운 **모든 자식**을 종료. 단, 같은 스코프의 형제까지 죽일 수 있어 보통 inner `fork...join`(isolation)으로 감싼다.
- **`wait fork`** : 현재 프로세스가 띄운 모든 자식(과 그 후손)이 끝날 때까지 대기.

## 3. for-loop + fork 의 고전 버그 (automatic)

```sv
// ❌ 버그: 모든 자식이 마지막 i(=4)를 본다
for (int i=0; i<4; i++)
  fork  drive(i);  join_none      // i는 공유 변수 → 자식 실행 시점엔 이미 4

// ✅ 수정: 반복마다 값을 캡처
for (int i=0; i<4; i++)
  fork
    automatic int k = i;          // 자동 변수에 그 순간의 i를 박제
    drive(k);
  join_none
```

:::gotcha
fork 안에서 루프 변수를 그대로 쓰면, 자식이 실제로 도는 시점엔 루프가 이미 끝나 **최종값만** 보인다. 반복별 값을 쓰려면 `automatic` 변수에 복사해 넣어라. UVM에서 여러 sequence/transaction을 fork로 띄울 때 단골 실수.
:::

## 4. process 클래스 — 동적 프로세스 제어

```sv
process p;
fork  p = process::self();  long_job();  join_none

// 다른 곳에서
if (p.status() != process::FINISHED) p.kill();   // 강제 종료
p.await();        // 끝날 때까지 대기
p.suspend();  p.resume();
```
- `process::self()` = 현재 프로세스 핸들. status: `RUNNING/WAITING/SUSPENDED/FINISHED/KILLED`.
- 세밀한 종료/일시정지가 필요할 때(`disable fork`보다 정밀).

## 5. mailbox — 프로세스 간 데이터 전달

```sv
mailbox #(packet) mbx = new();     // 타입 지정, unbounded
mailbox #(packet) bnd = new(4);    // bounded: 최대 4개 (가득 차면 put이 block)

// producer
packet p = new();  mbx.put(p);     // 가득 차면 block

// consumer
packet q;  mbx.get(q);             // 비었으면 block (꺼내며 제거)
mbx.peek(q);                       // 비었으면 block (꺼내지 않고 복사)

// non-blocking 변형 (성공 여부 즉시 반환, 0/1)
if (mbx.try_put(p)) ...;
if (mbx.try_get(q)) ...;
int n = mbx.num();                 // 현재 들어있는 개수
```

| 메서드 | block? | 동작 |
|---|---|---|
| `put` / `get` / `peek` | block | 넣기 / 꺼내기 / 엿보기 |
| `try_put` / `try_get` / `try_peek` | non-block | 성공 여부 반환 |
| `num()` | - | 메시지 수 |

generator→driver 통신의 고전 패턴이며, **UVM에선 sequencer–driver TLM**(`get_next_item`/`item_done`)이 이를 대체한다.

## 6. event — 동기화 신호

```sv
event done;

// waiter
@done;                  // edge 대기 (trigger 순간을 기다림)
wait(done.triggered);   // 이번 time step에 trigger됐으면 통과 (race 회피)

// trigger
-> done;                // blocking trigger (현재 step)
->> done;               // non-blocking trigger (스케줄됨)
```

- `event`는 **핸들**이다 — `e1 = e2`로 병합, `e = null`로 해제, 인자로 전달 가능.
- `@e`(edge)는 trigger가 **먼저** 발생하면 놓친다. `wait(e.triggered)`는 같은 step 내 발생을 레벨로 확인.
- 순서 동기화: `wait_order(a, b, c);` (a→b→c 순서로 발생해야 통과).

## 7. semaphore — 공유 자원 잠금

```sv
semaphore sem = new(1);   // key 1개 (mutex 효과)
sem.get(1);               // key 1개 확보 (없으면 block)
// ... critical section (한 번에 한 프로세스만) ...
sem.put(1);               // key 반납
if (sem.try_get(1)) ...;  // non-blocking
```
- `new(N)`으로 key N개 → 동시 접근 N개 허용(자원 풀). `get(k)`/`put(k)`로 k개씩.

:::analogy
mailbox = 택배 보관함(데이터를 넣고 꺼냄), event = 초인종(신호만, 내용 없음), semaphore = 화장실 열쇠(자원 1개를 한 명만). fork-join = 일꾼 여럿을 풀고(`fork`) 다 끝날 때까지 기다림(`join`).
:::

:::tip
UVM 진화 매핑: **mailbox → TLM port/FIFO**, **event → `uvm_event`(+pool, `wait_ptrigger`)**, **semaphore → 그대로 사용**. 뿌리(이 챕터)를 알면 UVM 동기화가 마법처럼 안 보인다.
:::

## 8. 종합 예제 — producer/consumer + timeout

```sv
mailbox #(packet) mbx = new(8);
event stop;

task producer();
  repeat (100) begin
    packet p = new(); assert(p.randomize());
    mbx.put(p);                 // 큐 가득 차면 자동 backpressure
  end
  -> stop;
endtask

task consumer();
  packet p;
  forever begin mbx.get(p); drive(p); end
endtask

task run();
  fork : iso
    producer();
    consumer();
    begin @stop; #100ns; end    // producer 끝나고 drain
  join_any
  disable fork;                 // consumer(forever) 정리
endtask
```

```check
Q: `join_none`으로 자식을 띄웠는데 자식 코드가 한 줄도 실행되지 않는다. 가장 흔한 원인은?
A: 부모 프로세스에 **block(동기)점이 없어서**다. join_none으로 띄운 자식은 부모가 다음에 `@`/`wait`/`#delay` 등으로 block될 때 비로소 실행 기회를 얻는다. 부모가 0-time으로 끝까지 달리면 자식이 돌지 못한다.
H: 자식은 부모가 멈출 때 돈다
```

```check
Q: `for (int i=0;i<4;i++) fork drive(i); join_none` 의 버그와 수정은?
A: `i`가 공유 변수라 자식이 실제 실행될 때는 이미 루프가 끝나 **i=4(최종값)**만 본다. fork 블록 안에 `automatic int k = i;`로 그 순간의 값을 캡처해 `drive(k)`를 호출해야 반복별 값이 전달된다.
H: automatic으로 박제
```

```check
Q: `@e`(edge 대기)와 `wait(e.triggered)`의 차이, 언제 후자를 쓰나?
A: `@e`는 edge-sensitive라 trigger가 **먼저** 발생하면 놓친다. `wait(e.triggered)`는 같은 time step에 trigger됐는지를 레벨로 확인하므로, trigger가 대기보다 앞설 수 있는 race 상황에서 안전하다. (UVM `uvm_event.wait_ptrigger`와 같은 취지.)
H: 이미 지나간 trigger
```

```check
Q: `disable fork`를 그냥 쓰면 위험한 이유와 표준 패턴은?
A: `disable fork`는 현재 프로세스의 자식을 모두 죽이는데, 의도치 않게 같은 스코프의 **형제 프로세스까지** 종료할 수 있다. 표준은 끝내고 싶은 프로세스들을 안쪽 `fork...join`(isolation begin-end)으로 감싸 disable fork의 범위를 그 블록으로 한정하는 것이다.
H: 범위를 가두는 isolation
```

```check
Q: mailbox의 `get`과 `peek`, 그리고 `try_get`은 어떻게 다른가?
A: `get`은 메시지를 **꺼내며 제거**(비었으면 block), `peek`은 **꺼내지 않고 복사**만(비었으면 block), `try_get`은 **non-blocking**으로 성공 여부(0/1)를 즉시 반환한다. bounded mailbox에서 put도 가득 차면 block, try_put은 즉시 반환.
H: 제거 vs 엿보기 vs 즉시반환
```
