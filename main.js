import * as THREE from 'three';

const $ = (selector) => document.querySelector(selector);
const root = $('#scene-root');
const fade = $('#scene-fade');
const intro = $('#intro');
const loading = $('#loading');
const portal = $('#portal-button');
const portalWrap = $('.portal-wrap');
const toast = $('#toast');
const spiritEl = $('#spirit-effect');
const soundButton = $('#sound-button');
const backButton = $('#back-button');
const sceneIndicator = $('#scene-indicator');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {
  place: 'exterior', started: false, transitioning: false,
  yaw: 0.70, pitch: -0.02, targetYaw: 0.70, targetPitch: -0.02,
  fov: 80, targetFov: 80, auroraEnd: 0, auroraStrength: 0,
  spiritEnd: 0, meteorEnd: 0, audioOn: false, toastTimer: 0,
};

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
root.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(state.fov, window.innerWidth / window.innerHeight, 0.05, 160);
camera.rotation.order = 'YXZ';
scene.add(camera);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();

const panoGeometry = new THREE.SphereGeometry(100, 96, 64);
panoGeometry.scale(-1, 1, 1);
const panoMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xffffff });
const pano = new THREE.Mesh(panoGeometry, panoMaterial);
scene.add(pano);

const auroraMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false,
  side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uStrength: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime;
    uniform float uStrength;
    void main(){
      float u=vUv.x;
      float v=vUv.y;
      float sweep=0.77+0.055*sin(u*15.0+uTime*0.17)+0.025*sin(u*36.0-uTime*0.25);
      float veil=exp(-pow((v-sweep)/0.15,2.0));
      float fringes=0.56+0.44*sin(u*104.0+sin(u*19.0+uTime*0.23)*2.5);
      float breath=0.76+0.24*sin(uTime*0.55+u*11.0);
      float horizon=smoothstep(0.57,0.67,v)*(1.0-smoothstep(0.95,1.0,v));
      float alpha=veil*fringes*breath*horizon*uStrength*0.9;
      vec3 mint=vec3(0.19,0.95,0.67);
      vec3 violet=vec3(0.43,0.35,0.91);
      vec3 color=mix(mint,violet,smoothstep(0.73,0.89,v)*0.58+0.16*sin(u*9.0));
      gl_FragColor=vec4(color,alpha);
    }`,
});
const aurora = new THREE.Mesh(new THREE.SphereGeometry(95, 96, 48).scale(-1, 1, 1), auroraMaterial);
scene.add(aurora);

function makeGlowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.24, 'rgba(255,255,255,.88)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}
const glowTexture = makeGlowTexture();

function createParticles(count, color, size, area) {
  const positions = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - .5) * area;
    positions[i * 3 + 1] = (Math.random() - .5) * area * .6;
    positions[i * 3 + 2] = (Math.random() - .5) * area;
    speed[i] = .12 + Math.random() * .28;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color, size, map: glowTexture, transparent: true, opacity: .75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  return { points, positions, speed, area, count };
}

const snow = createParticles(reducedMotion ? 75 : 360, 0xdbeeff, .14, 17);
const motes = createParticles(reducedMotion ? 35 : 125, 0xffd797, .105, 12);
motes.points.visible = false;

const meteorCanvas = document.createElement('canvas');
meteorCanvas.className = 'meteor-canvas';
meteorCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3';
root.after(meteorCanvas);
const meteorCtx = meteorCanvas.getContext('2d');
let meteorWidth = 0, meteorHeight = 0, meteorDpr = 1;
let meteors = [];
let glints = [];

function sizeMeteorCanvas() {
  meteorDpr = Math.min(window.devicePixelRatio || 1, 2);
  meteorWidth = window.innerWidth; meteorHeight = window.innerHeight;
  meteorCanvas.width = Math.round(meteorWidth * meteorDpr);
  meteorCanvas.height = Math.round(meteorHeight * meteorDpr);
  meteorCtx.setTransform(meteorDpr, 0, 0, meteorDpr, 0, 0);
}
sizeMeteorCanvas();

function showToast(message) {
  clearTimeout(state.toastTimer);
  toast.textContent = message;
  toast.classList.add('show');
  state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2700);
}

let textures = {};
async function loadAssets() {
  const loader = new THREE.TextureLoader();
  const [exterior, interior] = await Promise.all([
    loader.loadAsync('./assets/exterior.png'),
    loader.loadAsync('./assets/interior.png'),
  ]);
  for (const texture of [exterior, interior]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  textures = { exterior, interior };
  panoMaterial.map = exterior; panoMaterial.needsUpdate = true;
  $('#enter-button').disabled = false;
  loading.classList.add('hidden');
}

const sceneData = {
  exterior: {
    yaw: .70, pitch: -.018, fov: 80, portalU: .637, portalY: .565,
    eyebrow: 'SWISS ALPS · BLUE HOUR', title: '暮雪礼拜堂',
    copy: '在阿尔卑斯的雪夜停一会。<br />越过灯光，走进安静的礼拜堂。',
    coord: 'SWISS ALPS <span>／</span> A MOMENT OF STILLNESS',
    indicator: '雪夜外景', portalLabel: '进入礼拜堂', chapter: '01',
  },
  interior: {
    yaw: 1.55, pitch: -.015, fov: 70, portalU: .505, portalY: .535,
    eyebrow: 'THE CHAPEL · CANDLELIGHT', title: '光在静处',
    copy: '雪落在窗外，烛光留在室内。<br />靠近圣坛，听见一段安静。',
    coord: 'A QUIET PLACE <span>／</span> LIGHT WITHIN',
    indicator: '烛光内景', portalLabel: '靠近圣坛', chapter: '02',
  },
};

function applySceneUi(place) {
  const data = sceneData[place];
  $('#scene-eyebrow').textContent = data.eyebrow;
  $('#scene-title').textContent = data.title;
  $('#scene-copy').innerHTML = data.copy;
  $('#scene-coord').innerHTML = data.coord;
  sceneIndicator.innerHTML = `<span class="status-dot"></span> ${data.indicator}`;
  $('#portal-label').textContent = data.portalLabel;
  $('#chapter-number').textContent = data.chapter;
  backButton.hidden = place !== 'interior';
}

function angularDifference(a, b) { return Math.atan2(Math.sin(a - b), Math.cos(a - b)); }
function imageDirection(u, y) {
  const phi = u * Math.PI * 2;
  const theta = y * Math.PI;
  return new THREE.Vector3(Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
}

function positionPortal() {
  if (!state.started || state.transitioning) { portalWrap.style.opacity = '0'; portalWrap.style.pointerEvents = 'none'; return; }
  const data = sceneData[state.place];
  const direction = imageDirection(data.portalU, data.portalY);
  const forward = new THREE.Vector3(); camera.getWorldDirection(forward);
  const visible = direction.dot(forward) > .55;
  if (!visible) { portalWrap.style.opacity = '0'; portalWrap.style.pointerEvents = 'none'; return; }
  const point = direction.multiplyScalar(90).project(camera);
  const x = (point.x * .5 + .5) * 100;
  const y = (-point.y * .5 + .5) * 100;
  const within = x > 7 && x < 93 && y > 15 && y < 80;
  portalWrap.style.opacity = within ? '1' : '0';
  portalWrap.style.pointerEvents = within ? 'auto' : 'none';
  portalWrap.style.left = `${x}%`;
  portalWrap.style.top = `${y}%`;
}

function focusDirection(direction, fov = 45) {
  state.targetYaw = Math.atan2(-direction.x, -direction.z);
  state.targetPitch = THREE.MathUtils.clamp(Math.asin(direction.y), -.88, .88);
  state.targetFov = fov;
}

async function switchPlace(place) {
  if (state.transitioning || place === state.place || !textures[place]) return;
  state.transitioning = true;
  fade.classList.add('active');
  await new Promise(resolve => setTimeout(resolve, 680));
  state.place = place;
  panoMaterial.map = textures[place]; panoMaterial.needsUpdate = true;
  snow.points.visible = place === 'exterior';
  motes.points.visible = place === 'interior';
  if (place === 'interior') { state.auroraEnd = 0; state.meteorEnd = 0; meteors = []; }
  state.yaw = state.targetYaw = sceneData[place].yaw;
  state.pitch = state.targetPitch = sceneData[place].pitch;
  state.fov = state.targetFov = sceneData[place].fov;
  applySceneUi(place);
  await new Promise(resolve => setTimeout(resolve, 120));
  fade.classList.remove('active');
  await new Promise(resolve => setTimeout(resolve, 680));
  state.transitioning = false;
  showToast(place === 'interior' ? '已进入烛光礼拜堂' : '已回到阿尔卑斯雪夜');
  playBell(place === 'interior' ? 587.33 : 440, .18);
}

const activePointers = new Map();
let pointerStart = null;
let pinchDistance = null;
function pointerDistance() {
  const values = [...activePointers.values()];
  if (values.length < 2) return null;
  return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (!state.started || state.transitioning) return;
  renderer.domElement.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 1) pointerStart = { x: event.clientX, y: event.clientY, moved: false };
  if (activePointers.size === 2) pinchDistance = pointerDistance();
  root.classList.add('dragging');
});

renderer.domElement.addEventListener('pointermove', event => {
  const previous = activePointers.get(event.pointerId);
  if (!previous || !state.started) return;
  const dx = event.clientX - previous.x, dy = event.clientY - previous.y;
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size === 2) {
    const distance = pointerDistance();
    if (pinchDistance !== null) state.targetFov = THREE.MathUtils.clamp(state.targetFov - (distance - pinchDistance) * .13, 34, 82);
    pinchDistance = distance;
  } else {
    state.targetYaw -= dx * .004;
    state.targetPitch = THREE.MathUtils.clamp(state.targetPitch - dy * .0035, -.87, .87);
    if (pointerStart && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 6) pointerStart.moved = true;
  }
});

function onPointerEnd(event) {
  const wasTap = activePointers.size === 1 && pointerStart && !pointerStart.moved;
  activePointers.delete(event.pointerId);
  if (activePointers.size < 2) pinchDistance = null;
  if (!activePointers.size) root.classList.remove('dragging');
  if (wasTap && state.started && !state.transitioning) sceneClick(event.clientX, event.clientY);
  pointerStart = null;
}
renderer.domElement.addEventListener('pointerup', onPointerEnd);
renderer.domElement.addEventListener('pointercancel', onPointerEnd);
renderer.domElement.addEventListener('wheel', event => {
  if (!state.started) return;
  event.preventDefault();
  state.targetFov = THREE.MathUtils.clamp(state.targetFov + event.deltaY * .035, 34, 82);
}, { passive: false });
renderer.domElement.addEventListener('dblclick', event => {
  if (!state.started) return;
  event.preventDefault(); sceneClick(event.clientX, event.clientY, true);
});

function sceneClick(clientX, clientY, forceZoom = false) {
  pointerNdc.set(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointerNdc, camera);
  const hit = raycaster.intersectObject(pano)[0];
  if (!hit) return;
  const direction = hit.point.clone().normalize();
  const data = sceneData[state.place];
  const portalDir = imageDirection(data.portalU, data.portalY);
  if (!forceZoom && direction.dot(portalDir) > .984) {
    if (state.place === 'exterior') switchPlace('interior');
    else { focusDirection(portalDir, 42); playBell(659.25, .22); showToast('烛光在圣坛前亮起'); }
    return;
  }
  focusDirection(direction, state.targetFov < 51 ? 70 : 46);
  showToast(state.targetFov < 51 ? '视角已拉近' : '继续拖动，探索四周');
}

portal.addEventListener('click', () => {
  if (state.place === 'exterior') switchPlace('interior');
  else { focusDirection(imageDirection(.505, .535), 41); playBell(659.25, .2); showToast('光映在圣坛之上'); }
});
backButton.addEventListener('click', () => switchPlace('exterior'));

// Licensed instrumental score starts after the visitor enters; small interaction bells are synthesized locally.
const bgm = $('#bgm');
bgm.volume = 0;
let audioContext = null, masterGain = null, musicFadeFrame = 0, musicRequest = 0;
function createAudio() {
  if (audioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  audioContext = new AudioContextClass();
  masterGain = audioContext.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioContext.destination);
}

function playBell(frequency = 587.33, volume = .14) {
  if (!audioContext || !state.audioOn) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const upper = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine'; upper.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, now);
  upper.frequency.setValueAtTime(frequency * 2.01, now);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + .025);
  gain.gain.exponentialRampToValueAtTime(.0001, now + 3.8);
  oscillator.connect(gain); upper.connect(gain); gain.connect(masterGain);
  oscillator.start(now); upper.start(now);
  oscillator.stop(now + 3.9); upper.stop(now + 3.9);
}

function fadeMusic(target, done) {
  cancelAnimationFrame(musicFadeFrame);
  const from = bgm.volume;
  const start = performance.now();
  const duration = target > from ? 1600 : 650;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    bgm.volume = Math.max(0, Math.min(1, from + (target - from) * (t * t * (3 - 2 * t))));
    if (t < 1) musicFadeFrame = requestAnimationFrame(step);
    else if (done) done();
  }
  musicFadeFrame = requestAnimationFrame(step);
}

function pauseMusicForHiddenPage() {
  ++musicRequest;
  cancelAnimationFrame(musicFadeFrame);
  bgm.volume = 0;
  bgm.pause();
  if (audioContext) {
    masterGain.gain.setValueAtTime(0, audioContext.currentTime);
    audioContext.suspend().catch(() => {});
  }
}

function updateMusicButton() {
  soundButton.setAttribute('aria-label', state.audioOn ? '关闭音乐' : '开启音乐');
  soundButton.setAttribute('aria-pressed', String(state.audioOn));
  soundButton.querySelector('.action-label').textContent = state.audioOn ? '音乐开启' : '音乐关闭';
  soundButton.querySelector('.sound-icon').textContent = state.audioOn ? '♫' : '♪';
}

async function setMusic(on) {
  const request = ++musicRequest;
  state.audioOn = on;
  updateMusicButton();
  if (!on) {
    if (audioContext) masterGain.gain.setTargetAtTime(0, audioContext.currentTime, .2);
    fadeMusic(0, () => {
      if (request !== musicRequest || state.audioOn) return;
      bgm.pause();
      audioContext?.suspend().catch(() => {});
    });
    return;
  }
  if (document.hidden) return;
  try {
    createAudio();
    const resumeEffects = audioContext?.resume().catch(() => {});
    const playMusic = bgm.play();
    await playMusic;
    await resumeEffects;
    if (request !== musicRequest || !state.audioOn || document.hidden) return;
    fadeMusic(.62);
    if (audioContext) masterGain.gain.setTargetAtTime(.04, audioContext.currentTime, .25);
  } catch {
    if (request !== musicRequest) return;
    state.audioOn = false;
    bgm.pause();
    bgm.volume = 0;
    if (audioContext) {
      masterGain.gain.setValueAtTime(0, audioContext.currentTime);
      audioContext.suspend().catch(() => {});
    }
    updateMusicButton();
    showToast('音乐暂时无法播放，请重试');
  }
}
soundButton.addEventListener('click', () => setMusic(!state.audioOn));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pauseMusicForHiddenPage();
  else if (state.audioOn && bgm.paused) setMusic(true);
});
window.addEventListener('pagehide', pauseMusicForHiddenPage);
window.addEventListener('pageshow', () => {
  if (!document.hidden && state.audioOn && bgm.paused) setMusic(true);
});

$('#fullscreen-button').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { showToast('此浏览器暂不支持全屏'); }
});

$('#enter-button').addEventListener('click', () => {
  if (!textures.exterior) return;
  state.started = true;
  intro.classList.add('hidden');
  intro.inert = true;
  intro.setAttribute('aria-hidden', 'true');
  $('.topbar').inert = false;
  $('.hud').inert = false;
  root.focus();
  setMusic(true);
  showToast('拖动环视雪夜，点击光点进入礼拜堂');
});

function summonAurora() {
  if (state.transitioning || !state.started) return;
  if (state.place !== 'exterior') {
    switchPlace('exterior').then(() => summonAurora()); return;
  }
  state.auroraEnd = performance.now() + 26000;
  state.targetPitch = .68;
  state.targetFov = Math.max(state.targetFov, 82);
  playBell(739.99, .16);
  showToast('极光正在雪山上空展开');
}

function spawnMeteor() {
  const fromRight = Math.random() > .32;
  const speedScale = reducedMotion ? .4 : 1;
  meteors.push({
    x: fromRight ? meteorWidth * (.4 + Math.random() * .75) : meteorWidth * (.15 + Math.random() * .55),
    y: -40 + Math.random() * meteorHeight * .43,
    vx: -(7 + Math.random() * 8) * speedScale, vy: (3 + Math.random() * 4) * speedScale,
    length: 80 + Math.random() * 110, life: 0, max: 35 + Math.random() * 25,
  });
}

function summonMeteor() {
  if (state.transitioning || !state.started) return;
  if (state.place !== 'exterior') {
    switchPlace('exterior').then(() => summonMeteor()); return;
  }
  state.meteorEnd = performance.now() + 11000;
  state.targetPitch = .55;
  state.targetFov = Math.max(state.targetFov, 80);
  for (let i = 0; i < (reducedMotion ? 2 : 5); i++) setTimeout(spawnMeteor, i * 180);
  playBell(880, .13);
  showToast('抬头，流星雨来了');
}

function summonSpirit() {
  if (state.transitioning || !state.started) return;
  state.spiritEnd = performance.now() + 7500;
  spiritEl.classList.remove('visible');
  void spiritEl.offsetWidth;
  spiritEl.classList.add('visible');
  state.targetFov = Math.min(state.targetFov, 64);
  for (let i = 0; i < (reducedMotion ? 20 : 110); i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 4;
    glints.push({ x: meteorWidth * .5, y: meteorHeight * .45, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0, max: 40 + Math.random() * 70, size: 1 + Math.random() * 2 });
  }
  playBell(880, .2); setTimeout(() => playBell(1174.66, .15), 290);
  showToast('愿光与你同在');
}

document.querySelectorAll('.ritual').forEach(button => button.addEventListener('click', () => {
  if (!state.started || state.transitioning) return;
  const ritual = button.dataset.ritual;
  if (ritual === 'aurora') summonAurora();
  if (ritual === 'meteor') summonMeteor();
  if (ritual === 'spirit') summonSpirit();
}));

window.addEventListener('keydown', event => {
  if (!state.started || state.transitioning) return;
  if (event.key === '1') summonAurora();
  if (event.key === '2') summonMeteor();
  if (event.key === '3') summonSpirit();
  if (event.key === 'Escape' && state.place === 'interior') switchPlace('exterior');
  if (event.key.toLowerCase() === 'e') switchPlace(state.place === 'exterior' ? 'interior' : 'exterior');
  if (event.key === 'ArrowLeft') state.targetYaw += .15;
  if (event.key === 'ArrowRight') state.targetYaw -= .15;
  if (event.key === 'ArrowUp') state.targetPitch = Math.min(.87, state.targetPitch + .1);
  if (event.key === 'ArrowDown') state.targetPitch = Math.max(-.87, state.targetPitch - .1);
  if (event.key === '+' || event.key === '=') state.targetFov = Math.max(34, state.targetFov - 6);
  if (event.key === '-') state.targetFov = Math.min(82, state.targetFov + 6);
});

function drawEffects(now) {
  meteorCtx.clearRect(0, 0, meteorWidth, meteorHeight);
  if (state.meteorEnd > now && Math.random() < (reducedMotion ? .035 : .16) && meteors.length < (reducedMotion ? 5 : 22)) spawnMeteor();
  meteors = meteors.filter(meteor => meteor.life < meteor.max);
  for (const meteor of meteors) {
    meteor.x += meteor.vx; meteor.y += meteor.vy; meteor.life++;
    const fadeOut = Math.min(1, meteor.life / 9, (meteor.max - meteor.life) / 14);
    const tailX = meteor.x - meteor.vx * meteor.length / 12;
    const tailY = meteor.y - meteor.vy * meteor.length / 12;
    const gradient = meteorCtx.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
    gradient.addColorStop(0, `rgba(255,255,237,${fadeOut})`);
    gradient.addColorStop(.13, `rgba(194,226,255,${fadeOut * .85})`);
    gradient.addColorStop(1, 'rgba(115,198,255,0)');
    meteorCtx.strokeStyle = gradient; meteorCtx.lineWidth = 2.3;
    meteorCtx.shadowColor = '#a8ddff'; meteorCtx.shadowBlur = 18;
    meteorCtx.beginPath(); meteorCtx.moveTo(meteor.x, meteor.y); meteorCtx.lineTo(tailX, tailY); meteorCtx.stroke();
    meteorCtx.shadowBlur = 0;
    meteorCtx.fillStyle = `rgba(255,255,255,${fadeOut})`;
    meteorCtx.beginPath(); meteorCtx.arc(meteor.x, meteor.y, 2.1, 0, Math.PI * 2); meteorCtx.fill();
  }
  glints = glints.filter(glint => glint.life < glint.max);
  for (const glint of glints) {
    glint.x += glint.vx; glint.y += glint.vy; glint.vx *= .992; glint.vy *= .992; glint.life++;
    const alpha = (1 - glint.life / glint.max) * .82;
    meteorCtx.fillStyle = `rgba(255,233,179,${alpha})`;
    meteorCtx.shadowColor = '#ffe7a9'; meteorCtx.shadowBlur = 13;
    meteorCtx.beginPath(); meteorCtx.arc(glint.x, glint.y, glint.size, 0, Math.PI * 2); meteorCtx.fill();
  }
  meteorCtx.shadowBlur = 0;
  if (state.spiritEnd < now && spiritEl.classList.contains('visible')) spiritEl.classList.remove('visible');
}

function animateParticles(group, delta, interior) {
  if (!group.points.visible || reducedMotion) return;
  const positions = group.positions;
  for (let i = 0; i < group.count; i++) {
    positions[i * 3 + 1] -= group.speed[i] * delta * (interior ? .35 : 1.9);
    positions[i * 3] += Math.sin(clock.elapsedTime * .4 + i) * delta * .015;
    if (positions[i * 3 + 1] < -group.area * .3) positions[i * 3 + 1] = group.area * .3;
  }
  group.points.geometry.attributes.position.needsUpdate = true;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), .05);
  const now = performance.now();
  state.yaw += angularDifference(state.targetYaw, state.yaw) * (reducedMotion ? 1 : Math.min(1, delta * 7));
  state.pitch += (state.targetPitch - state.pitch) * (reducedMotion ? 1 : Math.min(1, delta * 7));
  state.fov += (state.targetFov - state.fov) * (reducedMotion ? 1 : Math.min(1, delta * 5.5));
  camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  camera.fov = state.fov; camera.updateProjectionMatrix();
  const targetAurora = state.place === 'exterior' && now < state.auroraEnd ? 1 : 0;
  state.auroraStrength += (targetAurora - state.auroraStrength) * (reducedMotion ? 1 : Math.min(1, delta * (targetAurora ? 1.2 : .55)));
  auroraMaterial.uniforms.uStrength.value = state.auroraStrength;
  auroraMaterial.uniforms.uTime.value = reducedMotion ? 0 : clock.elapsedTime;
  animateParticles(snow, delta, false);
  animateParticles(motes, delta, true);
  positionPortal();
  drawEffects(now);
  renderer.render(scene, camera);
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
  renderer.setSize(window.innerWidth, window.innerHeight);
  sizeMeteorCanvas();
}
window.addEventListener('resize', onResize);
animate();
loadAssets().catch(error => {
  console.error('Panorama loading failed:', error);
  loading.textContent = '场景载入失败，请刷新页面重试。';
});
