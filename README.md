# My Classroom Screen

A free classroom display for the front-of-room screen, made for touch smartboards. You add widgets (timers, a noise meter, a name picker, a whiteboard and more), then move and resize them anywhere on the screen. You can save as many screen setups as you like.

No accounts and no ads. Everything is saved in the browser on your own device.

**Live site:** https://evandevon.github.io/my-classroom-screen/ (once GitHub Pages is switched on, see below)

## Widgets

| Basics | Class management | Extras |
|---|---|---|
| ⏳ Timer (ring, white→red circle, white→red rectangle, hourglass, bar or numbers) | 🔊 Noise meter (bouncy balls, level bar or emoji face) | 🔂 Interval timer (work/rest rounds with get-ready, 3-2-1 beeps, presets like Tabata; rings on time in a background tab) | | |
| 🔔 Quiz buzzer (2–8 teams; first touch wins and only their sound plays; shows 2nd/3rd and how far behind; keyboard keys so Makey Makey / Arduino buttons work) | | |
| ✏️ Whiteboard (pens, eraser, undo, grid/lined/chalkboard; several fingers draw at once; ⏺ record sessions with optional voice, play back at ½–4× with loop, save as an MP4 quickly even in a background tab) |
| ⏱️ Stopwatch with laps | 🚦 Traffic light with your own labels | 🧮 Calculator (works safely without `eval`) |
| 🕒 Clock — 8 styles: analogue/digital, teaching clock (past/to, time in words, set-a-time & quiz), Roman numerals, word clock, sundial with draggable sun, candle, water and incense clocks |
| 🗓️ Activity timeline (coloured sessions with icons, now/next countdown, per-weekday plans, type-in quick entry) |
| 📅 Calendar (tap a day to add events, repeats, “coming up” countdowns, NSW term & week numbers) |
| ⏰ Alarms (school bells with a pack-up warning beforehand, choice of days and sounds) | | | 🤫 Work symbols (voice levels + how to work) | 🎲 Dice (1–6 dice, any number of sides from 2) |
| 📝 Text (bold, lists, sizes, colours) | 🎡 Name picker (spinning wheel or flash card, no repeats) | 🏆 Scoreboard (2–8 teams) |
| ✅ List / checklist | 👥 Group maker (by number of groups or group size) |
| | 🔢 Tally (count interruptions, great answers… for the class or each student) | 🔳 QR code (works offline) |
| 🖼️ Image (upload or link) | | ➡️ Now / Next visual schedule |
| 📷 Webcam / document camera (flip, rotate, zoom, freeze, full-resolution photos and ⏺ recorded clips — each opens in its own widget with a ⬇ download button) | | |
| 🔁 Video loop (each webcam recording loops in its own widget — Step 1, Step 2… — with half/quarter speed and download; or loop any video file) | | |
| 🎴 Random picture (choose a folder of pictures from the computer; no repeats, auto-change, captions, blurry “mystery” reveal — pictures stay in this browser) | | |
| ☀️ Weather today (one big picture of the day: high/low, school-hours forecast, what to bring — hat, umbrella, jumper, water) | | |
| 🌦️ Weather (now, next 6 hours, 5 days, UV sun-safety tips, rain alerts, °C/°F; free data from [Open-Meteo](https://open-meteo.com/), only the rough place is sent) | | |
| 🎬 Video / Web (YouTube, Google Drive files & folders, Slides, Docs, Vimeo, Canva, Spotify, websites; pop-up window for sites that block embedding) | | |
| 🎵 Audio (upload, MP3 link, Drive, YouTube, Spotify) | | |

## Saving and sharing

- Photos, clips, pictures and voice recordings are stored in this browser and **embedded in downloaded screen files** (so those files can be large). Files no screen uses any more (e.g. from a deleted widget) are tidied away automatically.

- **Pause screen** (menu → This screen) stops everything — timers and stopwatches keep their time, alarms, cameras, microphones and videos switch off — so you can carry on tomorrow.
- Share links can’t carry pictures, clips or sounds from your computer; the share window warns you and offers the screen file instead.

- **Auto-save:** every change is saved in the browser (IndexedDB) straight away.
- **Screens:** tap ☰ to make, switch, rename, duplicate or delete screens. You can start blank or from a template (Morning routine, Group work, Quiet reading, Maths lesson).
- **Share link:** ☰ → *Share link* puts the whole layout inside a long URL you can copy. Student names are **left out** unless you tick the box. Uploaded pictures and audio can't fit in a link.
- **Project file:** ☰ → *Download screen* or *Download all* saves a `.classroom` file — a zip containing `classroom.json` (the screens) and a `files/` folder with every photo, clip, picture and sound at its real size (rename to `.zip` to look inside). *Open project file* loads it on any computer, and still opens older `.classroom.json` files. Download a backup now and then.

## Classes and student lists (stay on this device)

- **☰ → Classes & student lists:** make a class, then type names or paste a column from a spreadsheet. You can also import or export CSV to move lists to another computer.
- **👥 button in the top bar:** choose the current class. It can also switch automatically when the Activity timeline's session name contains a class name.
- The Name picker, Group maker, Tally (per student), Scoreboard ("a row for each student") and Stopwatch use the current class's names, or their own typed list.
- Class lists are never put into share links or screen files. Student names in widgets are taken out of share links unless you choose to include them.

## Recording data (stays on this device)

- Use the **Tally** widget, or turn on **📊 Record** in the settings of the Scoreboard, Stopwatch (e.g. time off-task), Noise meter, Traffic light or Name picker. A red **● REC** shows while recording.
- **☰ → 📊 Data** lets you filter by date, class, widget or student, see totals, **download a CSV** for Excel or Sheets, copy rows, and delete records. You can also have old records deleted automatically.
- Records stay only in this browser on this device. They are never put into share links or screen files. They're for your own teaching notes; official records still belong in your school's system.

## Widget colour themes

Every widget can be **Light, Dark, Transparent · white, Transparent · dark, Transparent with a white or dark edge, Blue, Green, Yellow, Pink or Purple**, with an optional **drop shadow** on words and pictures (handy for the transparent themes over a photo background). Menu → *Widget theme* changes every widget on the screen (and new ones); each widget's ⚙ settings has its own theme at the bottom. Settings panels always stay light so they're easy to read.

## Phones and tablets

Tablets use the same free layout as the smartboard. On phones (and short landscape screens) widgets stack in a scrolling column — two side by side in landscape — in the same reading order as the big layout. Nothing about the saved layout changes, so a screen set up on a phone still looks right on the smartboard and vice versa. Moving and resizing are switched off in this view.

## Smartboard tips

- **Multi-touch:** several children can use different widgets at the same time (e.g. a calculator each, or dragging two widgets at once). Every finger is tracked separately.

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
js/zip.js             tiny zip reader/writer for .classroom files
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

## Credits

- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) by Vanilagy (MIT) — used to save whiteboard recordings as MP4.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT).
- Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
