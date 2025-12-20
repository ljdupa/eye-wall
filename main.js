import * as THREE from "https://cdn.skypack.dev/three@0.129.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/RenderPass.js";
import { FilmPass } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/FilmPass.js";
import { ShaderPass } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/shaders/VignetteShader.js";
import GUI from "https://cdn.skypack.dev/lil-gui";

// GLOBALS
let flickerTime = 0;
let mixers = [];
const clock = new THREE.Clock();
const irisMeshes = [];
let currentPalette = [];
let hasEntered = false;
let isMuted = false;

const mouse = new THREE.Vector2();
const cameraTarget = new THREE.Vector3();

// SCENE
const scene = new THREE.Scene();
scene.background = new THREE.Color("#000");

// CAMERA
const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 20);

// RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 7;
renderer.shadowMap.enabled = true;
document.getElementById("container3D").appendChild(renderer.domElement);

// HDRI
new RGBELoader()
  .setPath("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/")
  .load("studio_small_03_1k.hdr", (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.environmentIntensity = 0.15;
  });

// POST FX
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const filmPass = new FilmPass(1.2, 0.4, 1400, false);
composer.addPass(filmPass);

const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms.offset.value = 1.25;
vignettePass.uniforms.darkness.value = 2.1;
composer.addPass(vignettePass);

// LIGHTING
const keyLight = new THREE.DirectionalLight(0xffffff, 4.8);
keyLight.position.set(2, -6, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.05);
fillLight.position.set(-8, 1, 1);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 2.2);
rimLight.position.set(0, 8, -10);
scene.add(rimLight);

// AUDIO
const listener = new THREE.AudioListener();
camera.add(listener);

// Ambience
const ambience = new THREE.Audio(listener);
const ambienceGain = ambience.gain;
ambienceGain.gain.value = 0;

// Static noise
const noiseAudio = new THREE.Audio(listener);

function createWhiteNoiseBuffer(duration = 2) {
  const ctx = listener.context;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.25;
  }
  return buffer;
}

const audioLoader = new THREE.AudioLoader();
audioLoader.load("./audio/horror-ambience.mp3", (buffer) => {
  ambience.setBuffer(buffer);
  ambience.setLoop(true);
});

//MODEL
const loader = new GLTFLoader();
loader.load("./models/eye.glb", (gltf) => {
  const eye = gltf.scene;
  eye.scale.set(1.5, 1.5, 1.5);
  scene.add(eye);

  eye.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;

    const n = obj.name.toLowerCase();
    if (n.includes("iris")) irisMeshes.push(obj);
    if (n.includes("eyelid")) {
      obj.material = obj.material.clone();
      obj.material.transparent = true;
      obj.material.depthWrite = false;
      obj.renderOrder = 1;
    }
  });

  if (gltf.animations.length) {
    const mixer = new THREE.AnimationMixer(eye);
    gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
    mixers.push(mixer);
  }
});

// IMAGE COLOR
function extractColorsFromImage(img, count = 12) {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  c.width = img.width;
  c.height = img.height;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  return Array.from({ length: count }, () => {
    const i = Math.floor(Math.random() * (d.length / 4)) * 4;
    return new THREE.Color(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
  });
}

function applyRandomIrisColors(palette) {
  irisMeshes.forEach((m) => {
    m.material = m.material.clone();
    m.material.color.copy(palette[Math.floor(Math.random() * palette.length)]);
  });
}

// GUI
const gui = new GUI();
const controls = {
  uploadImage: () => fileInput.click(),
  rerollColors: () =>
    currentPalette.length && applyRandomIrisColors(currentPalette),
};
gui.add(controls, "uploadImage");
gui.add(controls, "rerollColors");

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "image/*";
fileInput.onchange = (e) => {
  const img = new Image();
  img.onload = () => {
    currentPalette = extractColorsFromImage(img);
    applyRandomIrisColors(currentPalette);
  };
  img.src = URL.createObjectURL(e.target.files[0]);
};

// CLICK TO ENTER
  document.getElementById("enterScreen").classList.add("hidden");

  const ctx = listener.context;
  const t = ctx.currentTime;

  ctx.resume().then(() => {
    // Ambience
    ambience.play();
    ambienceGain.gain.setValueAtTime(0, t);
    ambienceGain.gain.linearRampToValueAtTime(0.18, t + 5);

    // Static (NO POP)
    noiseAudio.setBuffer(createWhiteNoiseBuffer());
    noiseAudio.setLoop(true);
    noiseAudio.play();
    noiseAudio.gain.gain.setValueAtTime(0, t);
    noiseAudio.gain.gain.linearRampToValueAtTime(0.0005, t + 0.4);
    noiseAudio.gain.gain.linearRampToValueAtTime(0.001, t + 1.2);
  });
});

let audioStarted = false;

function startAudioOnce() {
  if (audioStarted) return;
  audioStarted = true;

  const ctx = listener.context;
  const t = ctx.currentTime;

  ctx.resume().then(() => {
    // Ambience
    ambience.play();
    ambienceGain.gain.setValueAtTime(0, t);
    ambienceGain.gain.linearRampToValueAtTime(0.18, t + 4);

    // Static noise
    noiseAudio.setBuffer(createWhiteNoiseBuffer());
    noiseAudio.setLoop(true);
    noiseAudio.play();
    noiseAudio.gain.gain.setValueAtTime(0, t);
    noiseAudio.gain.gain.linearRampToValueAtTime(0.001, t + 1);
  });

  window.removeEventListener("mousemove", startAudioOnce);
  window.removeEventListener("mousedown", startAudioOnce);
  window.removeEventListener("keydown", startAudioOnce);
}

// start audio on first interaction
window.addEventListener("mousemove", startAudioOnce);
window.addEventListener("mousedown", startAudioOnce);
window.addEventListener("keydown", startAudioOnce);


// MUTE
document.getElementById("muteButton").onclick = () => {
  isMuted = !isMuted;
  ambienceGain.gain.value = isMuted ? 0 : 0.18;
  noiseAudio.gain.gain.value = isMuted ? 0 : 0.001;
};

// EVENTS
window.onmousemove = (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
};

window.onresize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
};

// LOOP
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  mixers.forEach((m) => m.update(dt));

  filmPass.uniforms.nIntensity.value = 1 + Math.random() * 0.4;

  flickerTime += dt;
  keyLight.intensity = 1.1 + Math.sin(flickerTime * 7) * 0.1;

  cameraTarget.set(mouse.x * 2.2, mouse.y * 1.6, camera.position.z);
  camera.position.lerp(cameraTarget, 0.008);
  camera.lookAt(0, 0, 0);

  composer.render();
}

animate();


