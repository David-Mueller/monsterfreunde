'use strict';

// Part-based monster rig (see ANIMATION.md). The rig turns a small set of
// numeric channels into DOM transforms on separately drawn parts. Nothing is
// ever blended or warped at pixel level, so every frame is a clean drawing.
//
// Channels: body {x,y,r,sx,sy,height} in the same units as MonsterMotion.body,
// armLeft/armRight as absolute directions in degrees (0 = right, 90 = down),
// eyes {open 0..1, happy 0..1, gazeX, gazeY}, mouth variant and mouth scale.

const PUPIL = { momo: '#171449', pip: '#4a0f2e' };

class MonsterRig {
  constructor(root, data, key) {
    this.root = root;
    this.data = data[key];
    this.key = key;
    this.cell = this.data.cell;
    this.parts = {};
    root.replaceChildren();
    root.style.setProperty('--skin', `rgb(${this.data.skin.join(',')})`);
    const parts = this.data.parts;
    for (const [name, part] of Object.entries(parts)) {
      const element = document.createElement(name.startsWith('eye') ? 'div' : 'img');
      element.className = `part part-${name}`;
      element.dataset.part = name;
      // Arms are placed so that their pivot sits on the shoulder.
      const shift = part.shoulder && part.pivot ? [part.shoulder[0] - part.pivot[0], part.shoulder[1] - part.pivot[1]] : [0, 0];
      this.place(element, part.box.map((v, i) => v + shift[i % 2]), part.pivot && [part.pivot[0] + shift[0], part.pivot[1] + shift[1]]);
      element.style.zIndex = part.z;
      if (element.tagName === 'IMG') {
        element.src = `assets/parts/${key}-${name}.png`;
        element.alt = '';
        element.draggable = false;
      } else {
        const white = document.createElement('img');
        white.src = `assets/parts/${key}-${name}.png`; white.alt = ''; white.className = 'eye-white'; white.draggable = false;
        const pupil = document.createElement('span'); pupil.className = 'pupil'; pupil.style.background = PUPIL[key] || '#222';
        const lid = document.createElement('span'); lid.className = 'lid';
        const lower = document.createElement('span'); lower.className = 'lid lower';
        element.append(white, pupil, lower, lid);
        element.pupil = pupil; element.lid = lid; element.lower = lower;
      }
      root.append(element);
      this.parts[name] = element;
      if (part.pivot && part.tip) part.drawn = Math.atan2(part.tip[1] - part.pivot[1], part.tip[0] - part.pivot[0]) * 180 / Math.PI;
    }
    this.mouth = 'mouth';
  }

  place(element, box, pivot) {
    const [x0, y0, x1, y1] = box, n = this.cell;
    element.style.left = `${x0 / n * 100}%`;
    element.style.top = `${y0 / n * 100}%`;
    element.style.width = `${(x1 - x0) / n * 100}%`;
    element.style.height = `${(y1 - y0) / n * 100}%`;
    if (pivot) element.style.transformOrigin = `${(pivot[0] - x0) / (x1 - x0) * 100}% ${(pivot[1] - y0) / (y1 - y0) * 100}%`;
  }

  // Applies one frame. Missing channels keep their neutral value.
  set(state) {
    const parts = this.data.parts;
    for (const side of ['left', 'right']) {
      const name = `arm-${side}`, part = parts[name], element = this.parts[name];
      if (!part || !element) continue;
      const wanted = state[side === 'left' ? 'armLeft' : 'armRight'];
      const lift = state[side === 'left' ? 'armLeftLift' : 'armRightLift'] || 0;
      element.style.transform = `translateY(${-lift}%) rotate(${wanted - part.drawn}deg)`;
    }
    const eyes = state.eyes || {};
    const open = eyes.open ?? 1, happy = eyes.happy ?? 0;
    for (const side of ['left', 'right']) {
      const eye = this.parts[`eye-${side}`];
      if (!eye) continue;
      eye.lid.style.transform = `scaleY(${1 - open})`;
      eye.lower.style.transform = `scaleY(${happy * .62})`;
      eye.pupil.style.transform = `translate(${(eyes.gazeX || 0) * 18}%,${(eyes.gazeY || 0) * 18}%)`;
      eye.pupil.style.opacity = open < .25 ? '0' : '1';
    }
    const mouth = state.mouth || 'mouth';
    for (const name of ['mouth', 'mouth-open', 'mouth-laugh']) {
      const element = this.parts[name];
      if (!element) continue;
      const shown = name === mouth || (!this.parts[mouth] && name === 'mouth');
      element.style.visibility = shown ? 'visible' : 'hidden';
      if (shown) element.style.transform = `scale(${state.mouthScaleX ?? 1},${state.mouthScaleY ?? 1})`;
    }
  }
}

// Channel values per action and time, on top of MonsterMotion.body which
// still supplies the whole-body squash, sway and hop.
const RigMotion = (() => {
  const { smooth, clamp, hops } = MonsterMotion;
  // Absolute arm directions in degrees: 0 points right, 90 points down.
  const REST = { armLeft: 112, armRight: 68 };
  function pose(action, t, duration, clock) {
    const state = { armLeft: REST.armLeft + Math.sin(clock * 2.1) * 2, armRight: REST.armRight - Math.sin(clock * 2.1 + .4) * 2, eyes: { open: 1, happy: 0, gazeX: 0, gazeY: 0 }, mouth: 'mouth', mouthScaleX: 1, mouthScaleY: 1 };
    if (!action) return state;
    const envelope = smooth(t / .22) * smooth((duration - t) / .38);
    if (action === 'blink') {
      state.eyes.open = t < .075 ? 1 - smooth(t / .075) : t < .12 ? 0 : smooth((t - .12) / .15);
    } else if (action === 'wave') {
      const up = smooth(t / .3) * smooth((duration - t) / .36);
      state.armRight = REST.armRight + (-70 - REST.armRight) * up + Math.sin(t * 14) * 22 * up;
      state.armRightLift = up * 6;
      state.mouth = up > .5 ? 'mouth-open' : 'mouth';
      state.eyes.gazeX = .3 * up;
    } else if (action === 'tickle') {
      const in_ = smooth(t / .24) * smooth((duration - t) / .44);
      // Arms flail out to the sides while giggling.
      state.armLeft = REST.armLeft + (160 - REST.armLeft) * in_ + Math.sin(t * 24) * 14 * in_;
      state.armRight = REST.armRight + (20 - REST.armRight) * in_ - Math.sin(t * 24 + 1) * 14 * in_;
      state.armLeftLift = in_ * 4; state.armRightLift = in_ * 4;
      state.eyes.happy = in_;
      state.mouth = in_ > .5 ? 'mouth-laugh' : 'mouth';
      state.mouthScaleY = 1 + .12 * Math.sin(t * 24) * in_;
    } else if (action === 'dance') {
      const phase = (t - .34) * Math.PI / .56;
      const swing = Math.sin(phase) * envelope;
      // One arm up and outward while the other reaches out sideways, alternating.
      const k = .5 + .5 * swing;
      // Up-left is written as 235 rather than -125 so the swing stays outside the body.
      const left = 165 + (235 - 165) * k, right = 15 + (-55 - 15) * (1 - k);
      state.armLeft = REST.armLeft + (left - REST.armLeft) * envelope;
      state.armRight = REST.armRight + (right - REST.armRight) * envelope;
      state.armLeftLift = 6 * envelope; state.armRightLift = 6 * envelope;
      state.mouth = envelope > .5 ? 'mouth-open' : 'mouth';
      state.eyes.gazeX = -.35 * swing;
      state.eyes.happy = .25 * envelope;
    } else if (action === 'jump') {
      for (const { start, takeoff, landing } of hops) {
        if (t >= start && t < takeoff) {
          const crouch = smooth((t - start) / (takeoff - start));
          state.armLeft = REST.armLeft + 30 * crouch; state.armRight = REST.armRight - 30 * crouch;
        } else if (t >= takeoff && t < landing) {
          const p = (t - takeoff) / (landing - takeoff), up = Math.sin(p * Math.PI);
          state.armLeft = REST.armLeft + 30 + (240 - REST.armLeft - 30) * smooth(p * 3);
          state.armRight = REST.armRight - 30 + (-60 - REST.armRight + 30) * smooth(p * 3);
          state.armLeftLift = 12 * up; state.armRightLift = 12 * up;
          state.mouth = 'mouth-open';
          state.eyes.gazeY = -.4 * up;
        } else if (t >= landing && t < landing + .32) {
          const dt = t - landing, recoil = Math.exp(-dt * 12) * Math.sin(dt * 30);
          state.armLeft = REST.armLeft + 24 * recoil; state.armRight = REST.armRight - 24 * recoil;
          state.eyes.happy = clamp(1 - dt * 3) * .5;
        }
      }
    }
    return state;
  }
  return { pose, REST };
})();
