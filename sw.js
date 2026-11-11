// Service worker: keeps the app working when school wifi drops.
// Bump VERSION whenever files change so classrooms get the update.
const VERSION = 'mcs-v32';
const FILES = [
  './',
  'index.html',
  'css/app.css',
  'icon.svg',
  'manifest.webmanifest',
  'js/main.js',
  'js/board.js',
  'js/storage.js',
  'js/share.js',
  'js/util.js',
  'js/sound.js',
  'js/templates.js',
  'js/ticker.js',
  'js/termdates.js',
  'js/datalog.js',
  'js/datascreen.js',
  'js/classes.js',
  'js/help.js',
  'js/vendor/qrcode.js',
  'js/vendor/mp4-muxer.js',
  'js/videoencode.js',
  'js/zip.js',
  'js/themes.js',
  'js/widgets/index.js',
  'js/widgets/_common.js',
  'js/widgets/timer.js',
  'js/widgets/stopwatch.js',
  'js/widgets/clock.js',
  'js/widgets/clockfaces.js',
  'js/widgets/schoolday.js',
  'js/widgets/calendar.js',
  'js/widgets/alarm.js',
  'js/widgets/text.js',
  'js/widgets/list.js',
  'js/widgets/image.js',
  'js/widgets/embed.js',
  'js/widgets/audio.js',
  'js/widgets/noise.js',
  'js/widgets/traffic.js',
  'js/widgets/worksymbols.js',
  'js/widgets/namepicker.js',
  'js/widgets/groupmaker.js',
  'js/widgets/tally.js',
  'js/widgets/whiteboard.js',
  'js/widgets/calculator.js',
  'js/widgets/dice.js',
  'js/widgets/spinner.js',
  'js/widgets/coin.js',
  'js/widgets/storydice.js',
  'js/widgets/scoreboard.js',
  'js/widgets/qrcode.js',
  'js/widgets/nownext.js',
  'js/widgets/webcam.js',
  'js/widgets/countdown.js',
  'js/widgets/weather.js',
  'js/widgets/randompics.js',
  'js/widgets/videoloop.js',
  'js/widgets/interval.js',
  'js/widgets/buzzer.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first (so updates show straight away), fall back to the cache when offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
