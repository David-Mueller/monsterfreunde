'use strict';

// Existing drawings are warped towards matching face/body landmarks before
// blending. In-between frames are rendered at the display refresh rate.
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
        gl_FragColor = mix(a,b,uMix);
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

  capture() {
    if (!this.last) return this.pose(0);
    const {a,b,mix,time,life}=this.last;
    if (mix===0) return a;
    if (mix===1) return b;
    if (!this.supported) return mix<.5?a:b;
    // Render again before copying: the browser may have discarded its backbuffer.
    this.draw(a,b,mix,time,life);
    const gl=this.gl;
    gl.bindTexture(gl.TEXTURE_2D,this.snapshot);
    gl.copyTexImage2D(gl.TEXTURE_2D,0,gl.RGBA,0,0,this.canvas.width,this.canvas.height,0);
    return { frame:-1, offset:[0,0], texture:this.snapshot, rect:[0,1,1,-1],
      points:a.points.map((p,i) => [p[0]+(b.points[i][0]-p[0])*mix,p[1]+(b.points[i][1]-p[1])*mix]) };
  }

  draw(a,b,mix,time=0,life=0) {
    if (a.frame>=0 && a.frame===b.frame && a.texture===b.texture) { b=a; mix=0; }
    this.last={a,b,mix,time,life};
    if (!this.supported) {
      const frame=(mix<.5?a:b).frame;
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
      const middle=a.points.map((p,i) => [p[0]+(b.points[i][0]-p[0])*mix,p[1]+(b.points[i][1]-p[1])*mix]);
      for (let i=0;i<this.grid.length;i++) {
        const [x,y]=this.grid[i];
        let dx=0,dy=0,total=0;
        if (mix>0 && mix<1 && a!==b) {
          for (let j=0;j<middle.length;j++) {
            const q=middle[j],distance=(x-q[0])**2+(y-q[1])**2+.00025;
            const weight=1/(distance*distance);
            dx+=(b.points[j][0]-a.points[j][0])*weight;
            dy+=(b.points[j][1]-a.points[j][1])*weight;
            total+=weight;
          }
          dx/=total; dy/=total;
        }
        const base=i*6;
        this.vertices[base]=x; this.vertices[base+1]=y;
        this.vertices[base+2]=x-dx*mix-a.offset[0];
        this.vertices[base+3]=y-dy*mix-a.offset[1];
        this.vertices[base+4]=x+dx*(1-mix)-b.offset[0];
        this.vertices[base+5]=y+dy*(1-mix)-b.offset[1];
      }
      gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER,0,this.vertices);
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,a.texture);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,b.texture);
    gl.uniform4fv(this.uniforms.uFromRect,a.rect); gl.uniform4fv(this.uniforms.uToRect,b.rect);
    gl.uniform1f(this.uniforms.uMix,mix); gl.uniform2f(this.uniforms.uLife,time,life);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES,this.indexCount,gl.UNSIGNED_SHORT,0);
  }
}

const MonsterMotion = (() => {
  const clamp=value=>Math.max(0,Math.min(1,value));
  const smooth=value=>{const t=clamp(value);return clamp(t*t*t*(t*(t*6-15)+10));};
  // Pose timings are seconds; the renderer supplies all intervening positions.
  const clips={
    settle:[[0,0],[.35,0]],
    blink:[[0,0],[.075,1],[.12,1],[.27,0]],
    wave:[[0,0],[.30,4],[1.02,4],[1.38,0]],
    tickle:[[0,0],[.24,7],[1.36,7],[1.80,0]],
    jump:[[0,0],[.24,5],[.43,6],[.70,6],[.91,0],[1.17,5],[1.34,6],[1.52,6],[1.74,0],[2.05,0]],
    dance:[[0,0],[.34,2],[.90,3],[1.46,2],[2.02,3],[2.58,2],[3.14,3],[3.70,2],[4.18,0]],
  };
  function segment(clip,elapsed) {
    for (let i=1;i<clip.length;i++) {
      if (elapsed<clip[i][0]) return {from:clip[i-1][1],to:clip[i][1],mix:smooth((elapsed-clip[i-1][0])/(clip[i][0]-clip[i-1][0])),first:i===1};
    }
    return {from:0,to:0,mix:0,done:true};
  }
  function body(action,t,duration,clock,key) {
    const speed=key==='pip'?1.18:1;
    const breath=Math.sin(clock*2.1*speed);
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
      for (const [start,takeoff,landing,height] of [[0,.24,.88,62],[.97,1.17,1.71,42]]) {
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
  return {clamp,smooth,clips,segment,body,Spring};
})();
