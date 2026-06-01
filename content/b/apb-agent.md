# 3. APB Agent

:::tldr
- 레거시 `apb_write/read` task를 **apb_item + apb_driver + apb_monitor + apb_sequencer + apb_agent**로 분해.
- "무엇을(주소/데이터)"은 item/sequence, "어떻게(핀 토글)"는 driver, "관측"은 monitor.
- 가장 단순한 프로토콜이라 여기서 패턴을 확립하면 AXI는 같은 골격의 확장.
:::

## item

```sv
class apb_item extends uvm_sequence_item;
  rand bit [31:0] addr, data;
  rand bit        is_write;
  bit             slverr;
  constraint c_align { addr[1:0]==0; }
  `uvm_object_utils_begin(apb_item)
    `uvm_field_int(addr,UVM_ALL_ON) `uvm_field_int(data,UVM_ALL_ON)
    `uvm_field_int(is_write,UVM_ALL_ON) `uvm_field_int(slverr,UVM_ALL_ON|UVM_NOCOMPARE)
  `uvm_object_utils_end
  function new(string n="apb_item"); super.new(n); endfunction
endclass
```

## driver — task가 여기로

<div class="diff2">
<div class="before">
<div class="diff-label">Before: tb task</div>

```sv
task apb_write(input [31:0] a,
               input [31:0] d);
  @(posedge pclk);
  psel=1; pwrite=1;
  paddr=a; pwdata=d;
  @(posedge pclk); penable=1;
  wait(pready);
  @(posedge pclk);
  psel=0; penable=0;
endtask
```
</div>
<div class="after">
<div class="diff-label">After: apb_driver</div>

```sv
task drive(apb_item t);
  @(vif.cb);
  vif.cb.psel    <= 1;
  vif.cb.pwrite  <= t.is_write;
  vif.cb.paddr   <= t.addr;
  vif.cb.pwdata  <= t.data;
  @(vif.cb); vif.cb.penable <= 1;
  @(vif.cb iff vif.cb.pready);
  if(!t.is_write) t.data = vif.cb.prdata;
  t.slverr = vif.cb.pslverr;
  vif.cb.psel<=0; vif.cb.penable<=0;
endtask
```
</div>
</div>

```sv
class apb_driver extends uvm_driver #(apb_item);
  `uvm_component_utils(apb_driver)
  virtual apb_if vif;
  function new(string n, uvm_component p); super.new(n,p); endfunction
  function void build_phase(uvm_phase phase);
    if(!uvm_config_db#(virtual apb_if)::get(this,"","apb_vif",vif))
      `uvm_fatal("NOVIF","apb driver")
  endfunction
  task run_phase(uvm_phase phase);
    forever begin
      seq_item_port.get_next_item(req);
      drive(req);
      seq_item_port.item_done(req);   // read 결과를 rsp로 회수
    end
  endtask
endclass
```

## monitor

```sv
task collect();
  apb_item t = apb_item::type_id::create("t");
  @(vif.cb iff vif.cb.psel && !vif.cb.penable);
  t.addr=vif.cb.paddr; t.is_write=vif.cb.pwrite;
  @(vif.cb iff vif.cb.penable && vif.cb.pready);
  t.data = t.is_write ? vif.cb.pwdata : vif.cb.prdata;
  t.slverr = vif.cb.pslverr;
  ap.write(t);
endtask
```

## agent + sequence

```sv
class apb_write_seq extends uvm_sequence #(apb_item);
  `uvm_object_utils(apb_write_seq)
  rand bit [31:0] addr, data;
  function new(string n="apb_write_seq"); super.new(n); endfunction
  task body();
    apb_item r = apb_item::type_id::create("r");
    start_item(r);
    r.randomize() with { is_write==1; addr==local::addr; data==local::data; };
    finish_item(r);
  endtask
endclass
```

:::gotcha
레거시 task는 `posedge pclk`에 직접 신호를 박았지만, UVM driver는 **clocking block(`vif.cb`)을 통해** 구동해야 race가 없습니다. `vif.psel <= ...`(직접)가 아니라 `vif.cb.psel <= ...`.
:::

```check
Q: 레거시 `apb_write` task의 내용은 UVM에서 어디로, 어떻게 쪼개지나?
A: 핀을 흔드는 타이밍 로직은 `apb_driver.drive()`로, "어느 주소에 무엇을 쓸지"는 `apb_item`(필드)과 `apb_write_seq`(시나리오)로 분리된다. driver는 clocking block(vif.cb)으로 구동해 race를 없앤다.
H: 핀 토글 vs 무엇을 쓸지
```

```check
Q: APB driver에서 `vif.psel <= 1` 대신 `vif.cb.psel <= 1`을 써야 하는 이유는?
A: clocking block(cb)을 통해 구동해야 정의된 output skew(#1ns)와 input #1step 샘플 규칙이 적용되어 driver 구동과 monitor 샘플 사이의 race condition이 사라진다. interface 신호 직접 구동은 edge race를 유발한다.
```
