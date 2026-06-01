# Functional Coverage

:::tldr
- coverage = "검증이 **얼마나** 됐는가"를 정량화하는 잣대. constrained random의 짝꿍.
- **covergroup**(샘플 단위) + **coverpoint**(관심 변수) + **bins**(값 구간) + **cross**(조합).
- code coverage(라인/토글)와 다르다 — functional coverage는 "의도한 시나리오가 실제로 발생했나"를 본다.
:::

## covergroup 기본

```sv
class apb_coverage;
  bit [31:0] addr;
  bit        is_write;

  covergroup cg;
    cp_addr: coverpoint addr {
      bins low   = {[0:'hFFF]};
      bins mid   = {['h1000:'hFFFF]};
      bins high  = {['h1_0000:$]};
    }
    cp_dir: coverpoint is_write {
      bins rd = {0};
      bins wr = {1};
    }
    x_addr_dir: cross cp_addr, cp_dir;   // 6개 조합 bin
  endgroup

  function new(); cg = new(); endfunction
  function void sample(bit [31:0] a, bit w);
    addr = a; is_write = w; cg.sample();
  endfunction
endclass
```

## bins 종류

```sv
coverpoint len {
  bins one      = {1};
  bins small[]  = {[2:15]};      // 각 값마다 별도 bin (array bins)
  bins big      = {[16:$]};
  bins legal[]  = {[1:64]};
  illegal_bins  bad = {0};       // 발생하면 에러
  ignore_bins   skip = {[100:$]};
}
```

## transition bins

```sv
coverpoint state {
  bins idle_to_busy = (IDLE => BUSY);
  bins busy_to_done = (BUSY => DONE);
}
```

## cross — 조합 커버리지

가장 가치 있는 건 보통 **cross**입니다. "쓰기이면서 high 주소이면서 burst len=64"가 실제로 한 번이라도 일어났는가?

```sv
x_full: cross cp_dir, cp_addr, cp_len {
  ignore_bins rd_no_len = binsof(cp_dir.rd);  // 읽기엔 len 무의미 → 제외
}
```

:::gotcha
**code coverage 100% ≠ 검증 완료.** 모든 라인을 한 번씩 토글해도, "write 직후 read", "reset 중 transaction" 같은 의도한 **시나리오**가 일어났는지는 functional coverage만 말해준다. 둘은 보완 관계.
:::

:::tip
coverage는 monitor가 만든 transaction을 **subscriber**(`uvm_subscriber`)에서 sample하는 것이 정석. driver에서 sample하면 실제 DUT에 들어간 게 아니라 "보내려던 것"을 세게 된다(Part 4 참고).
:::

```check
Q: code coverage가 100%인데도 functional coverage를 봐야 하는 이유는?
A: code coverage는 RTL의 모든 라인/토글/브랜치가 한 번씩 실행됐는지만 본다. 반면 의도한 **시나리오 조합**(예: write 직후 같은 주소 read, reset 중 burst)이 실제로 발생했는지는 알려주지 않는다. functional coverage(특히 cross)가 그 검증 의도의 달성도를 정량화한다.
H: 라인은 다 밟았지만 특정 순서/조합은 안 일어났을 수 있다.
```

```check
Q: coverage를 driver가 아니라 monitor 쪽(subscriber)에서 sample 해야 하는 이유는?
A: driver는 "보내려던 의도"를 알 뿐이고, 실제 DUT 핀에서 관측된 것은 monitor가 본다. coverage는 실제로 발생한 동작을 측정해야 하므로 monitor가 publish한 transaction을 subscriber가 sample하는 것이 정확하다.
```
