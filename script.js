// ============================================================
// THRUST CINEMA — Shared Scripts
// ============================================================

// Nav shrink on scroll
(function() {
  const nav = document.getElementById('nav');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('shrink', window.scrollY > 60);
  });
})();

// Reveal on scroll
(function() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('in');
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
})();

// Newsletter handler (homepage)
function handleSubscribe() {
  const email = document.getElementById('emailInput').value;
  const note = document.getElementById('formNote');
  if (!email || !email.includes('@')) {
    note.textContent = 'Please enter a valid email.';
    note.style.color = 'var(--accent)';
    return;
  }
  note.textContent = 'Thanks. We\'ll be in touch when the first film drops.';
  note.style.color = 'var(--fg-dim)';
  document.getElementById('emailInput').value = '';
}

// Contact form handler — submits to Formspree
async function handleContactSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('contactForm');
  const status = document.getElementById('formStatus');
  const submitBtn = form.querySelector('button[type="submit"]');

  // Basic validation
  const data = new FormData(form);
  const name = data.get('name');
  const email = data.get('email');
  const message = data.get('message');

  if (!name || !email || !message) {
    status.textContent = 'Please fill in all required fields.';
    status.style.color = 'var(--accent)';
    return;
  }
  if (!email.includes('@')) {
    status.textContent = 'Please enter a valid email.';
    status.style.color = 'var(--accent)';
    return;
  }

  // Check that Formspree is configured
  if (form.action.includes('YOUR_FORMSPREE_ID')) {
    status.textContent = 'Form not yet configured. See contact.html instructions.';
    status.style.color = 'var(--accent)';
    return;
  }

  // Submit
  submitBtn.disabled = true;
  submitBtn.textContent = 'Sending...';
  status.textContent = '';

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      status.textContent = 'Thanks. We\'ll get back to you within 48 hours.';
      status.style.color = 'var(--fg-dim)';
      form.reset();
      submitBtn.textContent = 'Sent ✓';
      setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Message →';
      }, 3000);
    } else {
      throw new Error('Form submission failed');
    }
  } catch (err) {
    status.textContent = 'Could not send right now. Email hello@thrustcinema.com directly.';
    status.style.color = 'var(--accent)';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Send Message →';
  }
}

// ============================================================
// WEBGL HERO RENDERER — common scaffolding
// Each page calls initWebGL() with its own fragment shader
// ============================================================
function initWebGL(canvasId, fragmentShader) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { canvas.style.display = 'none'; return; }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  const vsSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = compileShader(gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl.FRAGMENT_SHADER, fragmentShader);
  if (!vs || !fs) { canvas.style.display = 'none'; return; }

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1,  -1, 1,
    -1,  1,  1, -1,   1, 1
  ]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, 'u_resolution');
  const uTime = gl.getUniformLocation(program, 'u_time');
  const uMouse = gl.getUniformLocation(program, 'u_mouse');

  let mouseX = 0, mouseY = 0;
  canvas.parentElement.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouseY = (canvas.height - (e.clientY - rect.top) * (canvas.height / rect.height));
  });

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let start = performance.now();
  let rafId;
  let visible = true;
  const heroSection = canvas.closest('.hero') || canvas.parentElement;
  const visObserver = new IntersectionObserver((entries) => {
    visible = entries[0].isIntersecting;
    if (visible && !rafId) render();
  }, { threshold: 0 });
  visObserver.observe(heroSection);

  function render() {
    if (!visible) { rafId = null; return; }
    const t = (performance.now() - start) / 1000;
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, t);
    gl.uniform2f(uMouse, mouseX || canvas.width / 2, mouseY || canvas.height / 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    rafId = requestAnimationFrame(render);
  }
  render();
}

// ============================================================
// SHADER 1: HOME — flowing red energy field
// ============================================================
const SHADER_HOME = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }
  float fbm(vec2 p) {
    float v = 0.0; float a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
    return v;
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;
    float t = u_time * 0.08;
    vec2 mouse = (u_mouse / u_resolution.xy) * 2.0 - 1.0;
    mouse.x *= u_resolution.x / u_resolution.y;

    vec2 p = uv * 1.5;
    float n1 = fbm(p + vec2(t, t * 0.7));
    float n2 = fbm(p + vec2(n1 * 2.0, -t));
    float field = fbm(p + vec2(n2, n1) * 1.5);

    float dist = length(uv - mouse * 0.5);
    float mouseGlow = exp(-dist * 1.5) * 0.15;
    float centerGlow = exp(-length(uv) * 0.8) * 0.4;
    float vignette = smoothstep(1.4, 0.4, length(uv));

    vec3 red = vec3(1.0, 0.18, 0.18);
    vec3 dark = vec3(0.02, 0.0, 0.0);
    float intensity = field * 0.7 + centerGlow + mouseGlow;
    intensity = pow(intensity, 1.8);
    vec3 color = mix(dark, red, intensity);
    color *= vignette;
    color += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.02;
    gl_FragColor = vec4(color, intensity * 0.85);
  }
`;

// ============================================================
// SHADER 2: ABOUT — vertical motion-blur light streaks
// (evokes long exposure, headlights at speed)
// ============================================================
const SHADER_ABOUT = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float hash1(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    vec2 p = uv * 2.0 - 1.0;
    p.x *= u_resolution.x / u_resolution.y;

    // Vertical streaks - many thin lines moving downward
    float streaks = 0.0;
    for (int i = 0; i < 14; i++) {
      float fi = float(i);
      float seed = hash1(fi * 7.13);
      float xpos = (seed - 0.5) * 3.5;
      float speed = 0.3 + hash1(fi * 3.7) * 0.9;
      float thickness = 0.001 + hash1(fi * 5.1) * 0.004;
      float yOffset = mod(u_time * speed + seed * 10.0, 4.0) - 2.0;
      float dx = abs(p.x - xpos);
      float dy = p.y - yOffset;
      // Streak shape: long vertical line with falloff at top
      float line = exp(-dx * dx / thickness) * smoothstep(-0.8, 0.8, dy) * smoothstep(1.5, -0.5, dy);
      streaks += line;
    }

    // Mouse-reactive subtle glow
    vec2 mouse = (u_mouse / u_resolution.xy) * 2.0 - 1.0;
    mouse.x *= u_resolution.x / u_resolution.y;
    float mouseGlow = exp(-length(p - mouse * 0.5) * 2.0) * 0.2;

    float vignette = smoothstep(1.6, 0.3, length(p));

    vec3 red = vec3(1.0, 0.2, 0.2);
    vec3 white = vec3(1.0, 0.9, 0.85);
    vec3 color = mix(red * 0.5, white, streaks * 0.5);
    color *= (streaks + mouseGlow);
    color *= vignette;

    float alpha = (streaks * 0.7 + mouseGlow) * 0.9;
    gl_FragColor = vec4(color, alpha);
  }
`;

// ============================================================
// SHADER 3: CONTACT — radial pulse / signal waves from cursor
// ============================================================
const SHADER_CONTACT = `
  precision mediump float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform vec2 u_mouse;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

  void main() {
    vec2 uv = (gl_FragCoord.xy / u_resolution.xy) * 2.0 - 1.0;
    uv.x *= u_resolution.x / u_resolution.y;

    vec2 mouse = (u_mouse / u_resolution.xy) * 2.0 - 1.0;
    mouse.x *= u_resolution.x / u_resolution.y;

    // Concentric pulse rings emanating from cursor (or center idle)
    float dist = length(uv - mouse * 0.4);
    float rings = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float ringRadius = mod(u_time * 0.4 + fi * 0.5, 2.0);
      float ringWidth = 0.015;
      float ring = exp(-pow(dist - ringRadius, 2.0) / (ringWidth * ringWidth)) * (1.0 - ringRadius * 0.5);
      rings += ring;
    }

    // Static radial gradient base
    float radial = exp(-dist * 0.7) * 0.3;

    // Subtle horizontal scan
    float scan = sin(uv.y * 30.0 + u_time * 0.5) * 0.02 + 0.98;

    float vignette = smoothstep(1.5, 0.4, length(uv));

    vec3 red = vec3(1.0, 0.18, 0.18);
    vec3 dark = vec3(0.02, 0.0, 0.0);
    float intensity = (rings * 0.6 + radial) * scan;
    intensity = pow(intensity, 1.4);

    vec3 color = mix(dark, red, intensity);
    color *= vignette;
    color += (hash(gl_FragCoord.xy + u_time) - 0.5) * 0.015;

    gl_FragColor = vec4(color, intensity * 0.85);
  }
`;

// Auto-init based on what canvas is present on the page
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('canvas-home')) initWebGL('canvas-home', SHADER_HOME);
  if (document.getElementById('canvas-about')) initWebGL('canvas-about', SHADER_ABOUT);
  if (document.getElementById('canvas-contact')) initWebGL('canvas-contact', SHADER_CONTACT);

  // Load YouTube videos if the films grid exists
  if (document.getElementById('films-grid')) loadYouTubeVideos();
});

// ============================================================
// YOUTUBE AUTO-EMBED
// Fetches the latest videos from the @thrustcinema channel via
// our own Vercel serverless function at /api/youtube.
//
// Channel ID is configured server-side in /api/youtube.js
// To use a different channel, edit that file (not this one).
// ============================================================
const YOUTUBE_API = '/api/youtube';

async function loadYouTubeVideos() {
  const grid = document.getElementById('films-grid');
  const shortsGrid = document.getElementById('shorts-grid');
  const shortsSection = document.getElementById('shorts-section');
  const loading = document.getElementById('films-loading');

  try {
    const res = await fetch(YOUTUBE_API);
    if (!res.ok) throw new Error('Feed unavailable');
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      // Channel exists but has no videos yet — keep the placeholders.
      if (loading) loading.style.display = 'none';
      return;
    }

    // Classify videos: shorts vs regular.
    // RSS doesn't expose duration or aspect ratio, so we infer Shorts from
    // either the #shorts hashtag in the title/description, or the YouTube
    // convention of marking them. Once you upload, this works automatically.
    const items = data.items.map(parseVideoItem);
    const shorts = items.filter(v => v.isShort);
    const films = items.filter(v => !v.isShort);

    // Clear placeholders
    if (loading) loading.style.display = 'none';
    grid.innerHTML = '';

    // Show up to 4 latest films
    const filmsToShow = films.length > 0 ? films.slice(0, 4) : items.slice(0, 4);
    filmsToShow.forEach((video, i) => {
      grid.appendChild(createFilmCard(video, i + 1, false));
    });

    // Show shorts row if we have any
    if (shorts.length > 0 && shortsGrid && shortsSection) {
      shortsSection.style.display = 'block';
      shortsGrid.innerHTML = '';
      shorts.slice(0, 4).forEach((video, i) => {
        shortsGrid.appendChild(createFilmCard(video, i + 1, true));
      });
    }
  } catch (err) {
    console.warn('Could not load YouTube videos:', err);
    // Leave placeholders in place — graceful fallback.
    // The /api/youtube endpoint only exists when deployed to Vercel,
    // so in local dev (file:// or python -m http.server) this will always
    // fail and that's fine. Once you push to Vercel, it activates.
    if (loading) {
      loading.textContent = 'Auto-feed activates once deployed to Vercel';
      loading.style.opacity = '0.5';
    }
  }
}

function parseVideoItem(item) {
  const id = item.id;
  const title = item.title || 'Untitled';
  const description = item.description || '';
  const isShort = /#shorts?\b/i.test(title) || /#shorts?\b/i.test(description);
  // Best thumbnail: maxresdefault (1280×720), fallback to hqdefault if not generated yet
  const thumbnail = `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
  const thumbnailFallback = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  // Pull category tag out of the title if user uses [Tag] format, e.g. "[Automotive] Night Tracks"
  const tagMatch = title.match(/^\[([^\]]+)\]/);
  const tag = tagMatch ? tagMatch[1] : (isShort ? 'Short' : 'Film');
  const cleanTitle = title.replace(/^\[[^\]]+\]\s*/, '').replace(/#shorts?\b/gi, '').trim();
  return { id, title: cleanTitle, tag, isShort, thumbnail, thumbnailFallback };
}

function createFilmCard(video, num, isShort) {
  const card = document.createElement('div');
  card.className = isShort ? 'short reveal in' : 'film reveal in';
  card.dataset.videoId = video.id;
  card.dataset.short = isShort ? '1' : '0';
  card.innerHTML = `
    <div class="film-thumb">
      <img class="film-thumb-img" src="${video.thumbnail}" alt="${escapeHtml(video.title)}"
           onerror="this.onerror=null;this.src='${video.thumbnailFallback}';" />
    </div>
    <div class="film-play"></div>
    <div class="film-overlay">
      <div class="film-meta">
        <div class="film-tag">${escapeHtml(video.tag)}</div>
        <div class="film-title">${escapeHtml(video.title)}</div>
      </div>
    </div>
  `;
  card.addEventListener('click', () => openLightbox(video.id, isShort));
  return card;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ============================================================
// LIGHTBOX
// Plays the video in a modal overlay
// ============================================================
function openLightbox(videoId, isShort) {
  let lb = document.getElementById('lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'lightbox';
    lb.className = 'lightbox';
    lb.innerHTML = `
      <button class="lightbox-close" aria-label="Close">×</button>
      <div class="lightbox-content"></div>
    `;
    document.body.appendChild(lb);
    lb.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });
  }
  const content = lb.querySelector('.lightbox-content');
  content.classList.toggle('short-mode', isShort);
  content.innerHTML = `<iframe
    src="https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen></iframe>`;
  requestAnimationFrame(() => lb.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.classList.remove('open');
  setTimeout(() => {
    lb.querySelector('.lightbox-content').innerHTML = '';
    document.body.style.overflow = '';
  }, 300);
}
