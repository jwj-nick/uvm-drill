# fork-join · mailbox · event

:::tldr
- UVM run_phase는 여러 컴포넌트가 **동시에** 도는 세계 → 프로세스 제어와 프로세스 간 통신을 알아야 한다.
- `fork...join`(전부 대기) / `join_any`(하나라도) / `join_none`(대기 안 함).
- 통신: **mailbox**(데이터 큐), **event**(신호), **semaphore**(자원 잠금). UVM에선 TLM과 `uvm_event`로 진화하지만 뿌리는 이것.
:::

## fork-join 3종

```sv
fork
  drive_a();
  drive_b();
join          // a,b 둘 다 끝나야 진행

fork
  wait_timeout();
  wait_done();
join_any      // 둘 중 하나 끝나면 진행 (timeout 패턴)

fork
  monitor_forever();
join_none     // 백그라운드로 띄우고 즉시 진행
```

`disable fork` / `wait fork`로 자식 프로세스를 정리/대기합니다.

```sv
fork
  begin : iso
    fork
      timeout_watchdog();
      do_work();
    join_any
    disable fork;     // 남은 형제 프로세스 kill
  end : iso
join
```

## mailbox — 프로세스 간 데이터 전달

```sv
mailbox #(packet) mbx = new();   // bounded면 new(N)

// producer
packet p = new();
mbx.put(p);          // 가득 차면 block

// consumer
packet q;
mbx.get(q);          // 비었으면 block
mbx.peek(q);         // 꺼내지 않고 들여다봄
```

generator→driver 통신의 고전 패턴이며, UVM에선 sequencer–driver TLM이 이를 대체합니다.

## event — 동기화 신호

```sv
event done;

// waiter
@done;          // 또는 wait(done.triggered);

// trigger
-> done;
```

## semaphore — 공유 자원 잠금

```sv
semaphore sem = new(1);   // key 1개
sem.get(1);   // 잠금 (없으면 block)
// ... critical section ...
sem.put(1);   // 반납
```

:::gotcha
`@done`(edge 대기)은 trigger가 **먼저** 일어나면 놓칩니다. 이미 발생했을 수 있는 경우 `wait(done.triggered)`를 쓰세요. UVM의 `uvm_event`는 `wait_trigger`/`wait_ptrigger`로 이 함정을 정리해 둔 것.
:::

:::analogy
mailbox = 택배 보관함(데이터를 넣고 꺼냄), event = 초인종(신호만), semaphore = 화장실 열쇠(자원 1개를 한 명만).
:::

```check
Q: watchdog timeout 패턴을 fork-join으로 구현하려면 어떤 join을 쓰고, 끝나고 무엇을 해야 하나?
A: `fork timeout(); work(); join_any` 로 둘 중 먼저 끝나는 것을 기다린 뒤, `disable fork`로 남은 프로세스를 정리한다. (보통 isolation begin-end로 감싸 다른 형제까지 죽이지 않도록 한다.)
H: 하나라도 끝나면 진행 + 나머지 정리
```

```check
Q: trigger가 먼저 발생할 수 있는 상황에서 `@event` 대신 무엇을 써야 하나?
A: `wait(event.triggered)`. `@event`는 edge-sensitive라 이미 지나간 trigger를 놓친다. `.triggered`는 같은 time step 내 발생 여부를 레벨로 확인해준다. (UVM `uvm_event`의 `wait_ptrigger`도 동일 취지.)
```
