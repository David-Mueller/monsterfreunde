'use strict';

// In-between frames are computed from the existing drawings with a rigid
// moving-least-squares deformation (Schaefer et al.): landmarks such as hands,
// feet, eyes and mouth act as handles, and the picture around each handle
// rotates and translates as one piece instead of stretching. Only one complete
// drawing is visible at any time; the drawing switches halfway through each
// pose step, when both drawings share the same handle positions.
class MonsterRenderer {
  constructor(root, landmarks) {
    this.root = root;
    this.landmarks = landmarks;
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    root.append(this.canvas);
    this.gl = this.canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: true });
    this.supported = !!this.gl;
    this.last = null;
    this.textures = new Map();
    if (!this.supported) return;
    try { this.init(); } catch (error) { this.supported = false; this.canvas.hidden = true; }
    this.canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.supported = false;
      this.root.classList.remove('rendered');
      this.canvas.hidden = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      try {
        this.textures.clear();
        this.init();
        this.supported = true;
        this.canvas.hidden = false;
        this.setMonster(this.key, this.image);
        this.onRestore?.();
      } catch (error) { this.supported = false; }
    });
  }

  init() {
    const gl = this.gl;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, `
      attribute vec2 aPosition;
      attribute vec2 aFrom;
      attribute vec2 aTo;
      varying vec2 vFrom;
      varying vec2 vTo;
      uniform vec2 uLife;
      void main() {
        vec2 p = aPosition;
        float head = pow(1.0-p.y, 2.0);
        float side = p.x-.5;
        p.x += sin(uLife.x*7.0-p.y*5.0)*head*uLife.y*.008;
        p.y += sin(uLife.x*9.0+side*5.0)*abs(side)*head*uLife.y*.006;
        gl_Position = vec4(p.x*2.0-1.0, 1.0-p.y*2.0, 0.0, 1.0);
        vFrom = aFrom;
        vTo = aTo;
      }
    `);
    const fragment = compile(gl.FRAGMENT_SHADER, `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform sampler2D uFrom;
      uniform sampler2D uTo;
      uniform vec4 uFromRect;
      uniform vec4 uToRect;
      uniform float uMix;
      varying vec2 vFrom;
      varying vec2 vTo;
      vec4 samplePose(sampler2D atlas, vec2 uv, vec4 rect) {
        float inside = step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);
        vec2 safeUV = clamp(uv,vec2(.0015),vec2(.9985));
        return texture2D(atlas,rect.xy+safeUV*rect.zw)*inside;
      }
      void main() {
        vec4 a = samplePose(uFrom,vFrom,uFromRect);
        vec4 b = samplePose(uTo,vTo,uToRect);
        // Exactly one complete illustration is visible at any time; an
        // alpha blend produced faded double limbs on devices. uMix is 0 or 1
        // and both drawings share the same handle positions at the switch.
        float visiblePose = step(0.5, uMix);
        gl_FragColor = mix(a, b, visiblePose);
      }
    `);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertex);
    gl.attachShader(this.program, fragment);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    gl.useProgram(this.program);
    this.uniforms = Object.fromEntries(['uFrom','uTo','uFromRect','uToRect','uMix','uLife'].map(name => [name,gl.getUniformLocation(this.program,name)]));
    gl.uniform1i(this.uniforms.uFrom,0); gl.uniform1i(this.uniforms.uTo,1);
    const steps = 32;
    this.vertices = new Float32Array((steps+1)*(steps+1)*6);
    this.grid = [];
    const indices = [];
    for (let y=0;y<=steps;y++) for (let x=0;x<=steps;x++) {
      this.grid.push([x/steps,y/steps]);
      if (x<steps && y<steps) {
        const a=y*(steps+1)+x,b=a+1,c=a+steps+1,d=c+1;
        indices.push(a,c,b,b,c,d);
      }
    }
    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,this.vertices.byteLength,gl.DYNAMIC_DRAW);
    ['aPosition','aFrom','aTo'].forEach((name,i) => {
      const location=gl.getAttribLocation(this.program,name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location,2,gl.FLOAT,false,24,i*8);
    });
    this.indexBuffer=gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
    this.indexCount=indices.length;
    this.snapshot=this.makeTexture();
    this.lastMeshKey=null;
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
  }

  makeTexture(image) {
    const gl=this.gl,texture=gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    if (image) {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    }
    return texture;
  }

  setMonster(key,image) {
    this.key=key; this.image=image;
    this.last=null; this.lastMeshKey=null;
    if (!this.supported) return;
    if (!this.textures.has(key)) this.textures.set(key,this.makeTexture(image));
    this.root.classList.add('rendered');
  }

  pose(frame) {
    const data=this.landmarks[this.key][frame];
    return { frame, points:data.points, offset:data.offset, texture:this.textures.get(this.key), rect:[frame%4/4,Math.floor(frame/4)/2,.25,.5] };
  }

  // The picture currently on screen, so a new clip continues without a jump.
  capture() {
    if (!this.last) return this.pose(0);
    const {a,b,mix,time,life}=this.last;
    if (mix===0) return a;
    if (mix===1) return b;
    if (!this.supported) return mix<this.cut(a,b)?a:b;
    // Render again before copying: the browser may have discarded its backbuffer.
    this.draw(a,b,mix,time,life);
    const gl=this.gl;
    gl.bindTexture(gl.TEXTURE_2D,this.snapshot);
    gl.copyTexImage2D(gl.TEXTURE_2D,0,gl.RGBA,0,0,this.canvas.width,this.canvas.height,0);
    // The handles of the snapshot are exactly where deform() put them.
    return { frame:-1, offset:[0,0], texture:this.snapshot, rect:[0,1,1,-1],
      points:a.points.map((p,i) => [this.handleX[i],this.handleY[i]]) };
  }

  // Where the visible drawing switches from A to B. Limbs differ in length
  // between drawings; a squeezed long limb still reads fine while a stretched
  // short one smears, so the drawing with the longer limbs gets more time.
  cut(a,b) {
    let total=0,sum=0;
    for (const [limb,pivot] of MonsterRenderer.pivots) {
      if (limb>=a.points.length || pivot>=a.points.length) continue;
      const ra=Math.hypot(a.points[limb][0]-a.points[pivot][0],a.points[limb][1]-a.points[pivot][1]);
      const rb=Math.hypot(b.points[limb][0]-b.points[pivot][0],b.points[limb][1]-b.points[pivot][1]);
      if (ra<1e-3 || rb<1e-3 || Math.abs(rb-ra)<1e-4) continue;
      const weight=Math.abs(Math.log(rb/ra));
      const balanced=Math.exp((2*Math.log(ra)+Math.log(rb))/3);
      total+=weight; sum+=weight*(balanced-ra)/(rb-ra);
    }
    return total ? Math.min(.85,Math.max(.15,sum/total)) : .5;
  }

  // Fills the mesh: every screen point gets the texture coordinate in drawing
  // A and in drawing B that lands there when the handles sit at their
  // in-between positions. Rigid MLS keeps local shapes intact, so an arm turns
  // towards its new place instead of being smeared across the gap.
  deform(a,b,mix) {
    const pivots=MonsterRenderer.pivots,joints=MonsterRenderer.joints;
    const base=a.points.length,count=base+pivots.length*joints.length;
    if (!this.handleX || this.handleX.length!==count) {
      for (const name of ['handleX','handleY','fromX','fromY','toX','toY','handleWeights']) this[name]=new Float64Array(count);
    }
    const {handleX:hx,handleY:hy,fromX:ax,fromY:ay,toX:bx,toY:by,handleWeights:weights}=this;
    const warp=mix>0 && mix<1 && a!==b;
    for (let j=0;j<base;j++) {
      ax[j]=a.points[j][0]; ay[j]=a.points[j][1]; bx[j]=b.points[j][0]; by[j]=b.points[j][1];
      hx[j]=ax[j]+(bx[j]-ax[j])*mix; hy[j]=ay[j]+(by[j]-ay[j])*mix;
    }
    // Hands and feet swing around their shoulder or hip instead of sliding on
    // a straight line, which would fold the limb over itself halfway. Extra
    // joints along each limb make it turn and shorten evenly like a bone.
    pivots.forEach(([limb,pivot],k) => {
      const px=hx[pivot],py=hy[pivot];
      const dax=ax[limb]-px,day=ay[limb]-py,dbx=bx[limb]-px,dby=by[limb]-py;
      const ra=Math.hypot(dax,day),rb=Math.hypot(dbx,dby);
      if (ra>1e-4 && rb>1e-4) {
        const ta=Math.atan2(day,dax);
        let turn=Math.atan2(dby,dbx)-ta;
        turn-=Math.round(turn/(2*Math.PI))*2*Math.PI;
        const angle=ta+turn*mix,radius=ra+(rb-ra)*mix;
        hx[limb]=px+Math.cos(angle)*radius; hy[limb]=py+Math.sin(angle)*radius;
      }
      joints.forEach((fraction,q) => {
        const j=base+k*joints.length+q;
        ax[j]=px+dax*fraction; ay[j]=py+day*fraction;
        bx[j]=px+dbx*fraction; by[j]=py+dby*fraction;
        hx[j]=px+(hx[limb]-px)*fraction; hy[j]=py+(hy[limb]-py)*fraction;
      });
    });
    for (let i=0;i<this.grid.length;i++) {
      const [x,y]=this.grid[i],vertex=i*6;
      let ux=x,uy=y,vx=x,vy=y;
      if (warp) {
        let sum=0,cx=0,cy=0,cax=0,cay=0,cbx=0,cby=0;
        for (let j=0;j<count;j++) {
          const d=(x-hx[j])**2+(y-hy[j])**2+1e-6,w=1/(d*d);
          weights[j]=w; sum+=w; cx+=w*hx[j]; cy+=w*hy[j];
          cax+=w*ax[j]; cay+=w*ay[j]; cbx+=w*bx[j]; cby+=w*by[j];
        }
        cx/=sum; cy/=sum; cax/=sum; cay/=sum; cbx/=sum; cby/=sum;
        const dx=x-cx,dy=y-cy,length=Math.hypot(dx,dy);
        let fax=0,fay=0,fbx=0,fby=0;
        for (let j=0;j<count;j++) {
          const px=hx[j]-cx,py=hy[j]-cy;
          const dot=(px*dx+py*dy)*weights[j],cross=(px*dy-py*dx)*weights[j];
          const qax=ax[j]-cax,qay=ay[j]-cay,qbx=bx[j]-cbx,qby=by[j]-cby;
          fax+=qax*dot-qay*cross; fay+=qax*cross+qay*dot;
          fbx+=qbx*dot-qby*cross; fby+=qbx*cross+qby*dot;
        }
        const la=Math.hypot(fax,fay)||1,lb=Math.hypot(fbx,fby)||1;
        ux=cax+length*fax/la; uy=cay+length*fay/la;
        vx=cbx+length*fbx/lb; vy=cby+length*fby/lb;
      }
      this.vertices[vertex]=x; this.vertices[vertex+1]=y;
      this.vertices[vertex+2]=ux-a.offset[0]; this.vertices[vertex+3]=uy-a.offset[1];
      this.vertices[vertex+4]=vx-b.offset[0]; this.vertices[vertex+5]=vy-b.offset[1];
    }
  }

  draw(a,b,mix,time=0,life=0) {
    if (a.frame>=0 && a.frame===b.frame && a.texture===b.texture) { b=a; mix=0; }
    this.last={a,b,mix,time,life};
    const visible=mix>0 && mix>=this.cut(a,b) ? 1 : 0;
    if (!this.supported) {
      const frame=(visible?b:a).frame;
      if (frame>=0) this.root.style.backgroundPosition=`${frame%4*100/3}% ${Math.floor(frame/4)*100}%`;
      return;
    }
    const gl=this.gl;
    const size=Math.max(1,Math.round(this.root.clientWidth*Math.min(window.devicePixelRatio||1,1.5)));
    if (this.canvas.width!==size) { this.canvas.width=size; this.canvas.height=size; }
    gl.viewport(0,0,size,size);
    gl.useProgram(this.program);
    const meshKey=`${this.key}:${a.frame}:${b.frame}:${mix}`;
    if (meshKey!==this.lastMeshKey || a.frame<0 || b.frame<0) {
      this.lastMeshKey=meshKey;
      this.deform(a,b,mix);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,this.vertices);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,a.texture);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,b.texture);
    gl.uniform4fv(this.uniforms.uFromRect,a.rect); gl.uniform4fv(this.uniforms.uToRect,b.rect);
    gl.uniform1f(this.uniforms.uMix,visible); gl.uniform2f(this.uniforms.uLife,time,life);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES,this.indexCount,gl.UNSIGNED_SHORT,0);
  }
}

// Landmark indices from scripts/prepare-motion.py: hands 12/13 belong to the
// shoulder anchors 19/20, feet 14/15 to the hip anchors 23/24.
MonsterRenderer.pivots=[[12,19],[13,20],[14,23],[15,24]];
// Virtual joints, as fractions of the way from the anchor to the hand or foot.
MonsterRenderer.joints=[1/3,2/3];

const MonsterMotion = (() => {
  const clamp=value=>Math.max(0,Math.min(1,value));
  const smooth=value=>{const t=clamp(value);return clamp(t*t*t*(t*(t*6-15)+10));};
  // Two hops: crouch from `start`, airborne between `takeoff` and `landing`.
  const hops=[{start:0,takeoff:.24,landing:.88,height:62},{start:.97,takeoff:1.17,landing:1.71,height:42}];
  // `keys` are [seconds, pose]; the renderer computes every frame in between.
  // `still` is the pose shown when motion is reduced, `moments` are named
  // instants (seconds) that sounds and effects can hook into.
  const clips={
    settle:{keys:[[0,0],[.35,0]],still:0,moments:[]},
    blink:{keys:[[0,0],[.075,1],[.12,1],[.27,0]],still:0,moments:[]},
    wave:{keys:[[0,0],[.30,4],[1.02,4],[1.38,0]],still:4,moments:[{at:.30,kind:'wave'}]},
    tickle:{keys:[[0,0],[.24,7],[1.36,7],[1.80,0]],still:7,moments:[{at:.10,kind:'giggle'},{at:.62,kind:'giggle'},{at:1.05,kind:'giggle'}]},
    jump:{keys:[[0,0],[.24,5],[.43,6],[.70,6],[.91,0],[1.17,5],[1.34,6],[1.52,6],[1.74,0],[2.05,0]],still:5,
      moments:hops.flatMap(hop => [{at:hop.takeoff,kind:'takeoff'},{at:hop.landing,kind:'land'}])},
    dance:{keys:[[0,0],[.34,2],[.90,3],[1.46,2],[2.02,3],[2.58,2],[3.14,3],[3.70,2],[4.18,0]],still:3,
      moments:[.34,.90,1.46,2.02,2.58,3.14,3.70].map(at => ({at,kind:'beat'}))},
  };
  for (const clip of Object.values(clips)) clip.duration=clip.keys[clip.keys.length-1][0];
  function segment(clip,elapsed) {
    const keys=clip.keys;
    for (let i=1;i<keys.length;i++) {
      if (elapsed<keys[i][0]) return {from:keys[i-1][1],to:keys[i][1],mix:smooth((elapsed-keys[i-1][0])/(keys[i][0]-keys[i-1][0])),first:i===1};
    }
    return {from:0,to:0,mix:0,done:true};
  }
  // Whole-body transform for the current instant: idle breathing plus the
  // action's sway, giggle, or ballistic hop. `tempo` scales the breathing.
  function body(action,t,duration,clock,tempo=1) {
    const breath=Math.sin(clock*2.1*tempo);
    const result={x:0,y:-.35*(breath+1),r:.3*Math.sin(clock*.9),sx:1+.006*breath,sy:1-.008*breath,height:0,life:.16};
    if (!action || action==='blink') return result;
    const envelope=smooth(t/.22)*smooth((duration-t)/.38);
    result.life+=envelope*.8;
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
    } else if (action==='wave') {
      result.r=1.7*Math.sin(t*8)*envelope;
      result.y-=1.5*Math.sin(t*7)*envelope;
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
  }
  return {clamp,smooth,clips,hops,segment,body,Spring};
})();
