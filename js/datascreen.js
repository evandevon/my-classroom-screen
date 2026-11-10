// ☰ → 📊 Data: look through, summarise, export and delete what widgets have recorded.
import { h, downloadBlob, toast, setKids } from './util.js';
import { db } from './storage.js';
import { allEvents, deleteEvents, pruneOld, toCSV, toTSV, describe, fmtDuration, fmtDate, onLogChange } from './datalog.js';
import { WIDGETS } from './widgets/index.js';

const RANGES = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['7', 'Last 7 days'],
  ['30', 'Last 30 days'],
  ['all', 'Everything'],
  ['custom', 'Choose dates…'],
];

function rangeBounds(r, fromStr, toStr) {
  const now = new Date();
  const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  if (r === 'today') return [sod(now), Infinity];
  if (r === 'week') { const d = new Date(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [sod(d), Infinity]; }
  if (r === '7' || r === '30') { const d = new Date(now); d.setDate(d.getDate() - Number(r) + 1); return [sod(d), Infinity]; }
  if (r === 'custom') {
    const a = fromStr ? new Date(`${fromStr}T00:00`).getTime() : 0;
    const b = toStr ? new Date(`${toStr}T23:59:59`).getTime() : Infinity;
    return [a, b];
  }
  return [0, Infinity];
}

export async function showDataScreen() {
  const f = { range: 'week', from: '', to: '', cls: '', widget: '', who: '' };
  let all = [];
  let shown = [];

  const sel = (opts, value, onChange, label) => {
    const s = h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) });
    for (const [v, t] of opts) {
      const o = h('option', { value: v }, t);
      if (v === value) o.selected = true;
      s.append(o);
    }
    return s;
  };

  const filters = h('div', { class: 'data-filters' });
  const summary = h('div', { class: 'data-summary' });
  const table = h('div', { class: 'data-table-wrap' });
  const countEl = h('span', { class: 'data-count' });
  const keepSel = sel([['0', 'Keep until I delete them'], ['28', 'Delete after 4 weeks'], ['56', 'Delete after 8 weeks'], ['70', 'Delete after 10 weeks (a term)']],
    String(await db.getMeta('dataKeepDays', 0)), async (v) => {
      await db.setMeta('dataKeepDays', Number(v));
      const n = await pruneOld(Number(v));
      if (n) toast(`Deleted ${n} older record${n === 1 ? '' : 's'}.`);
    }, 'How long to keep records');

  const dlg = h('dialog', { class: 'modal data-modal' },
    h('div', { class: 'modal-head' }, h('h2', {}, '📊 Recorded data'), h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕')),
    h('div', { class: 'modal-body' },
      h('p', { class: 'data-privacy' }, '🔒 This data is stored only in this browser on this device. It is never added to share links or screen files. It’s for your own teaching notes — official records still belong in your school’s system.'),
      filters,
      summary,
      h('div', { class: 'data-actions' },
        countEl,
        h('button', { class: 'btn primary', onclick: exportCSV }, '⬇ Download spreadsheet (CSV)'),
        h('button', { class: 'btn', onclick: copyRows }, '📋 Copy for Sheets / Excel'),
        h('button', { class: 'btn danger', onclick: deleteShown }, '🗑 Delete these records'),
      ),
      table,
      h('div', { class: 'data-foot' }, h('span', {}, 'Old records:'), keepSel),
      h('details', { class: 'sday-quickbox' },
        h('summary', {}, 'How do I record data?'),
        h('ul', {},
          h('li', {}, 'Add a ', h('b', {}, 'Tally'), ' widget to count things like interruptions or great answers — for the whole class or for each student.'),
          h('li', {}, 'Or open ⚙ on a Scoreboard, Stopwatch, Noise meter, Traffic light or Name picker and turn on ', h('b', {}, '📊 Record'), '. A red ● REC shows while it records.'),
          h('li', {}, 'Tap the ', h('b', {}, '👥 class'), ' button at the top so records are labelled with the right class (or let the Activity timeline fill it in).'),
          h('li', {}, 'The downloaded spreadsheet opens in Excel or Google Sheets, where you can sort, filter and chart it.'),
        ),
      ),
    ),
  );
  document.body.append(dlg);
  const off = onLogChange(() => load());
  dlg.addEventListener('close', () => { off(); dlg.remove(); });
  dlg.showModal();
  await pruneOld(await db.getMeta('dataKeepDays', 0));
  await load();

  async function load() {
    all = await allEvents();
    drawFilters();
    apply();
  }

  function drawFilters() {
    const classes = [...new Set(all.map((e) => e.cls).filter(Boolean))].sort();
    const types = [...new Set(all.map((e) => e.widget).filter(Boolean))];
    const people = [...new Set(all.filter((e) => (!f.cls || e.cls === f.cls)).map((e) => e.who).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const from = h('input', { type: 'date', value: f.from, 'aria-label': 'From' });
    const to = h('input', { type: 'date', value: f.to, 'aria-label': 'To' });
    from.addEventListener('change', () => { f.from = from.value; apply(); });
    to.addEventListener('change', () => { f.to = to.value; apply(); });
    setKids(filters,
      h('label', { class: 'field' }, h('span', {}, 'When'), sel(RANGES, f.range, (v) => { f.range = v; drawFilters(); apply(); }, 'Date range')),
      f.range === 'custom' ? h('label', { class: 'field' }, h('span', {}, 'From'), from) : null,
      f.range === 'custom' ? h('label', { class: 'field' }, h('span', {}, 'To'), to) : null,
      h('label', { class: 'field' }, h('span', {}, 'Class'), sel([['', 'All classes'], ...classes.map((c) => [c, c]), ...(all.some((e) => !e.cls) ? [['(none)', '(no class set)']] : [])], f.cls, (v) => { f.cls = v; f.who = ''; drawFilters(); apply(); }, 'Class')),
      h('label', { class: 'field' }, h('span', {}, 'Widget'), sel([['', 'All widgets'], ...types.map((t) => [t, WIDGETS[t]?.title || t])], f.widget, (v) => { f.widget = v; apply(); }, 'Widget')),
      h('label', { class: 'field' }, h('span', {}, 'Student / team'), sel([['', 'Everyone'], ...people.map((p) => [p, p])], f.who, (v) => { f.who = v; apply(); }, 'Student or team')),
    );
  }

  function apply() {
    const [a, b] = rangeBounds(f.range, f.from, f.to);
    shown = all.filter((e) =>
      e.t >= a && e.t <= b &&
      (!f.cls || (f.cls === '(none)' ? !e.cls : e.cls === f.cls)) &&
      (!f.widget || e.widget === f.widget) &&
      (!f.who || e.who === f.who));
    countEl.textContent = `${shown.length} record${shown.length === 1 ? '' : 's'}`;
    drawSummary();
    drawTable();
  }

  function drawSummary() {
    if (!shown.length) {
      summary.replaceChildren(h('p', { class: 'hint' }, all.length ? 'Nothing matches these filters.' : 'Nothing recorded yet. Open “How do I record data?” below to get started.'));
      return;
    }
    // Group by what was recorded, adding up counts, points and time.
    const groups = new Map();
    for (const e of shown) {
      const key = `${e.widget}|${e.label}|${e.unit}`;
      const g = groups.get(key) || { widget: e.widget, label: e.label, unit: e.unit, total: 0, n: 0, who: new Map() };
      g.total += e.unit === 'level' ? 0 : e.value;
      g.n += 1;
      if (e.who) g.who.set(e.who, (g.who.get(e.who) || 0) + (e.unit === 'level' ? 1 : e.value));
      groups.set(key, g);
    }
    const days = new Set(shown.map((e) => fmtDate(e.t))).size;
    const cards = [...groups.values()].sort((x, y) => y.n - x.n).slice(0, 12).map((g) => {
      const icon = WIDGETS[g.widget]?.icon || '•';
      const big = g.unit === 'seconds' ? fmtDuration(g.total) : g.unit === 'points' ? `${g.total > 0 ? '+' : ''}${g.total}` : g.unit === 'level' ? `${g.n}×` : String(g.total);
      const top = [...g.who.entries()].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 4)
        .map(([w, v]) => `${w} ${g.unit === 'seconds' ? fmtDuration(v) : v}`).join(' · ');
      return h('div', { class: 'data-card' },
        h('div', { class: 'dc-what' }, h('span', {}, icon), g.label || WIDGETS[g.widget]?.title || g.widget),
        h('div', { class: 'dc-big' }, big),
        h('div', { class: 'dc-sub' }, `${g.n} record${g.n === 1 ? '' : 's'}${top ? ` · ${top}` : ''}`),
      );
    });
    summary.replaceChildren(
      h('div', { class: 'hint' }, `Over ${days} day${days === 1 ? '' : 's'}:`),
      h('div', { class: 'data-cards' }, ...cards),
    );
  }

  function drawTable() {
    const rows = shown.slice(0, 300);
    setKids(table,
      h('table', { class: 'data-table' },
        h('thead', {}, h('tr', {}, ...['When', 'Class', 'Widget', 'Student / team', 'What', 'Amount', ''].map((t) => h('th', {}, t)))),
        h('tbody', {},
          ...rows.map((e) => h('tr', {},
            h('td', {}, new Date(e.t).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })),
            h('td', {}, e.cls || '—'),
            h('td', {}, `${WIDGETS[e.widget]?.icon || ''} ${WIDGETS[e.widget]?.title || e.widget}`),
            h('td', {}, e.who || '—'),
            h('td', {}, e.label, e.note ? h('small', {}, ` (${e.note})`) : null),
            h('td', { class: 'num' }, describe(e)),
            h('td', {}, h('button', { class: 'w-btn close', title: 'Delete this record', 'aria-label': 'Delete this record', onclick: () => deleteEvents([e.id]) }, '✕')),
          )),
        ),
      ),
      shown.length > rows.length ? h('p', { class: 'hint' }, `Showing the newest ${rows.length}. The download includes all ${shown.length}.`) : null,
    );
  }

  function exportCSV() {
    if (!shown.length) { toast('Nothing to export with these filters.'); return; }
    const name = ['classroom-data', f.cls && f.cls !== '(none)' ? f.cls : '', fmtDate(Date.now())].filter(Boolean).join('-').replace(/[^\w-]+/g, '-');
    downloadBlob(new Blob([toCSV(shown)], { type: 'text/csv;charset=utf-8' }), `${name}.csv`);
  }
  async function copyRows() {
    if (!shown.length) { toast('Nothing to copy with these filters.'); return; }
    try {
      await navigator.clipboard.writeText(toTSV(shown));
      toast(`Copied ${shown.length} rows — paste into a spreadsheet.`);
    } catch {
      toast('Copy was blocked by the browser — use Download instead.');
    }
  }
  async function deleteShown() {
    if (!shown.length) return;
    if (!confirm(`Delete these ${shown.length} records from this device? This can’t be undone.`)) return;
    await deleteEvents(shown.map((e) => e.id));
    toast('Deleted.');
  }
}
