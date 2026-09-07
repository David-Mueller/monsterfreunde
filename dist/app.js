'use strict';

// Everything that makes a monster feel different lives here: looks, lines,
// tempo of its motion, blink rhythm and the colour of the browser chrome.
const monsters = {
  momo: {
    name: 'Momo', personality: 'Der Wuschel', description: 'Momo, ein freundliches blaues Wuschelmonster',
    sheet: 'assets/momo.png', theme: '#73066d', tempo: 1, blink: [3400, 1500], voice: 250,
    lines: { tickle: ['Hihihi!', 'Nicht am Bauch!', 'Du bist kitzelig … ich auch!'], jump: ['Boing!', 'Bis zu den Wolken!'], dance: ['Wackel, wackel!', 'So geht mein Monstertanz!'] }
  },
  pip: {
    name: 'Pip', personality: 'Der Wirbelwind', description: 'Pip, ein fröhliches orangefarbenes Monster mit kleinen Hörnern',
    sheet: 'assets/pip.png', theme: '#473178', tempo: 1.15, blink: [2500, 1500], voice: 390,
    lines: { tickle: ['Hahaha! Nochmal!', 'Hihi, erwischt!', 'Das kitzelt!'], jump: ['Huuui!', 'Einmal bis zum Mond!'], dance: ['Wackel mit!', 'Tanzparty!'] }
  }
};
const keys = Object.keys(monsters);
const plays = ['tickle', 'jump', 'dance'];
// Stamped by the deploy workflow; a local checkout keeps the placeholder.
const stamp = document.documentElement.dataset.version || '';
const version = stamp.startsWith('__') ? 'lokal' : stamp;
const $ = (selector) => document.querySelector(selector);
const choices = [...document.querySelectorAll('[data-choice]')];
const actions = [...document.querySelectorAll('[data-action]')];
const arrows = [...document.querySelectorAll('.arrow')];
const sprite = $('.main-sprite');
const character = $('.character');
const touch = $('.monster-touch');
const speech = $('#speech');
const ground = $('.ground');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let selected = 'momo';
let frameRequest = 0;
let speechTimer = 0;
let entranceAnimation = null;
let pointerStart = null;
let ignoreClickUntil = 0;
let ready = false;
let renderer = null;
let currentClip = null;
let previousTime = 0;
let nextBlink = 0;
const images = {};
const springs = Object.fromEntries(Object.entries({x:0,y:0,r:0,sx:1,sy:1,height:0}).map(([key,value]) => [key,new MonsterMotion.Spring(value)]));

const monster = () => monsters[selected];

function clearAction() {
  clearTimeout(speechTimer);
  currentClip = null;
  actions.forEach(button => button.classList.remove('active'));
}

function scheduleFrame() {
  if (!frameRequest && ready && !document.hidden) frameRequest = requestAnimationFrame(animate);
}

function scheduleBlink(now = performance.now()) {
  const [delay, spread] = monster().blink;
  nextBlink = now + delay + Math.random() * spread;
}

function idle() {
  scheduleBlink();
  scheduleFrame();
}

function startClip(name) {
  if (!ready) return;
  clearAction();
  const clip = MonsterMotion.clips[name];
  // A clip starts from the drawing on screen and always ends in pose 0.
  currentClip = { name, clip, initial: renderer.frame, start: performance.now(), speed: monster().tempo, duration: clip.duration, fired: 0 };
  scheduleFrame();
}

// Named instants inside a clip, e.g. the take-off of a jump or a dance beat.
function moment(kind) {
  Sounds.play(kind, monster().voice);
  if (reduced.matches) return;
  if (kind === 'land') burst('jump');
  if (kind === 'beat') burst('dance', 3);
}

function animate(now) {
  frameRequest = 0;
  if (!ready || document.hidden) return;
  const dt = Math.min(.05, previousTime ? (now - previousTime) / 1000 : 1 / 60);
  previousTime = now;
  if (!currentClip && !reduced.matches && now >= nextBlink) startClip('blink');
  let frame = 0;
  let target = MonsterMotion.body(null, 0, 0, now / 1000, monster().tempo);
  if (currentClip) {
    const running = currentClip;
    const elapsed = (now - running.start) / 1000 * running.speed;
    const finished = reduced.matches ? elapsed >= .9 : elapsed >= running.duration;
    if (finished) {
      clearAction();
      speech.classList.remove('visible');
      scheduleBlink(now);
    } else if (reduced.matches) {
      frame = elapsed > .7 ? 0 : running.clip.still;
    } else {
      frame = MonsterMotion.poseAt(running.clip, elapsed, running.initial);
      target = MonsterMotion.body(running.name, elapsed, running.duration, now / 1000, monster().tempo);
      while (running.fired < running.clip.moments.length && elapsed >= running.clip.moments[running.fired].at) moment(running.clip.moments[running.fired++].kind);
    }
  }
  if (reduced.matches) target = { x: 0, y: 0, r: 0, sx: 1, sy: 1, height: 0 };
  // A tiny bounce on every pose change reads as a step and hides the cut.
  if (frame !== renderer.frame && !reduced.matches && frame !== 1 && renderer.frame !== 1) { springs.sy.kick(-1.6); springs.sx.kick(1.1); }
  const motion = {};
  for (const key of Object.keys(springs)) motion[key] = springs[key].step(target[key], dt, key === 'height' ? 38 : 24);
  const scale = Math.min(1, sprite.clientWidth / 360);
  character.style.transform = `translate3d(${motion.x * scale}px,${(motion.y - motion.height) * scale}px,0) rotate(${motion.r}deg) scale(${motion.sx},${motion.sy})`;
  const altitude = MonsterMotion.clamp(motion.height / 110);
  ground.style.transform = `scale(${1 - altitude * .45},${1 - altitude * .25})`;
  ground.style.opacity = String(1 - altitude * .65);
  renderer.show(frame);
  if (!reduced.matches || currentClip) scheduleFrame();
}

function say(message, duration = 1800) {
  clearTimeout(speechTimer);
  speech.textContent = message;
  speech.classList.add('visible');
  speechTimer = window.setTimeout(() => speech.classList.remove('visible'), duration);
}

function burst(action, count = 9) {
  const box = $('.particles');
  if (count >= 9) box.replaceChildren();
  if (reduced.matches) return;
  const glyphs = action === 'dance' ? ['♪', '♫', '♪'] : ['✦', '·', '✧'];
  const offset = Math.random() * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('span');
    particle.className = 'particle';
    particle.textContent = glyphs[i % glyphs.length];
    const angle = offset + (i / count) * Math.PI * 2;
    const radius = 100 + (i % 3) * 19;
    particle.style.setProperty('--dx', `${Math.cos(angle) * radius}px`);
    particle.style.setProperty('--dy', `${Math.sin(angle) * radius - 20}px`);
    particle.style.setProperty('--spin', `${i % 2 ? 28 : -28}deg`);
    particle.style.animationDelay = `${(i % 3) * 25}ms`;
    particle.addEventListener('animationend', () => particle.remove(), { once: true });
    box.append(particle);
  }
}

function perform(action) {
  if (!ready || !plays.includes(action)) return;
  startClip(action);
  const lines = monster().lines[action];
  const duration = reduced.matches ? 900 : currentClip.duration / currentClip.speed * 1000;
  say(lines[Math.floor(Math.random() * lines.length)], duration + 200);
  actions.find(button => button.dataset.action === action).classList.add('active');
  burst(action);
}

function selectMonster(key, greet = true) {
  if (!monsters[key]) return;
  if (key === selected && greet && ready) { perform('tickle'); return; }
  clearAction();
  selected = key;
  const chosen = monsters[key];
  document.body.dataset.monster = key;
  document.querySelector('meta[name="theme-color"]').content = chosen.theme;
  $('#monster-name').textContent = chosen.name;
  $('#personality').textContent = chosen.personality;
  sprite.setAttribute('aria-label', chosen.description);
  touch.setAttribute('aria-label', `${chosen.name} kitzeln`);
  for (const choice of choices) {
    const current = choice.dataset.choice === key;
    choice.classList.toggle('selected', current);
    choice.setAttribute('aria-checked', String(current));
    choice.tabIndex = current ? 0 : -1;
  }
  const index = keys.indexOf(key);
  arrows[0].setAttribute('aria-label', `${monsters[keys[(index + keys.length - 1) % keys.length]].name} auswählen`);
  arrows[1].setAttribute('aria-label', `${monsters[keys[(index + 1) % keys.length]].name} auswählen`);
  entranceAnimation?.cancel();
  if (ready) renderer.setMonster(key, images[key]);
  if (greet && ready) {
    if (!reduced.matches) entranceAnimation = $('.entrance').animate([
      { transform: 'translateY(12px) scale(.87)', opacity: .35 },
      { transform: 'translateY(-5px) scale(1.025)', opacity: 1, offset: .65 },
      { transform: 'translateY(0) scale(1)', opacity: 1 }
    ], { duration: 360, easing: 'ease-out' });
    startClip('wave');
    Sounds.play('hello', chosen.voice);
    say(`Hallo! Ich bin ${chosen.name}.`, 1400);
  } else idle();
}

function changeMonster(direction = 1, focus = false) {
  const next = keys[(keys.indexOf(selected) + direction + keys.length) % keys.length];
  selectMonster(next);
  if (focus) choices.find(button => button.dataset.choice === next).focus();
}

choices.forEach(button => button.addEventListener('click', () => selectMonster(button.dataset.choice)));
actions.forEach(button => button.addEventListener('click', () => perform(button.dataset.action)));
arrows[0].addEventListener('click', () => changeMonster(-1));
arrows[1].addEventListener('click', () => changeMonster(1));
$('.monster-choices').addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); changeMonster(-1, true); }
  else if (['ArrowRight', 'ArrowDown'].includes(event.key)) { event.preventDefault(); changeMonster(1, true); }
  else if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    const key = event.key === 'Home' ? keys[0] : keys[keys.length - 1];
    if (key !== selected) selectMonster(key);
    choices.find(button => button.dataset.choice === key).focus();
  }
});
touch.addEventListener('click', () => { if (performance.now() > ignoreClickUntil) perform('tickle'); });
touch.addEventListener('pointerdown', event => {
  if (!event.isPrimary) return;
  pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
  touch.setPointerCapture(event.pointerId);
});
touch.addEventListener('pointerup', event => {
  if (!pointerStart || event.pointerId !== pointerStart.id) return;
  const dx = event.clientX - pointerStart.x;
  const dy = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.2) {
    ignoreClickUntil = performance.now() + 500;
    changeMonster(dx < 0 ? 1 : -1);
  }
});
touch.addEventListener('pointercancel', () => { pointerStart = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frameRequest); frameRequest = 0; previousTime = 0;
    clearAction(); speech.classList.remove('visible');
  } else {
    if (ready) startClip('settle');
    idle();
  }
});
reduced.addEventListener('change', () => { clearAction(); speech.classList.remove('visible'); idle(); });
$('#reload').addEventListener('click', () => window.location.reload());
$('#version').textContent = version;
Sounds.bindToggle($('#sound'));
// Offline copy of the app; the registration URL carries the version so a new
// deployment always installs a fresh worker.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(version)}`, { updateViaCache: 'none' }).catch(() => {}));
}


Promise.all([
  ...keys.map(key => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { images[key] = image; resolve(); };
    image.onerror = reject;
    image.src = monsters[key].sheet;
  })),
  fetch(`assets/motion.json?v=${encodeURIComponent(version)}`).then(response => { if (!response.ok) throw new Error('Missing motion data'); return response.json(); })
]).then(results => {
  renderer = new MonsterRenderer(sprite, results[results.length - 1]);
  ready = true;
  document.body.classList.add('ready');
  touch.disabled = false;
  actions.forEach(button => { button.disabled = false; });
  selectMonster(selected, false);
}).catch(() => {
  $('.load-error').hidden = false;
  $('#touch-hint').textContent = 'Unsere Monster verstecken sich gerade.';
});
