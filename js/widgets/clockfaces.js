// Clock faces for the Clock widget. Each face: { id, label, icon, build(host, s) -> { update(date), destroy? } }
// Faces draw with SVG so they stay sharp at any size.

import { h } from '../util.js';
import { play } from '../sound.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (viewBox, cls, inner = '') => {
  const e = document.createElementNS(NS, 'svg');
  e.setAttribute('viewBox', viewBox);
  e.setAttribute('class', cls);
  e.innerHTML = inner;
  return e;
};
const rad = (deg) => (deg * Math.PI) / 180;
const pol = (cx, cy, r, deg) => [cx + Math.sin(rad(deg)) * r, cy - Math.cos(rad(deg)) * r];
const f1 = (n) => Math.round(n * 100) / 100;
const uidN = () => Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------- words
const HOURS = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven'];
const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'quarter', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
function minuteWords(m) {
  if (m < 20) return ONES[m];
  return m === 20 ? 'twenty' : `twenty-${ONES[m - 20]}`;
}
/** "twenty past ten", "quarter to three", "seven minutes past four", "ten o'clock" */
export function timeInWords(hh, mm) {
  const hour = HOURS[hh % 12];
  const next = HOURS[(hh + 1) % 12];
  if (mm === 0) return `${hour} o’clock`;
  if (mm === 30) return `half past ${hour}`;
  const past = mm < 30;
  const n = past ? mm : 60 - mm;
  const unit = n === 15 || n % 5 === 0 ? '' : n === 1 ? ' minute' : ' minutes';
  return `${minuteWords(n)}${unit} ${past ? 'past' : 'to'} ${past ? hour : next}`;
}

// ---------------------------------------------------------------- roman
export function toRoman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

// ---------------------------------------------------------------- shared analogue face
function analogue(host, { numerals, cls, extra = '', hourHand = 'hour', minHand = 'min' }) {
  let marks = `<circle cx="100" cy="100" r="95" class="cf-bg"/>${extra}`;
  for (let i = 0; i < 60; i++) {
    const big = i % 5 === 0;
    const [x1, y1] = pol(100, 100, big ? 80 : 84, i * 6);
    const [x2, y2] = pol(100, 100, 89, i * 6);
    marks += `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" class="tick${big ? ' big' : ''}"/>`;
  }
  numerals.forEach((t, i) => {
    const [x, y] = pol(100, 100, 66, (i + 1) * 30);
    marks += `<text x="${f1(x)}" y="${f1(y)}" class="num">${t}</text>`;
  });
  marks += `<line x1="100" y1="112" x2="100" y2="52" class="hand ${hourHand}"/><line x1="100" y1="114" x2="100" y2="24" class="hand ${minHand}"/><line x1="100" y1="118" x2="100" y2="18" class="hand sec"/><circle cx="100" cy="100" r="4.5" class="pin"/>`;
  const el = svg('0 0 200 200', `clock-face ${cls}`, marks);
  host.append(el);
  const [hH, mH, sH] = el.querySelectorAll('.hand');
  return {
    el,
    set(hh, mm, ss, showSec) {
      hH.setAttribute('transform', `rotate(${(hh % 12) * 30 + mm * 0.5} 100 100)`);
      mH.setAttribute('transform', `rotate(${mm * 6 + ss * 0.1} 100 100)`);
      sH.setAttribute('transform', `rotate(${ss * 6} 100 100)`);
      sH.style.display = showSec ? '' : 'none';
    },
  };
}

const caption = (text) => h('div', { class: 'cf-caption' }, text);

// ================================================================ CLASSIC
const classic = {
  id: 'classic',
  label: 'Analogue + digital',
  icon: '🕒',
  build(host, s) {
    const face = analogue(host, { numerals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cls: 'cf-classic' });
    const digital = h('div', { class: 'clock-digital' });
    const date = h('div', { class: 'clock-date' });
    host.append(h('div', { class: 'clock-text' }, digital, date));
    host.dataset.mode = s.mode;
    return {
      update(d) {
        face.set(d.getHours(), d.getMinutes(), d.getSeconds(), s.seconds);
        digital.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: s.seconds ? '2-digit' : undefined, hour12: s.hour12 });
        date.textContent = s.date ? d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : '';
      },
    };
  },
};

// ================================================================ TEACHING CLOCK
const teaching = {
  id: 'teaching',
  label: 'Teaching clock',
  icon: '🧑‍🏫',
  build(host, s, api) {
    // "past" half (right) and "to" half (left), minute numbers around the outside.
    let extra = `<path d="M100 100 L100 5 A95 95 0 0 1 100 195 Z" class="tc-past"/><path d="M100 100 L100 195 A95 95 0 0 1 100 5 Z" class="tc-to"/>`;
    extra += `<circle cx="100" cy="100" r="76" class="tc-inner"/>`;
    for (let m = 0; m < 60; m += 5) {
      const [x, y] = pol(100, 100, 94.5, m * 6);
      extra += `<circle cx="${f1(x)}" cy="${f1(y)}" r="5.2" class="tc-minbg"/><text x="${f1(x)}" y="${f1(y)}" class="tc-min">${m === 0 ? '00' : m}</text>`;
    }
    extra += `<text x="150" y="58" class="tc-word past">past</text><text x="50" y="58" class="tc-word to">to</text>`;
    const face = analogue(host, { numerals: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cls: 'cf-teaching', extra });

    const words = h('button', { class: 'tc-sentence', title: 'Tap to show or hide the words' });
    const digital = h('div', { class: 'tc-digital' });
    let reveal = !s.quiz;
    words.addEventListener('click', () => { reveal = !reveal; draw(); });
    const btn = (label, aria, fn) => h('button', { class: 'btn small', 'aria-label': aria, onclick: fn }, label);
    const setBar = h('div', { class: 'tc-set' },
      btn('−1 h', 'Back one hour', () => nudge(-60)),
      btn('−5', 'Back five minutes', () => nudge(-5)),
      btn('+5', 'Forward five minutes', () => nudge(5)),
      btn('+1 h', 'Forward one hour', () => nudge(60)),
      btn('🎲', 'Random time', () => { s.setMin = Math.floor(Math.random() * 144) * 5; reveal = !s.quiz; api.save(); draw(); }),
    );
    host.append(h('div', { class: 'clock-text' }, words, digital, setBar));

    // In "set my own time" mode the minute hand can be dragged round.
    if (s.setMin == null) s.setMin = 10 * 60 + 10;
    function nudge(dm) {
      s.setMin = (((s.setMin + dm) % 720) + 720) % 720;
      reveal = !s.quiz;
      api.save();
      draw();
    }
    let dragging = null; // the pointer moving the hands (a second finger can't take over)
    let lastM = 0;
    face.el.addEventListener('pointerdown', (e) => {
      if (!s.teachSet || dragging != null) return;
      dragging = e.pointerId;
      lastM = s.setMin % 60;
      face.el.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    face.el.addEventListener('pointermove', (e) => {
      if (dragging !== e.pointerId) return;
      const r = face.el.getBoundingClientRect();
      const ang = (Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180) / Math.PI;
      const m = Math.round((((ang + 360) % 360) / 6)) % 60;
      let hrs = Math.floor(s.setMin / 60);
      if (lastM > 45 && m < 15) hrs++; // went past 12 forwards
      if (lastM < 15 && m > 45) hrs--; // went past 12 backwards
      lastM = m;
      s.setMin = ((((hrs % 12) + 12) % 12) * 60) + m;
      reveal = !s.quiz;
      draw();
    });
    const endDrag = (e) => { if (dragging === e.pointerId) { dragging = null; api.save(); } };
    face.el.addEventListener('pointerup', endDrag);
    face.el.addEventListener('pointercancel', endDrag);
    face.el.addEventListener('lostpointercapture', endDrag);

    let last = new Date();
    function draw(d = last) {
      last = d;
      const live = !s.teachSet;
      const hh = live ? d.getHours() : Math.floor(s.setMin / 60);
      const mm = live ? d.getMinutes() : s.setMin % 60;
      face.set(hh, mm, live ? d.getSeconds() : 0, live && s.seconds);
      face.el.classList.toggle('settable', !live);
      setBar.hidden = live;
      const sentence = `It is ${timeInWords(hh, mm)}.`;
      words.textContent = reveal ? sentence.charAt(0).toUpperCase() + sentence.slice(1) : 'What time is it? (tap to check)';
      words.classList.toggle('hidden-answer', !reveal);
      const h12 = hh % 12 || 12;
      digital.textContent = s.teachDigital === false ? '' : `${h12}:${String(mm).padStart(2, '0')}`;
      digital.hidden = !reveal || s.teachDigital === false;
      host.classList.toggle('no-words', s.teachWords === false);
    }
    return { update: (d) => { if (!s.teachSet) draw(d); else last = d; }, redraw: () => { reveal = !s.quiz; draw(); } };
  },
};

// ================================================================ ROMAN
const roman = {
  id: 'roman',
  label: 'Roman numerals',
  icon: '🏛️',
  build(host, s) {
    const nums = ['I', 'II', 'III', s.romanIIII === false ? 'IV' : 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
    const extra = '<circle cx="100" cy="100" r="88" class="rm-ring"/><circle cx="100" cy="100" r="50" class="rm-ring thin"/>';
    const face = analogue(host, { numerals: nums, cls: 'cf-roman', extra, hourHand: 'hour spade', minHand: 'min spade' });
    // Rotate numerals to read outward like a traditional dial.
    face.el.querySelectorAll('.num').forEach((t, i) => {
      t.setAttribute('transform', `rotate(${(i + 1) * 30} ${t.getAttribute('x')} ${t.getAttribute('y')})`);
    });
    const romanTime = h('div', { class: 'rm-time' });
    const year = h('div', { class: 'cf-caption' });
    host.append(h('div', { class: 'clock-text' }, romanTime, year));
    return {
      update(d) {
        face.set(d.getHours(), d.getMinutes(), d.getSeconds(), s.seconds);
        const h12 = d.getHours() % 12 || 12;
        const m = d.getMinutes();
        romanTime.textContent = s.romanDigital === false ? '' : `${toRoman(h12)} : ${m ? toRoman(m) : '—'}`;
        romanTime.title = `${h12}:${String(m).padStart(2, '0')}`;
        year.textContent = s.facts === false ? '' : `The year ${d.getFullYear()} is ${toRoman(d.getFullYear())}. Many clocks use IIII instead of IV.`;
      },
    };
  },
};

// ================================================================ WORD CLOCK
const GRID = ['ITLISASTIME', 'ACQUARTERDC', 'TWENTYFIVEX', 'HALFSTENFTO', 'PASTERUNINE', 'ONESIXTHREE', 'FOURFIVETWO', 'EIGHTELEVEN', 'SEVENTWELVE', 'TENSEOCLOCK'];
const W = {
  IT: [0, 0, 2], IS: [0, 3, 2], A: [1, 0, 1], QUARTER: [1, 2, 7], TWENTY: [2, 0, 6], FIVE_M: [2, 6, 4],
  HALF: [3, 0, 4], TEN_M: [3, 5, 3], TO: [3, 9, 2], PAST: [4, 0, 4],
  H9: [4, 7, 4], H1: [5, 0, 3], H6: [5, 3, 3], H3: [5, 6, 5], H4: [6, 0, 4], H5: [6, 4, 4], H2: [6, 8, 3],
  H8: [7, 0, 5], H11: [7, 5, 6], H7: [8, 0, 5], H12: [8, 5, 6], H10: [9, 0, 3], OCLOCK: [9, 5, 6],
};
const MIN_WORDS = {
  0: ['OCLOCK'], 5: ['FIVE_M', 'PAST'], 10: ['TEN_M', 'PAST'], 15: ['A', 'QUARTER', 'PAST'], 20: ['TWENTY', 'PAST'],
  25: ['TWENTY', 'FIVE_M', 'PAST'], 30: ['HALF', 'PAST'], 35: ['TWENTY', 'FIVE_M', 'TO'], 40: ['TWENTY', 'TO'],
  45: ['A', 'QUARTER', 'TO'], 50: ['TEN_M', 'TO'], 55: ['FIVE_M', 'TO'],
};
const words = {
  id: 'words',
  label: 'Word clock',
  icon: '🔤',
  build(host, s) {
    const grid = h('div', { class: 'wc-grid', 'aria-hidden': 'true' });
    const cells = GRID.map((row) => [...row].map((ch) => {
      const c = h('span', {}, ch);
      grid.append(c);
      return c;
    }));
    const dots = [0, 1, 2, 3].map((i) => h('span', { class: `wc-dot d${i}` }));
    const panel = h('div', { class: 'wc-panel' }, grid, ...dots);
    const spoken = h('div', { class: 'sr-only', 'aria-live': 'off' });
    host.append(panel, spoken);
    let lastKey = '';
    return {
      update(d) {
        panel.style.setProperty('--lit', s.wordColor || '#ffd166');
        const hh = d.getHours();
        const mm = d.getMinutes();
        const m5 = Math.floor(mm / 5) * 5;
        const key = `${hh}:${mm}`;
        if (key === lastKey) return;
        lastKey = key;
        const hourIdx = (m5 >= 35 ? hh + 1 : hh) % 12 || 12;
        const on = ['IT', 'IS', ...MIN_WORDS[m5], `H${hourIdx}`];
        cells.flat().forEach((c) => c.classList.remove('on'));
        for (const w of on) {
          const [r, c0, len] = W[w];
          for (let i = 0; i < len; i++) cells[r][c0 + i].classList.add('on');
        }
        dots.forEach((dt, i) => dt.classList.toggle('on', i < mm % 5));
        spoken.textContent = `It is ${timeInWords(hh, mm)}`;
        panel.title = spoken.textContent + (mm % 5 ? ` (each dot is one more minute)` : '');
      },
    };
  },
};

// ================================================================ SUNDIAL
export const PLACES = {
  sydney: ['Sydney', -33.87, 151.21, 'Australia/Sydney'],
  portmac: ['Port Macquarie', -31.43, 152.91, 'Australia/Sydney'],
  newcastle: ['Newcastle', -32.93, 151.78, 'Australia/Sydney'],
  canberra: ['Canberra', -35.28, 149.13, 'Australia/Sydney'],
  melbourne: ['Melbourne', -37.81, 144.96, 'Australia/Melbourne'],
  brisbane: ['Brisbane', -27.47, 153.03, 'Australia/Brisbane'],
  adelaide: ['Adelaide', -34.93, 138.6, 'Australia/Adelaide'],
  perth: ['Perth', -31.95, 115.86, 'Australia/Perth'],
  hobart: ['Hobart', -42.88, 147.33, 'Australia/Hobart'],
  darwin: ['Darwin', -12.46, 130.84, 'Australia/Darwin'],
  auckland: ['Auckland', -36.85, 174.76, 'Pacific/Auckland'],
  singapore: ['Singapore', 1.35, 103.82, 'Asia/Singapore'],
  tokyo: ['Tokyo', 35.68, 139.69, 'Asia/Tokyo'],
  johannesburg: ['Johannesburg', -26.2, 28.05, 'Africa/Johannesburg'],
  london: ['London', 51.5, -0.13, 'Europe/London'],
  newyork: ['New York', 40.71, -74.01, 'America/New_York'],
  losangeles: ['Los Angeles', 34.05, -118.24, 'America/Los_Angeles'],
};

/** Minutes ahead of UTC for a time zone at a moment (includes daylight saving). */
export function tzOffset(date, timeZone) {
  if (!timeZone) return -date.getTimezoneOffset();
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(date).map((p) => [p.type, p.value]));
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
    return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  } catch {
    return -date.getTimezoneOffset();
  }
}

/** Pick a sensible place from this device's time zone (so the default isn't always Sydney). */
export function guessPlace() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { /* ignore */ }
  const exact = Object.entries(PLACES).find(([, p]) => p[3] === tz);
  if (exact) return exact[0];
  const off = tzOffset(new Date(2026, 0, 1));
  let best = 'sydney';
  let bestD = Infinity;
  for (const [k, p] of Object.entries(PLACES)) {
    const d = Math.abs(tzOffset(new Date(2026, 0, 1), p[3]) - off);
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

/** Sun position from a date and place (good to a minute or so — plenty for a sundial). */
export function sun(d, lat, lon, timeZone) {
  const start = new Date(d.getFullYear(), 0, 0);
  const n = Math.floor((d - start) / 86400000);
  const B = rad((360 / 364) * (n - 81));
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minutes
  const decl = 23.44 * Math.sin(rad((360 / 365) * (284 + n)));
  const off = tzOffset(d, timeZone); // this place's clock, minutes ahead of UTC (includes daylight saving)
  const tz = off / 60;
  const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  const clockMin = (((utcMin + off) % 1440) + 1440) % 1440;
  const solarMin = clockMin + 4 * lon - 60 * tz + eot;
  let ha = (solarMin / 60 - 12) * 15; // hour angle, degrees (negative = morning)
  ha = ((((ha + 180) % 360) + 360) % 360) - 180;
  const alt = Math.asin(Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(ha)));
  // Break the clock-vs-sundial gap into its three causes (minutes).
  const y = d.getFullYear();
  const jan = tzOffset(new Date(y, 0, 1), timeZone);
  const jul = tzOffset(new Date(y, 6, 1), timeZone);
  const stdTz = Math.min(jan, jul) / 60;
  const dst = off - Math.min(jan, jul); // daylight saving: clocks ahead of the sun
  const lonMin = 4 * lon - 60 * stdTz; // + = east of the time-zone line, the sun arrives earlier
  return {
    solarMin: ((solarMin % 1440) + 1440) % 1440, ha, decl, alt: (alt * 180) / Math.PI, diff: clockMin - solarMin,
    eot, dst, lonMin, stdTz, lon, clockMin, usesDst: jan !== jul,
  };
}

/** Equation of time (minutes) for each day of the year, for the little chart. */
export function eotYear(year) {
  const out = [];
  for (let n = 1; n <= 365; n++) {
    const B = rad((360 / 364) * (n - 81));
    out.push(9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B));
  }
  void year;
  return out;
}

/** The "How does it work?" panel for the sundial — written for children to read. */
function sundialExplainer(sp, d, name, lat) {
  const r = (x) => Math.round(x);
  const gap = r(sp.diff);
  const south = lat < 0;
  // How each reason moves the sundial compared with the clock.
  const chip = (c) => {
    const m = r(c);
    if (!m) return 'no change';
    return m > 0 ? `sundial ${m} min behind` : `sundial ${-m} min ahead`;
  };

  // Year chart: how fast or slow a sundial runs on each day, today marked.
  const data = eotYear(d.getFullYear());
  const W = 300;
  const H = 96;
  const x = (i) => 22 + (i / 364) * (W - 32);
  const yy = (v) => H / 2 - 4 - v * 2.3;
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${yy(v).toFixed(1)}`).join(' ');
  const n = Math.max(0, Math.min(364, Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) - 1));
  const months = 'JFMAMJJASOND'.split('').map((m, i) => `<text x="${x(i * 30.4 + 15).toFixed(1)}" y="${H - 2}" class="eq-m">${m}</text>`).join('');
  const chartBox = h('div', { class: 'ex-chart' });
  chartBox.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="eq-chart" role="img" aria-label="Chart: how fast or slow a sundial runs through the year">
    <line x1="22" x2="${W - 10}" y1="${yy(0)}" y2="${yy(0)}" class="eq-zero"/>
    <text x="${W - 10}" y="${yy(14)}" class="eq-y end">fast</text><text x="${W - 10}" y="${yy(-12)}" class="eq-y end">slow</text>
    <polyline points="${pts}" class="eq-line"/>${months}
    <circle cx="${x(n).toFixed(1)}" cy="${yy(data[n]).toFixed(1)}" r="5" class="eq-today"/>
  </svg>`;

  const row = (icon, title, text, c) =>
    h('div', { class: 'ex-row' }, h('span', { class: 'ex-ic', 'aria-hidden': 'true' }, icon),
      h('div', {}, h('b', {}, title), h('div', {}, text)),
      h('span', { class: 'ex-min' }, chip(c)));

  const lonM = r(sp.lonMin);
  const eotM = r(sp.eot);
  const dstH = r(sp.dst / 60);

  return h('div', { class: 'ex' },
    h('h4', {}, gap === 0 ? 'The sundial and the clock match today!' : `Why is the sundial ${Math.abs(gap)} minutes ${gap > 0 ? 'behind' : 'ahead of'} the clock?`),
    h('p', {}, 'A sundial shows ', h('b', {}, 'sun time'), '. When the sun is highest in the sky, a sundial says 12 o’clock.'),
    h('p', {}, 'A clock shows ', h('b', {}, 'clock time'), '. Everyone in a big area called a ', h('b', {}, 'time zone'), ' uses the same clock time, even though the sun is in a slightly different place for each of them.'),
    h('p', {}, 'Here are the three reasons the times are different:'),

    sp.dst
      ? row('🕐', 'Daylight saving', `In summer, people move their clocks forward ${dstH === 1 ? '1 hour' : `${dstH} hours`}. The sun doesn’t change, so the clock gets ahead of the sundial.`, sp.dst)
      : sp.usesDst
        ? row('🕐', 'Daylight saving', 'Daylight saving is not on at this time of year, so it doesn’t change anything today.', 0)
        : row('🕐', 'Daylight saving', `${name} doesn’t use daylight saving, so it doesn’t change anything.`, 0),

    row('🌏', 'Where you are in your time zone',
      Math.abs(lonM) < 1
        ? `${name} is right in the middle of its time zone, so this doesn’t change much.`
        : `The sun rises in the east first. ${name} is a little ${lonM > 0 ? 'east' : 'west'} of the middle of its time zone, so the sun is highest here about ${Math.abs(lonM)} minute${Math.abs(lonM) === 1 ? '' : 's'} ${lonM > 0 ? 'earlier' : 'later'} than in the middle.`,
      -sp.lonMin),

    row('📅', 'Time of year',
      `The Earth goes around the sun in an oval path, and it is tilted. This makes sun time run a little fast or a little slow during the year. Today the sundial is ${Math.abs(eotM)} minute${Math.abs(eotM) === 1 ? '' : 's'} ${eotM >= 0 ? 'fast' : 'slow'}.`,
      -sp.eot),
    chartBox,
    h('p', { class: 'ex-small' }, 'The orange line shows how fast or slow a sundial runs through the year. The red dot is today.'),
    h('div', { class: 'ex-total' }, h('span', {}, 'Add them all up:'), h('b', {}, gap === 0 ? 'the times match' : `the sundial is about ${Math.abs(gap)} min ${gap > 0 ? 'behind' : 'ahead of'} the clock`)),

    h('h4', {}, 'How to read a sundial'),
    h('ul', {},
      h('li', {}, 'The pointy part in the middle is called the ', h('b', {}, 'gnomon'), ' (say “NO-mon”). Its shadow is like the hand of a clock.'),
      h('li', {}, 'Look at the number the shadow points to. That is the hour. The little lines show half past.'),
      h('li', {}, 'The shadow always points ', h('b', {}, 'away'), ' from the sun. Drag the ☀️ along its path to watch the shadow move. Let go and it goes back to the real time.'),
      h('li', {}, 'When the sun is low in the morning and afternoon, shadows are long. Around midday the sun is high and shadows are short.'),
    ),

    h('h4', {}, 'Things to notice'),
    h('ul', {},
      south
        ? h('li', {}, 'In the southern half of the world, the shadow goes around ', h('b', {}, 'anticlockwise'), ' — the opposite way to clock hands! Clock hands turn the same way as sundial shadows in the northern half of the world, where clocks were invented.')
        : h('li', {}, 'In the northern half of the world, the shadow goes around ', h('b', {}, 'clockwise'), ' — the same way as clock hands. Clocks were invented here, so clock hands copy the way sundial shadows move.'),
      h('li', {}, 'The hour lines are not the same distance apart. They are closer together around midday. That is because the gnomon leans over at a special angle that matches how far your place is from the equator.'),
      h('li', {}, 'At night there is no sunlight, so there is no shadow. A sundial can’t tell the time at night!'),
      h('li', {}, 'People used sundials in ancient Egypt more than 3,000 years ago.'),
    ),
  );
}

const sundial = {
  id: 'sundial',
  label: 'Sundial',
  icon: '☀️',
  build(host, s) {
    const id = uidN();
    // Horizontal garden sundial seen from above, with the sun's path drawn as an arc across the sky.
    // Drag the sun along its path to see the shadow move; let go and it glides back to the real time.
    // The gnomon's foot is at the top so shadows fall down the dial, away from the sun's arc above.
    const O = [100, 74]; // foot of the gnomon; hour lines fan out from here
    const ARC = { cx: 100, cy: 112, rx: 99, ry: 158 }; // sky arc (sunrise → noon → sunset)
    const el = svg('0 -52 200 254', 'cf-sundial', `
      <defs>
        <radialGradient id="st${id}" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#e9e2d0"/><stop offset="1" stop-color="#b9ad92"/></radialGradient>
        <linearGradient id="sh${id}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity=".05"/></linearGradient>
        <clipPath id="cl${id}"><circle cx="100" cy="112" r="86"/></clipPath>
      </defs>
      <path class="sd-path" d="M${ARC.cx - ARC.rx} ${ARC.cy} A${ARC.rx} ${ARC.ry} 0 0 1 ${ARC.cx + ARC.rx} ${ARC.cy}"/>
      <path class="sd-path-done" d=""/>
      <text class="sd-edge" x="4" y="${ARC.cy + 16}"></text><text class="sd-edge" x="196" y="${ARC.cy + 16}" text-anchor="end"></text>
      <circle cx="100" cy="112" r="94" fill="url(#st${id})" stroke="#8d7f63" stroke-width="2"/>
      <circle cx="100" cy="112" r="86" fill="none" stroke="#8d7f63" stroke-width=".8"/>
      <g class="sd-lines"></g>
      <polygon class="sd-shadow" fill="url(#sh${id})" clip-path="url(#cl${id})" points=""/>
      <polygon class="sd-gnomon" points=""/>
      <circle class="sd-night" cx="100" cy="112" r="94"/>
      <g class="sd-sunwrap"><circle class="sd-hit" r="15"/><text class="sd-sun">☀️</text></g>`);
    host.append(el);
    const $ = (q) => el.querySelector(q);
    const lines = $('.sd-lines');
    const shadow = $('.sd-shadow');
    const gnomon = $('.sd-gnomon');
    const night = $('.sd-night');
    const sunWrap = $('.sd-sunwrap');
    const sunIcon = $('.sd-sun');
    const pathDone = $('.sd-path-done');
    const [edgeL, edgeR] = el.querySelectorAll('.sd-edge');
    const info = h('div', { class: 'sd-info' });
    const fact = caption('');
    const explain = h('div', { class: 'sd-explain', hidden: true });
    const whyBtn = h('button', { class: 'btn small sd-why', 'aria-expanded': 'false' }, '❓ How does it work?');
    let lastSp = null;
    let lastKey = '';
    whyBtn.addEventListener('click', () => {
      explain.hidden = !explain.hidden;
      whyBtn.setAttribute('aria-expanded', String(!explain.hidden));
      whyBtn.textContent = explain.hidden ? '❓ How does it work?' : '✕ Close the explainer';
      host.classList.toggle('explaining', !explain.hidden);
      lastKey = '';
      if (!explain.hidden) fillExplain();
    });
    function fillExplain() {
      if (explain.hidden || !lastSp) return;
      const [name, lat] = place();
      const key = `${Math.round(lastSp.diff)}|${name}|${Math.round(lastSp.eot)}`;
      if (key === lastKey) return;
      lastKey = key;
      explain.replaceChildren(sundialExplainer(lastSp, lastD, name, lat));
    }
    host.append(h('div', { class: 'clock-text' }, info, fact, whyBtn, explain));

    const place = () => {
      if (s.place === 'custom') return ['Your place', s.lat, s.lon, undefined];
      return PLACES[s.place === 'auto' || !s.place ? guessPlace() : s.place] || PLACES.sydney;
    };
    const lineAngle = (hourAngle, lat) => (Math.atan(Math.sin(rad(Math.abs(lat))) * Math.tan(rad(hourAngle))) * 180) / Math.PI;
    const fmt = (x) => x.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    let builtFor = '';
    function buildLines(lat) {
      const side = lat < 0 ? -1 : 1; // southern hemisphere: morning hours sit on the right
      let ln = '';
      let tx = '';
      const R = ['VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'I', 'II', 'III', 'IV', 'V', 'VI'];
      for (let hr = 6; hr <= 18; hr++) {
        const ha = (hr - 12) * 15;
        const a = (Math.abs(ha) === 90 ? Math.sign(ha) * 90 : lineAngle(ha, lat)) * side + 180;
        const [x2, y2] = pol(O[0], O[1], 130, a);
        const [lx, ly] = pol(O[0], O[1], hr === 12 ? 116 : 96, a);
        ln += `<line x1="${O[0]}" y1="${O[1]}" x2="${f1(x2)}" y2="${f1(y2)}" class="sd-line${hr === 12 ? ' noon' : ''}"/>`;
        tx += `<text x="${f1(Math.max(20, Math.min(180, lx)))}" y="${f1(Math.max(70, Math.min(192, ly)))}" class="sd-num">${R[hr - 6]}</text>`;
        if (hr < 18) {
          const ab = lineAngle((hr - 11.5) * 15, lat) * side + 180;
          const [p1x, p1y] = pol(O[0], O[1], 82, ab);
          const [p2x, p2y] = pol(O[0], O[1], 90, ab);
          ln += `<line x1="${f1(p1x)}" y1="${f1(p1y)}" x2="${f1(p2x)}" y2="${f1(p2y)}" class="sd-half"/>`;
        }
      }
      lines.innerHTML = `<g clip-path="url(#cl${id})">${ln}</g>${tx}`;
      gnomon.setAttribute('points', `${O[0] - 3},${O[1]} ${O[0] + 3},${O[1]} ${O[0]},${O[1] + 72}`);
      edgeL.textContent = side > 0 ? 'sunrise (east)' : 'sunset (west)';
      edgeR.textContent = side > 0 ? 'sunset (west)' : 'sunrise (east)';
    }

    // Sun path parameter u: 0 = sunrise, 0.5 = solar noon, 1 = sunset.
    const dayLength = (lat, decl) => {
      const x = -Math.tan(rad(lat)) * Math.tan(rad(decl));
      return (Math.acos(Math.max(-1, Math.min(1, x))) * 180) / Math.PI; // sunrise hour angle H0 (deg)
    };
    const altitude = (lat, decl, ha) =>
      (Math.asin(Math.sin(rad(lat)) * Math.sin(rad(decl)) + Math.cos(rad(lat)) * Math.cos(rad(decl)) * Math.cos(rad(ha))) * 180) / Math.PI;
    const arcPoint = (u, side) => {
      // morning side is the left in the north, the right in the south
      const t = Math.PI * u;
      return [ARC.cx - side * ARC.rx * Math.cos(t), ARC.cy - ARC.ry * Math.sin(t)];
    };

    let dragU = null; // set while the sun is being dragged / gliding back
    let glide = null;
    let lastD = new Date();

    function draw(d) {
      const [name, lat, lon, zone] = place();
      if (builtFor !== `${lat},${lon}`) { buildLines(lat); builtFor = `${lat},${lon}`; }
      const side = lat < 0 ? -1 : 1;
      const sp = sun(d, lat, lon, zone);
      const placeClock = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: zone });
      const H0 = dayLength(lat, sp.decl);
      const realU = (sp.ha + H0) / (2 * H0 || 1);
      const pretend = dragU !== null;
      const u = pretend ? dragU : realU;
      const ha = pretend ? -H0 + 2 * H0 * u : sp.ha;
      const alt = pretend ? altitude(lat, sp.decl, ha) : sp.alt;
      const up = alt > 0 && u > 0 && u < 1;

      // sun on its path (hidden below the horizon at night unless dragged)
      const uu = Math.max(0, Math.min(1, u));
      const [sx, sy] = arcPoint(uu, side);
      sunWrap.setAttribute('transform', `translate(${f1(sx)} ${f1(sy)})`);
      sunIcon.textContent = up || pretend ? '☀️' : '🌙';
      sunWrap.classList.toggle('below', !up && !pretend);
      if (!up && !pretend) sunWrap.setAttribute('transform', 'translate(100 -30)');
      // the part of today's path already travelled
      if (u > 0) {
        const [x0, y0] = arcPoint(0, side);
        pathDone.setAttribute('d', `M${f1(x0)} ${f1(y0)} A${ARC.rx} ${ARC.ry} 0 0 ${side > 0 ? 1 : 0} ${f1(sx)} ${f1(sy)}`);
      } else pathDone.setAttribute('d', '');

      night.style.display = up ? 'none' : '';
      if (up) {
        const a = lineAngle(Math.max(-89.9, Math.min(89.9, ha)), lat) * side + 180;
        // Low sun = long shadow; high sun = shorter shadow.
        const len = Math.min(140, 56 + 14 / Math.tan(rad(Math.max(3, alt))));
        const [tx, ty] = pol(O[0], O[1], len, a);
        const [lx, ly] = pol(O[0], O[1], 6, a - 90);
        const [rx, ry] = pol(O[0], O[1], 6, a + 90);
        shadow.setAttribute('points', `${f1(lx)},${f1(ly)} ${f1(rx)},${f1(ry)} ${f1(tx)},${f1(ty)}`);
        shadow.style.display = '';
      } else shadow.style.display = 'none';

      const solar = new Date(d);
      const solarMin = pretend ? 720 + (ha / 15) * 60 : sp.solarMin;
      solar.setHours(0, Math.round(solarMin), 0, 0);
      if (pretend) {
        info.replaceChildren(h('span', {}, h('b', {}, `Sun time ${fmt(solar)}`), ' · moving the sun… let go to return'));
      } else if (up) {
        info.replaceChildren(h('span', {}, h('b', {}, `Sun time ${fmt(solar)}`), ` · clock says ${placeClock}`));
      } else {
        info.replaceChildren(h('span', {}, h('b', {}, 'The sun has set!'), ' Drag the ☀️ along its path to try it.'));
      }
      const diff = Math.round(sp.diff);
      fact.textContent = s.facts === false ? '' : diff === 0
        ? `${name}: the sundial and the clock match right now.`
        : `${name}: the sundial is ${Math.abs(diff)} min ${diff > 0 ? 'behind' : 'ahead of'} the clock. Tap “How does it work?” to find out why.`;
      if (!pretend) { lastSp = sp; fillExplain(); }
      return { realU, side };
    }

    // --- drag the sun along its path
    let geom = { side: 1 };
    const toU = (e) => {
      const r = el.getBoundingClientRect();
      const vb = el.viewBox.baseVal;
      const x = vb.x + ((e.clientX - r.left) / r.width) * vb.width;
      const y = vb.y + ((e.clientY - r.top) / r.height) * vb.height;
      const ang = Math.atan2(Math.max(0, (ARC.cy - y) / ARC.ry), (-(x - ARC.cx) * geom.side) / ARC.rx);
      return Math.max(0, Math.min(1, ang / Math.PI));
    };
    sunWrap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      cancelAnimationFrame(glide);
      sunWrap.setPointerCapture(e.pointerId);
      dragU = toU(e);
      el.classList.add('dragging-sun');
      geom = draw(lastD);
    });
    sunWrap.addEventListener('pointermove', (e) => {
      if (!sunWrap.hasPointerCapture(e.pointerId)) return;
      dragU = toU(e);
      draw(lastD);
    });
    const release = () => {
      if (dragU === null) return;
      el.classList.remove('dragging-sun');
      // glide back to where the sun really is
      const from = dragU;
      const target = draw(new Date(lastD)).realU;
      const to = Math.max(-0.05, Math.min(1.05, target));
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 900);
        const e = 1 - Math.pow(1 - k, 3);
        dragU = from + (to - from) * e;
        draw(lastD);
        if (k < 1) glide = requestAnimationFrame(step);
        else { dragU = null; draw(lastD); }
      };
      glide = requestAnimationFrame(step);
    };
    sunWrap.addEventListener('pointerup', release);
    sunWrap.addEventListener('pointercancel', release);

    return {
      update(d) {
        lastD = d;
        if (dragU === null) geom = draw(d);
      },
      destroy: () => cancelAnimationFrame(glide),
    };
  },
};

// ================================================================ burn / fill span helpers
function spanOf(s, d) {
  const [sh, sm] = String(s.spanStart || '08:00').split(':').map(Number);
  const hours = Math.max(1, Math.min(24, s.spanHours || 8));
  const start = new Date(d);
  start.setHours(sh, sm, 0, 0);
  const frac = (d - start) / (hours * 3600000);
  return { start, hours, used: Math.max(0, Math.min(1, frac)), before: frac < 0, after: frac >= 1, sh, sm };
}
const hourLabel = (sh, k, h12) => {
  const v = (sh + k) % 24;
  return h12 ? String(v % 12 || 12) : String(v);
};
function hourChime(s) {
  let last = null;
  return (d) => {
    if (!s.chime) return;
    const span = spanOf(s, d);
    if (span.before || span.after) return;
    const k = Math.floor(span.used * span.hours + 1e-6);
    if (last !== null && k !== last) play('ding');
    last = k;
  };
}

// ================================================================ CANDLE
const candle = {
  id: 'candle',
  label: 'Candle clock',
  icon: '🕯️',
  build(host, s) {
    const id = uidN();
    const el = svg('0 0 160 240', 'cf-candle', `
      <defs>
        <linearGradient id="wx${id}" x1="0" x2="1"><stop offset="0" stop-color="#f3e2c0"/><stop offset=".45" stop-color="#fff6e3"/><stop offset="1" stop-color="#e1c99d"/></linearGradient>
        <radialGradient id="gl${id}"><stop offset="0" stop-color="#ffd27a" stop-opacity=".8"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
      </defs>
      <circle class="cd-glow" r="46" fill="url(#gl${id})"/>
      <ellipse cx="80" cy="222" rx="58" ry="10" fill="#9a7b4f"/><rect x="22" y="214" width="116" height="8" rx="3" fill="#b58f5a"/>
      <rect class="cd-body" x="52" width="56" fill="url(#wx${id})" stroke="#d5bb8b" stroke-width="1"/>
      <g class="cd-marks"></g>
      <path class="cd-drip" fill="#fff6e3"/>
      <line class="cd-wick" x1="80" x2="80" stroke="#333" stroke-width="2"/>
      <g class="cd-flame"><path d="M0 0 C-9 -10 -6 -24 0 -36 C6 -24 9 -10 0 0 Z" fill="#ffb703"/><path d="M0 -2 C-4 -8 -3 -16 0 -22 C3 -16 4 -8 0 -2 Z" fill="#fff3b0"/></g>
      <g class="cd-smoke"><path d="M80 0 c-6 -10 6 -18 0 -30 c-6 -10 6 -18 0 -30" fill="none" stroke="#999" stroke-width="2" opacity=".5"/></g>`);
    host.append(el);
    const body = el.querySelector('.cd-body');
    const marks = el.querySelector('.cd-marks');
    const wick = el.querySelector('.cd-wick');
    const flame = el.querySelector('.cd-flame');
    const glow = el.querySelector('.cd-glow');
    const drip = el.querySelector('.cd-drip');
    const smoke = el.querySelector('.cd-smoke');
    const info = h('div', { class: 'sd-info' });
    const fact = caption('');
    host.append(h('div', { class: 'clock-text' }, info, fact));
    const TOP = 30;
    const BASE = 214;
    const chime = hourChime(s);
    let builtFor = '';
    return {
      update(d) {
        const sp = spanOf(s, d);
        const key = `${sp.sh}:${sp.sm}:${sp.hours}:${s.hour12}`;
        if (key !== builtFor) {
          builtFor = key;
          let m = '';
          for (let k = 0; k <= sp.hours; k++) {
            const y = TOP + ((BASE - TOP) * k) / sp.hours;
            m += `<line x1="52" x2="108" y1="${f1(y)}" y2="${f1(y)}" class="cd-mark"/><text x="44" y="${f1(y)}" class="cd-num">${hourLabel(sp.sh, k, s.hour12 !== false)}</text>`;
          }
          marks.innerHTML = m;
        }
        const top = TOP + (BASE - TOP) * sp.used;
        body.setAttribute('y', f1(top));
        body.setAttribute('height', f1(Math.max(0, BASE - top)));
        // hide marks that have burnt away
        marks.querySelectorAll('line').forEach((l, k) => {
          const gone = Number(l.getAttribute('y1')) < top - 0.5;
          l.style.opacity = gone ? 0 : 1;
          marks.querySelectorAll('text')[k].style.opacity = gone ? 0.25 : 1;
        });
        const lit = !sp.before && !sp.after;
        wick.setAttribute('y1', f1(top));
        wick.setAttribute('y2', f1(top - 9));
        flame.setAttribute('transform', `translate(80 ${f1(top - 7)})`);
        flame.style.display = lit ? '' : 'none';
        glow.setAttribute('cx', 80);
        glow.setAttribute('cy', f1(top - 20));
        glow.style.display = lit ? '' : 'none';
        drip.setAttribute('d', sp.used < 1 ? `M52 ${f1(top)} h56 v4 q-4 0 -4 6 q0 5 -3 5 q-3 0 -3 -5 v-6 h-20 v10 q0 4 -3 4 q-3 0 -3 -4 v-10 h-12 v3 q0 3 -2 3 q-3 0 -3 -3 Z` : '');
        smoke.setAttribute('transform', `translate(0 ${f1(top - 12)})`);
        smoke.style.display = sp.after ? '' : 'none';
        const left = Math.max(0, sp.hours * 60 * (1 - sp.used));
        info.replaceChildren(h('span', {},
          sp.before ? `Lights at ${sp.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` :
          sp.after ? 'Burnt out — see you tomorrow!' :
          h('span', {}, h('b', {}, `${Math.floor(left / 60)} h ${Math.round(left % 60)} min`), ' of candle left')));
        fact.textContent = s.facts === false ? '' : 'Each band is one hour. Candle clocks were used in England over 1,000 years ago — King Alfred the Great is said to have used them.';
        chime(d);
      },
    };
  },
};

// ================================================================ WATER CLOCK
const water = {
  id: 'water',
  label: 'Water clock',
  icon: '💧',
  build(host, s) {
    const id = uidN();
    const el = svg('0 0 170 240', 'cf-water', `
      <defs>
        <linearGradient id="wa${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6fc3ff"/><stop offset="1" stop-color="#1f6fd1"/></linearGradient>
        <clipPath id="tb${id}"><path d="M34 22 L136 22 L112 86 L58 86 Z"/></clipPath>
        <clipPath id="bb${id}"><rect x="40" y="122" width="90" height="98" rx="6"/></clipPath>
      </defs>
      <rect x="24" y="86" width="20" height="140" fill="#8a5a2b" rx="2"/><rect x="126" y="86" width="20" height="140" fill="#8a5a2b" rx="2"/>
      <rect x="20" y="84" width="130" height="8" fill="#a06a35" rx="2"/>
      <rect class="wt-top" x="0" width="170" fill="url(#wa${id})" clip-path="url(#tb${id})"/>
      <path d="M34 22 L136 22 L112 86 L58 86 Z" class="wt-glass"/>
      <rect x="82" y="86" width="6" height="8" fill="#6b4a2a"/>
      <g class="wt-drops"><circle cx="85" cy="98" r="2.6"/><circle cx="85" cy="98" r="2.6"/><circle cx="85" cy="98" r="2.6"/></g>
      <rect class="wt-bot" x="0" width="170" fill="url(#wa${id})" clip-path="url(#bb${id})"/>
      <rect x="40" y="122" width="90" height="98" rx="6" class="wt-glass"/>
      <g class="wt-marks"></g>
      <rect x="30" y="220" width="110" height="8" rx="3" fill="#a06a35"/>`);
    host.append(el);
    const topW = el.querySelector('.wt-top');
    const botW = el.querySelector('.wt-bot');
    const drops = el.querySelector('.wt-drops');
    const marks = el.querySelector('.wt-marks');
    const info = h('div', { class: 'sd-info' });
    const fact = caption('');
    host.append(h('div', { class: 'clock-text' }, info, fact));
    const B_TOP = 130;
    const B_BOT = 218;
    const chime = hourChime(s);
    let builtFor = '';
    return {
      update(d) {
        const sp = spanOf(s, d);
        const key = `${sp.sh}:${sp.sm}:${sp.hours}:${s.hour12}`;
        if (key !== builtFor) {
          builtFor = key;
          let m = '';
          for (let k = 0; k <= sp.hours; k++) {
            const y = B_BOT - ((B_BOT - B_TOP) * k) / sp.hours;
            m += `<line x1="118" x2="130" y1="${f1(y)}" y2="${f1(y)}" class="wt-mark"/><text x="150" y="${f1(y)}" class="wt-num">${hourLabel(sp.sh, k, s.hour12 !== false)}</text>`;
          }
          marks.innerHTML = m;
        }
        // Upper bowl empties, lower jar fills.
        const topLevel = 26 + 60 * sp.used;
        topW.setAttribute('y', f1(topLevel));
        topW.setAttribute('height', f1(Math.max(0, 86 - topLevel)));
        const botLevel = B_BOT - (B_BOT - B_TOP) * sp.used;
        botW.setAttribute('y', f1(botLevel));
        botW.setAttribute('height', f1(Math.max(0, 222 - botLevel)));
        const flowing = !sp.before && !sp.after;
        drops.style.display = flowing ? '' : 'none';
        drops.style.setProperty('--fall', `${f1(Math.max(4, botLevel - 100))}px`);
        const left = Math.max(0, sp.hours * 60 * (1 - sp.used));
        info.replaceChildren(h('span', {},
          sp.before ? `Starts at ${sp.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` :
          sp.after ? 'The jar is full — time is up for today!' :
          h('span', {}, h('b', {}, `${Math.floor(left / 60)} h ${Math.round(left % 60)} min`), ' of water left')));
        fact.textContent = s.facts === false ? '' : 'The water level shows the hour. Water clocks (clepsydras) were used in ancient Egypt, Babylon, Greece and China over 3,000 years ago.';
        chime(d);
      },
    };
  },
};

// ================================================================ INCENSE SEAL CLOCK
function spiralPath(step = 15) {
  let l = 22;
  let t = 22;
  let r = 178;
  let b = 178;
  const pts = [[l, t]];
  for (;;) {
    pts.push([r, t], [r, b], [l, b]);
    t += step;
    if (b - t < step) break;
    pts.push([l, t]);
    l += step;
    r -= step;
    b -= step;
    if (r - l < step) break;
  }
  return `M${pts.map((p) => p.join(' ')).join(' L')}`;
}
const incense = {
  id: 'incense',
  label: 'Incense clock',
  icon: '🪔',
  build(host, s) {
    const id = uidN();
    const d0 = spiralPath();
    const el = svg('0 0 200 200', 'cf-incense', `
      <defs>
        <radialGradient id="em${id}"><stop offset="0" stop-color="#fff2a8"/><stop offset=".4" stop-color="#ff7b00"/><stop offset="1" stop-color="#ff3d00" stop-opacity="0"/></radialGradient>
        <linearGradient id="tr${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a4a24"/><stop offset="1" stop-color="#4e2c13"/></linearGradient>
      </defs>
      <rect x="4" y="4" width="192" height="192" rx="14" fill="url(#tr${id})"/>
      <rect x="12" y="12" width="176" height="176" rx="8" fill="#d9cbb0"/>
      <path d="${d0}" class="ic-powder"/>
      <path d="${d0}" class="ic-ash"/>
      <g class="ic-marks"></g>
      <circle class="ic-ember" r="9" fill="url(#em${id})"/>
      <g class="ic-smoke"><path d="M0 0 c-5 -8 5 -14 0 -22 c-5 -8 5 -14 0 -22"/><path d="M0 0 c5 -8 -5 -14 0 -22 c5 -8 -5 -14 0 -22"/></g>`);
    host.append(el);
    const powder = el.querySelector('.ic-powder');
    const ash = el.querySelector('.ic-ash');
    const ember = el.querySelector('.ic-ember');
    const smoke = el.querySelector('.ic-smoke');
    const marks = el.querySelector('.ic-marks');
    const info = h('div', { class: 'sd-info' });
    const fact = caption('');
    host.append(h('div', { class: 'clock-text' }, info, fact));
    const chime = hourChime(s);
    let total = 0;
    let builtFor = '';
    return {
      update(d) {
        if (!total) total = powder.getTotalLength();
        if (!total) return; // not laid out yet
        const sp = spanOf(s, d);
        const key = `${sp.sh}:${sp.sm}:${sp.hours}:${s.hour12}`;
        if (key !== builtFor) {
          builtFor = key;
          let m = '';
          for (let k = 0; k <= sp.hours; k++) {
            const p = powder.getPointAtLength((total * k) / sp.hours);
            m += `<circle cx="${f1(p.x)}" cy="${f1(p.y)}" r="4.2" class="ic-mark"/><text x="${f1(p.x)}" y="${f1(p.y)}" class="ic-num">${hourLabel(sp.sh, k, s.hour12 !== false)}</text>`;
          }
          marks.innerHTML = m;
        }
        const burnt = total * sp.used;
        ash.style.strokeDasharray = `${f1(burnt)} ${f1(total + 10)}`;
        const p = powder.getPointAtLength(burnt);
        ember.setAttribute('cx', f1(p.x));
        ember.setAttribute('cy', f1(p.y));
        smoke.setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y)})`);
        const lit = !sp.before && !sp.after;
        ember.style.display = lit ? '' : 'none';
        smoke.style.display = lit ? '' : 'none';
        const left = Math.max(0, sp.hours * 60 * (1 - sp.used));
        info.replaceChildren(h('span', {},
          sp.before ? `Lit at ${sp.start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` :
          sp.after ? 'All burnt — time is up for today!' :
          h('span', {}, h('b', {}, `${Math.floor(left / 60)} h ${Math.round(left % 60)} min`), ' of incense left')));
        fact.textContent = s.facts === false ? '' : 'A trail of incense powder burns slowly at a steady speed; the dots mark the hours. Incense seal clocks were used in China and Japan for hundreds of years.';
        chime(d);
      },
    };
  },
};

export const FACES = [classic, teaching, roman, words, sundial, candle, water, incense];
export const FACE_BY_ID = Object.fromEntries(FACES.map((f) => [f.id, f]));
