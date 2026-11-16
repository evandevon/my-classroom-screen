# My Classroom Screen

A free classroom display for the front-of-room screen, made for touch smartboards. You add widgets (timers, a noise meter, a name picker, a whiteboard and more), then move and resize them anywhere on the screen. You can save as many screen setups as you like.

No accounts and no ads. Everything is saved in the browser on your own device.

**Live site:** https://evandevon.github.io/my-classroom-screen/ (once GitHub Pages is switched on, see below)

## Widgets

| Basics | Class management | Extras |
|---|---|---|
| ⏳ Timer (ring, white→red circle, white→red rectangle, hourglass, bar or numbers) | 🔊 Noise meter (bouncy balls, level bar or emoji face) | 🔂 Interval timer (work/rest rounds with get-ready, 3-2-1 beeps, presets like Tabata; rings on time in a background tab) | | |
| 🔔 Quiz buzzer (2–8 teams; first touch wins and only their sound plays; shows 2nd/3rd and how far behind; keyboard keys so Makey Makey / Arduino buttons work) | | |
| ✏️ Whiteboard (pens, 3 highlighters, straight lines/arrows/dashed/dotted/number lines that snap together, move line ends and corners, 📐 Straighten toggle on the toolbar (hand-drawn lines that were meant to be straight become straight), eraser, undo (also undoes Clear), size circle under the mouse, grid/lined/chalkboard; 🖼 pictures to draw over — paste one (tap the whiteboard, then Ctrl+V), drop one on it or choose a file, then drag to move it, drag a corner to resize it, 🗑 to remove it; pens draw over pictures and the eraser leaves them alone; several fingers draw at once; ⏺ record sessions with optional voice, play back at ½–4× with loop, save as an MP4 quickly even in a background tab) |
| ⏱️ Stopwatch with laps | 🚦 Traffic light with your own labels | 🧮 Calculator (works safely without `eval`) · 🗳️ Poll (a question with tappable emoji or word answers; results can stay hidden until revealed) |
| 🕒 Clock — 8 styles: analogue/digital, teaching clock (past/to, time in words, set-a-time & quiz), Roman numerals, word clock, sundial with draggable sun, candle, water and incense clocks |
| 🗓️ Activity timeline (coloured sessions with icons, now/next countdown, per-weekday plans, type-in quick entry) |
| 📅 Calendar (tap a day to add events, repeats, “coming up” countdowns, NSW term & week numbers) |
| ⏰ Alarms (school bells with a pack-up warning beforehand, choice of days and sounds) | | | 🤫 Work symbols (voice levels + how to work) | 🎲 Dice (1–6 dice, any number of sides from 2) |
| 📝 Text (bold, lists, sizes, colours) | 🎡 Name picker (spinning wheel or flash card, no repeats) | 🏆 Scoreboard (2–8 teams) |
| ✅ List / checklist | 👥 Group maker (by number of groups or group size) |
| | 🔢 Tally (count interruptions, great answers… for the class or each student) | 🔳 QR code (works offline) |
| ➡️ Go to screen (a big button that opens another of your screens — put one on each screen to step through a lesson; finds the screen by name after a file or link) |
| 🖼️ Image (upload or link) | ✅ Progress (an optional heading for what it's for, then a row of tick boxes for each student in the class, so children can mark how far through a task they are; + / − for more or fewer boxes; rows spread into columns to fit; ticks kept per class) | ➡️ Now / Next visual schedule |
| 📷 Webcam / document camera (flip, rotate, zoom, freeze, full-resolution photos and ⏺ recorded clips — each opens in its own widget with a ⬇ download button) | | |
| 🔁 Video loop (each webcam recording loops in its own widget — Step 1, Step 2… — with half/quarter speed and download; or loop any video file) | | |
| 🎴 Random picture (choose a folder of pictures from the computer; no repeats, auto-change, captions, blurry “mystery” reveal — pictures stay in this browser) | | |
| ☀️ Weather today (one big picture of the day: high/low, school-hours forecast, what to bring — hat, umbrella, jumper, water) | | |
| 🌦️ Weather (now, next 6 hours, 5 days, UV sun-safety tips, rain alerts, °C/°F; free data from [Open-Meteo](https://open-meteo.com/), only the rough place is sent) | | |
| 🎬 Video / Web (YouTube, Google Drive files & folders, Slides, Docs, Vimeo, Canva, Spotify, websites; pop-up window for sites that block embedding; plain-words messages when a link is wrong, a YouTube video can't be embedded, or a site is blocked or slow, plus a ❓ *Can't see it?* button) | | |
| 🎵 Audio (upload, MP3 link, Drive, YouTube, Spotify) | | |

## Saving and sharing

Your screens **save themselves** in this browser on this computer — there's nothing to do. To move or share them, use ☰ → *Save & share*:

| | 🔗 Share a link | 💾 Save to a file |
|---|---|---|
| Good for | Sending one screen quickly | Backups, a new computer, sharing a set of screens |
| Screens | The one showing | Any you tick |
| Pictures, clips, sounds from this computer | ✗ Left out (the share window warns you) | ✓ Inside the file |
| Class lists the screens use | ✓ Unless you untick the box | ✓ |

- **Bringing screens in** always works the same way — ☰ → *Add screens from a file*, dragging a `.classroom` file onto the screen, or opening a share link: a window lists the screens with tick boxes, marks any **you already have** (unticked), and shows which class lists come too. Nothing changes until you press **Add**; added screens go alongside yours and never replace them. A shared class with the same name as one of yours but different students is added as “Name (2)”.
- **👁 Preview** on any row opens that screen exactly as it is, without adding it. A banner across the top offers **Add this screen**, **Other screens** (back to the list) and **Close**. Nothing you do while previewing is saved, and closing takes you back to where you were.
- A `.classroom` file is a zip: `classroom.json` (screens and class lists) and a `files/` folder with every photo, clip, picture and sound at its real size (rename it to `.zip` to look inside). Older `.json` files still open.
- Files no screen uses any more (e.g. from a deleted widget) are tidied away automatically. Save a file now and then as a backup — clearing the browser's data would remove your screens.
- **Screens:** tap ☰ to make, switch, rename, duplicate, delete or drag screens into order. Start blank or from a ready-made screen: Morning routine, Group work, Quiet reading, Maths lesson, Test conditions, Writing task, Science investigation, Stations / rotations, Brain break, Pack up or Relief teacher day.
- **Pause screen** (☰ → This screen) stops everything — timers and stopwatches keep their time, alarms, cameras, microphones and videos switch off — so you can carry on tomorrow.

## Classes and student lists (stay on this device)

- **☰ → Classes & student lists:** make a class, then type names or paste a column from a spreadsheet. You can also import or export CSV to move lists to another computer.
- **👥 button in the top bar:** choose the current class. It can also switch automatically when the Activity timeline's session name contains a class name.
- The Name picker, Group maker, Tally (per student), and Scoreboard ("a row for each student") use the current class's names, or their own typed list. Progress always uses a class list, and keeps each class's ticks separately.
- **Every name in a class must be different**, or widgets like Progress would mix two students up. If a name is typed twice, the editor asks for a surname initial (e.g. *Sam B*) and, until then, saves the repeat as “Sam (2)”. Imported files and shared classes are treated the same way, and lists saved before this change were fixed when they were next opened.
- **🚫 Keep apart:** in a class's list, choose pairs of students who shouldn't be in the same group. The Group maker keeps them apart (and tells you if it can't, e.g. with too few groups).
- **Sharing:** a screen's class lists (and keep-apart pairs) go with it in screen files, and in share links unless you untick “Include class lists and student names”. Only share with colleagues — it's up to you who gets them. On the other computer they're added to that teacher's classes (a class with the same name and students isn't doubled up; a different class with the same name is added as “Name (2)”).

## Backgrounds

Menu → *Background* has four tabs, and opens on the one your screen is using:

- **📚 Library**: ready-made pictures and moving loops that come with the site, shown as preview tiles (hover with a mouse to see a moving one play). To add more, drop pictures (jpg, png, webp, gif) or short looping videos (mp4, webm) into the `backgrounds/` folder on GitHub. The *Background library* GitHub Action then makes the previews and the list (`backgrounds/index.json`) automatically. Library backgrounds also work in share links, because they live on the site.
- **✨ Animated** (drawn live, no downloads): aurora, calm waves, bubbles, snow, rain, night sky, fireflies, clouds, autumn leaves, confetti — with a speed slider. They pause when the screen is paused or the tab is hidden, and stay still if the computer asks for reduced motion.
- **🎨 Colours**: plain colours and gradients.
- **📁 Your own**: a picture or looping video from the computer, a link, or a slideshow.
  - **Video or web link**: upload a looping video, or paste a link to a video file, a picture or animated GIF, a YouTube video (plays muted and looping), or a Google Drive file shared as “Anyone with the link”.
  - **Slideshow**: choose a folder of pictures (and short videos) from the computer; fade or slow-zoom, every 5 s–5 min, shuffled.
- **Darken** slider for any moving background, so widgets stand out.
- Uploaded pictures, videos and slideshows stay on the computer and go in `.classroom` files, not share links.

Audio widget → **🎧 Sound library**: sounds that come with the site, for quiet background sound in class. Library sounds loop with no gap and fade gently in and out. To add more, drop sound files (mp3, m4a, ogg, wav) into the `sounds/` folder on GitHub; the same GitHub Action adds them to the list (`sounds/index.json`) automatically. Short seamless loops work best.


## Widget settings

Tapping ⚙ opens the widget's settings in a panel at the side of the screen (on the left if the widget is on the right), so you can watch the widget change as you adjust it. Tap anywhere outside the panel, press Esc, or tap Done to close it. On phones the panel comes up from the bottom.

## Widget colour themes

Every widget can be **Light, Dark, Transparent · white, Transparent · dark, Transparent · white edge, Transparent · dark edge, Blue or Yellow** (the edge ones add a thin outline to set a transparent widget apart). (Green, Pink and Purple are no longer offered, but widgets already using them keep their colour.) Any widget can also have a **drop shadow** on words and pictures (handy for the transparent themes over a photo background). Menu → *Widget theme* changes every widget on the screen (and new ones); each widget's ⚙ settings has its own theme at the bottom. Settings panels always stay light so they're easy to read. Each widget's ⚙ also has a **Text size** slider (50–250%), and *Widget theme & text size* in the menu sets it for every widget.

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
js/oldrecords.js      one-time offer to download and delete records from the removed Data feature
js/screenshot.js      ☰ → Save a picture (tab capture → JPG, or a one-page PDF written by hand)
js/backup.js          backup file of everything, last-backed-up status, persistent storage, ask once
js/welcome.js         welcome, what's new, end of term, ways to help
js/tabs.js            tabs tell each other which screen they use; opening one claims it (BroadcastChannel)
js/config.js          coffee / feedback links, coffee goal, thank-you list, What's new entries
js/widgets/*.js       one file per widget; register new ones in js/widgets/index.js
js/vendor/qrcode.js   QR generator by Kazuhiko Arase (MIT)
sw.js                 offline cache. Bump VERSION when files change
```

To add a widget, copy an existing widget file. Export an object with `type`, `title`, `icon`, `group`, `size`, `defaultState()` and `mount(ctx)`, then add it to `js/widgets/index.js` and to the file list in `sw.js`. Put anything that holds student names in `privateKeys` so share links leave it out.

## Pasting and dropping pictures, videos and sounds

- **Copy a picture anywhere (right-click → Copy image, or a screenshot) and press Ctrl+V (⌘V on a Mac)** on the screen: it becomes an Image widget, sized to the picture's shape. Several pictures at once each get their own widget. A copied link to a picture (ending .jpg, .png, .gif…) works too.
- **Drag files onto the screen** from a folder (or a picture straight from a web page): pictures become Image widgets, short videos become Video loops and sound files become Audio widgets, right where you drop them. Dropping onto an existing Image widget fills that widget instead.
- **On a smartboard without a keyboard:** add an Image widget and tap **📋 Paste**.
- Pasting while typing in a text box still pastes text as usual. Big pictures are made screen-sized; see-through PNGs keep their transparency. ↶ Undo removes a pasted picture.

## Saving a picture, backups and notes

- **☰ → 📸 Save a picture (JPG or PDF)** takes one picture of the screen without the menu and widget bar. The browser asks to share the tab (choose *Share*); it grabs one frame and stops, and nothing is sent anywhere. Browsers that can't do this (e.g. iPad Safari) are pointed to the screenshot keys.
- **Backups:** screens live only in this browser. **☰ → Save & share** shows when everything was last backed up to a file, with a gentle ⚠ after four weeks (or if never), and a **⬇ Back up everything** button: one .classroom file of every screen and class list. Open it with ☰ → Add screens from a file. Saving every screen with *Save to a file* counts too. The site also asks the browser not to clear its storage to free up space.
- On the second day someone uses the site (with a few widgets made and no backup yet), a small card asks **once** whether to save a backup file. The end-of-term note also offers one, since laptops are often reset over the holidays.
- **First visit:** a short 👋 welcome. **After an update:** a once-off ✨ What's new note for people already using the site. **Last week of term:** a once-a-term 🎉 thank-you. Each shows ways to help, and they can all be opened again from ☰ → Help.
- **Owner settings** are in `js/config.js`: the coffee link, a feedback form link, an optional coffee goal (*3 of 10 coffees towards…*) and a thank-you list. Anything left empty doesn't show. Add a new entry to `WHATS_NEW` there for each update worth announcing.

## More than one tab

- Each tab can show a different screen. Opening the site in a new tab still goes straight to your last screen, unless another tab is already using it; then this tab starts on a free screen and asks **Which screen in this tab?** (or + New screen).
- **A screen is used in one tab at a time.** Opening it in a second tab moves it there: the first tab stops running it (no timers, sounds, videos, camera or microphone, and no saving) and shows **“…is being used in another tab”** with **Use it here** (takes it back, with the other tab's latest changes) or **Show a different screen**. Running timers carry on in the tab that takes over. So two tabs never overwrite each other or ring twice.
- Class lists changed in one tab update in the others straight away. Each tab keeps its own current class.
- For two completely separate sets of screens, use two browser profiles (e.g. *School* and *Home*) — each has its own storage.

## Undo, redo and screen order

- **↶ ↷ in the top bar, or Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y):** undo anything you did on a screen — adding, moving, resizing or removing widgets, settings, scores, votes, typing, backgrounds — and deleting a screen. Things that change by themselves (a running timer, weather updates, a slideshow) aren't undo steps. In a text box, Ctrl+Z undoes your typing as usual.
- **Screen order:** in ☰, drag a screen by its ⋮⋮ handle (or focus the handle and use the arrow keys). The "Which screen?" picker uses the same order.

## Ideas for later

- **Draw over everything:** an annotation layer across the whole screen, so you can circle or underline anything — a widget, a name, the background — not just inside a whiteboard.
- **Think-Pair-Share** and other learning-structure widgets (see the list in the project notes).
- **Recording data** (tallies, points, timings and noise levels saved to a log with a CSV download) was removed in mcs-v55. [docs/removed-recording-data.md](docs/removed-recording-data.md) explains how it worked, where to find the code, and what to do differently if it comes back. If a browser still has old records, it offers once to download them and delete them.

- **If background alarms still prove unreliable:** add an optional "keep tab awake" switch that plays an inaudible tone while a timer runs or an alarm is due. Browsers don't slow down or put to sleep a tab that is playing sound, but a speaker icon shows on the tab.

- Web Serial widget: let an Arduino button or sensor start a timer, pick a name or drive a meter
- Maths tools: number line, ten-frame, 120 chart
- Timetable that highlights the current lesson, and an event countdown
- Exit tickets, brain-break spinner

## Credits

- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) by Vanilagy (MIT) — used to save whiteboard recordings as MP4.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT).
- Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
