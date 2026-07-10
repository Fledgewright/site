/* Fledgewright rebrand sky — living clouds from baked keyframes.
   All realism is baked offline (make_cloud_plates.py) into two data textures:
   R = cloud density (silhouette threshold at 0.5), G = brightness, B = ember-hot mask.
   This shader mixes DENSITY between the keyframes and re-thresholds, so the
   silhouette itself moves: thin cloud evaporates, lumps reform — a true morph,
   not a crossfade — then drifts the whole field. The far layer and the static
   near plate stay in CSS; the CSS near layer is the no-WebGL fallback.
   Local rebrand test only. */
(function () {
  var CLOUDS_OFF = true; // 2026-07-10: clouds paused pending workshop — gradient-only
                         // sky. Set false to bring the living clouds back.
  if (CLOUDS_OFF) return;
  var host = document.getElementById('sky');
  var fallback = document.querySelector('.sky-near');
  if (!host || !fallback) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'sky-morph';
  host.insertBefore(canvas, fallback);
  var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, antialias: false })
        || canvas.getContext('experimental-webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) { host.removeChild(canvas); return; } // CSS drift fallback stays

  var TILE = 1560;          // css px per tile, matches the fallback background-size
  var DRIFT = TILE / 380;   // css px per second, matches the fallback 380s loop
  var PERIOD = 120;         // seconds for a full evaporate-and-reform ping-pong
  var WAMP = 0.03;          // warp amplitude in tile-UV units (~47 css px)
  var WSLIDE = [0.0019, 0.00075]; // warp field slide, uv/s — differs from the drift
                                  // velocity, so shapes deform (the old morph's trick)
  var WSLIDE2 = [0.0055, 0.0022]; // fine boil-warp slide, uv/s — faster than WSLIDE
                                  // but tiny amplitude: lump edges churn in place
  var BSLIDE = [0.00045, -0.0002]; // keyframe B slides relative to A, uv/s: the mix
                                  // source itself keeps changing, so the density morph
                                  // never parks at the ping-pong turnarounds

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  var FRAG = [
    'precision mediump float;',
    'uniform sampler2D u_a,u_b,u_warp; uniform vec2 u_res,u_woff,u_woff2,u_boff;',
    'uniform float u_tile,u_x,u_w,u_wamp;',
    'void main(){',
    ' vec2 css=vec2(gl_FragCoord.x,u_res.y-gl_FragCoord.y);',
    ' vec2 uv=vec2((css.x+u_x)/u_tile,-css.y/u_tile);', // REPEAT wraps negatives
    // graft of the first shader's living motion: a warp field slides across the
    // cloud field, so billows continuously deform instead of translating rigidly.
    // second sample at 3x frequency = slow edge boil (convective churn, not slide)
    ' vec2 wrp=(texture2D(u_warp,uv+u_woff).rg-.5)*u_wamp',
    '        +(texture2D(u_warp,uv*3.+u_woff2).rg-.5)*u_wamp*0.4;',
    ' uv+=wrp;',
    ' vec3 A=texture2D(u_a,uv).rgb, B=texture2D(u_b,uv+u_boff).rgb;',
    ' float d=mix(A.r,B.r,u_w);',              // mixed density...
    // feathered silhouette: translucent fringe around a solid core (video look)
    ' float a=0.5*smoothstep(0.46,0.60,d)+0.5*smoothstep(0.58,0.70,d);',
    ' float l=mix(A.g,B.g,u_w), hot=mix(A.b,B.b,u_w);',
    // same three-stop ramp as the bake: white -> gray-blue -> slate
    ' float dk=1.-l;',
    ' vec3 c=mix(vec3(.99,.985,.972),vec3(.655,.705,.785),smoothstep(.10,.58,dk));',
    ' c=mix(c,vec3(.115,.150,.215),smoothstep(.48,1.,dk));',
    ' c=mix(c,c*vec3(1.,.86,.62),.55*hot);',   // ember kiss on the hottest linings
    ' gl_FragColor=vec4(c,a);',
    '}'
  ].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); }
    return s;
  }
  var prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog); gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var U = {};
  ['u_a','u_b','u_warp','u_res','u_woff','u_woff2','u_boff','u_tile','u_x','u_w','u_wamp']
    .forEach(function (k) { U[k] = gl.getUniformLocation(prog, k); });

  // keyframe textures (2048 = POT, so REPEAT wrapping is available)
  var loaded = 0;
  function texture(unit, src) {
    var t = gl.createTexture();
    var img = new Image();
    img.onload = function () {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      loaded++;
      if (loaded === 3) { host.classList.add('sky-gl'); start(); draw(0); }
    };
    img.src = src;
    return t;
  }
  var VER = '?v=1'; // bump after every re-bake or the browser serves stale plates
  texture(0, '/assets/img/cloud-morph-a.webp' + VER);
  texture(1, '/assets/img/cloud-morph-b.webp' + VER);
  texture(2, '/assets/img/cloud-warp.webp' + VER);

  var dpr = 1;
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.floor(window.innerWidth * dpr);
    var h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h);
    }
  }
  window.addEventListener('resize', resize);

  function draw(t) {
    if (loaded < 3) return;
    resize();
    var s = t * 0.001;
    var w = 0.5 - 0.5 * Math.cos(2 * Math.PI * s / PERIOD); // slow ping-pong A<->B
    if (window.__SKY_W != null) w = window.__SKY_W;          // local tuning hook
    var amp = (window.__SKY_AMP != null) ? window.__SKY_AMP : WAMP;
    gl.useProgram(prog);
    gl.uniform1i(U.u_a, 0); gl.uniform1i(U.u_b, 1); gl.uniform1i(U.u_warp, 2);
    gl.uniform2f(U.u_res, canvas.width, canvas.height);
    gl.uniform2f(U.u_woff, s * WSLIDE[0], s * WSLIDE[1]);
    gl.uniform2f(U.u_woff2, s * WSLIDE2[0], s * WSLIDE2[1]);
    gl.uniform2f(U.u_boff, s * BSLIDE[0], s * BSLIDE[1]);
    gl.uniform1f(U.u_tile, TILE * dpr);
    gl.uniform1f(U.u_x, s * DRIFT * dpr);
    gl.uniform1f(U.u_w, w);
    gl.uniform1f(U.u_wamp, amp);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // --- run/pause discipline (mobile + reduced motion stay static) ---
  var raf = null, running = false, onScreen = true;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  // freeze only on true touch devices, not on any narrow desktop window
  var small = window.matchMedia && window.matchMedia('(max-width: 720px) and (pointer: coarse)');
  function still() { return (reduce && reduce.matches) || (small && small.matches); }
  function frame(t) { draw(t); raf = requestAnimationFrame(frame); }
  function start() {
    if (running || still() || document.hidden || !onScreen) return;
    running = true; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

  document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (e) {
      onScreen = e[0].isIntersecting; onScreen ? start() : stop();
    }).observe(canvas);
  }
  [reduce, small].forEach(function (mq) {
    if (mq) mq.addEventListener('change', function () { still() ? (stop(), draw(0)) : start(); });
  });
})();
