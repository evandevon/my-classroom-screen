# Recording data: removed, notes for bringing it back

"Recording data" (☰ → 📊 *Data you've recorded*) was taken out in mcs-v55. These notes explain how it worked and what to change if it comes back.

**The last version with it in is commit `8401b10`** (mcs-v54). To see or restore the code:

```
git show 8401b10:js/datalog.js
git show 8401b10:js/datascreen.js
git checkout 8401b10 -- js/datalog.js js/datascreen.js   # bring the files back
```

## Why it was removed

- It was a records system inside a projector tool. It added a lot of surface (REC badges, a Data screen, filters, retention settings) for something few teachers would open.
- Behaviour records with student names sat on shared classroom computers. A relief teacher, or the next class on that board, could open them.
- The data was easy to lose without noticing: clearing the browser, a reimaged laptop, or moving from the smartboard to a laptop. That's bad for anything a teacher relies on as evidence.
- Eight widgets had recording hooks that every later change had to keep working.

## How it worked

### Storage
- An IndexedDB object store `events` (keyPath `id`) in `js/storage.js`, with `db.addEvent`, `db.allEvents` and `db.deleteEvents(ids)`. **The store is still created**, so any old records are left in place, and bringing the feature back would find them again.
- The retention setting was in the `meta` store, as `dataKeepDays` (0, 28, 56 or 70).
- Events were never put into share links or `.classroom` files.

### `js/datalog.js`
- `setLogContext({ getClass, getScreen })`, called by main.js, so every event knew the current class and screen.
- `logEvent(e)` stored `{ id, t, cls, screen, widget, widgetId, kind, label, who, value, unit, note }`. `unit` was one of `count`, `seconds`, `points` or `level`. It returned the event, so a widget could undo it (`undoEvent`).
- `onLogChange(fn)` let the Data screen refresh while it was open.
- `pruneOld(days)` deleted records past the retention period.
- `toCSV(events)` wrote the columns Date, Time, Day, Class, Widget, Student/team, What, Amount, Unit, Minutes, Note and Screen. It added a BOM so emoji and accents survive Excel, and put `'` in front of cells starting with `= + - @` to block spreadsheet formula injection. `toTSV` did the same for "Copy rows".
- `recBadge()` made the red "● REC" pill (`.rec-badge` in app.css, blinking with `recblink`). `RECORD_HINT` was the shared settings hint.

### `js/datascreen.js` (the ☰ → 📊 Data dialog)
- Filters: date range (Today, This week, Last 7/30 days, Everything, Choose dates), class, widget and student.
- A summary of totals per widget, label and student, with durations added up.
- A table, Download CSV, Copy rows, Delete the shown records, and the "keep for" retention select.
- A privacy line: data stays on this device and official records belong in the school's system.

### What each widget recorded (each had a 📊 tick box in ⚙, off by default except Tally)
| Widget | Event |
|---|---|
| Tally | every tap: category + student (undoable). Tally was **on** by default |
| Scoreboard | every point change: team + ±points |
| Stopwatch | each start → stop as seconds, with a label chip (Off-task, Transition…) and an optional student name with suggestions from the class list. It also recorded when the screen was paused (`hold`) |
| Noise meter | a session average with a warning count, each too-loud warning, and optionally a reading every minute |
| Traffic light | seconds each light was on (ignoring under 2 s), using `since` |
| Name picker | who was picked |
| Spinner | each spin result |
| Coin | each flip, and ×100 batches as one event |

## What to do differently if it comes back

1. **Start from the strongest uses, not every widget.** Those were classroom-science data (coin, dice and spinner chance experiments, noise investigations) and fair turns (who the Name picker has chosen). Leave behaviour tracking out, because that's where nearly all the privacy risk is.
2. **Record into the screen, not a hidden global log.** For example, a Tally or Coin widget could keep its own results table and download it as CSV from its own ⚙. The data is then visible where it was made and travels with the screen file, and there's no separate Data screen to learn.
3. **Don't keep names by default.** Store counts per category, and keep names only when the teacher ticks a box. Never put names in exports without asking.
4. **Make losing it unlikely.** Remind the teacher to download before the end of term, or offer to save to a file or Google Sheet they control instead of the browser.
5. **Protect it on shared boards.** A lock (PIN) on viewing records, or record only while a teacher is "signed in" to a class.
6. **Let students graph it in class.** A built-in simple bar or line chart of a widget's results would teach more than a CSV only the teacher opens.
7. **Keep it in one module.** If widgets need hooks, use one small `record(ctx, …)` helper in `_common.js`, so the core never depends on the feature and removing it again is one file.
