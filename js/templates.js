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
