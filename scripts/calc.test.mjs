// 부동산 계산기 계산식 검산: node scripts/calc.test.mjs
// 기대값은 세율표로 손계산한 값이다.
import assert from 'node:assert/strict';
import * as c from '../src/lib/calc/core.ts';
import { CALCS, defaults, resolve } from '../src/lib/calc/calculators.ts';

const near = (a, b, tol = 1) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('취득세 6~9억 구간 세율', () => {
  assert.equal(c.baseAcqRate(6e8), 1);
  assert.equal(c.baseAcqRate(7.5e8), 2);
  assert.equal(c.baseAcqRate(8e8), 2.3333);
  assert.equal(c.baseAcqRate(9.5e8), 3);
});
t('취득세 9억 1주택', () => {
  const r = c.acquisition({ cause: 'buy', price: 9e8, homes: '1', adj: true, big: false, first: false, temp2: false });
  assert.equal(r.rate, 3); near(r.total, 29.7e6);
});
t('취득세 조정지역 2주택 중과·일시적 2주택', () => {
  const heavy = c.acquisition({ cause: 'buy', price: 10e8, homes: '2', adj: true, big: true, first: false, temp2: false });
  assert.equal(heavy.rate, 8); near(heavy.total, 10e8 * (0.08 + 0.004 + 0.006));
  const temp = c.acquisition({ cause: 'buy', price: 10e8, homes: '2', adj: true, big: false, first: false, temp2: true });
  assert.equal(temp.rate, 3);
});
t('생애최초 감면 200만원 한도', () => {
  const r = c.acquisition({ cause: 'buy', price: 5e8, homes: '1', adj: false, big: false, first: true, temp2: false });
  assert.equal(r.cut, 2e6); near(r.total, 5e6 - 2e6 + 5e5);
});
t('보유세 1주택 공시 15억', () => {
  const r = c.holding({ price: 15e8, homes: 1, urban: true, age: 50, years: 6 });
  near(r.propTax, 2.07e6); near(r.cBase, 1.8e8); near(r.ctaxGross, 9e5);
  near(r.overlap, 91500); near(r.total, 4205160, 2);
});
t('종부세 3주택 중과표', () => {
  const r = c.holding({ price: 40e8, homes: 3, urban: false, age: 0, years: 0 });
  near(r.cBase, 18.6e8); near(r.ctaxGross, 18.6e8 * 0.02 - 14.4e6);
});
t('양도세 1주택 12억 초과', () => {
  const r = c.capitalGains({ sale: 15e8, buy: 9e8, cost: 3e7, hold: 6, live: 4, kind: 'one' });
  near(r.taxable, 1.14e8); assert.equal(r.ltd.rate, 40); near(r.base, 65.9e6); near(r.tax, 10.056e6); near(r.total, 11.0616e6, 2);
});
t('양도세 비과세·단기·중과', () => {
  assert.equal(c.capitalGains({ sale: 10e8, buy: 5e8, cost: 0, hold: 3, live: 3, kind: 'one' }).total, 0);
  const s = c.capitalGains({ sale: 6e8, buy: 5e8, cost: 0, hold: 1.5, live: 0, kind: 'general' });
  near(s.tax, (1e8 - 2.5e6) * 0.6);
  const h = c.capitalGains({ sale: 6e8, buy: 5e8, cost: 0, hold: 5, live: 0, kind: 'heavy3' });
  assert.equal(h.ltd.rate, 0); near(h.tax, 97.5e6 * 0.35 - 15.44e6 + 97.5e6 * 0.3);
});
t('중개보수 구간 경계와 한도', () => {
  near(c.brokerage('sale', 9e8, 0).fee, 4.5e6);
  near(c.brokerage('sale', 8.99e8, 0).fee, 8.99e8 * 0.004);
  near(c.brokerage('sale', 1e8, 0).fee, 5e5);
  near(c.brokerage('sale', 1.8e8, 0).fee, 8e5);
  const r = c.brokerage('rent', 1e7, 5e5); // 1천 + 50만×100 = 6천 → 0.4%, 한도 30만
  near(r.amount, 6e7); near(r.fee, 2.4e5);
});
t('원리금균등 월 상환액', () => {
  const s = c.schedule(4e8, 4.2, 30, 'equal');
  near(s.firstPay, 1956069, 1); near(s.rows.at(-1).bal, 0);
  const p = c.schedule(1.2e8, 6, 10, 'principal');
  near(p.firstPay, 1e6 + 6e5); assert.equal(p.rows.length, 120);
});
t('대출 한도는 LTV·상한·DSR 중 최소', () => {
  const r = c.loanLimit({ price: 9e8, region: 'reg', buyer: 'none', ltv: 40, senior: 0, income: 8e7, existing: 0, rate: 4.2, stress: 3, years: 30, dsr: 40 });
  near(r.ltvLimit, 3.6e8); assert.equal(r.cap, 6e8);
  assert.equal(r.final, Math.min(r.ltvLimit, r.cap, r.dsrLimit));
  near(r.dsrActual, r.binding === 'DSR' ? 40 : r.dsrActual, 0.01);
  assert.equal(c.loanCap('reg', 20e8), 4e8); assert.equal(c.loanCap('local', 50e8), Infinity);
});
t('청약 가점', () => {
  assert.equal(c.homelessScore(8, false), 18); assert.equal(c.homelessScore(20, false), 32); assert.equal(c.homelessScore(5, true), 0);
  assert.equal(c.familyScore(2), 15); assert.equal(c.familyScore(9), 35);
  assert.equal(c.accountScore(0.3), 1); assert.equal(c.accountScore(7), 9); assert.equal(c.accountScore(20), 17);
});
t('모든 계산기가 기본값으로 숫자를 낸다', () => {
  for (const calc of CALCS) {
    const r = calc.compute(resolve(calc, defaults(calc)));
    const text = JSON.stringify(r);
    assert.ok(!/NaN|Infinity|undefined/.test(text), `${calc.id}: ${text}`);
  }
});
t('퍼센트 표시', () => {
  assert.equal(c.pct(20, 0), '20%'); assert.equal(c.pct(2.5), '2.5%'); assert.equal(c.pct(100), '100%'); assert.equal(c.pct(2.3333, 4), '2.3333%'); assert.equal(c.pct(0.4), '0.4%');
});
console.log(`${n}개 통과`);
