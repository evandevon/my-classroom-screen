// Widget registry. To add a widget: create a file in this folder and add it to the list below.
import timer from './timer.js';
import stopwatch from './stopwatch.js';
import clock from './clock.js';
import alarm from './alarm.js';
import text from './text.js';
import list from './list.js';
import image from './image.js';
import embed from './embed.js';
import audio from './audio.js';
import noise from './noise.js';
import traffic from './traffic.js';
import worksymbols from './worksymbols.js';
import namepicker from './namepicker.js';
import groupmaker from './groupmaker.js';
import whiteboard from './whiteboard.js';
import calculator from './calculator.js';
import dice from './dice.js';
import scoreboard from './scoreboard.js';
import qrcode from './qrcode.js';
import nownext from './nownext.js';

const ALL = [
  timer, stopwatch, clock, alarm, text, list, image, embed, audio,
  noise, traffic, worksymbols, namepicker, groupmaker,
  whiteboard, calculator, dice, scoreboard, qrcode, nownext,
];

export const WIDGETS = Object.fromEntries(ALL.map((w) => [w.type, w]));

export const GROUPS = [
  { id: 'core', label: 'Basics' },
  { id: 'manage', label: 'Class management' },
  { id: 'extras', label: 'Extras' },
];

export const byGroup = (g) => ALL.filter((w) => w.group === g);
