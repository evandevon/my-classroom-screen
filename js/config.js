// Things the site's owner fills in. Anything left empty simply doesn't show.

export const SUPPORT = {
  // e.g. 'https://buymeacoffee.com/yourname'. Nothing about coffee shows until this is set.
  coffeeUrl: '',
  // A form for feature ideas, bug reports and kind words (e.g. a Google Form). Hidden until set.
  feedbackUrl: '',
  // What the next coffees go towards, shown as a small progress bar, e.g.
  // { label: 'micro:bit buttons', have: 3, need: 10 }. A near goal makes one coffee feel like it counts.
  goal: null,
  // First names of supporters who said yes to being listed, newest first.
  thanks: [],
};

// The once-off "What's new" note. Add a new entry at the top for each update worth telling
// teachers about (n must go up by one each time); people who've seen the newest one aren't shown it again.
export const WHATS_NEW = [
  {
    n: 2,
    title: 'New: My widgets',
    items: [
      '⭐ **My widgets**: set a widget up just how you like it, tap **☆** on its title bar, and it’s saved. Add it to any screen from **⭐ My widgets** at the start of the widget bar — same size, spot and settings, starting fresh.',
      '🗂️ **Groups of screens** in the ☰ menu, with colours — drag screens in and out.',
      '🎨 The ☰ menu is now in colour-coded sections, with shortcuts at the top.',
    ],
  },
  {
    n: 1,
    title: 'New this week',
    items: [
      '✅ **Progress** widget: a row of tick boxes for each student, so children can mark how far through a task they are.',
      '✏️ **Whiteboards** take pictures — paste or drop one in, move and resize it, and draw over it.',
      '📸 **Save a picture of the screen** as a JPG or PDF (☰ menu).',
      '💾 **Back up everything** to a file from the ☰ menu — it shows when you last did.',
      '⚙ Every widget’s settings now follow the same order: what it shows, how it behaves, sounds, then how it looks.',
    ],
  },
];
