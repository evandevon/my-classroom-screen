import { h } from '../util.js';
import { panel, select, checkbox, field, textInput, swatches } from './_common.js';
import { FACES, FACE_BY_ID, PLACES } from './clockfaces.js';

export default {
  type: 'clock',
  title: 'Clock',
  icon: '🕒',
  group: 'core',
  size: [340, 340],
  hasSettings: true,
  defaultState: () => ({
    face: 'classic',
    mode: 'both', // classic face: both | analog | digital
    hour12: true,
    seconds: false,
    date: true,
    facts: true, // history captions
    // teaching clock
    teachSet: false,
    setMin: 610,
    quiz: false,
    teachWords: true,
    teachDigital: true,
    // roman
    romanIIII: true,
    romanDigital: true,
    // word clock
    wordColor: '#ffd166',
    // sundial
    place: 'sydney',
    lat: -33.87,
    lon: 151.21,
    // candle / water / incense
    spanStart: '09:00',
    spanHours: 6,
    chime: false,
  }),

  mount(ctx) {
    const s = ctx.state;
    const host = h('div', { class: 'clock-host' });
    ctx.view.append(host);
    let face = null;
    let t;

    function build() {
      face?.destroy?.();
      host.replaceChildren();
      const def = FACE_BY_ID[s.face] || FACE_BY_ID.classic;
      host.className = `clock-host face-${def.id}`;
      host.dataset.mode = s.mode;
      face = def.build(host, s, { save: ctx.save });
      tick();
    }
    function tick() {
      face?.update(new Date());
    }
    build();
    // Faces that change slowly still update each second (cheap SVG attribute changes).
    t = setInterval(tick, 1000);

    return {
      destroy: () => { clearInterval(t); face?.destroy?.(); },
      resize: tick,
      openSettings() {
        const rebuild = () => { build(); ctx.save(); };
        const upd = (fn) => (v) => { fn(v); rebuild(); };

        const picker = h('div', { class: 'face-grid' },
          ...FACES.map((f) =>
            h('button', {
              class: `face-opt${s.face === f.id ? ' on' : ''}`,
              onclick: (e) => { e.preventDefault(); s.face = f.id; rebuild(); ctx.openSettings(); },
            }, h('span', { class: 'fi' }, f.icon), f.label),
          ),
        );

        const opts = [];
        const common = [checkbox('12-hour time (am/pm)', s.hour12, upd((v) => (s.hour12 = v)))];
        switch (s.face) {
          case 'classic':
            opts.push(
              field('Show', select([['both', 'Analogue + digital'], ['analog', 'Analogue only'], ['digital', 'Digital only']], s.mode, upd((v) => (s.mode = v)))),
              ...common,
              checkbox('Show seconds', s.seconds, upd((v) => (s.seconds = v))),
              checkbox('Show date', s.date, upd((v) => (s.date = v))),
            );
            break;
          case 'teaching':
            opts.push(
              field('Time shown', select([['live', 'The real time now'], ['set', 'A time I choose (drag the long hand)']], s.teachSet ? 'set' : 'live', upd((v) => (s.teachSet = v === 'set')))),
              checkbox('Quiz mode — hide the answer until tapped', s.quiz, upd((v) => (s.quiz = v))),
              checkbox('Show the time in words', s.teachWords !== false, upd((v) => (s.teachWords = v))),
              checkbox('Show digital time', s.teachDigital !== false, upd((v) => (s.teachDigital = v))),
              checkbox('Show seconds hand (live time)', s.seconds, upd((v) => (s.seconds = v))),
            );
            break;
          case 'roman':
            opts.push(
              checkbox('Use IIII for four (traditional clocks)', s.romanIIII !== false, upd((v) => (s.romanIIII = v))),
              checkbox('Show the time in Roman numerals', s.romanDigital !== false, upd((v) => (s.romanDigital = v))),
              checkbox('Show seconds', s.seconds, upd((v) => (s.seconds = v))),
            );
            break;
          case 'words':
            opts.push(field('Letter colour', swatches(['#ffd166', '#ffffff', '#7bdff2', '#b8f2a1', '#ff8fab', '#ffb347'], s.wordColor, upd((v) => (s.wordColor = v)))),
              h('p', { class: 'hint' }, 'The word clock moves in five-minute steps. The four corner dots add one minute each.'));
            break;
          case 'sundial': {
            const status = h('span', { class: 'hint' });
            opts.push(
              field('Place', select([...Object.entries(PLACES).map(([k, v]) => [k, v[0]]), ['custom', 'Custom / my location']], s.place, upd((v) => (s.place = v)))),
              s.place === 'custom'
                ? h('div', { class: 'row' },
                    field('Latitude', textInput(String(s.lat), (v) => { const n = parseFloat(v); if (!Number.isNaN(n)) { s.lat = n; build(); ctx.save(); } })),
                    field('Longitude', textInput(String(s.lon), (v) => { const n = parseFloat(v); if (!Number.isNaN(n)) { s.lon = n; build(); ctx.save(); } })),
                  )
                : null,
              h('div', { class: 'row' },
                h('button', {
                  class: 'btn',
                  onclick: () => {
                    if (!navigator.geolocation) { status.textContent = 'Location is not available on this device.'; return; }
                    status.textContent = 'Finding your location…';
                    navigator.geolocation.getCurrentPosition(
                      (p) => {
                        s.place = 'custom';
                        s.lat = Math.round(p.coords.latitude * 100) / 100; // rounded: about 1 km is plenty
                        s.lon = Math.round(p.coords.longitude * 100) / 100;
                        rebuild();
                        ctx.openSettings();
                      },
                      () => (status.textContent = 'Could not get your location — choose a place instead.'),
                      { timeout: 10000 },
                    );
                  },
                }, '📍 Use this device’s location'),
                status,
              ),
              ...common,
              h('p', { class: 'hint' }, 'Drag the ☀️ along its path to see the shadow move. Let go and it returns to where the sun really is.'),
            );
            break;
          }
          case 'candle':
          case 'water':
          case 'incense': {
            const startIn = h('input', { type: 'time', value: s.spanStart, 'aria-label': 'Start time' });
            startIn.addEventListener('change', () => { if (startIn.value) { s.spanStart = startIn.value; rebuild(); } });
            opts.push(
              h('div', { class: 'row' },
                field(s.face === 'water' ? 'Starts flowing at' : 'Lit at', startIn),
                field('Lasts for', select([2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => [n, `${n} hours`]), s.spanHours, upd((v) => (s.spanHours = Number(v))))),
              ),
              checkbox('Chime at each hour mark', s.chime, upd((v) => (s.chime = v))),
              ...common,
            );
            break;
          }
          default:
        }
        panel(ctx, 'Clock',
          field('Clock style', picker),
          ...opts,
          s.face !== 'classic' ? checkbox('Show history / learning notes', s.facts !== false, upd((v) => (s.facts = v))) : null,
        );
      },
    };
  },
};
