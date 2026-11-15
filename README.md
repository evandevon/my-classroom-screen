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
| 🖼️ Image (upload or link) | ✅ Progress (a row of tick boxes for each student in the class, so children can mark how far through a task they are; + / − for more or fewer boxes; rows spread into columns to fit; ticks kept per class) | ➡️ Now / Next visual schedule |
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

- **Bringing screens in** always works the same way — ☰ → *Open a file*, dragging a `.classroom` file onto the screen, or opening a share link: a window lists the screens with tick boxes, marks any **you already have** (unticked), and shows which class lists come too. Nothing changes until you press **Add**; added screens go alongside yours and never replace them. A shared class with the same name as one of yours but different students is added as “Name (2)”.
- **👁 Preview** on any row opens that screen exactly as it is, without adding it. A banner across the top offers **Add this screen**, **Other screens** (back to the list) and **Close**. Nothing you do while previewing is saved, and closing takes you back to where you were.
- A `.classroom` file is a zip: `classroom.json` (screens and class lists) and a `files/` folder with every photo, clip, picture and sound at its real size (rename it to `.zip` to look inside). Older `.json` files still open.
- Files no screen uses any more (e.g. from a deleted widget) are tidied away automatically. Save a file now and then as a backup — clearing the browser's data would remove your screens.
- **Screens:** tap ☰ to make, switch, rename, duplicate, delete or drag screens into order. Start blank or from a template.
- **Pause screen** (☰ → This screen) stops everything — timers and stopwatches keep their time, alarms, cameras, microphones and videos switch off — so you can carry on tomorrow.

## Classes and student lists (stay on this device)

- **☰ → Classes & student lists:** make a class, then type names or paste a column from a spreadsheet. You can also import or export CSV to move lists to another computer.
- **👥 button in the top bar:** choose the current class. It can also switch automatically when the Activity timeline's session name contains a class name.
- The Name picker, Group maker, Tally (per student), and Scoreboard ("a row for each student") use the current class's names, or their own typed list. Progress always uses a class list, and keeps each class's ticks separately.
- **🚫 Keep apart:** in a class's list, choose pairs of students who shouldn't be in the same group. The Group maker keeps them apart (and tells you if it can't, e.g. with too few groups).
- **Sharing:** a screen's class lists (and keep-apart pairs) go with it in screen files, and in share links unless you untick “Include class lists and student names”. Only share with colleagues — it's up to you who gets them. On the other computer they're added to that teacher's classes (a class with the same name and students isn't doubled up; a different class with the same name is added as “Name (2)”).

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
