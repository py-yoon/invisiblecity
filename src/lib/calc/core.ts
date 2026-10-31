// 부동산 계산기의 계산식. 화면과 무관한 순수 함수만 둔다(scripts/calc.test.mjs 가 검산).
// 금액 단위는 모두 원. 세율표 기준일은 BASIS_DATE.

export const BASIS_DATE = '2026년 7월';

/* ───── 표시 ───── */
export const comma = (n: number) => Math.round(n).toLocaleString('ko-KR');
export const won = (n: number) => `${comma(n)}원`;
// 소수점 아래 끝의 0만 지운다: 20.00 → 20, 2.50 → 2.5
export const pct = (n: number, d = 2) => `${(Number.isFinite(n) ? n : 0).toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')}%`;

// 1234567890 → '12억 3,456만 7,890원'
export function kor(n: number): string {
  const sign = n < 0 ? '−' : '';
  let rest = Math.floor(Math.abs(n));
  if (!rest) return '0원';
  const out: string[] = [];
  for (const [u, name] of [[1e12, '조'], [1e8, '억'], [1e4, '만']] as const) {
    const q = Math.floor(rest / u);
    if (q) { out.push(`${q.toLocaleString('ko-KR')}${name}`); rest -= q * u; }
  }
  if (rest) out.push(rest.toLocaleString('ko-KR'));
  return `${sign}${out.join(' ')}원`;
}

// 누진세율표: [구간 상한, 세율, 누진공제]
type Table = [number, number, number][];
export function progressive(base: number, table: Table) {
  if (base <= 0) return { tax: 0, rate: 0 };
  const row = table.find(([cap]) => base <= cap)!;
  return { tax: Math.max(0, base * row[1] - row[2]), rate: row[1] };
}

/* ═════ 취득세 ═════ */
export type AcqCause = 'buy' | 'gift' | 'inherit' | 'etc';
export type Homes = '1' | '2' | '3' | '4' | 'corp';
export interface AcqInput { cause: AcqCause; price: number; homes: Homes; adj: boolean; big: boolean; first: boolean; temp2: boolean }

// 6억~9억 구간: (취득가액 × 2/3억 − 3)%, 소수점 넷째 자리까지
export function baseAcqRate(price: number) {
  if (price <= 6e8) return 1;
  if (price <= 9e8) return Math.round((price * 2 / 3e8 - 3) * 10000) / 10000;
  return 3;
}

export function acquisition(i: AcqInput) {
  let rate = 0, edu = 0, rural = 0, heavy = false;
  const notes: string[] = [];
  if (i.cause === 'etc') {
    rate = 4; edu = 0.4; rural = 0.2;
    notes.push('토지·상가 같은 주택 외 부동산은 면적과 관계없이 농어촌특별세 0.2%가 붙습니다.');
  } else if (i.cause === 'gift') {
    if (i.adj && i.price >= 3e8) {
      rate = 12; edu = 0.4; rural = i.big ? 1 : 0; heavy = true;
      notes.push('조정대상지역의 시가표준액 3억원 이상 주택 증여는 12%입니다. 1세대 1주택자가 배우자·직계존비속에게 증여하면 3.5%가 적용됩니다.');
    } else { rate = 3.5; edu = 0.3; rural = i.big ? 0.2 : 0; }
  } else if (i.cause === 'inherit') {
    if (i.homes === '1') {
      rate = 0.8; edu = 0.16; rural = 0;
      notes.push('무주택 세대가 상속으로 1주택이 되면 특례세율 0.8%입니다.');
    } else { rate = 2.8; edu = 0.16; rural = i.big ? 0.2 : 0; }
  } else if (i.homes === 'corp') {
    rate = 12; edu = 0.4; rural = i.big ? 1 : 0; heavy = true;
    notes.push('법인이 주택을 사면 주택 수와 관계없이 12%입니다.');
  } else {
    const n = Number(i.homes), base = baseAcqRate(i.price);
    if (n === 1 || (n === 2 && i.temp2)) rate = base;
    else if (n === 2) rate = i.adj ? 8 : base;
    else if (n === 3) rate = i.adj ? 12 : 8;
    else rate = 12;
    if (n === 2 && i.temp2) notes.push('일시적 2주택은 종전 주택을 기한 안에 팔면 1주택 세율이 적용됩니다. 기한을 넘기면 중과세율과의 차액이 추징됩니다.');
    if (rate === 8 || rate === 12) {
      heavy = true; edu = 0.4; rural = i.big ? (rate === 8 ? 0.6 : 1) : 0;
      notes.push(`${i.adj ? '조정대상지역' : '비조정지역'} ${n}주택은 ${rate}% 중과입니다.`);
    } else {
      edu = Math.round(rate * 0.1 * 10000) / 10000; // 표준세율의 1/2 × 20%
      rural = i.big ? 0.2 : 0;
    }
  }
  const acq = i.price * rate / 100, eduTax = i.price * edu / 100, ruralTax = i.price * rural / 100;
  let cut = 0;
  if (i.cause === 'buy' && i.first) {
    if (i.homes !== '1') notes.push('생애최초 감면은 취득 후 1주택일 때만 받을 수 있습니다.');
    else if (i.price > 12e8) notes.push('생애최초 감면은 취득가액 12억원 이하 주택만 대상입니다.');
    else cut = Math.min(acq, 2e6);
  }
  return { rate, edu, rural, acq, eduTax, ruralTax, cut, heavy, notes, total: acq - cut + eduTax + ruralTax };
}

/* ═════ 보유세 (재산세 + 종합부동산세) ═════ */
const PROP_STD: Table = [[6e7, 0.001, 0], [1.5e8, 0.0015, 3e4], [3e8, 0.0025, 18e4], [Infinity, 0.004, 63e4]];
const PROP_ONE: Table = [[6e7, 0.0005, 0], [1.5e8, 0.001, 3e4], [3e8, 0.002, 18e4], [Infinity, 0.0035, 63e4]];
const CTAX_GEN: Table = [[3e8, 0.005, 0], [6e8, 0.007, 6e5], [12e8, 0.01, 24e5], [25e8, 0.013, 6e6], [50e8, 0.015, 11e6], [94e8, 0.02, 36e6], [Infinity, 0.027, 101.8e6]];
const CTAX_MUL: Table = [[3e8, 0.005, 0], [6e8, 0.007, 6e5], [12e8, 0.01, 24e5], [25e8, 0.02, 14.4e6], [50e8, 0.03, 39.4e6], [94e8, 0.04, 89.4e6], [Infinity, 0.05, 183.4e6]];

export interface HoldInput { price: number; homes: 1 | 2 | 3; urban: boolean; age: number; years: number }

export const ageCredit = (age: number) => (age >= 70 ? 0.4 : age >= 65 ? 0.3 : age >= 60 ? 0.2 : 0);
export const holdCredit = (y: number) => (y >= 15 ? 0.5 : y >= 10 ? 0.4 : y >= 5 ? 0.2 : 0);

export function holding(i: HoldInput) {
  const single = i.homes === 1;
  // 재산세 공정시장가액비율: 1세대 1주택 특례 43~45%, 그 밖 60%
  const fair = single ? (i.price <= 3e8 ? 0.43 : i.price <= 6e8 ? 0.44 : 0.45) : 0.6;
  const pBase = i.price * fair;
  const p = progressive(pBase, single && i.price <= 9e8 ? PROP_ONE : PROP_STD);
  const propEdu = p.tax * 0.2, propUrban = i.urban ? pBase * 0.0014 : 0;
  const propTotal = p.tax + propEdu + propUrban;

  const deduct = single ? 12e8 : 9e8;
  const cBase = Math.max(0, i.price - deduct) * 0.6;
  const c = progressive(cBase, i.homes >= 3 ? CTAX_MUL : CTAX_GEN);
  // 종부세 과세표준에 해당하는 재산세는 빼 준다(근사)
  const overlap = c.tax > 0 ? Math.min(p.tax, progressive(cBase * fair, PROP_STD).tax) : 0;
  let ctax = Math.max(0, c.tax - overlap);
  const creditRate = single ? Math.min(0.8, ageCredit(i.age) + holdCredit(i.years)) : 0;
  const credit = ctax * creditRate;
  ctax -= credit;
  const ctaxRural = ctax * 0.2;
  return {
    fair, pBase, propRate: p.rate, propTax: p.tax, propEdu, propUrban, propTotal,
    deduct, cBase, ctaxRate: c.rate, ctaxGross: c.tax, overlap, creditRate, credit, ctax, ctaxRural,
    ctaxTotal: ctax + ctaxRural, total: propTotal + ctax + ctaxRural,
  };
}

/* ═════ 양도소득세 (주택) ═════ */
const INCOME: Table = [[14e6, 0.06, 0], [50e6, 0.15, 1.26e6], [88e6, 0.24, 5.76e6], [150e6, 0.35, 15.44e6], [300e6, 0.38, 19.94e6], [500e6, 0.4, 25.94e6], [1e9, 0.42, 35.94e6], [Infinity, 0.45, 65.94e6]];
export const incomeTax = (base: number) => progressive(base, INCOME);

export type CgtCase = 'one' | 'general' | 'heavy2' | 'heavy3';
export interface CgtInput { sale: number; buy: number; cost: number; hold: number; live: number; kind: CgtCase }

// 장기보유특별공제율(%)
export function ltDeduction(kind: CgtCase, hold: number, live: number) {
  const h = Math.floor(hold), l = Math.floor(live);
  if (kind === 'heavy2' || kind === 'heavy3' || h < 3) return { rate: 0, holdPart: 0, livePart: 0, special: false };
  if (kind === 'one' && l >= 2) {
    const holdPart = Math.min(40, 4 * h), livePart = Math.min(40, 4 * l);
    return { rate: holdPart + livePart, holdPart, livePart, special: true };
  }
  const rate = Math.min(30, 6 + 2 * (h - 3));
  return { rate, holdPart: rate, livePart: 0, special: false };
}

export function capitalGains(i: CgtInput) {
  const notes: string[] = [];
  const gain = Math.max(0, i.sale - i.buy - i.cost);
  let taxable = gain, exempt = false;
  if (i.kind === 'one') {
    if (i.sale <= 12e8) { exempt = true; taxable = 0; }
    else taxable = gain * (i.sale - 12e8) / i.sale; // 12억 초과분만 과세
  }
  const ltd = ltDeduction(i.kind, i.hold, i.live);
  const ltdAmt = taxable * ltd.rate / 100;
  const income = taxable - ltdAmt;
  const base = Math.max(0, income - 2.5e6);
  const add = i.kind === 'heavy2' ? 0.2 : i.kind === 'heavy3' ? 0.3 : 0;
  const basic = incomeTax(base);
  const heavyTax = basic.tax + base * add;
  const short = i.hold < 1 ? 0.7 : i.hold < 2 ? 0.6 : 0;
  const shortTax = base * short;
  const tax = Math.max(heavyTax, shortTax);
  const rateLabel = shortTax > heavyTax ? `단기 ${short * 100}%` : `${pct((basic.rate + add) * 100, 0)}${add ? ' (중과)' : ''}`;
  if (i.kind === 'one' && exempt) notes.push('1세대 1주택 비과세 요건을 갖췄고 양도가액이 12억원 이하라 양도세가 없습니다.');
  if (i.kind === 'one' && !exempt) notes.push('양도가액 12억원을 넘는 부분의 차익에만 과세합니다.');
  if (i.kind === 'one' && !ltd.special && i.hold >= 3) notes.push('거주 2년 미만이라 1주택 장기보유특별공제(최대 80%) 대신 일반 공제(최대 30%)를 적용했습니다.');
  if (add) notes.push('다주택 중과는 기본세율에 20%p(2주택) 또는 30%p(3주택 이상)를 더하고 장기보유특별공제를 빼지 않습니다. 중과 유예 여부는 양도 시점의 법령을 확인하세요.');
  if (short) notes.push(`보유 ${i.hold < 1 ? '1년 미만' : '2년 미만'} 주택은 ${short * 100}% 단일세율과 비교해 큰 금액을 냅니다.`);
  return { gain, exempt, taxable, ltd, ltdAmt, income, base, rateLabel, tax, local: tax * 0.1, total: tax * 1.1, notes };
}

/* ═════ 중개보수 (서울시 조례) ═════ */
const FEE_SALE: [number, number, number | null][] = [[5e7, 0.006, 25e4], [2e8, 0.005, 8e5], [9e8, 0.004, null], [12e8, 0.005, null], [15e8, 0.006, null], [Infinity, 0.007, null]];
const FEE_RENT: [number, number, number | null][] = [[5e7, 0.005, 2e5], [1e8, 0.004, 3e5], [6e8, 0.003, null], [12e8, 0.004, null], [15e8, 0.005, null], [Infinity, 0.006, null]];
export type FeeKind = 'sale' | 'rent' | 'offi_sale' | 'offi_rent' | 'etc';

export function brokerage(kind: FeeKind, deposit: number, monthly: number, offiOk = true) {
  const rent = kind === 'rent' || kind === 'offi_rent';
  let amount = deposit, note = '';
  if (rent && monthly > 0) {
    amount = deposit + monthly * 100;
    if (amount < 5e7) { amount = deposit + monthly * 70; note = '환산 거래금액이 5천만원 미만이라 월세 × 70으로 다시 계산했습니다.'; }
  }
  let rate = 0, cap: number | null = null;
  if (kind === 'etc' || (kind.startsWith('offi') && !offiOk)) rate = 0.009;
  else if (kind === 'offi_sale') rate = 0.005;
  else if (kind === 'offi_rent') rate = 0.004;
  else {
    const row = (rent ? FEE_RENT : FEE_SALE).find(([lim]) => amount < lim)!;
    rate = row[1]; cap = row[2];
  }
  let fee = amount * rate;
  if (cap !== null && fee > cap) { fee = cap; note = note || `이 구간은 한도액 ${won(cap)}이 적용됩니다.`; }
  return { amount, rate, cap, fee, note };
}

/* ═════ 대출 상환 ═════ */
export type Method = 'equal' | 'principal' | 'bullet';
export interface Row { m: number; prin: number; int: number; bal: number }

export const annuity = (P: number, r: number, n: number) => (n <= 0 ? 0 : r === 0 ? P / n : P * r / (1 - Math.pow(1 + r, -n)));

export function schedule(P: number, annualRate: number, years: number, method: Method, graceYears = 0) {
  const r = annualRate / 100 / 12, n = Math.round(years * 12);
  const g = Math.min(Math.round(graceYears * 12), n - 1), pay = n - g;
  const rows: Row[] = [];
  let bal = P;
  for (let m = 1; m <= g; m++) rows.push({ m, prin: 0, int: P * r, bal: P });
  const M = annuity(P, r, pay);
  for (let m = g + 1; m <= n; m++) {
    const int = bal * r;
    let prin = method === 'equal' ? M - int : method === 'principal' ? P / pay : 0;
    if (m === n) prin = bal;
    bal = Math.max(0, bal - prin);
    rows.push({ m, prin, int, bal });
  }
  const totalInt = rows.reduce((s, x) => s + x.int, 0);
  const firstPay = rows[g] ? rows[g].prin + rows[g].int : 0;
  return { rows, totalInt, firstPay, lastPay: rows.length ? rows[rows.length - 1].prin + rows[rows.length - 1].int : 0, graceInt: P * r };
}

/* ═════ 주택담보대출 한도 (LTV · DSR · 금액 상한) ═════ */
// 2025.6.27·10.15 대책 기준 기본값. 은행·상품마다 다르므로 화면에서 고쳐 쓸 수 있게 한다.
export type Region = 'reg' | 'metro' | 'local';
export type Buyer = 'none' | 'first' | 'one' | 'multi';
const LTV: Record<Region, Record<Buyer, number>> = {
  reg: { none: 40, first: 70, one: 40, multi: 0 },
  metro: { none: 70, first: 70, one: 70, multi: 0 },
  local: { none: 70, first: 80, one: 70, multi: 60 },
};
export const autoLtv = (r: Region, b: Buyer) => LTV[r][b];
export const autoStress = (r: Region) => (r === 'local' ? 0.75 : 3);
// 수도권·규제지역 주담대 최대 금액: 시가 15억 이하 6억, 25억 이하 4억, 초과 2억
export const loanCap = (r: Region, price: number) => (r === 'local' ? Infinity : price <= 15e8 ? 6e8 : price <= 25e8 ? 4e8 : 2e8);

export interface LimitInput { price: number; region: Region; buyer: Buyer; ltv: number; senior: number; income: number; existing: number; rate: number; stress: number; years: number; dsr: number }

export function loanLimit(i: LimitInput) {
  const ltvLimit = Math.max(0, i.price * i.ltv / 100 - i.senior);
  const cap = loanCap(i.region, i.price);
  const n = Math.round(i.years * 12);
  const rStress = (i.rate + i.stress) / 100 / 12;
  const roomYear = Math.max(0, i.income * i.dsr / 100 - i.existing);
  const perWon = annuity(1, rStress, n) * 12; // 대출 1원당 연 원리금(스트레스 금리)
  const dsrLimit = perWon > 0 ? roomYear / perWon : 0;
  const final = Math.max(0, Math.min(ltvLimit, cap, dsrLimit));
  const binding = final === dsrLimit ? 'DSR' : final === cap ? '금액 상한' : 'LTV';
  const monthly = annuity(final, i.rate / 100 / 12, n);
  return { ltvLimit, cap, dsrLimit, final, binding, monthly, dsrActual: i.income > 0 ? (i.existing + final * perWon) / i.income * 100 : 0 };
}

/* ═════ 중도상환수수료 ═════ */
export function prepayFee(amount: number, ratePct: number, usedMonths: number, termMonths: number) {
  const remain = Math.max(0, termMonths - usedMonths);
  return { remain, fee: termMonths > 0 ? amount * ratePct / 100 * remain / termMonths : 0 };
}

/* ═════ 청약 가점 (84점 만점) ═════ */
export const homelessScore = (years: number, none: boolean) => (none ? 0 : years < 1 ? 2 : Math.min(32, 2 + 2 * Math.floor(years)));
export const familyScore = (n: number) => Math.min(35, 5 + 5 * Math.floor(n));
export const accountScore = (years: number) => (years < 0.5 ? 1 : years < 1 ? 2 : Math.min(17, 2 + Math.floor(years)));

/* ═════ 면적 ═════ */
export const PYEONG = 3.305785;
