// 계산기 13개의 입력 항목과 결과 구성. 페이지(tools-2.astro)는 이 정의로 입력란을 그리고,
// 브라우저 스크립트는 같은 정의의 compute()로 결과를 낸다. 금액 입력은 만원 단위.
import {
  acquisition, holding, capitalGains, brokerage, schedule, loanLimit, prepayFee, annuity,
  autoLtv, autoStress, homelessScore, familyScore, accountScore, PYEONG,
  won, kor, pct, comma, ageCredit, holdCredit,
  type Homes, type AcqCause, type CgtCase, type FeeKind, type Method, type Region, type Buyer,
} from './core.ts';

export type Values = Record<string, any>;
export interface Field {
  k: string;
  type: 'money' | 'num' | 'seg' | 'check';
  label: string;
  hint?: string;
  def: number | string | boolean | null; // null이면 auto() 값을 쓴다
  unit?: string;
  step?: number;
  options?: [string, string][];
  show?: (v: Values) => boolean;
  auto?: (v: Values) => number;
}
export interface Row { k: string; v: string; rate?: string; tone?: 'hot' | 'neg' | 'sum' | 'sub' }
export interface Note { t: string; warn?: boolean }
export interface Result { label: string; value: string; sub?: string; tag?: string; rows: Row[]; notes: Note[]; table?: { caption: string; head: string[]; rows: string[][] } }
export interface Calc { id: string; group: string; name: string; title: string; lead: string; fields: Field[]; compute: (v: Values) => Result; basis?: string[] }

const M = 1e4; // 만원

const REGION_OPTS: [string, string][] = [['reg', '규제지역'], ['metro', '수도권 비규제'], ['local', '지방']];
const REGION_HINT = '규제지역: 서울 전역과 경기 일부(2025.10.15 지정). 조정대상지역과 같습니다.';

/* ═════ 1. 집 살 때 드는 돈 (통합) ═════ */
const buy: Calc = {
  id: 'buy', group: '한눈에', name: '집 살 때 드는 돈', title: '집 살 때 필요한 현금',
  lead: '매매가 하나로 취득세, 중개보수, 대출 한도를 한꺼번에 계산해 실제로 준비해야 할 현금을 보여 줍니다.',
  fields: [
    { k: 'price', type: 'money', label: '매매가', def: 90000 },
    { k: 'region', type: 'seg', label: '지역', options: REGION_OPTS, def: 'reg', hint: REGION_HINT },
    { k: 'homes', type: 'seg', label: '산 뒤 주택 수', options: [['1', '1주택'], ['2', '2주택'], ['3', '3주택 이상']], def: '1' },
    { k: 'first', type: 'check', label: '생애최초 구입', def: false, show: (v) => v.homes === '1' },
    { k: 'temp2', type: 'check', label: '일시적 2주택 (종전 집 처분 예정)', def: true, show: (v) => v.homes === '2' },
    { k: 'big', type: 'check', label: '전용 85㎡ 초과', def: false },
    { k: 'income', type: 'money', label: '연소득', hint: '부부 합산 가능', def: 8000 },
    { k: 'existing', type: 'money', label: '다른 대출 연 원리금', def: 0 },
    { k: 'rate', type: 'num', label: '대출 금리', unit: '%', step: 0.01, def: 4.2 },
    { k: 'years', type: 'num', label: '대출 기간', unit: '년', step: 1, def: 30 },
    { k: 'loanMode', type: 'seg', label: '대출', options: [['max', '최대 한도'], ['manual', '직접 입력'], ['none', '안 받음']], def: 'max' },
    { k: 'loan', type: 'money', label: '대출 금액', def: 30000, show: (v) => v.loanMode === 'manual' },
    { k: 'etc', type: 'money', label: '기타 비용', hint: '법무사 보수·채권 할인·이사·인테리어', def: 500 },
  ],
  compute(v) {
    const price = v.price * M;
    const homes = v.homes as '1' | '2' | '3';
    const region = v.region as Region;
    const acq = acquisition({ cause: 'buy', price, homes: homes === '3' ? '3' : homes, adj: region === 'reg', big: v.big, first: v.first, temp2: v.temp2 });
    const fee = brokerage('sale', price, 0);
    const feeTotal = fee.fee * 1.1;
    const buyer: Buyer = homes === '1' ? (v.first ? 'first' : 'none') : homes === '2' && v.temp2 ? 'one' : 'multi';
    const lim = loanLimit({ price, region, buyer, ltv: autoLtv(region, buyer), senior: 0, income: v.income * M, existing: v.existing * M, rate: v.rate, stress: autoStress(region), years: v.years, dsr: 40 });
    const loan = v.loanMode === 'none' ? 0 : v.loanMode === 'manual' ? Math.min(v.loan * M, price) : lim.final;
    const etc = v.etc * M;
    const cash = price + acq.total + feeTotal + etc - loan;
    const monthly = annuity(loan, v.rate / 100 / 12, Math.round(v.years * 12));
    const notes: Note[] = [];
    if (v.loanMode === 'manual' && loan > lim.final) notes.push({ t: `입력한 대출(${kor(loan)})이 예상 한도(${kor(lim.final)})보다 큽니다. 은행 심사에서 줄어들 수 있습니다.`, warn: true });
    if (v.loanMode === 'max') notes.push({ t: `대출 한도는 ${lim.binding} 기준으로 정해졌습니다. 자세한 계산은 '대출 한도' 탭에서 볼 수 있습니다.` });
    acq.notes.forEach((t) => notes.push({ t, warn: acq.heavy }));
    return {
      label: '준비할 현금', value: won(cash), sub: kor(cash), tag: `대출 ${kor(loan)}`,
      rows: [
        { k: '매매가', v: won(price) },
        { k: '취득세 등', rate: pct(acq.rate), v: `+${won(acq.total)}`, tone: acq.heavy ? 'hot' : undefined },
        { k: '중개보수(부가세 포함)', rate: pct(fee.rate * 100, 1), v: `+${won(feeTotal)}` },
        { k: '기타 비용', v: `+${won(etc)}` },
        { k: '대출', v: `−${won(loan)}`, tone: 'neg' },
        { k: '대출 월 상환액', rate: `${v.years}년 원리금균등`, v: won(monthly) },
        { k: '필요 현금', v: won(cash), tone: 'sum' },
      ],
      notes,
    };
  },
};

/* ═════ 2. 취득세 ═════ */
const acq: Calc = {
  id: 'acq', group: '세금', name: '취득세', title: '취득세',
  lead: '부동산을 사거나 증여·상속받을 때 내는 세금입니다. 취득세에 지방교육세와 농어촌특별세가 함께 붙습니다.',
  fields: [
    { k: 'cause', type: 'seg', label: '취득 원인', options: [['buy', '매매'], ['gift', '증여'], ['inherit', '상속'], ['etc', '주택 외']], def: 'buy' },
    { k: 'price', type: 'money', label: '취득가액', hint: '증여·상속은 시가표준액', def: 90000 },
    { k: 'homes', type: 'seg', label: '취득 후 주택 수', hint: '1세대 기준. 상속은 무주택이었으면 1주택', options: [['1', '1주택'], ['2', '2주택'], ['3', '3주택'], ['4', '4주택+'], ['corp', '법인']], def: '1', show: (v) => v.cause === 'buy' || v.cause === 'inherit' },
    { k: 'temp2', type: 'check', label: '일시적 2주택 (종전 집 처분 예정)', def: false, show: (v) => v.cause === 'buy' && v.homes === '2' },
    { k: 'adj', type: 'check', label: '조정대상지역', hint: REGION_HINT, def: true, show: (v) => v.cause !== 'etc' && v.cause !== 'inherit' },
    { k: 'big', type: 'check', label: '전용 85㎡ 초과', def: false, show: (v) => v.cause !== 'etc' },
    { k: 'first', type: 'check', label: '생애최초 구입', def: false, show: (v) => v.cause === 'buy' && v.homes === '1' },
  ],
  compute(v) {
    const price = v.price * M;
    const r = acquisition({ cause: v.cause as AcqCause, price, homes: v.homes as Homes, adj: v.adj, big: v.big, first: v.first, temp2: v.temp2 });
    const rows: Row[] = [{ k: '취득세', rate: pct(r.rate, 4), v: won(r.acq), tone: r.heavy ? 'hot' : undefined }];
    if (r.cut) rows.push({ k: '생애최초 감면', v: `−${won(r.cut)}`, tone: 'neg' });
    rows.push({ k: '지방교육세', rate: pct(r.edu, 4), v: won(r.eduTax) });
    rows.push({ k: '농어촌특별세', rate: r.rural ? pct(r.rural, 1) : '비과세', v: won(r.ruralTax) });
    rows.push({ k: '실효세율', v: price ? pct(r.total / price * 100) : '—', tone: 'sum' });
    return { label: '납부할 세금', value: won(r.total), sub: kor(r.total), tag: `세율 ${pct(r.rate, 4)}`, rows, notes: r.notes.map((t) => ({ t, warn: r.heavy })) };
  },
  basis: ['6억~9억원 주택은 (취득가액 × 2/3억 − 3)% 공식으로 1~3% 사이 세율이 정해집니다.', '생애최초 감면은 12억원 이하 주택에 최대 200만원입니다. 3개월 안에 전입해야 하는 등 요건이 있습니다.'],
};

/* ═════ 3. 보유세 ═════ */
const hold: Calc = {
  id: 'hold', group: '세금', name: '보유세', title: '보유세 (재산세 + 종합부동산세)',
  lead: '매년 6월 1일 소유자에게 부과됩니다. 실거래가가 아니라 공시가격으로 계산합니다.',
  fields: [
    { k: 'price', type: 'money', label: '공시가격 합계', hint: '본인 지분 기준', def: 150000 },
    { k: 'homes', type: 'seg', label: '보유 주택 수', options: [['1', '1세대 1주택'], ['2', '2주택'], ['3', '3주택 이상']], def: '1' },
    { k: 'age', type: 'num', label: '나이', unit: '세', step: 1, def: 50, show: (v) => v.homes === '1' },
    { k: 'years', type: 'num', label: '보유 기간', unit: '년', step: 1, def: 6, show: (v) => v.homes === '1' },
    { k: 'urban', type: 'check', label: '도시지역분 포함', hint: '도시지역 주택은 대부분 해당', def: true },
  ],
  compute(v) {
    const r = holding({ price: v.price * M, homes: Number(v.homes) as 1 | 2 | 3, urban: v.urban, age: v.age, years: v.years });
    const rows: Row[] = [
      { k: '재산세', rate: pct(r.propRate * 100), v: won(r.propTax) },
      { k: '지방교육세', rate: '20%', v: won(r.propEdu) },
      { k: '도시지역분', rate: v.urban ? '0.14%' : '—', v: won(r.propUrban) },
      { k: '재산세 합계', v: won(r.propTotal), tone: 'sub' },
    ];
    const notes: Note[] = [];
    if (r.cBase > 0) {
      rows.push({ k: '종부세 산출', rate: pct(r.ctaxRate * 100, 1), v: won(r.ctaxGross), tone: 'hot' });
      rows.push({ k: '재산세 중복분 공제', v: `−${won(r.overlap)}`, tone: 'neg' });
      if (r.credit) rows.push({ k: '고령·장기보유 공제', rate: pct(r.creditRate * 100, 0), v: `−${won(r.credit)}`, tone: 'neg' });
      rows.push({ k: '농어촌특별세', rate: '20%', v: won(r.ctaxRural) });
      rows.push({ k: '종부세 합계', v: won(r.ctaxTotal), tone: 'sub' });
      notes.push({ t: '종부세의 재산세 공제액은 근사치이고, 전년도 대비 세부담 상한(150%)은 반영하지 않았습니다.', warn: true });
    } else {
      rows.push({ k: '종합부동산세', v: '해당 없음' });
      notes.push({ t: `공시가격이 공제금액 ${kor(r.deduct)} 이하라 종부세는 없습니다.` });
    }
    rows.push({ k: '실효세율 (공시가격 대비)', v: pct(r.total / (v.price * M || 1) * 100, 3), tone: 'sum' });
    if (v.homes === '1' && r.cBase > 0) notes.push({ t: `종부세 세액공제: 나이 ${pct(ageCredit(v.age) * 100, 0)} + 보유 ${pct(holdCredit(v.years) * 100, 0)} (합계 최대 80%)` });
    return { label: '올해 보유세', value: won(r.total), sub: kor(r.total), tag: `공정비율 ${pct(r.fair * 100, 0)}`, rows, notes };
  },
  basis: ['재산세 공정시장가액비율: 1세대 1주택 43~45%, 그 밖 60%. 공시가 9억원 이하 1주택은 특례세율(0.05~0.35%).', '종부세: 기본공제 9억원(1세대 1주택 12억원), 공정시장가액비율 60%. 3주택 이상은 과세표준 12억원 초과분에 중과세율.'],
};

/* ═════ 4. 양도소득세 ═════ */
const cgt: Calc = {
  id: 'cgt', group: '세금', name: '양도세', title: '양도소득세 (주택)',
  lead: '집을 팔아 남긴 차익에 매기는 세금입니다. 1세대 1주택 비과세, 장기보유특별공제, 단기 세율을 반영합니다.',
  fields: [
    { k: 'sale', type: 'money', label: '양도가액 (판 값)', def: 150000 },
    { k: 'buy', type: 'money', label: '취득가액 (산 값)', def: 90000 },
    { k: 'cost', type: 'money', label: '필요경비', hint: '취득세·중개보수·확장 공사비 등', def: 3000 },
    { k: 'hold', type: 'num', label: '보유 기간', unit: '년', step: 1, def: 6 },
    { k: 'live', type: 'num', label: '거주 기간', unit: '년', step: 1, def: 4, show: (v) => v.kind === 'one' },
    { k: 'kind', type: 'seg', label: '상황', options: [['one', '1세대 1주택 비과세'], ['general', '일반 과세'], ['heavy2', '2주택 중과'], ['heavy3', '3주택+ 중과']], def: 'one', hint: '비과세는 2년 보유(조정지역에서 산 집은 2년 거주)가 기본 요건' },
  ],
  compute(v) {
    const r = capitalGains({ sale: v.sale * M, buy: v.buy * M, cost: v.cost * M, hold: v.hold, live: v.live, kind: v.kind as CgtCase });
    const rows: Row[] = [
      { k: '양도차익', v: won(r.gain) },
    ];
    if (v.kind === 'one') rows.push({ k: '과세 대상 차익', rate: r.exempt ? '비과세' : '12억 초과분', v: won(r.taxable) });
    rows.push({ k: '장기보유특별공제', rate: r.ltd.special ? `보유 ${r.ltd.holdPart}% + 거주 ${r.ltd.livePart}%` : pct(r.ltd.rate, 0), v: `−${won(r.ltdAmt)}`, tone: 'neg' });
    rows.push({ k: '기본공제', v: `−${won(Math.min(2.5e6, Math.max(0, r.income)))}`, tone: 'neg' });
    rows.push({ k: '과세표준', v: won(r.base), tone: 'sub' });
    rows.push({ k: '양도소득세', rate: r.rateLabel, v: won(r.tax), tone: r.tax ? 'hot' : undefined });
    rows.push({ k: '지방소득세', rate: '10%', v: won(r.local) });
    rows.push({ k: '세후 남는 돈', v: won(r.gain - r.total), tone: 'sum' });
    return { label: '양도세 합계', value: won(r.total), sub: kor(r.total), tag: r.exempt ? '비과세' : r.rateLabel, rows, notes: r.notes.map((t) => ({ t, warn: v.kind.startsWith('heavy') })) };
  },
  basis: ['기본세율 6~45%(8단계), 기본공제 연 250만원, 지방소득세는 양도세의 10%.', '장기보유특별공제: 일반은 3년부터 연 2%씩 최대 30%. 1세대 1주택(2년 이상 거주)은 보유·거주 각 연 4%씩 최대 80%.', '보유 기간은 만 년 단위로 넣습니다. 상속·증여받은 집, 분양권·입주권은 계산이 다릅니다.'],
};

/* ═════ 5. 대출 한도 ═════ */
const limit: Calc = {
  id: 'limit', group: '대출', name: '대출 한도', title: '주택담보대출 한도 (LTV · DSR)',
  lead: '담보 기준(LTV), 소득 기준(DSR), 수도권·규제지역 금액 상한 중 가장 낮은 값이 한도가 됩니다. DSR은 실제 금리에 스트레스 금리를 더해 계산합니다.',
  fields: [
    { k: 'price', type: 'money', label: '집값 (시세)', def: 90000 },
    { k: 'region', type: 'seg', label: '지역', options: REGION_OPTS, def: 'reg', hint: REGION_HINT },
    { k: 'buyer', type: 'seg', label: '매수자', options: [['none', '무주택'], ['first', '생애최초'], ['one', '1주택(처분 조건)'], ['multi', '다주택']], def: 'none' },
    { k: 'income', type: 'money', label: '연소득', def: 8000 },
    { k: 'existing', type: 'money', label: '다른 대출 연 원리금', def: 0 },
    { k: 'rate', type: 'num', label: '대출 금리', unit: '%', step: 0.01, def: 4.2 },
    { k: 'years', type: 'num', label: '대출 기간', unit: '년', step: 1, def: 30 },
    { k: 'ltv', type: 'num', label: 'LTV', unit: '%', step: 1, def: null, auto: (v) => autoLtv(v.region, v.buyer), hint: '비워 두면 지역·매수자 기준값' },
    { k: 'stress', type: 'num', label: '스트레스 금리', unit: '%p', step: 0.05, def: null, auto: (v) => autoStress(v.region), hint: '비워 두면 수도권·규제 3%p, 지방 0.75%p' },
    { k: 'dsr', type: 'num', label: 'DSR 기준', unit: '%', step: 1, def: 40, hint: '은행 40%, 2금융권 50%' },
    { k: 'senior', type: 'money', label: '선순위 채권·소액임차보증금', def: 0 },
  ],
  compute(v) {
    const r = loanLimit({ price: v.price * M, region: v.region, buyer: v.buyer, ltv: v.ltv, senior: v.senior * M, income: v.income * M, existing: v.existing * M, rate: v.rate, stress: v.stress, years: v.years, dsr: v.dsr });
    const notes: Note[] = [];
    if (v.ltv === 0) notes.push({ t: '이 지역에서 다주택자의 주택 구입용 주담대는 막혀 있습니다(LTV 0%).', warn: true });
    else if (r.binding === 'DSR') notes.push({ t: '소득이 한도를 정하고 있습니다. 대출 기간을 늘리거나 다른 대출을 줄이면 한도가 오릅니다.', warn: true });
    else if (r.binding === '금액 상한') notes.push({ t: '수도권·규제지역 주담대 금액 상한에 걸렸습니다(시가 15억 이하 6억, 25억 이하 4억, 초과 2억).', warn: true });
    else notes.push({ t: '담보(LTV)가 한도를 정하고 있습니다. 소득 여력은 남아 있습니다.' });
    notes.push({ t: '정책 대출(디딤돌·보금자리 등)과 은행별 심사 기준은 다릅니다. 기본값은 2025년 6·27, 10·15 대책 기준이니 대출 전에 은행에서 확인하세요.' });
    return {
      label: '예상 대출 한도', value: won(r.final), sub: kor(r.final), tag: `${r.binding} 기준`,
      rows: [
        { k: 'LTV 한도', rate: pct(v.ltv, 0), v: won(r.ltvLimit), tone: r.binding === 'LTV' ? 'hot' : undefined },
        { k: 'DSR 한도', rate: `${pct(v.dsr, 0)} · ${pct(v.rate + v.stress)}로 계산`, v: won(r.dsrLimit), tone: r.binding === 'DSR' ? 'hot' : undefined },
        { k: '금액 상한', v: Number.isFinite(r.cap) ? won(r.cap) : '없음', tone: r.binding === '금액 상한' ? 'hot' : undefined },
        { k: '월 상환액', rate: '실제 금리 · 원리금균등', v: won(r.monthly) },
        { k: '필요 자기자금', v: won(Math.max(0, v.price * M - r.final)), tone: 'sum' },
      ],
      notes,
    };
  },
};

/* ═════ 6. 대출 상환 ═════ */
const loan: Calc = {
  id: 'loan', group: '대출', name: '상환 계산', title: '대출 상환 계산',
  lead: '상환 방식에 따라 매달 내는 돈과 총이자가 크게 달라집니다. 연도별 상환표를 함께 보여 줍니다.',
  fields: [
    { k: 'amt', type: 'money', label: '대출 금액', def: 40000 },
    { k: 'rate', type: 'num', label: '금리', unit: '%', step: 0.01, def: 4.2 },
    { k: 'years', type: 'num', label: '기간', unit: '년', step: 1, def: 30 },
    { k: 'grace', type: 'num', label: '거치 기간', unit: '년', step: 1, def: 0, hint: '이자만 내는 기간' },
    { k: 'method', type: 'seg', label: '상환 방식', options: [['equal', '원리금균등'], ['principal', '원금균등'], ['bullet', '만기일시']], def: 'equal' },
  ],
  compute(v) {
    const P = v.amt * M, years = Math.max(1, v.years);
    const s = schedule(P, v.rate, years, v.method as Method, Math.max(0, v.grace));
    const yearsRows: string[][] = [];
    for (let y = 0; y * 12 < s.rows.length; y++) {
      const slice = s.rows.slice(y * 12, y * 12 + 12);
      const prin = slice.reduce((a, x) => a + x.prin, 0), int = slice.reduce((a, x) => a + x.int, 0);
      yearsRows.push([`${y + 1}년차`, comma(prin), comma(int), comma(prin + int), comma(slice[slice.length - 1].bal)]);
    }
    const label = v.method === 'bullet' ? '월 이자' : v.method === 'principal' ? '첫 달 상환액' : v.grace > 0 ? '거치 후 월 상환액' : '월 상환액';
    const rows: Row[] = [];
    if (v.method === 'principal') rows.push({ k: '첫 달 → 마지막 달', v: `${won(s.firstPay)} → ${won(s.lastPay)}` });
    if (v.method === 'bullet') rows.push({ k: '만기 상환액', v: won(s.lastPay), tone: 'hot' });
    if (v.grace > 0) rows.push({ k: `거치 ${v.grace}년 동안 월 이자`, v: won(s.graceInt) });
    rows.push({ k: '총이자', v: won(s.totalInt), tone: 'hot' });
    rows.push({ k: '이자 ÷ 원금', v: P ? pct(s.totalInt / P * 100, 1) : '—' });
    rows.push({ k: '총 상환액', v: won(P + s.totalInt), tone: 'sum' });
    const msg: Record<string, Note> = {
      equal: { t: '매달 같은 금액을 냅니다. 초반에는 이자 비중이 커서 원금이 천천히 줄어듭니다.' },
      principal: { t: '처음 부담은 크지만 원금이 빨리 줄어 총이자가 가장 적습니다.' },
      bullet: { t: '이자만 내다가 만기에 원금을 한 번에 갚습니다. 총이자가 가장 많습니다.', warn: true },
    };
    return {
      label, value: won(v.method === 'bullet' ? s.graceInt : s.firstPay), sub: kor(v.method === 'bullet' ? s.graceInt : s.firstPay), tag: `${years}년 · ${pct(v.rate)}`,
      rows, notes: [msg[v.method]],
      table: { caption: '연도별 상환표 (원)', head: ['연차', '원금', '이자', '합계', '잔액'], rows: yearsRows },
    };
  },
};

/* ═════ 7. 중도상환수수료 ═════ */
const prepay: Calc = {
  id: 'prepay', group: '대출', name: '중도상환', title: '중도상환수수료',
  lead: '대출을 일찍 갚을 때 내는 수수료입니다. 남은 면제 기간에 비례해 줄어듭니다.',
  fields: [
    { k: 'amt', type: 'money', label: '갚을 금액', def: 10000 },
    { k: 'rate', type: 'num', label: '수수료율', unit: '%', step: 0.01, def: 0.6, hint: '대출 약정서 확인' },
    { k: 'used', type: 'num', label: '지난 기간', unit: '개월', step: 1, def: 12 },
    { k: 'term', type: 'num', label: '수수료 부과 기간', unit: '개월', step: 1, def: 36, hint: '보통 3년' },
    { k: 'save', type: 'num', label: '갈아탈 때 금리 차이', unit: '%p', step: 0.05, def: 0.5, hint: '갈아타기 판단용' },
  ],
  compute(v) {
    const amt = v.amt * M;
    const r = prepayFee(amt, v.rate, v.used, Math.max(1, v.term));
    const saveYear = amt * v.save / 100;
    const breakeven = saveYear > 0 ? r.fee / saveYear * 12 : Infinity;
    return {
      label: '중도상환수수료', value: won(r.fee), sub: kor(r.fee), tag: `남은 ${r.remain}개월`,
      rows: [
        { k: '남은 부과 기간', v: `${r.remain}개월 / ${v.term}개월` },
        { k: '실제 수수료율', v: pct(amt ? r.fee / amt * 100 : 0, 3) },
        { k: '금리 차이로 아끼는 이자', rate: '연간', v: won(saveYear) },
        { k: '수수료 회수 기간', v: r.fee === 0 ? '바로 이득' : Number.isFinite(breakeven) ? `${Math.ceil(breakeven)}개월` : '—', tone: 'sum' },
      ],
      notes: [r.remain === 0 ? { t: '부과 기간이 지나 수수료가 없습니다.' } : { t: '갈아탄 대출을 회수 기간보다 오래 유지하면 이득입니다. 새 대출의 부대비용(인지세·설정비)도 함께 따져 보세요.' }],
    };
  },
};

/* ═════ 8. 중개보수 ═════ */
const fee: Calc = {
  id: 'fee', group: '거래·임대', name: '중개보수', title: '중개보수 (복비)',
  lead: '법정 상한 요율로 계산합니다. 이 범위 안에서 중개사와 협의해 정합니다.',
  fields: [
    { k: 'kind', type: 'seg', label: '거래 종류', options: [['sale', '주택 매매'], ['rent', '주택 전월세'], ['offi_sale', '오피스텔 매매'], ['offi_rent', '오피스텔 임대'], ['etc', '토지·상가']], def: 'sale' },
    { k: 'dep', type: 'money', label: '거래금액·보증금', def: 90000 },
    { k: 'mon', type: 'money', label: '월세', def: 0, show: (v) => v.kind === 'rent' || v.kind === 'offi_rent' },
    { k: 'offi', type: 'check', label: '전용 85㎡ 이하 + 주거시설 갖춤', def: true, show: (v) => v.kind.startsWith('offi') },
    { k: 'vat', type: 'check', label: '부가세 10% (일반과세자)', def: true },
  ],
  compute(v) {
    const r = brokerage(v.kind as FeeKind, v.dep * M, v.mon * M, v.offi);
    const vat = v.vat ? r.fee * 0.1 : 0;
    const notes: Note[] = [];
    if (r.note) notes.push({ t: r.note });
    if (v.kind.startsWith('offi') && !v.offi) notes.push({ t: '요건을 못 갖춘 오피스텔은 주택 외 요율(0.9% 이내)입니다.' });
    notes.push({ t: '서울시 조례 기준입니다. 다른 시·도는 요율이 조금 다를 수 있습니다.' });
    return {
      label: '내가 낼 중개보수', value: won(r.fee + vat), sub: kor(r.fee + vat), tag: `상한 ${pct(r.rate * 100, 1)}`,
      rows: [
        { k: '거래금액', rate: v.mon > 0 ? '보증금 + 월세 × 100' : undefined, v: won(r.amount) },
        { k: '상한 요율', v: `${pct(r.rate * 100, 1)}${r.cap ? ` (한도 ${kor(r.cap)})` : ''}` },
        { k: '중개보수', v: won(r.fee) },
        { k: '부가가치세', v: won(vat) },
        { k: '거래 당사자 양쪽 합계', v: won((r.fee + vat) * 2), tone: 'sum' },
      ],
      notes,
    };
  },
};

/* ═════ 9. 전월세 전환 ═════ */
const conv: Calc = {
  id: 'conv', group: '거래·임대', name: '전월세 전환', title: '전월세 전환',
  lead: '보증금과 월세를 바꿀 때 쓰는 계산입니다. 계약 기간 중이나 갱신 때는 법정 전환율 상한(연 10%와 기준금리 + 2%p 중 낮은 값)을 넘을 수 없습니다.',
  fields: [
    { k: 'dir', type: 'seg', label: '방향', options: [['toMonthly', '보증금 → 월세'], ['toDeposit', '월세 → 보증금']], def: 'toMonthly' },
    { k: 'dep', type: 'money', label: '지금 보증금', def: 50000 },
    { k: 'mon', type: 'money', label: '지금 월세', def: 0 },
    { k: 'next', type: 'money', label: '바꿀 보증금', def: 20000, show: (v) => v.dir === 'toMonthly' },
    { k: 'nextMon', type: 'money', label: '바꿀 월세', def: 0, show: (v) => v.dir === 'toDeposit' },
    { k: 'rate', type: 'num', label: '전환율', unit: '%', step: 0.1, def: 4.5 },
    { k: 'base', type: 'num', label: '한국은행 기준금리', unit: '%', step: 0.25, def: 2.5 },
    { k: 'save', type: 'num', label: '예금 금리', unit: '%', step: 0.1, def: 3, hint: '세입자 손익 비교용' },
  ],
  compute(v) {
    const cap = Math.min(10, v.base + 2);
    const over = v.rate > cap + 1e-9;
    const dep = v.dep * M, mon = v.mon * M, r = v.rate / 100;
    let newDep: number, newMon: number;
    if (v.dir === 'toMonthly') { newDep = v.next * M; newMon = mon + (dep - newDep) * r / 12; }
    else { newMon = v.nextMon * M; newDep = dep + (mon - newMon) * 12 / (r || Infinity); }
    // 세입자 연간 부담 = 월세 × 12 + 보증금의 예금이자(기회비용)
    const costOld = mon * 12 + dep * v.save / 100, costNew = newMon * 12 + newDep * v.save / 100;
    const notes: Note[] = [over
      ? { t: `전환율이 법정 상한 ${pct(cap)}를 넘습니다. 기존 계약 중이나 갱신 때는 이 상한까지만 받을 수 있습니다.`, warn: true }
      : { t: `지금 법정 상한은 ${pct(cap)}입니다. 새로 맺는 계약에는 적용되지 않습니다.` }];
    notes.push({ t: costNew < costOld ? `세입자 입장에서는 바꾼 뒤가 연 ${won(costOld - costNew)} 유리합니다(예금 금리 ${pct(v.save)} 기준).` : `세입자 입장에서는 바꾸기 전이 연 ${won(costNew - costOld)} 유리합니다(예금 금리 ${pct(v.save)} 기준).` });
    const main = v.dir === 'toMonthly' ? newMon : newDep;
    return {
      label: v.dir === 'toMonthly' ? '바꾼 뒤 월세' : '바꾼 뒤 보증금', value: won(main), sub: kor(main), tag: `전환율 ${pct(v.rate)}`,
      rows: [
        { k: '보증금', v: `${kor(dep)} → ${kor(newDep)}` },
        { k: '월세', v: `${kor(mon)} → ${kor(newMon)}`, tone: 'hot' },
        { k: '세입자 연간 부담 (전)', v: won(costOld) },
        { k: '세입자 연간 부담 (후)', v: won(costNew) },
        { k: '법정 전환율 상한', v: pct(cap), tone: 'sum' },
      ],
      notes,
    };
  },
};

/* ═════ 10. 임대수익률 ═════ */
const yieldCalc: Calc = {
  id: 'yield', group: '거래·임대', name: '임대수익률', title: '임대수익률',
  lead: '월세를 받는 부동산의 수익률입니다. 대출과 비용을 뺀 자기자본수익률로 판단해야 합니다.',
  fields: [
    { k: 'price', type: 'money', label: '매입가', def: 30000 },
    { k: 'cost', type: 'money', label: '취득 부대비용', hint: '취득세·중개보수 등', def: 1500 },
    { k: 'dep', type: 'money', label: '임대 보증금', def: 2000 },
    { k: 'mon', type: 'money', label: '월세', def: 100 },
    { k: 'opex', type: 'money', label: '연 운영비', hint: '관리비·수선비·보유세', def: 150 },
    { k: 'loan', type: 'money', label: '대출', def: 15000 },
    { k: 'rate', type: 'num', label: '대출 금리', unit: '%', step: 0.01, def: 4.5 },
    { k: 'vac', type: 'num', label: '공실률', unit: '%', step: 1, def: 5 },
  ],
  compute(v) {
    const price = v.price * M, cost = v.cost * M, dep = v.dep * M, loanAmt = v.loan * M;
    const gross = v.mon * M * 12, net = gross * (1 - v.vac / 100);
    const interest = loanAmt * v.rate / 100, equity = price + cost - dep - loanAmt;
    const income = net - v.opex * M - interest;
    const roe = equity > 0 ? income / equity * 100 : 0;
    const surface = price - dep > 0 ? gross / (price - dep) * 100 : 0;
    const notes: Note[] = [];
    if (equity <= 0) notes.push({ t: '보증금과 대출이 매입가를 넘어 자기자본이 0 이하입니다. 수익률이 의미가 없습니다.', warn: true });
    else if (income < 0) notes.push({ t: '이자와 운영비가 임대수입보다 큽니다. 매달 돈이 빠져나갑니다.', warn: true });
    else notes.push({ t: `금리가 1%p 오르면 연 순수익이 ${won(loanAmt * 0.01)} 줄어듭니다.` });
    return {
      label: '자기자본수익률', value: pct(roe), sub: `연 순수익 ${kor(income)}`, tag: `표면 ${pct(surface, 1)}`,
      rows: [
        { k: '실투자금', v: won(equity) },
        { k: '연 임대수입', rate: `공실 ${pct(v.vac, 0)} 반영`, v: won(net) },
        { k: '연 운영비', v: `−${won(v.opex * M)}`, tone: 'neg' },
        { k: '연 대출이자', v: `−${won(interest)}`, tone: 'neg' },
        { k: '월 순현금흐름', v: won(income / 12) },
        { k: '표면수익률', rate: '월세 × 12 ÷ (매입가 − 보증금)', v: pct(surface), tone: 'sum' },
      ],
      notes,
    };
  },
};

/* ═════ 11. 갭투자 ═════ */
const gap: Calc = {
  id: 'gap', group: '거래·임대', name: '갭투자', title: '갭투자 실투자금과 역전세',
  lead: '전세를 끼고 살 때 들어가는 돈과, 전세가가 떨어졌을 때 돌려줘야 할 돈을 함께 봅니다.',
  fields: [
    { k: 'price', type: 'money', label: '매매가', def: 60000 },
    { k: 'jeonse', type: 'money', label: '전세 보증금', def: 45000 },
    { k: 'extra', type: 'money', label: '취득 부대비용', hint: '취득세·중개보수·수리비', def: 1200 },
    { k: 'drop', type: 'num', label: '만기 때 전세가 하락', unit: '%', step: 1, def: 10, hint: '역전세 시나리오' },
    { k: 'sell', type: 'money', label: '예상 매도가', def: 66000 },
  ],
  compute(v) {
    const price = v.price * M, jeonse = v.jeonse * M, extra = v.extra * M;
    const cash = price - jeonse + extra, ratio = price ? jeonse / price * 100 : 0;
    const refund = jeonse * v.drop / 100;
    const profit = v.sell * M - price - extra;
    const notes: Note[] = [];
    if (jeonse > price) notes.push({ t: '전세금이 매매가보다 큽니다. 깡통전세 위험이 큰 구조입니다.', warn: true });
    else if (ratio >= 80) notes.push({ t: '전세가율 80% 이상은 집값이 조금만 내려도 보증금을 돌려주기 어려워지는 구간입니다.', warn: true });
    notes.push({ t: '매도 차익은 세전입니다. 양도세는 \'양도세\' 탭에서 계산하세요.' });
    return {
      label: '실투자금', value: won(cash), sub: kor(cash), tag: `전세가율 ${pct(ratio, 0)}`,
      rows: [
        { k: '매매가 − 전세금', v: won(price - jeonse) },
        { k: '부대비용', v: `+${won(extra)}` },
        { k: '전세가율', v: pct(ratio, 1), tone: ratio >= 80 ? 'hot' : undefined },
        { k: `역전세 때 돌려줄 돈`, rate: `전세가 ${pct(v.drop, 0)} 하락`, v: won(refund), tone: refund ? 'hot' : undefined },
        { k: '예상 매도 차익', v: won(profit) },
        { k: '실투자금 대비 수익률', v: cash > 0 ? pct(profit / cash * 100, 1) : '—', tone: 'sum' },
      ],
      notes,
    };
  },
};

/* ═════ 12. 청약 가점 ═════ */
const score: Calc = {
  id: 'score', group: '기타', name: '청약 가점', title: '청약 가점 (84점 만점)',
  lead: '민영주택 가점제 점수입니다. 무주택 기간 32점, 부양가족 35점, 청약통장 가입 기간 17점으로 구성됩니다.',
  fields: [
    { k: 'owner', type: 'check', label: '지금 집이 있음', hint: '유주택자는 무주택 기간 0점', def: false },
    { k: 'homeless', type: 'num', label: '무주택 기간', unit: '년', step: 1, def: 8, hint: '만 30세 또는 혼인신고일 중 빠른 날부터', show: (v) => !v.owner },
    { k: 'family', type: 'num', label: '부양가족 수', unit: '명', step: 1, def: 2, hint: '본인 제외. 배우자·자녀·같이 사는 부모' },
    { k: 'account', type: 'num', label: '청약통장 가입 기간', unit: '년', step: 0.5, def: 7 },
  ],
  compute(v) {
    const a = homelessScore(v.homeless, v.owner), b = familyScore(v.family), c = accountScore(v.account);
    const total = a + b + c;
    return {
      label: '청약 가점', value: `${total}점`, sub: '84점 만점', tag: `${Math.round(total / 84 * 100)}%`,
      rows: [
        { k: '무주택 기간', rate: '32점 만점', v: `${a}점` },
        { k: '부양가족 수', rate: '35점 만점', v: `${b}점` },
        { k: '청약통장 가입 기간', rate: '17점 만점', v: `${c}점` },
        { k: '합계', v: `${total} / 84점`, tone: 'sum' },
      ],
      notes: [{ t: '부양가족 인정 범위(직계존속 3년 이상 동일 세대 등)와 무주택 기간 기산일은 모집공고 기준으로 다시 확인하세요.' }],
    };
  },
};

/* ═════ 13. 면적 ═════ */
const area: Calc = {
  id: 'area', group: '기타', name: '평 ↔ ㎡', title: '면적 환산 (평 ↔ ㎡)',
  lead: '1평은 3.305785㎡입니다. 아파트 광고의 "몇 평"은 대개 공급면적 기준입니다.',
  fields: [
    { k: 'net', type: 'num', label: '전용면적', unit: '㎡', step: 0.01, def: 84.97 },
    { k: 'sup', type: 'num', label: '공급면적', unit: '㎡', step: 0.01, def: 112.4 },
    { k: 'py', type: 'num', label: '평 → ㎡', unit: '평', step: 0.1, def: 25 },
  ],
  compute(v) {
    const eff = v.sup > 0 ? v.net / v.sup * 100 : 0;
    const f = (n: number) => n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    return {
      label: '공급면적', value: `${f(v.sup / PYEONG)}평`, sub: `전용 ${f(v.net / PYEONG)}평`, tag: `전용률 ${pct(eff, 0)}`,
      rows: [
        { k: '전용면적', v: `${f(v.net)}㎡ = ${f(v.net / PYEONG)}평` },
        { k: '공급면적', v: `${f(v.sup)}㎡ = ${f(v.sup / PYEONG)}평` },
        { k: '전용률', v: pct(eff, 1), tone: eff && eff < 70 ? 'hot' : undefined },
        { k: `${f(v.py)}평`, v: `${f(v.py * PYEONG)}㎡`, tone: 'sum' },
      ],
      notes: [eff && eff < 70 ? { t: '전용률이 70% 미만입니다. 오피스텔·주상복합에서 흔하고, 같은 평수라도 실제 쓰는 면적이 좁습니다.', warn: true } : { t: '아파트 전용률은 보통 70~80%입니다. 59㎡는 약 25평형, 84㎡는 약 33~34평형으로 부릅니다.' }],
    };
  },
};

export const CALCS: Calc[] = [buy, acq, hold, cgt, limit, loan, prepay, fee, conv, yieldCalc, gap, score, area];
export const GROUPS = [...new Set(CALCS.map((c) => c.group))];

// 입력값 읽기: 빈 auto 칸은 자동값으로 채운다
export function resolve(c: Calc, raw: Values): Values {
  const v: Values = { ...raw };
  for (const f of c.fields) if (f.auto && (v[f.k] === null || v[f.k] === '' || v[f.k] === undefined)) v[f.k] = f.auto(v);
  return v;
}
export const defaults = (c: Calc): Values => Object.fromEntries(c.fields.map((f) => [f.k, f.def]));
