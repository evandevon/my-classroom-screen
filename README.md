# My Classroom Screen

A free classroom display for the front-of-room screen, made for touch smartboards. You add widgets (timers, a noise meter, a name picker, a whiteboard and more), then move and resize them anywhere on the screen. You can save as many screen setups as you like.

No accounts and no ads. Everything is saved in the browser on your own device.

**Live site:** https://evandevon.github.io/my-classroom-screen/ (once GitHub Pages is switched on, see below)

## Widgets

| Basics | Class management | Extras |
|---|---|---|
| ⏳ Timer (ring, white→red circle, white→red rectangle, hourglass, bar or numbers) | 🔊 Noise meter (bouncy balls, level bar or emoji face) | ✏️ Whiteboard (pens, eraser, undo, grid/lined/chalkboard) |
| ⏱️ Stopwatch with laps | 🚦 Traffic light with your own labels | 🧮 Calculator (works safely without `eval`) |
| 🕒 Clock (analogue and/or digital) |
| ⏰ Alarms (school bells with a pack-up warning beforehand, choice of days and sounds) | | | 🤫 Work symbols (voice levels + how to work) | 🎲 Dice (1–6 dice, any number of sides from 2) |
| 📝 Text (bold, lists, sizes, colours) | 🎡 Name picker (spinning wheel or flash card, no repeats) | 🏆 Scoreboard (2–8 teams) |
| ✅ List / checklist | 👥 Group maker (by number of groups or group size) | 🔳 QR code (works offline) |
| 🖼️ Image (upload or link) | | ➡️ Now / Next visual schedule |
| 🎬 Video / Web (YouTube, Google Drive, Slides, Docs, Vimeo, Canva, Spotify, websites) | | |
| 🎵 Audio (upload, MP3 link, Drive, YouTube, Spotify) | | |

## Saving and sharing

- **Auto-save:** every change is saved in the browser (IndexedDB) straight away.
- **Screens:** tap ☰ to make, switch, rename, duplicate or delete screens. You can start blank or from a template (Morning routine, Group work, Quiet reading, Maths lesson).
- **Share link:** ☰ → *Share link* puts the whole layout inside a long URL you can copy. Student names are **left out** unless you tick the box. Uploaded pictures and audio can't fit in a link.
- **Project file:** ☰ → *Download screen* or *Download all* saves a `.classroom.json` file that includes uploaded pictures and audio. *Open project file* loads it on any computer. Download a backup now and then.

## Smartboard tips

- Press **F** or tap ⛶ for full screen.
- ☰ → *Hide widget title bars* gives a clean display. Tap a widget to show its controls again.
- ☰ → *Large buttons* makes the controls bigger.
- 🔒 locks a widget so it can't be moved by accident.
- ▾ above the widget bar hides the bar.
- Tap the screen once after opening the page. Browsers only allow sound after a tap, and alarms need it.
- Alarms and timers keep ringing when another tab is in front. Their sounds are booked ahead on the audio clock, and a background worker keeps the countdown running. See ☰ → *Keep alarms ringing* to stop the browser putting the tab to sleep.
- After the first visit, the site works offline, so it keeps running when the school wifi drops. Videos still need internet.

## Turning on GitHub Pages

1. In the repository on GitHub, go to **Settings → Pages**.
2. Under *Build and deployment*, set **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**, then **Save**.
3. After a minute the site will be live at `https://evandevon.github.io/my-classroom-screen/`.

## For developers

Plain HTML, CSS and JavaScript modules. There is no build step. Open `index.html` through any static server (e.g. `python3 -m http.server`) and edit the files directly.

```
index.html            page shell
css/app.css           all styles
js/main.js            app: screens, menu, dock, sharing dialogs
js/board.js           drag / resize / z-order (Pointer Events: mouse, pen and touch)
js/storage.js         IndexedDB (screens, uploaded assets, settings)
js/share.js           share links (deflate + base64url in the #hash) and project files
js/templates.js       starter screens and backgrounds
js/sound.js           sound effects made with Web Audio (no audio files)
js/widgets/*.js       one file per widget; register new ones in js/widgets/index.js
js/vendor/qrcode.js   QR generator by Kazuhiko Arase (MIT)
sw.js                 offline cache. Bump VERSION when files change
```

To add a widget, copy an existing widget file. Export an object with `type`, `title`, `icon`, `group`, `size`, `defaultState()` and `mount(ctx)`, then add it to `js/widgets/index.js` and to the file list in `sw.js`. Put anything that holds student names in `privateKeys` so share links leave it out.

## Ideas for later

- **If background alarms still prove unreliable:** add an optional "keep tab awake" switch that plays an inaudible tone while a timer runs or an alarm is due. Browsers don't slow down or put to sleep a tab that is playing sound, but a speaker icon shows on the tab.

- Web Serial widget: let an Arduino button or sensor start a timer, pick a name or drive a meter
- Maths tools: number line, ten-frame, 120 chart
- Timetable that highlights the current lesson, and an event countdown
- Polls and exit tickets, brain-break spinner
- Webcam / document camera widget
- Saved class lists shared between the name picker and group maker
