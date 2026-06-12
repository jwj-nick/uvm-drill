<!-- filename: content/c/m4-rle-ral.md · created 2026-06-12 -->
# M4 — RLE + APB config 레지스터 + RAL

:::tldr
- M3 인코더에 **APB로 접근하는 config 레지스터**(예: max run-length, bypass)를 붙이고, UVM **RAL**로 검증한다.
- uvm_reg 모델 + adapter + predictor, frontdoor(APB)/backdoor(hdl_path) 접근을 모두 다룬다.
- 레지스터를 바꾸면 인코더 동작이 바뀌는 것까지 end-to-end로 확인 — 프로젝트 아크의 마무리.
:::

:::note 🚧 이 챕터는 만들며 채워진다
M3를 마친 뒤 착수. RAL은 추상화 층이 많아 보일러플레이트가 크다 — 실행은 회사 VCS 권장(집은 svcheck로 문법 확인). 흐름 이해 위주로 기록.
:::

## 만들 것 (build spec)
- **DUT 확장:** APB slave + config register block(1~3개 레지스터)을 M3 RLE에 추가.
- **RAL:** uvm_reg 모델 + adapter(reg2bus/bus2reg) + predictor.
- **접근:** frontdoor(APB 경유) / backdoor(hdl_path) 둘 다.
- **시퀀스:** built-in reg 시퀀스(hw_reset/bit-bash 등) + "레지스터가 인코더 동작에 반영되는지" end-to-end.
- **검증 목표:** reg test 통과 + 레지스터 값 변경이 DUT 동작을 바꿈을 확인.

## 이걸 위해 공부할 것 (study map)
- [Register Model](#/a/part6/reg-model) · [Adapter & Predictor](#/a/part6/adapter-predictor)
- [Frontdoor vs Backdoor](#/a/part6/frontdoor-backdoor) · [Built-in Reg Sequences](#/a/part6/ral-sequences)
- **개념 대조:** [Track B · RAL 통합](#/b/mig/ral)
- 참조: [RAL API 요약](#/ref/cheat/ral-api)

```check
Q: RAL의 frontdoor와 backdoor 접근의 차이는?
A: **frontdoor**는 실제 버스(APB) 트랜잭션을 통해 레지스터를 읽고/쓴다(실제 경로·타이밍 검증). **backdoor**는 시뮬레이터의 hdl_path로 신호에 직접 접근해 즉시 읽고/쓴다(0 time, 셋업·검사 가속). 보통 backdoor로 빠르게 세팅하고 frontdoor로 실제 경로를 검증한다.
H: 버스를 거치나, 신호에 직접 닿나
```
