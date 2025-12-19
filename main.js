import * as THREE from "https://cdn.skypack.dev/three@0.129.0/build/three.module.js";
import { GLTFLoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";
import { RGBELoader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/RenderPass.js";
import { FilmPass } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/FilmPass.js";
import { ShaderPass } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "https://cdn.skypack.dev/three@0.129.0/examples/jsm/shaders/VignetteShader.js";
import GUI from "https://cdn.skypack.dev/lil-gui";

console.log("Three version:", THREE.REVISION);

// ================= GLOBALS =================
let flickerTime = 0;
let mixers = [];
const clock = new THREE.Clock();
const irisMeshes = [];
let currentPalette = [];

const mouse = new THREE.Vector2(0, 0);
const cameraTarget = new THREE.Vector3();

function tryStartYouTubeAudio() {
  if (!ytPlayer) return;

  try {
    ytPlayer.playVideo();
    ytPlayer.unMute();
    ytPlayer.setVolume(30);
    console.log("YouTube play attempt");
  } catch (e) {
    console.warn("YT play failed:", e);
  }
}


let noiseAudio;
let noiseStarted = false;


// ================= SCENE =================
const scene = new THREE.Scene();
scene.background = new THREE.Color("#000000");

// ================= HDRI =================
new RGBELoader()
  .setPath("https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/")
  .load("studio_small_03_1k.hdr", (hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = hdr;
    scene.environmentIntensity = 0.15;
  });

// ================= CAMERA =================
const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 20);
camera.lookAt(0, 0, 0);

let ytPlayer;
let ytReady = false;
let isMuted = false;

window.onYouTubeIframeAPIReady = function () {
  ytPlayer = new YT.Player("yt-player", {
    height: "0",
    width: "0",
    videoId: "xAO3x-Uhfoo",
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      playsinline: 1,
    },
    events: {
      onReady: () => {
        ytReady = true;
        console.log("YouTube player ready");

        // 🔥 if user already clicked, start now
        if (noiseStarted) {
          tryStartYouTubeAudio();
        }
      },
    },
  });
};



// ================= AUDIO =================
const listener = new THREE.AudioListener();
camera.add(listener);

// Create ambient noise audio
noiseAudio = new THREE.Audio(listener);

// Generate white noise buffer
function createWhiteNoiseBuffer(duration = 2) {
  const sampleRate = listener.context.sampleRate;
  const buffer = listener.context.createBuffer(
    1,
    sampleRate * duration,
    sampleRate
  );

  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.35; // grain intensity
  }

  return buffer;
}


// ================= RENDERER =================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.physicallyCorrectLights = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 7;

renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

document.getElementById("container3D").appendChild(renderer.domElement);

// ================= POST PROCESSING =================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const filmPass = new FilmPass(1.25, 0.45, 1600, false);
composer.addPass(filmPass);

const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms.offset.value = 1.25;
vignettePass.uniforms.darkness.value = 2.1;
composer.addPass(vignettePass);

// ================= LIGHTING =================
const keyLight = new THREE.DirectionalLight(0xffffff, 4.8);
keyLight.position.set(2, -6, 5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.05);
fillLight.position.set(-8, 1, 1);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xffffff, 2.2);
rimLight.position.set(0, 8, -10);
scene.add(rimLight);

// ================= MODEL =================
const loader = new GLTFLoader();

loader.load("./models/eye.glb", (gltf) => {
  const eye = gltf.scene;
  scene.add(eye);

  eye.scale.set(1.5, 1.5, 1.5);

  eye.traverse((obj) => {
    if (!obj.isMesh) return;

    obj.castShadow = true;
    obj.receiveShadow = true;

    const name = obj.name.toLowerCase();

    if (name.includes("iris")) irisMeshes.push(obj);

    if (name.includes("eyelid")) {
      obj.material = obj.material.clone();
      obj.material.transparent = true;
      obj.material.depthWrite = false;
      obj.material.side = THREE.DoubleSide;
      obj.renderOrder = 1;
    }

    if (name.includes("eye") || name.includes("iris") || name.includes("pupil")) {
      obj.renderOrder = 0;
    }
  });

  if (gltf.animations.length > 0) {
    const mixer = new THREE.AnimationMixer(eye);
    gltf.animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      action.startAt(Math.random() * 2);
      action.play();
    });
    mixers.push(mixer);
  }
});

// ================= IMAGE COLOR SAMPLING =================
function extractColorsFromImage(img, count = 12) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const colors = [];

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(Math.random() * (data.length / 4)) * 4;
    colors.push(
      new THREE.Color(
        data[idx] / 255,
        data[idx + 1] / 255,
        data[idx + 2] / 255
      )
    );
  }
  return colors;
}

function applyRandomIrisColors(palette) {
  irisMeshes.forEach((mesh) => {
    mesh.material = mesh.material.clone();
    mesh.material.color.copy(
      palette[Math.floor(Math.random() * palette.length)]
    );
    mesh.material.roughness = 0.2;
    mesh.material.metalness = 0.1;
  });
}

// ================= GUI =================
const gui = new GUI();

const controls = {
  uploadImage: () => {},
  rerollColors: () => {
    if (currentPalette.length) applyRandomIrisColors(currentPalette);
  },
};

const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "image/*";

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const img = new Image();
  img.onload = () => {
    currentPalette = extractColorsFromImage(img);
    applyRandomIrisColors(currentPalette);
  };
  img.src = URL.createObjectURL(file);
});

controls.uploadImage = () => fileInput.click();

gui.add(controls, "uploadImage").name("Upload Image");
gui.add(controls, "rerollColors").name("Re-roll Iris Colors");

// ================= EVENTS =================
window.addEventListener("mousemove", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.position.z = Math.max(18, w / 120);
});
function startNoiseAudio() {
  if (noiseStarted) return;

  const ctx = listener.context;

 const start = () => {
  noiseAudio.setBuffer(createWhiteNoiseBuffer(3));
  noiseAudio.setLoop(true);
  noiseAudio.setVolume(0.001);
  noiseAudio.play();

  tryStartYouTubeAudio();

  noiseStarted = true;
  console.log("Audio started");
};


  if (ctx.state === "suspended") {
    ctx.resume().then(start);
  } else {
    start();
  }
}



window.addEventListener("click", startNoiseAudio, { once: true });
window.addEventListener("keydown", startNoiseAudio, { once: true });

const muteBtn = document.getElementById("muteButton");
muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;

  // Mute / unmute white noise
  noiseAudio.setVolume(isMuted ? 0 : 0.00001);

  // Mute / unmute YouTube audio
  if (ytPlayer && ytReady) {
    if (isMuted) ytPlayer.mute();
    else ytPlayer.unMute();
  }

  muteBtn.textContent = isMuted ? "🔊 Unmute" : "🔇 Mute";
});

// ================= LOOP =================
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  mixers.forEach((m) => m.update(delta));

  // Grain
  filmPass.uniforms.nIntensity.value = 1.1 + Math.random() * 0.4;
  filmPass.uniforms.sIntensity.value = 0.35 + Math.random() * 0.15;
  filmPass.uniforms.sCount.value = 1200 + Math.random() * 600;

  // Light flicker
  flickerTime += delta;
  const flicker =
    Math.sin(flickerTime * 6.0) * 0.08 +
    Math.sin(flickerTime * 17.0) * 0.04 +
    (Math.random() - 0.5) * 0.03;

  keyLight.intensity = 1.1 + flicker;
  keyLight.color.setHSL(0.6, 0.25, 0.55 + flicker * 0.3);

  
  // ===== FLOATY CAMERA DRIFT =====

// how far camera can pan (bigger than before)
const maxOffsetX = 2.2;   // lets you see cut-off eyes
const maxOffsetY = 1.6;

// target position based on mouse
cameraTarget.set(
  mouse.x * maxOffsetX,
  mouse.y * maxOffsetY,
  camera.position.z
);

// VERY slow easing = floaty, underwater feel
camera.position.lerp(cameraTarget, 0.008);

// always look toward center
camera.lookAt(0, 0, 0);


  composer.render();
}

animate();
