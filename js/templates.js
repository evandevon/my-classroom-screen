// Ready-made starting screens. Positions are fractions of the screen (x, y, w, h).

export const TEMPLATES = [
  {
    name: 'Blank screen',
    icon: '⬜',
    background: { type: 'gradient', value: 'sky' },
    widgets: [],
  },
  {
    name: 'Morning routine',
    icon: '🌅',
    background: { type: 'gradient', value: 'sunrise' },
    widgets: [
      { type: 'clock', x: 0.02, y: 0.102, w: 0.2, h: 0.288 },
      { type: 'text', x: 0.24, y: 0.102, w: 0.46, h: 0.288, state: { html: '<b>Good morning!</b><div>Unpack your bag, hand in notes and start your morning task.</div>', size: 9, bg: '#fff8c4' } },
      { type: 'nownext', x: 0.24, y: 0.435, w: 0.46, h: 0.324 },
      { type: 'timer', x: 0.72, y: 0.102, w: 0.26, h: 0.36, state: { duration: 600, remaining: 600, label: 'Morning task' } },
      { type: 'worksymbols', x: 0.72, y: 0.498, w: 0.26, h: 0.27, state: { show: 'voice', voice: 1 } },
      { type: 'list', x: 0.02, y: 0.435, w: 0.2, h: 0.324, state: { heading: 'Jobs', items: [{ text: 'Roll', done: false }, { text: 'Lunch orders', done: false }, { text: 'Readers', done: false }] } },
    ],
  },
  {
    name: 'Group work',
    icon: '👥',
    background: { type: 'gradient', value: 'mint' },
    widgets: [
      { type: 'groupmaker', x: 0.02, y: 0.102, w: 0.46, h: 0.45 },
      { type: 'timer', x: 0.5, y: 0.102, w: 0.25, h: 0.378, state: { duration: 900, remaining: 900, label: 'Group task' } },
      { type: 'traffic', x: 0.77, y: 0.102, w: 0.12, h: 0.495 },
      { type: 'noise', x: 0.5, y: 0.507, w: 0.25, h: 0.27 },
      { type: 'worksymbols', x: 0.02, y: 0.579, w: 0.3, h: 0.198, state: { show: 'work', work: 2 } },
    ],
  },
  {
    name: 'Quiet reading',
    icon: '📚',
    background: { type: 'gradient', value: 'night' },
    widgets: [
      { type: 'timer', x: 0.3, y: 0.147, w: 0.4, h: 0.468, state: { duration: 1200, remaining: 1200, label: 'Quiet reading', sound: 'gentle' } },
      { type: 'worksymbols', x: 0.3, y: 0.642, w: 0.4, h: 0.153, state: { show: 'voice', voice: 0 } },
      { type: 'noise', x: 0.73, y: 0.147, w: 0.24, h: 0.288, state: { style: 'face', threshold: 35 } },
    ],
  },
  {
    name: 'Maths lesson',
    icon: '➗',
    background: { type: 'gradient', value: 'sky' },
    widgets: [
      { type: 'whiteboard', x: 0.02, y: 0.102, w: 0.55, h: 0.675, state: { bg: 'grid' } },
      { type: 'calculator', x: 0.59, y: 0.102, w: 0.18, h: 0.45 },
      { type: 'dice', x: 0.79, y: 0.102, w: 0.19, h: 0.27 },
      { type: 'timer', x: 0.79, y: 0.399, w: 0.19, h: 0.27, state: { duration: 300, remaining: 300 } },
      { type: 'namepicker', x: 0.59, y: 0.579, w: 0.18, h: 0.198, state: { mode: 'card' } },
    ],
  },
  {
    name: 'Test conditions',
    icon: '📝',
    background: { type: 'gradient', value: 'sky' },
    widgets: [
      { type: 'clock', x: 0.02, y: 0.102, w: 0.24, h: 0.36, state: { mode: 'digital' } },
      { type: 'text', x: 0.28, y: 0.102, w: 0.44, h: 0.36, state: { html: '<b>Test time</b><div>No talking. Eyes on your own paper.</div><div>Finished? Check your answers, then read quietly.</div>', size: 9, bg: '#ffffff' } },
      { type: 'timer', x: 0.74, y: 0.102, w: 0.24, h: 0.36, state: { duration: 2700, remaining: 2700, label: 'Time left', sound: 'gentle' } },
      { type: 'worksymbols', x: 0.28, y: 0.49, w: 0.44, h: 0.27, state: { show: 'both', voice: 0, work: 0 } },
    ],
  },
  {
    name: 'Writing task',
    icon: '✍️',
    background: { type: 'gradient', value: 'lavender' },
    widgets: [
      { type: 'text', x: 0.02, y: 0.102, w: 0.36, h: 0.36, state: { html: '<b>Success criteria</b><ul><li>Capital letters and full stops</li><li>A strong opening</li><li>Interesting words</li></ul>', size: 8, bg: '#fff8c4' } },
      { type: 'progress', x: 0.4, y: 0.102, w: 0.58, h: 0.66, state: { heading: 'Plan · Draft · Edit · Publish', count: 4 } },
      { type: 'timer', x: 0.02, y: 0.49, w: 0.2, h: 0.27, state: { duration: 1200, remaining: 1200, label: 'Writing time' } },
      { type: 'worksymbols', x: 0.23, y: 0.49, w: 0.15, h: 0.27, state: { show: 'voice', voice: 1 } },
    ],
  },
  {
    name: 'Science investigation',
    icon: '🔬',
    background: { type: 'gradient', value: 'forest' },
    widgets: [
      { type: 'nownext', x: 0.02, y: 0.102, w: 0.4, h: 0.3, state: { items: '❓ Question\n🤔 Predict\n🧪 Test\n📋 Record\n💡 Conclude', show: 2 } },
      { type: 'whiteboard', x: 0.44, y: 0.102, w: 0.54, h: 0.45, state: { bg: 'white', paper: 'grid' } },
      { type: 'stopwatch', x: 0.02, y: 0.43, w: 0.2, h: 0.33 },
      { type: 'timer', x: 0.23, y: 0.43, w: 0.19, h: 0.33, state: { duration: 900, remaining: 900, label: 'Test time' } },
      { type: 'worksymbols', x: 0.44, y: 0.58, w: 0.3, h: 0.18, state: { show: 'work', work: 2 } },
    ],
  },
  {
    name: 'Stations / rotations',
    icon: '🔄',
    background: { type: 'gradient', value: 'ocean' },
    widgets: [
      { type: 'interval', x: 0.02, y: 0.102, w: 0.34, h: 0.45, state: { work: 600, rest: 60, rounds: 4, prep: 10, workLabel: 'Station time', restLabel: 'Move on', workSound: 'chime', restSound: 'ding' } },
      { type: 'groupmaker', x: 0.38, y: 0.102, w: 0.38, h: 0.45 },
      { type: 'list', x: 0.78, y: 0.102, w: 0.2, h: 0.45, state: { heading: 'Stations', style: 'number', items: [{ text: 'Reading corner', done: false }, { text: 'Maths games', done: false }, { text: 'Computers', done: false }, { text: 'With the teacher', done: false }] } },
      { type: 'noise', x: 0.02, y: 0.58, w: 0.34, h: 0.18, state: { style: 'bar' } },
    ],
  },
  {
    name: 'Brain break',
    icon: '🤸',
    background: { type: 'gradient', value: 'sunset' },
    widgets: [
      { type: 'spinner', x: 0.04, y: 0.102, w: 0.42, h: 0.66, state: { text: '🦘 Jump 10 times\n🙆 Big stretch\n💃 Dance party\n🏃 Run on the spot\n🧘 3 deep breaths\n🤸 Star jumps', showTally: false } },
      { type: 'timer', x: 0.5, y: 0.102, w: 0.24, h: 0.36, state: { duration: 120, remaining: 120, label: 'Brain break' } },
      { type: 'interval', x: 0.76, y: 0.102, w: 0.22, h: 0.36, state: { work: 20, rest: 10, rounds: 4, prep: 5 } },
      { type: 'text', x: 0.5, y: 0.49, w: 0.48, h: 0.27, state: { html: '<b>Back to work when the timer ends!</b>', size: 9, bg: '#ffffff', align: 'center' } },
    ],
  },
  {
    name: 'Pack up',
    icon: '🎒',
    background: { type: 'gradient', value: 'peach' },
    widgets: [
      { type: 'timer', x: 0.02, y: 0.102, w: 0.34, h: 0.5, state: { duration: 300, remaining: 300, label: 'Pack up' } },
      { type: 'list', x: 0.38, y: 0.102, w: 0.3, h: 0.5, state: { heading: 'Before you go', items: [{ text: 'Books away', done: false }, { text: 'Rubbish in the bin', done: false }, { text: 'Chair up', done: false }, { text: 'Bag and hat', done: false }] } },
      { type: 'nownext', x: 0.7, y: 0.102, w: 0.28, h: 0.5, state: { items: '🎒 Pack up\n🏠 Home time', show: 2 } },
      { type: 'worksymbols', x: 0.38, y: 0.63, w: 0.3, h: 0.15, state: { show: 'voice', voice: 1 } },
    ],
  },
  {
    name: 'Relief teacher day',
    icon: '👋',
    background: { type: 'gradient', value: 'mint' },
    widgets: [
      { type: 'text', x: 0.02, y: 0.102, w: 0.34, h: 0.3, state: { html: '<b>Hello! I’m your teacher today.</b><div>My name is ____</div>', size: 9, bg: '#ffffff' } },
      { type: 'schoolday', x: 0.38, y: 0.102, w: 0.6, h: 0.3 },
      { type: 'list', x: 0.02, y: 0.43, w: 0.34, h: 0.33, state: { heading: 'Our class rules', items: [{ text: 'Be kind', done: false }, { text: 'Be safe', done: false }, { text: 'Be a learner', done: false }] } },
      { type: 'namepicker', x: 0.38, y: 0.43, w: 0.3, h: 0.33, state: { mode: 'card' } },
      { type: 'traffic', x: 0.7, y: 0.43, w: 0.12, h: 0.33 },
      { type: 'worksymbols', x: 0.84, y: 0.43, w: 0.14, h: 0.33, state: { show: 'voice', voice: 1 } },
    ],
  },
];

export const GRADIENTS = {
  sky: 'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
  sunrise: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
  mint: 'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
  lavender: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)',
  peach: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
  ocean: 'linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)',
  night: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  forest: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  sunset: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
  candy: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
};

export const SOLIDS = ['#ffffff', '#f5f5f7', '#fff8e1', '#e8f5e9', '#e3f2fd', '#fce4ec', '#263238', '#1b5e20', '#0d47a1', '#000000'];
