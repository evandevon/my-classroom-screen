import { h, setKids } from '../util.js';
import { panel, field, select } from './_common.js';
import { PLACES, guessPlace } from './clockfaces.js';

// Weather from Open-Meteo (free for non-commercial use, no key; data CC BY 4.0 — credit shown).
// Only the place's rounded latitude/longitude is sent. The last forecast is kept so the widget
// still shows something if the internet drops.

const API = 'https://api.open-meteo.com/v1/forecast';
const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const REFRESH_MS = 15 * 60 * 1000;

// WMO weather codes → words and pictures (day / night).
const CODES = {
  0: ['Clear sky', '☀️', '🌙'], 1: ['Mostly clear', '🌤️', '🌙'], 2: ['Partly cloudy', '⛅', '☁️'], 3: ['Cloudy', '☁️', '☁️'],
  45: ['Fog', '🌫️', '🌫️'], 48: ['Icy fog', '🌫️', '🌫️'],
  51: ['Light drizzle', '🌦️', '🌧️'], 53: ['Drizzle', '🌦️', '🌧️'], 55: ['Heavy drizzle', '🌧️', '🌧️'],
  56: ['Freezing drizzle', '🌧️', '🌧️'], 57: ['Freezing drizzle', '🌧️', '🌧️'],
  61: ['Light rain', '🌦️', '🌧️'], 63: ['Rain', '🌧️', '🌧️'], 65: ['Heavy rain', '🌧️', '🌧️'],
  66: ['Freezing rain', '🌧️', '🌧️'], 67: ['Freezing rain', '🌧️', '🌧️'],
  71: ['Light snow', '🌨️', '🌨️'], 73: ['Snow', '🌨️', '🌨️'], 75: ['Heavy snow', '❄️', '❄️'], 77: ['Snow grains', '🌨️', '🌨️'],
  80: ['Light showers', '🌦️', '🌧️'], 81: ['Showers', '🌧️', '🌧️'], 82: ['Heavy showers', '⛈️', '⛈️'],
  85: ['Snow showers', '🌨️', '🌨️'], 86: ['Snow showers', '🌨️', '🌨️'],
  95: ['Thunderstorm', '⛈️', '⛈️'], 96: ['Thunderstorm with hail', '⛈️', '⛈️'], 99: ['Thunderstorm with hail', '⛈️', '⛈️'],
};
const describe = (code, day = 1) => {
  const c = CODES[code] || ['Weather', '🌡️', '🌡️'];
  return { text: c[0], icon: day ? c[1] : c[2] };
};
const UV = (u) =>
  u == null ? null
    : u < 3 ? { level: 'Low', tip: 'No sun protection needed', cls: 'low' }
      : u < 6 ? { level: 'Moderate', tip: 'Hat and sunscreen outside', cls: 'mod' }
        : u < 8 ? { level: 'High', tip: 'Hat, sunscreen, shirt — find shade', cls: 'high' }
          : u < 11 ? { level: 'Very high', tip: 'Hat, sunscreen, shirt, shade, sunnies', cls: 'vhigh' }
            : { level: 'Extreme', tip: 'Stay in the shade as much as possible', cls: 'ext' };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const compass = (deg) => COMPASS[Math.round(((deg % 360) / 22.5)) % 16];

const weather = {
  type: 'weather',
  title: 'Weather',
  icon: '🌦️',
  group: 'core',
  size: [520, 380],
  hasSettings: true,
  cacheKeys: ['data', 'fetchedAt'],
  defaultState: () => {
    const p = PLACES[guessPlace()] || PLACES.sydney;
    return { name: p[0], lat: p[1], lon: p[2], guessed: true, unit: 'C', show: 'auto', data: null, fetchedAt: 0 };
  },

  mount(ctx) {
    const s = ctx.state;
    const isToday = ctx.rec?.type === 'weathertoday';
    const box = h('div', { class: isToday ? 'wx wxt' : 'wx' });
    ctx.view.append(box);
    let timer;
    let error = '';
    let loading = false;

    const temp = (c) => (c == null ? '–' : s.unit === 'F' ? `${Math.round(c * 9 / 5 + 32)}°` : `${Math.round(c)}°`);

    // Each load gets a number; a newer load (e.g. a new place) makes older replies ignored.
    let loadSeq = 0;
    let retryTimer = null;
    const TIMEOUT_MS = 12000;
    const tryFetch = async (url) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);   // don't wait minutes on a dropped connection
      try {
        const r = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!data.current) throw new Error('No weather in the reply');
        return data;
      } finally { clearTimeout(t); }
    };

    async function load(force = false) {
      const key = `${s.lat},${s.lon}`;
      if (!force && s.data && Date.now() - s.fetchedAt < REFRESH_MS && s.data._for === key) { render(); return; }
      const seq = ++loadSeq;
      clearTimeout(retryTimer);
      loading = true;
      error = '';
      render();
      const q = new URLSearchParams({
        latitude: s.lat.toFixed(2),
        longitude: s.lon.toFixed(2),
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day,precipitation',
        hourly: 'temperature_2m,precipitation_probability,weather_code,is_day',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset',
        timezone: 'auto',
        forecast_days: '7',
      });
      let data = null;
      let lastErr;
      for (const wait of [0, 1500, 4000]) {   // a couple of quick retries: one dropped request shouldn't stop the weather
        if (wait) await new Promise((r) => setTimeout(r, wait));
        if (seq !== loadSeq) return;           // a newer request has taken over
        try { data = await tryFetch(`${API}?${q}`); break; } catch (e) { lastErr = e; }
      }
      if (seq !== loadSeq) return;
      loading = false;
      if (data) {
        data._for = key;
        s.data = data;
        s.fetchedAt = Date.now();
        ctx.save();
      } else {
        error = navigator.onLine === false
          ? 'You’re offline — showing the last weather we had.'
          : 'Couldn’t reach the weather service (the school network may block it). Trying again in a minute…';
        console.warn('weather', lastErr);
        retryTimer = setTimeout(() => load(true), 60000);   // keep trying every minute until it works
      }
      render();
    }

    function render() {
      const d = s.data;
      if (!d) {
        setKids(box, h('div', { class: 'empty' },
          h('p', {}, loading ? '⏳ Getting the weather…' : '🌦️ Weather'),
          error ? h('p', { class: 'error' }, error.replace(' — showing the last weather we had.', '.')) : null,
          !loading ? h('button', { class: 'btn primary', onclick: () => load(true) }, 'Try again') : null,
          h('button', { class: 'btn', onclick: () => ctx.openSettings() }, '📍 Choose the place'),
        ));
        return;
      }
      if (isToday) { renderToday(d); return; }
      const c = d.current;
      const now = describe(c.weather_code, c.is_day);
      const today = d.daily;
      const uv = UV(today?.uv_index_max?.[0]);
      // Next few hours, starting from the current hour.
      const hrs = d.hourly;
      const startIdx = Math.max(0, hrs.time.findIndex((t) => t >= c.time.slice(0, 13)));
      const next = hrs.time.slice(startIdx + 1, startIdx + 7).map((t, i) => ({
        t, temp: hrs.temperature_2m[startIdx + 1 + i], p: hrs.precipitation_probability?.[startIdx + 1 + i], code: hrs.weather_code[startIdx + 1 + i], day: hrs.is_day?.[startIdx + 1 + i] ?? 1,
      }));
      const soonRain = Math.max(0, ...next.slice(0, 3).map((x) => x.p ?? 0));
      const hourLabel = (iso) => { const hr = Number(iso.slice(11, 13)); return `${hr % 12 || 12}${hr < 12 ? 'am' : 'pm'}`; };
      const dayLabel = (iso, i) => (i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(`${iso}T12:00`).toLocaleDateString([], { weekday: 'short' }));
      const age = Math.round((Date.now() - s.fetchedAt) / 60000);

      setKids(box,
        h('div', { class: 'wx-now' },
          h('div', { class: 'wx-icon', 'aria-hidden': 'true' }, now.icon),
          h('div', { class: 'wx-main' },
            h('div', { class: 'wx-temp' }, temp(c.temperature_2m)),
            h('div', { class: 'wx-desc' }, now.text),
            h('div', { class: 'wx-feels' }, `Feels like ${temp(c.apparent_temperature)} · ${temp(today.temperature_2m_min[0])} to ${temp(today.temperature_2m_max[0])}`),
          ),
          h('div', { class: 'wx-side' },
            h('div', {}, `💧 Rain today ${today.precipitation_probability_max?.[0] ?? '–'}%`),
            h('div', {}, h('span', { class: 'wx-arrow', style: { transform: `rotate(${(c.wind_direction_10m + 180) % 360}deg)` } }, '↑'), ` ${Math.round(c.wind_speed_10m)} km/h from the ${compass(c.wind_direction_10m)}`),
          ),
        ),
        uv || soonRain >= 50 ? h('div', { class: 'wx-alerts' },
          uv ? h('span', { class: `wx-uv ${uv.cls}` }, `UV ${Math.round(today.uv_index_max[0])} ${uv.level}`, h('small', {}, ` · ${uv.tip}`)) : null,
          soonRain >= 50 ? h('span', { class: 'wx-wet' }, `🌂 ${soonRain}% chance of rain in the next 3 hours`) : null,
        ) : null,
        h('div', { class: 'wx-hours' },
          ...next.map((x) => { const w = describe(x.code, x.day); return h('div', { class: 'wx-h' }, h('small', {}, hourLabel(x.t)), h('span', { class: 'wx-hi', title: w.text }, w.icon), h('b', {}, temp(x.temp)), x.p ? h('small', { class: 'wx-p' }, `${x.p}%`) : h('small', { class: 'wx-p' }, '')); }),
        ),
        h('div', { class: 'wx-days' },
          ...today.time.slice(0, 5).map((t, i) => { const w = describe(today.weather_code[i], 1); return h('div', { class: 'wx-d' }, h('small', {}, dayLabel(t, i)), h('span', { class: 'wx-hi', title: w.text }, w.icon), h('b', {}, temp(today.temperature_2m_max[i])), h('small', {}, temp(today.temperature_2m_min[i]))); }),
        ),
        h('div', { class: 'wx-foot' },
          placeChip(),
          error ? h('span', { class: 'error' }, error) : h('span', {}, loading ? 'Updating…' : `Updated ${age < 1 ? 'just now' : `${age} min ago`}`),
          h('button', { class: 'btn small', title: 'Update now', 'aria-label': 'Update now', onclick: () => load(true) }, '⟳'),
          h('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener', class: 'wx-credit' }, 'Weather data by Open-Meteo.com'),
        ),
      );
      box.dataset.show = s.show;
    }

    /** Always say where the weather is for — tap to change it. */
    function placeChip() {
      return h('button', {
        class: `wx-placechip${s.guessed ? ' guessed' : ''}`,
        title: s.guessed ? 'Guessed from this computer’s time zone — tap to choose your town' : 'Tap to change the place',
        onclick: () => ctx.openSettings?.(),
      }, `📍 ${s.name}`, s.guessed ? h('small', {}, ' (guessed)') : null);
    }

    /** "Weather today": one big, simple picture of the school day, with what to bring. */
    function renderToday(d) {
      const c = d.current;
      const dl = d.daily;
      const w = describe(dl.weather_code[0], 1);
      const hi = dl.temperature_2m_max[0];
      const lo = dl.temperature_2m_min[0];
      const rain = dl.precipitation_probability_max?.[0] ?? 0;
      const uvv = dl.uv_index_max?.[0];
      const uv = UV(uvv);
      const tips = [];
      if (uvv >= 3) tips.push(['🧢', 'Hat & sunscreen']);
      if (rain >= 50) tips.push(['☂️', 'Umbrella or raincoat']);
      else if (rain >= 25) tips.push(['🌂', 'Maybe a raincoat']);
      if (hi != null && hi < 16) tips.push(['🧥', 'Jumper or jacket']);
      if (hi != null && hi >= 30) tips.push(['💧', 'Drink lots of water']);
      if (!tips.length) tips.push(['😊', 'A nice day']);
      const day = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
      // The school day at a glance: 9 am, 11 am, 1 pm, 3 pm (today).
      const ymd = dl.time[0];
      const slots = [9, 11, 13, 15].map((hr) => {
        const i = d.hourly.time.indexOf(`${ymd}T${String(hr).padStart(2, '0')}:00`);
        if (i < 0) return null;
        const hw = describe(d.hourly.weather_code[i], d.hourly.is_day?.[i] ?? 1);
        return h('div', { class: 'wxt-slot' }, h('small', {}, `${hr % 12 || 12}${hr < 12 ? 'am' : 'pm'}`), h('span', { class: 'wxt-si', title: hw.text }, hw.icon), h('b', {}, temp(d.hourly.temperature_2m[i])));
      }).filter(Boolean);
      setKids(box,
        h('div', { class: 'wxt-head' }, h('span', {}, day)),
        h('div', { class: 'wxt-main' },
          h('div', { class: 'wxt-icon', 'aria-hidden': 'true' }, w.icon),
          h('div', { class: 'wxt-words' },
            h('div', { class: 'wxt-desc' }, w.text),
            h('div', { class: 'wxt-range' }, h('span', { class: 'wxt-hi' }, `↑ ${temp(hi)}`), h('span', { class: 'wxt-lo' }, `↓ ${temp(lo)}`)),
            h('div', { class: 'wxt-now' }, `Now ${temp(c.temperature_2m)} · Rain ${rain}%${uv ? ` · UV ${Math.round(uvv)} ${uv.level}` : ''}`),
          ),
        ),
        slots.length ? h('div', { class: 'wxt-slots' }, ...slots) : null,
        h('div', { class: 'wxt-tips' }, ...tips.map(([i, t]) => h('div', { class: 'wxt-tip' }, h('span', { class: 'wxt-ti' }, i), h('span', {}, t)))),
        h('div', { class: 'wx-foot' },
          placeChip(),
          error ? h('span', { class: 'error' }, error) : null,
          h('a', { href: 'https://open-meteo.com/', target: '_blank', rel: 'noopener', class: 'wx-credit' }, 'Weather data by Open-Meteo.com'),
        ),
      );
      box.dataset.show = 'today';
    }

    load();
    timer = setInterval(() => load(), REFRESH_MS);
    const onOnline = () => load(true);
    window.addEventListener('online', onOnline);

    return {
      destroy() { clearInterval(timer); clearTimeout(retryTimer); loadSeq++; window.removeEventListener('online', onOnline); },
      resize: render,
      openSettings() {
        const results = h('div', { class: 'wx-results' });
        const status = h('span', { class: 'hint' });
        const search = h('input', { type: 'text', placeholder: 'Type a town or suburb, e.g. Port Macquarie', 'aria-label': 'Search for a place' });
        const choose = (name, lat, lon) => {
          // ~1 km is plenty for weather, and keeps the exact location private.
          s.name = name; s.lat = Math.round(lat * 100) / 100; s.lon = Math.round(lon * 100) / 100; s.guessed = false;
          s.data = null; ctx.save(); load(true); ctx.openSettings();
        };
        const doSearch = async () => {
          const q = search.value.trim();
          if (q.length < 2) return;
          status.textContent = 'Searching…';
          try {
            const r = await fetch(`${GEO}?${new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' })}`);
            const j = await r.json();
            const list = j.results || [];
            status.textContent = list.length ? '' : 'No places found — try another spelling.';
            setKids(results, ...list.map((p) => h('button', { class: 'chip', onclick: () => choose(p.name, p.latitude, p.longitude) }, [p.name, p.admin1, p.country_code].filter(Boolean).join(', '))));
          } catch {
            status.textContent = 'Couldn’t search right now (no internet or blocked).';
          }
        };
        search.addEventListener('keydown', (e) => e.key === 'Enter' && doSearch());
        panel(ctx, 'Weather',
          h('p', {}, `Showing: 📍 ${s.name}${s.guessed ? ' (guessed from this device’s time zone)' : ''}`),
          field('Find a place', h('div', { class: 'row stretch' }, search, h('button', { class: 'btn', onclick: doSearch }, 'Search'))),
          results,
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => {
              if (!navigator.geolocation) { status.textContent = 'Location isn’t available on this device.'; return; }
              status.textContent = 'Finding your location…';
              navigator.geolocation.getCurrentPosition((p) => choose('Here', p.coords.latitude, p.coords.longitude), () => (status.textContent = 'Couldn’t get your location — search for a place instead.'), { timeout: 10000 });
            } }, '📍 Use this device’s location'),
            status,
          ),
          field('Temperature', select([['C', '°C'], ['F', '°F']], s.unit, (v) => { s.unit = v; ctx.save(); render(); })),
          isToday ? null : field('Show', select([['auto', 'Fit to the widget size'], ['now', 'Just the weather now'], ['full', 'Everything']], s.show, (v) => { s.show = v; ctx.save(); render(); })),
          h('p', { class: 'hint' }, 'Updates every 15 minutes. Only the place’s rough position (about 1 km) is sent to Open-Meteo, a free weather service. UV advice follows the usual sun-safety steps: slip, slop, slap, seek, slide.'),
        );
      },
      closeSettings: render,
    };
  },
};

export default weather;

/** Just today, big and simple — with what to bring (hat, umbrella, jumper, water). */
export const weatherToday = { ...weather, type: 'weathertoday', title: 'Weather today', icon: '☀️', size: [440, 440] };
