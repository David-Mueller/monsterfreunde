'use strict';

// Clips, whole-body motion and the spring used by app.js and rig.js. The
// drawing itself is assembled from parts by MonsterRig (rig.js).
const MonsterMotion = (() => {
  const clamp=value=>Math.max(0,Math.min(1,value));
  const smooth=value=>{const t=clamp(value);return clamp(t*t*t*(t*(t*6-15)+10));};
  // Two hops: crouch from `start`, airborne between `takeoff` and `landing`.
  const hops=[{start:0,takeoff:.24,landing:.88,height:62},{start:.97,takeoff:1.17,landing:1.71,height:42}];
  // `keys` are [seconds, pose] from the original pose sheets and document the
  // intended silhouette of each phase; the rig derives its own channels from
  // the clip name and time. `moments` are named instants (seconds) that
  // sounds and effects hook into. Every clip ends in the neutral pose.
  const clips={
    settle:{keys:[[0,0],[.35,0]],still:0,moments:[]},
    blink:{keys:[[0,0],[.075,1],[.12,1],[.27,0]],still:0,moments:[]},
    wave:{keys:[[0,0],[.30,4],[1.02,4],[1.38,0]],still:4,moments:[{at:.30,kind:'wave'}]},
    tickle:{keys:[[0,0],[.24,7],[1.36,7],[1.80,0]],still:7,moments:[{at:.10,kind:'giggle'},{at:.62,kind:'giggle'},{at:1.05,kind:'giggle'}]},
    // Tickle zones: the head shakes its hair, the feet make it hop, a side makes it flinch away.
    'tickle-head':{keys:[[0,0],[.2,7],[1.3,7],[1.6,0]],still:7,moments:[{at:.08,kind:'giggle'},{at:.55,kind:'giggle'},{at:1.0,kind:'giggle'}]},
    'tickle-feet':{keys:[[0,0],[.15,6],[1.3,6],[1.6,0]],still:6,moments:[{at:.1,kind:'giggle'},{at:.32,kind:'land'},{at:.68,kind:'land'},{at:.75,kind:'giggle'},{at:1.04,kind:'land'}]},
    'tickle-side':{keys:[[0,0],[.2,3],[1.2,3],[1.5,0]],still:3,moments:[{at:.08,kind:'giggle'},{at:.6,kind:'giggle'}]},
    jump:{keys:[[0,0],[.24,5],[.43,6],[.70,6],[.91,0],[1.17,5],[1.34,6],[1.52,6],[1.74,0],[2.05,0]],still:5,
      moments:hops.flatMap(hop => [{at:hop.takeoff,kind:'takeoff'},{at:hop.landing,kind:'land'}])},
    dance:{keys:[[0,0],[.34,2],[.90,3],[1.46,2],[2.02,3],[2.58,2],[3.14,3],[3.70,2],[4.18,0]],still:3,
      moments:[.34,.90,1.46,2.02,2.58,3.14,3.70].map(at => ({at,kind:'beat'}))},
    // Eating: arms up while the snack flies in, then hands at the cheeks
    // while chewing, a gulp, and back to neutral.
    eat:{keys:[[0,0],[.22,5],[.95,5],[1.05,7],[2.45,7],[2.80,0]],still:7,
      moments:[{at:.95,kind:'grab'},{at:1.15,kind:'chew'},{at:1.5,kind:'chew'},{at:1.85,kind:'chew'},{at:2.3,kind:'gulp'}]},
    // Refusing a snack: eyes shut, head shake, then neutral.
    yuck:{keys:[[0,0],[.25,1],[1.3,1],[1.6,0]],still:1,moments:[{at:.3,kind:'yuck'}]},
    // Idle life while nobody plays: a curious look around and a small hop.
    peek:{keys:[[0,0],[1.6,0]],still:0,moments:[]},
    hop:{keys:[[0,0],[.2,6],[.5,6],[.75,0]],still:6,moments:[{at:.2,kind:'pop'},{at:.55,kind:'land'}]},
    // Momo's trick: a wind-up, two full spins with arms up, a dizzy wobble.
    whirl:{keys:[[0,0],[.3,5],[1.45,5],[1.55,7],[2.2,7],[2.5,0]],still:5,
      moments:[{at:.3,kind:'whirl'},{at:1.45,kind:'land'},{at:1.6,kind:'giggle'}]},
    // Pip's trick: a high jump with a somersault and a proud landing.
    flip:{keys:[[0,0],[.3,5],[.5,6],[1.15,6],[1.3,5],[2.0,5],[2.3,0]],still:6,
      moments:[{at:.3,kind:'takeoff'},{at:.45,kind:'whirl'},{at:1.3,kind:'land'},{at:1.45,kind:'tada'}]},
  };
  for (const clip of Object.values(clips)) clip.duration=clip.keys[clip.keys.length-1][0];
  // Whole-body transform for the current instant: idle breathing plus the
  // action's sway, giggle, or ballistic hop. `tempo` scales the breathing.
  function body(action,t,duration,clock,tempo=1,options={}) {
    const breath=Math.sin(clock*2.1*tempo);
    const result={x:0,y:-.35*(breath+1),r:.3*Math.sin(clock*.9),sx:1+.006*breath,sy:1-.008*breath,height:0,spin:0};
    if (!action || action==='blink') return result;
    const envelope=smooth(t/.22)*smooth((duration-t)/.38);
    if (action==='dance') {
      const phase=(t-.34)*Math.PI/.56;
      result.x=10*Math.cos(phase)*envelope;
      result.r=3.8*Math.cos(phase-.3)*envelope;
      result.y-=5*(.5+.5*Math.sin(phase*2-.5))*envelope;
      result.sx+=.023*Math.sin(phase*2)*envelope;
      result.sy-=.028*Math.sin(phase*2)*envelope;
    } else if (action==='tickle') {
      const giggle=Math.sin(t*24)+.35*Math.sin(t*39);
      result.r=2* giggle*envelope;
      result.x=1.4*Math.sin(t*26-.5)*envelope;
      result.y-=2.2*(.5+.5*Math.sin(t*24))*envelope;
      result.sx+=.025*Math.sin(t*24+.8)*envelope;
      result.sy-=.027*Math.sin(t*24+.8)*envelope;
    } else if (action==='tickle-head') {
      const shake=Math.sin(t*26)*envelope;
      result.r=3.5*shake; result.x=2*shake;
      result.sy-=.03*envelope; result.sx+=.02*envelope;
    } else if (action==='tickle-feet') {
      // Three quick hops, feet pulled up each time.
      for (const start of [.1,.46,.82]) {
        const p=(t-start)/.3;
        if (p>=0 && p<1) result.height=4*24*p*(1-p);
      }
      result.r=2.5*Math.sin(t*20)*envelope;
    } else if (action==='tickle-side') {
      // Flinch away from the tickled side (options.side), then wriggle.
      const away=(options.side==='left'?1:-1);
      const flinch=smooth(t/.18)*smooth((duration-t)/.35);
      result.x=12*away*flinch+2*Math.sin(t*24)*envelope;
      result.r=-6*away*flinch+2*Math.sin(t*22)*envelope;
      result.sx+=.02*envelope; result.sy-=.025*envelope;
    } else if (action==='wave') {
      result.r=1.7*Math.sin(t*8)*envelope;
      result.y-=1.5*Math.sin(t*7)*envelope;
    } else if (action==='eat') {
      if (t<.95) {
        // Excited little bounces while the snack is on its way.
        const bounce=Math.max(0,Math.sin(t*14));
        result.y-=4*bounce*envelope; result.sy+=.02*bounce*envelope; result.sx-=.015*bounce*envelope;
      } else if (t<2.2) {
        // Chewing: rhythmic squash with the jaw.
        const chew=.5+.5*Math.sin((t-1.05)*Math.PI*2/.35-Math.PI/2);
        result.sy-=.045*chew*envelope; result.sx+=.03*chew*envelope; result.y+=1.5*chew*envelope;
      } else if (t<2.6) {
        // Gulp: a stretch that travels down.
        const p=(t-2.2)/.4,gulp=Math.sin(p*Math.PI);
        result.sy+=.07*gulp; result.sx-=.04*gulp; result.y-=3*gulp;
      }
    } else if (action==='peek') {
      // Lean to one side, then the other, as if something caught the eye.
      const look=Math.sin(t*Math.PI/.8)*smooth(t/.25)*smooth((duration-t)/.3);
      result.r=6*look; result.x=8*look; result.y-=1.5*Math.abs(look);
    } else if (action==='hop') {
      if (t<.2) { const crouch=Math.sin(t/.2*Math.PI); result.sx+=.06*crouch; result.sy-=.08*crouch; }
      else if (t<.55) { const p=(t-.2)/.35; result.height=4*22*p*(1-p); result.sy+=.03*Math.sin(p*Math.PI); result.sx-=.02*Math.sin(p*Math.PI); }
      else { const dt=t-.55,recoil=Math.exp(-dt*12)*Math.sin(dt*30); result.sx+=.06*recoil; result.sy-=.08*recoil; }
    } else if (action==='whirl') {
      if (t<.3) {
        const wind=smooth(t/.3);
        result.r=-9*wind; result.sx+=.06*wind; result.sy-=.08*wind;
      } else if (t<1.45) {
        // Two full turns around the centre, fastest in the middle, with a small lift.
        const p=(t-.3)/1.15;
        result.spin=720*smooth(p);
        result.height=26*Math.sin(p*Math.PI);
        result.sx-=.03*Math.sin(p*Math.PI); result.sy+=.04*Math.sin(p*Math.PI);
      } else {
        // Dizzy wobble that settles down.
        const dt=t-1.45,wobble=Math.sin(dt*16)*Math.exp(-dt*2.2);
        result.r=8*wobble; result.x=5*wobble;
        result.sx+=.07*Math.exp(-dt*9)*Math.sin(dt*30); result.sy-=.09*Math.exp(-dt*9)*Math.sin(dt*30);
      }
    } else if (action==='flip') {
      if (t<.3) {
        const crouch=Math.sin(t/.3*Math.PI);
        result.sx+=.1*crouch; result.sy-=.14*crouch;
      } else if (t<1.3) {
        // High arc with one forward somersault.
        const p=(t-.3)/1;
        result.height=4*92*p*(1-p);
        result.spin=360*smooth((p-.08)/.8);
        result.sx-=.03*Math.sin(p*Math.PI); result.sy+=.05*Math.sin(p*Math.PI);
      } else if (t<1.7) {
        const dt=t-1.3,recoil=Math.exp(-dt*11)*Math.sin(dt*28);
        result.sx+=.12*recoil; result.sy-=.15*recoil;
      } else {
        // Proud little bounces with the arms up.
        const bounce=Math.max(0,Math.sin((t-1.7)*12));
        result.y-=3*bounce*envelope; result.sy+=.015*bounce*envelope;
      }
    } else if (action==='yuck') {
      const shake=Math.sin(t*22)*Math.exp(-t*1.2);
      result.r=5*shake*envelope; result.x=-6*shake*envelope;
      result.y+=2*envelope; result.sy-=.02*envelope;
    } else if (action==='jump') {
      // Anticipation, a ballistic arc, then a damped landing and smaller hop.
      for (const {start,takeoff,landing,height} of hops) {
        if(t>=start && t<takeoff) {
          const crouch=Math.sin((t-start)/(takeoff-start)*Math.PI);
          result.sx+=.085*crouch; result.sy-=.12*crouch;
        } else if(t>=takeoff && t<landing) {
          const p=(t-takeoff)/(landing-takeoff);
          result.height=4*height*p*(1-p);
          result.sx-=.032*Math.sin(p*Math.PI);
          result.sy+=.043*Math.sin(p*Math.PI);
          result.r+=2.8*Math.sin(p*Math.PI*2);
        } else if(t>=landing && t<landing+.32) {
          const dt=t-landing,recoil=Math.exp(-dt*12)*Math.sin(dt*30);
          result.sx+=.095*recoil; result.sy-=.12*recoil;
        }
      }
    }
    return result;
  }
  class Spring {
    constructor(value){this.value=value;this.velocity=0;}
    step(target,dt,frequency=20){
      const offset=this.value-target,term=this.velocity+frequency*offset,decay=Math.exp(-frequency*dt);
      this.value=target+(offset+term*dt)*decay;
      this.velocity=(this.velocity-frequency*term*dt)*decay;
      return this.value;
    }
    // A short push, e.g. a small bounce when the drawing changes.
    kick(amount){this.velocity+=amount;}
  }
  return {clamp,smooth,clips,hops,body,Spring};
})();
