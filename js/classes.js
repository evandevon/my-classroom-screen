// Class lists: named classes with student names, kept only on this device.
// The current class labels recorded data and supplies names to the Name picker, Group maker,
// Tally, Scoreboard and Stopwatch (each can also use its own typed list).

import { db } from './storage.js';
import { h, uid, toast, downloadBlob, pickFile, setKids } from './util.js';
import { currentSession } from './widgets/schoolday.js';

const st = { lists: [], currentId: '', auto: true, getScreen: () => null, lastName: '' };
const listeners = new Set();

export function onClassChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  st.lastName = currentClassName();
  for (const fn of listeners) {
    try { fn(); } catch (e) { console.error(e); }
  }
}
const save = () => db.setMeta('classLists', st.lists);

const cleanNames = (text) =>
  String(text || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\t+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

export async function initClasses(getScreen) {
  st.getScreen = getScreen;
  st.lists = await db.getMeta('classLists', []);
  st.currentId = await db.getMeta('currentClassId', '');
  st.auto = await db.getMeta('classAuto', true);
  // Older versions only stored a typed class name: turn it into a class.
  const legacy = await db.getMeta('classLabel', '');
  if (legacy && !st.lists.some((c) => c.name === legacy)) {
    const c = { id: uid('class'), name: legacy, students: [] };
    st.lists.push(c);
    if (!st.currentId) st.currentId = c.id;
    await save();
    await db.setMeta('currentClassId', st.currentId);
  }
  await db.setMeta('classLabel', '');
  st.lastName = currentClassName();
  // The Activity timeline can change the class as sessions change.
  setInterval(() => { if (currentClassName() !== st.lastName) emit(); }, 15000);
}

export const classLists = () => st.lists;

/** If the Activity timeline on this screen is in a session, which class is it? */
function sessionMatch() {
  if (!st.auto) return null;
  const sd = st.getScreen()?.widgets.find((w) => w.type === 'schoolday');
  const name = sd ? currentSession(sd.state)?.name : '';
  if (!name) return null;
  const low = name.toLowerCase();
  const cls = st.lists
    .filter((l) => l.name.trim() && low.includes(l.name.trim().toLowerCase()))
    .sort((a, b) => b.name.length - a.name.length)[0];
  return { name, cls: cls || null };
}

export function currentClass() {
  const m = sessionMatch();
  if (m?.cls) return m.cls;
  return st.lists.find((l) => l.id === st.currentId) || null;
}
export function currentClassName() {
  const m = sessionMatch();
  if (m) return m.cls?.name || m.name;
  return currentClass()?.name || '';
}
export const fromTimeline = () => !!sessionMatch();

/** Names for a widget's "names from" choice: 'current', a class id, or 'own' (null = use own list). */
export function namesFor(source) {
  if (!source || source === 'own') return null;
  const c = source === 'current' ? currentClass() : st.lists.find((l) => l.id === source);
  return c && c.students.length ? [...c.students] : null;
}
export function sourceName(source) {
  if (source === 'own') return 'your own list';
  const c = source === 'current' || !source ? currentClass() : st.lists.find((l) => l.id === source);
  return c ? c.name : 'no class chosen';
}

/** <select> for widget settings: where do the names come from? */
export function sourceSelect(value, onChange) {
  const cur = currentClass();
  const opts = [
    ['current', `The current class${cur ? ` (${cur.name}, ${cur.students.length})` : ' (none chosen yet)'}`],
    ...st.lists.map((c) => [c.id, `${c.name} (${c.students.length})`]),
    ['own', 'My own list — type names below'],
  ];
  const sel = h('select', { onchange: (e) => onChange(e.target.value) });
  for (const [v, t] of opts) {
    const o = h('option', { value: v }, t);
    if (v === (value || 'current')) o.selected = true;
    sel.append(o);
  }
  return sel;
}

export async function setCurrentClass(id) {
  st.currentId = id || '';
  await db.setMeta('currentClassId', st.currentId);
  emit();
}

// ------------------------------------------------------------------ dialogs
function dialog(title, ...content) {
  const dlg = h('dialog', { class: 'modal classes-modal' },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕')),
    h('div', { class: 'modal-body' }, ...content),
  );
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

/** Quick picker from the 👥 button in the top bar. */
export function showClassPicker() {
  const box = h('div', { class: 'class-grid' });
  const auto = h('input', { type: 'checkbox' });
  auto.checked = st.auto;
  auto.addEventListener('change', async () => { st.auto = auto.checked; await db.setMeta('classAuto', st.auto); emit(); draw(); });
  const note = h('p', { class: 'hint' });
  const dlg = dialog('Which class?',
    box,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => { dlg.close(); showClassManager(); } }, '✎ Add or edit classes…'),
    ),
    h('label', { class: 'check' }, auto, h('span', {}, 'When this screen has an Activity timeline, switch to the class whose name matches the current session')),
    note,
    h('p', { class: 'hint' }, '🔒 Class lists stay on this device. They are not put into share links or screen files.'),
  );
  function draw() {
    const cur = currentClass();
    setKids(box,
      ...st.lists.map((c) => h('button', {
        class: `class-tile${cur?.id === c.id ? ' on' : ''}`,
        onclick: async () => { await setCurrentClass(c.id); dlg.close(); },
      }, h('b', {}, c.name), h('small', {}, `${c.students.length} student${c.students.length === 1 ? '' : 's'}`))),
      h('button', { class: `class-tile none${!st.currentId ? ' on' : ''}`, onclick: async () => { await setCurrentClass(''); dlg.close(); } }, h('b', {}, 'No class'), h('small', {}, 'don’t label')),
      st.lists.length ? null : h('p', { class: 'hint' }, 'No classes yet — tap “Add or edit classes…” to make one.'),
    );
    const m = sessionMatch();
    note.textContent = m ? `Right now the timeline says “${m.name}”${m.cls ? `, so ${m.cls.name} is being used.` : ' (no class with a matching name).'}` : '';
  }
  draw();
}

/** Full editor: make classes, type or paste names, import/export. */
export function showClassManager(selectId) {
  let sel = selectId || currentClass()?.id || st.lists[0]?.id || '';
  const listBox = h('div', { class: 'cm-list' });
  const editor = h('div', { class: 'cm-editor' });
  dialog('Classes',
    h('div', { class: 'cm' }, listBox, editor),
    h('div', { class: 'row cm-io' },
      h('button', { class: 'btn small', onclick: exportCSV }, '⬇ Export class lists (CSV)'),
      h('button', { class: 'btn small', onclick: importFile }, '📂 Import from a CSV or text file'),
    ),
    h('p', { class: 'hint' }, '🔒 Names stay in this browser on this device only — they are not in share links or screen files. Use Export to move them to another computer.'),
  );

  function drawList() {
    setKids(listBox,
      ...st.lists.map((c) => h('button', { class: `cm-item${c.id === sel ? ' on' : ''}`, onclick: () => { sel = c.id; drawList(); drawEditor(); } },
        h('b', {}, c.name || 'Untitled'), h('small', {}, `${c.students.length}`))),
      h('button', { class: 'btn primary', onclick: () => {
        const c = { id: uid('class'), name: `Class ${st.lists.length + 1}`, students: [] };
        st.lists.push(c);
        sel = c.id;
        save(); emit(); drawList(); drawEditor();
        editor.querySelector('input')?.select();
      } }, '+ New class'),
    );
  }

  function drawEditor() {
    const c = st.lists.find((l) => l.id === sel);
    if (!c) {
      setKids(editor, h('div', { class: 'empty-note' }, h('p', {}, 'Make a class, then type or paste the students’ names.'), h('p', { class: 'hint' }, 'Tip: copy a column of names from a spreadsheet or your school system and paste it in.')));
      return;
    }
    const nameIn = h('input', { type: 'text', value: c.name, 'aria-label': 'Class name', placeholder: 'e.g. 4B or 3/4 Blue' });
    nameIn.addEventListener('input', () => { c.name = nameIn.value; save(); emit(); drawListOnly(); });
    const names = h('textarea', { rows: 14, 'aria-label': 'Student names, one per line', placeholder: 'Ava\nBen\nCharlie\n…' });
    names.value = c.students.join('\n');
    const count = h('span', { class: 'hint' }, `${c.students.length} students`);
    names.addEventListener('input', () => { c.students = cleanNames(names.value); count.textContent = `${c.students.length} students`; save(); emit(); drawListOnly(); });
    const isCur = currentClass()?.id === c.id;
    setKids(editor,
      h('label', { class: 'field' }, h('span', {}, 'Class name'), nameIn),
      h('label', { class: 'field' }, h('span', {}, 'Students (one per line — you can paste a column from a spreadsheet)'), names),
      h('div', { class: 'row' },
        count,
        h('button', { class: 'btn small', onclick: () => { c.students.sort((a, b) => a.localeCompare(b)); names.value = c.students.join('\n'); save(); emit(); } }, 'Sort A–Z'),
        h('button', { class: `btn small${isCur ? '' : ' primary'}`, disabled: isCur, onclick: async () => { await setCurrentClass(c.id); drawEditor(); toast(`${c.name} is now the current class.`); } }, isCur ? '✓ Current class' : 'Use this class now'),
        h('button', { class: 'btn small danger', onclick: () => {
          if (!confirm(`Delete the class “${c.name}” and its list of names from this device?`)) return;
          st.lists = st.lists.filter((x) => x !== c);
          if (st.currentId === c.id) setCurrentClass('');
          sel = st.lists[0]?.id || '';
          save(); emit(); drawList(); drawEditor();
        } }, '🗑 Delete class'),
      ),
    );
  }
  const drawListOnly = () => {
    listBox.querySelectorAll('.cm-item').forEach((b, i) => {
      const c = st.lists[i];
      if (!c) return;
      b.querySelector('b').textContent = c.name || 'Untitled';
      b.querySelector('small').textContent = String(c.students.length);
    });
  };

  function exportCSV() {
    const esc = (v) => { const s = String(v); const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
    const rows = ['Class,Student'];
    for (const c of st.lists) for (const n of c.students.length ? c.students : ['']) rows.push(`${esc(c.name)},${esc(n)}`);
    downloadBlob(new Blob([`﻿${rows.join('\r\n')}`], { type: 'text/csv;charset=utf-8' }), 'class-lists.csv');
  }

  async function importFile() {
    const f = await pickFile('.csv,.txt,text/csv,text/plain');
    if (!f) return;
    const text = (await f.text()).replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const splitCSV = (l) => {
      const out = [];
      let cur = '';
      let q = false;
      for (const ch of l) {
        if (ch === '"') q = !q;
        else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur);
      return out.map((x) => x.trim().replace(/^'(?=[=+\-@])/, ''));
    };
    let added = 0;
    if (/^class\s*,/i.test(lines[0] || '')) {
      // "Class,Student" rows (like our own export)
      for (const l of lines.slice(1)) {
        const [cn, sn] = splitCSV(l);
        if (!cn) continue;
        let c = st.lists.find((x) => x.name === cn);
        if (!c) { c = { id: uid('class'), name: cn, students: [] }; st.lists.push(c); }
        if (sn && !c.students.includes(sn)) { c.students.push(sn); added++; }
      }
    } else {
      // One name per line (first column): becomes a new class named after the file.
      const c = { id: uid('class'), name: f.name.replace(/\.[^.]+$/, ''), students: [] };
      for (const l of lines) { const n = splitCSV(l)[0]; if (n && !c.students.includes(n)) { c.students.push(n); added++; } }
      st.lists.push(c);
      sel = c.id;
    }
    await save();
    emit();
    drawList();
    drawEditor();
    toast(`Imported ${added} name${added === 1 ? '' : 's'}.`);
  }

  drawList();
  drawEditor();
}
