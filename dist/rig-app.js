'use strict';

// Driver for rig.html: the same actions as the main page, rendered with the
// part-based rig instead of morphing whole drawings.
const monsters = {
  momo: { name: 'Momo', personality: 'Der Wuschel', theme: '#73066d', tempo: 1, blink: [3400, 1500], voice: 250,
    lines: { tickle: ['Hihihi!', 'Nicht am Bauch!'], jump: ['Boing!', 'Bis zu den Wolken!'], dance: ['Wackel, wackel!', 'So geht mein Monstertanz!'], wave: ['Hallo!', 'Huhu!'] } },
  pip: { name: 'Pip', personality: 'Der Wirbelwind', theme: '#473178', tempo: 1.15, blink: [2500, 1500], voice: 390,
    lines: { tickle: ['Hahaha! Nochmal!', 'Das kitzelt!'], jump: ['Huuui!', 'Einmal bis zum Mond!'], dance: ['Wackel mit!', 'Tanzparty!'], wave: ['Hallo!', 'Hier bin ich!'] } }
};
const keys = Object.keys(monsters);
const stamp = document.documentElement.dataset.version || '';
const version = stamp.startsWith('__') ? 'lokal' : stamp;
const $ = selector => document.querySelector(selector);
const actions = [...document.querySelectorAll('[data-action]')];
const arrows = [...document.querySelectorAll('.arrow')];
const character = $('.character');
const touch = $('.monster-touch');
const speech = $('#speech');
const ground = $('.ground');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let selected = 'momo';
let rig = null;
let rigData = null;
let currentClip = null;
let frameRequest = 0;
let previousTime = 0;
let nextBlink = 0;
let speechTimer = 0;
let ready = false;
const bodySprings = Object.fromEntries(Object.entries({ x: 0, y: 0, r: 0, sx: 1, sy: 1, height: 0 }).map(([key, value]) => [key, new MonsterMotion.Spring(value)]));
// Arms and face blend on the transform level: a new action never jumps.
const channelSprings = { armLeft: new MonsterMotion.Spring(RigMotion.REST.armLeft), armRight: new MonsterMotion.Spring(RigMotion.REST.armRight), armLeftLift: new MonsterMotion.Spring(0), armRightLift: new MonsterMotion.Spring(0), happy: new MonsterMotion.Spring(0), gazeX: new MonsterMotion.Spring(0), gazeY: new MonsterMotion.Spring(0), mouthScaleY: new MonsterMotion.Spring(1) };

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

function startClip(name) {
  if (!ready) return;
  clearAction();
  const clip = MonsterMotion.clips[name];
  currentClip = { name, clip, start: performance.now(), speed: monster().tempo, duration: clip.duration, fired: 0 };
  scheduleFrame();
}

function say(message, duration = 1800) {
  clearTimeout(speechTimer);
  speech.textContent = message;
  speech.classList.add('visible');
  speechTimer = window.setTimeout(() => speech.classList.remove('visible'), duration);
}

function perform(action) {
  if (!ready || !MonsterMotion.clips[action]) return;
  startClip(action);
  const lines = monster().lines[action] || [];
  if (lines.length) say(lines[Math.floor(Math.random() * lines.length)], currentClip.duration / currentClip.speed * 1000 + 200);
  actions.find(button => button.dataset.action === action)?.classList.add('active');
}

function animate(now) {
  frameRequest = 0;
  if (!ready || document.hidden) return;
  const dt = Math.min(.05, previousTime ? (now - previousTime) / 1000 : 1 / 60);
  previousTime = now;
  if (!currentClip && !reduced.matches && now >= nextBlink) startClip('blink');
  let body = MonsterMotion.body(null, 0, 0, now / 1000, monster().tempo);
  let pose = RigMotion.pose(null, 0, 0, now / 1000);
  if (currentClip) {
    const running = currentClip;
    const elapsed = (now - running.start) / 1000 * running.speed;
    if (elapsed >= running.duration) {
      clearAction();
      speech.classList.remove('visible');
      scheduleBlink(now);
    } else {
      body = MonsterMotion.body(running.name, elapsed, running.duration, now / 1000, monster().tempo);
      pose = RigMotion.pose(running.name, elapsed, running.duration, now / 1000);
      while (running.fired < running.clip.moments.length && elapsed >= running.clip.moments[running.fired].at) Sounds.play(running.clip.moments[running.fired++].kind, monster().voice);
    }
  }
  if (reduced.matches) { body = { x: 0, y: 0, r: 0, sx: 1, sy: 1, height: 0 }; }
  const motion = {};
  for (const key of Object.keys(bodySprings)) motion[key] = bodySprings[key].step(body[key], dt, key === 'height' ? 38 : 24);
  const scale = Math.min(1, character.clientWidth / 360);
  character.style.transform = `translate3d(${motion.x * scale}px,${(motion.y - motion.height) * scale}px,0) rotate(${motion.r}deg) scale(${motion.sx},${motion.sy})`;
  const altitude = MonsterMotion.clamp(motion.height / 110);
  ground.style.transform = `scale(${1 - altitude * .45},${1 - altitude * .25})`;
  ground.style.opacity = String(1 - altitude * .65);
  const smoothed = {
    armLeft: channelSprings.armLeft.step(pose.armLeft, dt, 22),
    armRight: channelSprings.armRight.step(pose.armRight, dt, 22),
    armLeftLift: channelSprings.armLeftLift.step(pose.armLeftLift || 0, dt, 22),
    armRightLift: channelSprings.armRightLift.step(pose.armRightLift || 0, dt, 22),
    eyes: { open: pose.eyes.open, happy: channelSprings.happy.step(pose.eyes.happy, dt, 26), gazeX: channelSprings.gazeX.step(pose.eyes.gazeX, dt, 16), gazeY: channelSprings.gazeY.step(pose.eyes.gazeY, dt, 16) },
    mouth: pose.mouth,
    mouthScaleX: pose.mouthScaleX,
    mouthScaleY: channelSprings.mouthScaleY.step(pose.mouthScaleY, dt, 30)
  };
  rig.set(smoothed);
  scheduleFrame();
}

function selectMonster(key, greet = true) {
  if (!monsters[key] || !rigData) return;
  if (key === selected && greet && ready) { perform('tickle'); return; }
  clearAction();
  selected = key;
  const chosen = monsters[key];
  document.body.dataset.monster = key;
  document.querySelector('meta[name="theme-color"]').content = chosen.theme;
  $('#monster-name').textContent = chosen.name;
  $('#personality').textContent = chosen.personality;
  touch.setAttribute('aria-label', `${chosen.name} kitzeln`);
  rig = new MonsterRig($('#rig'), rigData, key);
  if (greet) { startClip('wave'); Sounds.play('hello', chosen.voice); say(`Hallo! Ich bin ${chosen.name}.`, 1400); }
  else { scheduleBlink(); scheduleFrame(); }
}

function changeMonster(direction) {
  selectMonster(keys[(keys.indexOf(selected) + direction + keys.length) % keys.length]);
}

actions.forEach(button => button.addEventListener('click', () => perform(button.dataset.action)));
arrows[0].addEventListener('click', () => changeMonster(-1));
arrows[1].addEventListener('click', () => changeMonster(1));
touch.addEventListener('click', () => perform('tickle'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(frameRequest); frameRequest = 0; previousTime = 0; clearAction(); }
  else { scheduleBlink(); scheduleFrame(); }
});
$('#version').textContent = version;
Sounds.bindToggle($('#sound'));
// Offline copy of the app; the registration URL carries the version so a new
// deployment always installs a fresh worker.
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(version)}`, { updateViaCache: 'none' }).catch(() => {}));
}


fetch(`assets/rig.json?v=${encodeURIComponent(version)}`).then(response => {
  if (!response.ok) throw new Error('Missing rig data');
  return response.json();
}).then(data => {
  rigData = data;
  ready = true;
  document.body.classList.add('ready');
  touch.disabled = false;
  actions.forEach(button => { button.disabled = false; });
  selectMonster(selected, false);
}).catch(() => {
  $('#touch-hint').textContent = 'Das Rig konnte nicht geladen werden.';
});
