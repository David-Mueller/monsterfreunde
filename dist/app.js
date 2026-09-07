'use strict';

const monsters = {
  momo: { name: 'Momo', personality: 'Der Wuschel', description: 'Momo, ein freundliches blaues Wuschelmonster', sheet: 'assets/momo.png', tickle: ['Hihihi!', 'Nicht am Bauch!', 'Du bist kitzelig … ich auch!'], jump: ['Boing!', 'Bis zu den Wolken!'], dance: ['Wackel, wackel!', 'So geht mein Monstertanz!'] },
  pip: { name: 'Pip', personality: 'Der Wirbelwind', description: 'Pip, ein fröhliches orangefarbenes Monster mit kleinen Hörnern', sheet: 'assets/pip.png', tickle: ['Hahaha! Nochmal!', 'Hihi, erwischt!', 'Das kitzelt!'], jump: ['Huuui!', 'Einmal bis zum Mond!'], dance: ['Wackel mit!', 'Tanzparty!'] }
};
const keys = Object.keys(monsters);
const $ = (selector) => document.querySelector(selector);
const choices = [...document.querySelectorAll('[data-choice]')];
const actions = [...document.querySelectorAll('[data-action]')];
const sprite = $('.main-sprite');
const character = $('.character');
const touch = $('.monster-touch');
const speech = $('#speech');
const playground = $('.playground');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
let selected = 'momo';
let active = null;
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
const ground = $('.ground');
const springs = Object.fromEntries(Object.entries({x:0,y:0,r:0,sx:1,sy:1,height:0}).map(([key,value]) => [key,new MonsterMotion.Spring(value)]));

function clearAction() {
  clearTimeout(speechTimer);
  currentClip = null;
  active = null;
  actions.forEach(button => button.classList.remove('active'));
}

function scheduleFrame() {
  if (!frameRequest && ready && !document.hidden) frameRequest = requestAnimationFrame(animate);
}

function idle() {
  nextBlink = performance.now() + (selected === 'momo' ? 3400 : 2500) + Math.random()*1500;
  scheduleFrame();
}

function startClip(name) {
  if (!ready) return;
  const initial = renderer.capture();
  clearAction();
  const clip = MonsterMotion.clips[name];
  active = name;
  currentClip = { name, clip, initial, start:performance.now(), speed:selected==='pip'?1.12:1, duration:clip[clip.length-1][0] };
  renderer.draw(initial,initial,0,performance.now()/1000,0);
  scheduleFrame();
}

function animate(now) {
  frameRequest = 0;
  if (!ready || document.hidden) return;
  const dt = Math.min(.05, previousTime ? (now-previousTime)/1000 : 1/60);
  previousTime = now;
  if (!currentClip && !reduced.matches && now>=nextBlink) startClip('blink');
  let a=renderer.pose(0),b=a,mix=0;
  let target=MonsterMotion.body(null,0,0,now/1000,selected);
  if (currentClip) {
    const running=currentClip;
    const elapsed=(now-running.start)/1000*running.speed;
    const finished=reduced.matches ? elapsed>=.9 : elapsed>=running.duration;
    if (finished) {
      clearAction();
      speech.classList.remove('visible');
      nextBlink=now+(selected==='momo'?3600:2600)+Math.random()*1400;
    } else if (reduced.matches) {
      a=b=renderer.pose(elapsed>.7?0:({tickle:7,jump:5,dance:3,wave:4,blink:0}[running.name]||0));
    } else {
      const segment=MonsterMotion.segment(running.clip,elapsed);
      a=segment.first?running.initial:renderer.pose(segment.from);
      b=renderer.pose(segment.to);
      mix=segment.mix;
      target=MonsterMotion.body(running.name,elapsed,running.duration,now/1000,selected);
    }
  }
  if (reduced.matches) target={x:0,y:0,r:0,sx:1,sy:1,height:0,life:0};
  const motion={};
  for (const key of Object.keys(springs)) motion[key]=springs[key].step(target[key],dt,key==='height'?38:24);
  const scale=Math.min(1,sprite.clientWidth/360);
  character.style.transform=`translate3d(${motion.x*scale}px,${(motion.y-motion.height)*scale}px,0) rotate(${motion.r}deg) scale(${motion.sx},${motion.sy})`;
  const altitude=MonsterMotion.clamp(motion.height/110);
  ground.style.transform=`scale(${1-altitude*.45},${1-altitude*.25})`;
  ground.style.opacity=String(1-altitude*.65);
  renderer.draw(a,b,mix,now/1000,reduced.matches?0:target.life);
  if (!reduced.matches || currentClip) scheduleFrame();
}

function say(message, duration = 1800) {
  clearTimeout(speechTimer);
  speech.textContent = message;
  speech.classList.add('visible');
  speechTimer = window.setTimeout(() => speech.classList.remove('visible'), duration);
}

function burst(action) {
  const box = $('.particles');
  box.replaceChildren();
  if (reduced.matches) return;
  const glyphs = action === 'dance' ? ['♪', '♫', '♪'] : ['✦', '·', '✧'];
  for (let i = 0; i < 9; i++) {
    const particle = document.createElement('span');
    particle.className = 'particle';
    particle.textContent = glyphs[i % glyphs.length];
    const angle = (i / 9) * Math.PI * 2;
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
  if (!ready || !['tickle', 'jump', 'dance'].includes(action)) return;
  startClip(action);
  const lines=monsters[selected][action];
  const duration=reduced.matches?900:currentClip.duration/currentClip.speed*1000;
  say(lines[Math.floor(Math.random()*lines.length)],duration+200);
  actions.find(button=>button.dataset.action===action).classList.add('active');
  burst(action);
}

function selectMonster(key, greet = true) {
  if (!monsters[key]) return;
  if (key === selected && greet && ready) { perform('tickle'); return; }
  clearAction();
  selected = key;
  const monster = monsters[key];
  document.body.dataset.monster = key;
  document.querySelector('meta[name="theme-color"]').content = key === 'momo' ? '#73066d' : '#473178';
  $('#monster-name').textContent = monster.name;
  $('#personality').textContent = monster.personality;
  sprite.setAttribute('aria-label', monster.description);
  touch.setAttribute('aria-label', `${monster.name} kitzeln`);
  for (const choice of choices) {
    const chosen = choice.dataset.choice === key;
    choice.classList.toggle('selected', chosen);
    choice.setAttribute('aria-checked', String(chosen));
    choice.tabIndex = chosen ? 0 : -1;
  }
  const other = monsters[keys.find(otherKey => otherKey !== key)].name;
  document.querySelectorAll('.arrow').forEach(arrow => arrow.setAttribute('aria-label', `${other} auswählen`));
  entranceAnimation?.cancel();
  if (ready) renderer.setMonster(key,images[key]);
  if (greet && ready) {
    if (!reduced.matches) entranceAnimation = $('.entrance').animate([
      { transform: 'translateY(12px) scale(.87)', opacity: .35 },
      { transform: 'translateY(-5px) scale(1.025)', opacity: 1, offset: .65 },
      { transform: 'translateY(0) scale(1)', opacity: 1 }
    ], { duration: 360, easing: 'ease-out' });
    startClip('wave');
    say(`Hallo! Ich bin ${monster.name}.`, 1400);
  } else idle();
}

function changeMonster(focus = false) {
  const next = keys[(keys.indexOf(selected) + 1) % keys.length];
  selectMonster(next);
  if (focus) choices.find(button => button.dataset.choice === next).focus();
}

choices.forEach(button => button.addEventListener('click', () => selectMonster(button.dataset.choice)));
actions.forEach(button => button.addEventListener('click', () => perform(button.dataset.action)));
document.querySelectorAll('.arrow').forEach(button => button.addEventListener('click', () => changeMonster()));
$('.monster-choices').addEventListener('keydown', event => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
    event.preventDefault(); changeMonster(true);
  } else if (event.key === 'Home' || event.key === 'End') {
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
    changeMonster();
  }
});
touch.addEventListener('pointercancel', () => { pointerStart = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(frameRequest); frameRequest=0; previousTime=0;
    clearAction(); speech.classList.remove('visible');
  } else {
    if (ready) startClip('settle');
    idle();
  }
});
reduced.addEventListener('change', () => { clearAction(); speech.classList.remove('visible'); idle(); });
$('#reload').addEventListener('click', () => window.location.reload());

Promise.all([
  ...keys.map(key=>new Promise((resolve,reject)=>{
    const image=new Image();
    image.onload=()=>{images[key]=image;resolve();};
    image.onerror=reject;
    image.src=monsters[key].sheet;
  })),
  fetch('assets/motion.json?v=2').then(response=>{if(!response.ok)throw new Error('Missing motion data');return response.json();})
]).then(results=>{
  renderer=new MonsterRenderer(sprite,results[results.length-1]);
  renderer.onRestore=()=>{clearAction();idle();};
  ready=true;
  document.body.classList.add('ready');
  touch.disabled=false;
  actions.forEach(button=>{button.disabled=false;});
  selectMonster(selected,false);
}).catch(()=>{
  $('.load-error').hidden=false;
  $('#touch-hint').textContent='Unsere Monster verstecken sich gerade.';
});
