// "Keep alarms and timers working" help, opened from the menu and from the Alarms settings.
import { h } from './util.js';
import { audioReady, unlockAudio, onAudioState, play } from './sound.js';

export function showSoundHelp() {
  const host = location.host || 'evandevon.github.io';
  const soundState = h('span', { class: 'sound-state' });
  const soundBtn = h('button', { class: 'btn small', onclick: () => { unlockAudio(); setTimeout(() => play('ding'), 100); } }, '🔊 Test sound');
  const upd = (ok) => {
    soundState.textContent = ok ? '✅ Sound is on for this page.' : '🔇 Sound is not on yet — tap anywhere on the page, or press Test sound.';
    soundState.classList.toggle('bad', !ok);
  };
  upd(audioReady());
  const off = onAudioState(upd);

  const copyBtn = h('button', { class: 'btn small' }, '📋 Copy site address');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(host);
      copyBtn.textContent = '✔ Copied';
    } catch {
      copyBtn.textContent = host;
    }
  });

  const step = (title, ...body) => h('section', { class: 'help-step' }, h('h3', {}, title), ...body);
  const code = (t) => h('code', {}, t);

  const dlg = h('dialog', { class: 'modal help' },
    h('div', { class: 'modal-head' }, h('h2', {}, '🔔 Keep alarms and timers working'), h('button', { class: 'w-btn', 'aria-label': 'Close', onclick: () => dlg.close() }, '✕')),
    h('div', { class: 'modal-body' },
      h('p', {}, 'Timers and alarms keep time and ring even when another tab is in front. They just need the page to stay open and awake.'),

      step('1. Turn sound on', h('p', {}, 'Browsers only allow sound after you tap the page once. Do this each time you open the screen.'), h('div', { class: 'row' }, soundBtn, soundState)),

      step('2. Leave this tab open', h('p', {}, 'It can sit behind other tabs or windows. Don’t close it or the browser window.')),

      step('3. Stop the browser putting the tab to sleep',
        h('p', {}, 'After a while, Chrome and Edge can put unused tabs to sleep to save memory, and a sleeping tab can’t ring. Add this site to the “keep awake” list once on each computer:'),
        h('div', { class: 'row' }, h('strong', {}, host), copyBtn),
        h('div', { class: 'help-browsers' },
          h('div', {},
            h('h4', {}, 'Google Chrome'),
            h('ol', {},
              h('li', {}, 'Click ⋮ (top right) → ', h('b', {}, 'Settings'), '.'),
              h('li', {}, 'Choose ', h('b', {}, 'Performance'), ' on the left (or type ', code('chrome://settings/performance'), ' in the address bar).'),
              h('li', {}, 'Under ', h('b', {}, 'Memory'), ', find ', h('b', {}, 'Always keep these sites active'), ' and click ', h('b', {}, 'Add'), '.'),
              h('li', {}, 'Paste ', code(host), ' and click ', h('b', {}, 'Add'), '.'),
            ),
          ),
          h('div', {},
            h('h4', {}, 'Microsoft Edge'),
            h('ol', {},
              h('li', {}, 'Click ⋯ (top right) → ', h('b', {}, 'Settings'), '.'),
              h('li', {}, 'Choose ', h('b', {}, 'System and performance'), ' (or type ', code('edge://settings/system'), ').'),
              h('li', {}, 'Under ', h('b', {}, 'Optimize performance'), ', find ', h('b', {}, 'Never put these sites to sleep'), ' and click ', h('b', {}, 'Add'), '.'),
              h('li', {}, 'Paste ', code(host), ' and click ', h('b', {}, 'Add'), '.'),
            ),
          ),
          h('div', {},
            h('h4', {}, 'Firefox'),
            h('p', {}, 'Nothing to change. Firefox only unloads tabs when the computer is very low on memory.'),
          ),
          h('div', {},
            h('h4', {}, 'Safari / iPad'),
            h('p', {}, 'Keep this page on screen. iPads pause pages that aren’t showing.'),
          ),
        ),
      ),

      step('4. Don’t let the computer sleep',
        h('p', {}, 'If the computer itself goes to sleep, nothing can ring. On Windows: ', h('b', {}, 'Settings → System → Power'), ' → set sleep to ', h('b', {}, 'Never'), ' when plugged in. (A school-managed laptop may need IT to change this.) The screen turning off is fine — only sleep stops it.'),
      ),

      step('5. Check the volume',
        h('p', {}, 'Make sure the computer or board isn’t muted, and the tab itself isn’t muted (right-click the tab — if it says ', h('b', {}, 'Unmute site'), ', click it).'),
      ),
    ),
  );
  dlg.addEventListener('close', () => { off(); dlg.remove(); });
  dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
  document.body.append(dlg);
  dlg.showModal();
}
