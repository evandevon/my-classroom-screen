// Widget registry. To add a widget: create a file in this folder and add it to the list below.
import timer from './timer.js';
import stopwatch from './stopwatch.js';
import clock from './clock.js';
import alarm from './alarm.js';
import schoolday from './schoolday.js';
import calendar from './calendar.js';
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
import tally from './tally.js';
import whiteboard from './whiteboard.js';
import calculator from './calculator.js';
import dice from './dice.js';
import spinner from './spinner.js';
import coin from './coin.js';
import storydice from './storydice.js';
import scoreboard from './scoreboard.js';
import qrcode from './qrcode.js';
import nownext from './nownext.js';
import webcam from './webcam.js';
import countdown from './countdown.js';
import weather from './weather.js';
import randompics from './randompics.js';
import videoloop from './videoloop.js';

const ALL = [
  timer, stopwatch, clock, alarm, schoolday, calendar, text, list, image, embed, audio,
  noise, traffic, worksymbols, namepicker, groupmaker, tally,
  whiteboard, calculator, dice, spinner, coin, storydice, scoreboard, qrcode, nownext, webcam, countdown, weather, randompics, videoloop,
];

export const WIDGETS = Object.fromEntries(ALL.map((w) => [w.type, w]));

export const GROUPS = [
  { id: 'core', label: 'Basics' },
  { id: 'manage', label: 'Class management' },
  { id: 'extras', label: 'Extras' },
];

export const byGroup = (g) => ALL.filter((w) => w.group === g);

// The widget bar shows these categories; each opens a pop-up of its widgets.
export const CATEGORIES = [
  { id: 'time', label: 'Time & weather', icon: '⏰', types: ['timer', 'stopwatch', 'clock', 'alarm', 'schoolday', 'calendar', 'countdown', 'weather'] },
  { id: 'class', label: 'Class', icon: '🧑‍🏫', types: ['noise', 'traffic', 'worksymbols', 'nownext', 'namepicker', 'groupmaker', 'tally', 'scoreboard'] },
  { id: 'media', label: 'Words & media', icon: '🖼️', types: ['text', 'list', 'whiteboard', 'image', 'randompics', 'embed', 'audio', 'webcam', 'videoloop', 'qrcode'] },
  { id: 'play', label: 'Maths & chance', icon: '🎲', types: ['calculator', 'dice', 'spinner', 'coin', 'storydice'] },
];
