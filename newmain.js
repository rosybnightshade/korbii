import * as THREE from "three";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let mixer;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xfcdcf4);
const camera = new THREE.PerspectiveCamera(
  100,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
camera.position.z = 10;

const clock = new THREE.Clock();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 2);
dirLight.position.set(10, 10, 20);
scene.add(dirLight);

const landscape = new THREE.BoxGeometry(5, 5, 5);
const landscapingMaterials = new THREE.MeshBasicMaterial({
  transparent: true,
  color: 0xffffff,
  opacity: 0.5,
});

const fullLandscaping = new THREE.Mesh(landscape, landscapingMaterials);
fullLandscaping.rotation.set(360, 3.5, 80);

const landscapeBorder = new THREE.EdgesGeometry(landscape);
const segmantedBorder = new THREE.LineBasicMaterial({
  color: 0xffffff,
  linewidth: 2,
});
const border = new THREE.LineSegments(landscapeBorder, segmantedBorder);
fullLandscaping.add(border);

// landscaping grid
const landscapingGrid = new THREE.Group();
const gridsize = 5;
const griddivs = 16;

const gridFront = new THREE.GridHelper(gridsize, griddivs);
gridFront.position.y = 2.8;
landscapingGrid.add(gridFront);

const gridBack = new THREE.GridHelper(gridsize, griddivs);
gridBack.position.y = -2.8;
gridBack.rotation.z = Math.PI;
landscapingGrid.add(gridBack);

const gridTop = new THREE.GridHelper(gridsize, griddivs);
gridTop.position.z = 2.8;
gridTop.rotation.x = -Math.PI / 2;
landscapingGrid.add(gridTop);

const gridBottom = new THREE.GridHelper(gridsize, griddivs);
gridBottom.position.z = -2.8;
gridBottom.rotation.x = -Math.PI / 2;
landscapingGrid.add(gridBottom);

const gridRight = new THREE.GridHelper(gridsize, griddivs);
gridRight.position.y = 2.8;
landscapingGrid.add(gridRight);

fullLandscaping.add(landscapingGrid);
scene.add(fullLandscaping);

// ─── Drag to rotate ───────────────────────────────────────────────────────────
let isDragging = false;
let mouseCords = { x: 0, y: 0 };

document.addEventListener("mousedown", (event) => {
  isDragging = true;
  mouseCords.x = event.clientX;
  mouseCords.y = event.clientY;
});

document.addEventListener("mousemove", (event) => {
  if (!isDragging) return;

  const dx = event.clientX - mouseCords.x;
  const dy = event.clientY - mouseCords.y;

  fullLandscaping.rotation.y += dx * 0.01;
  fullLandscaping.rotation.x += dy * 0.01;

  // FIX: was swapped — clientX goes to .x, clientY goes to .y
  mouseCords.x = event.clientX;
  mouseCords.y = event.clientY;
});

document.addEventListener("mouseup", () => {
  isDragging = false;
});

// ─── Korbii ───────────────────────────────────────────────────────────────────
let korbiiMesh = null;
let korbiiAngle = 0;

// The cleaned GLB has an Armature node with internal scale ~4.15.
// With JS scale of 0.3 applied on top: effective scale = 4.15 * 0.3 = 1.245.
// The mesh foot sits at Y = -1 in Armature local space → -1.245 in world space.
// The cube top face is at Y = +2.5 (cube half-height) in cube local space.
// Lift the path group by 2.5 + 1.245 = 3.745 to place feet flush on the face.
const korbiiYOffset = gridFront.position.y;

let korbiiPathGroup = null;

const KorbiiLoader = new GLTFLoader();
KorbiiLoader.load(
  "newkorb.glb",
  (gltf) => {
    const Korbii = gltf.scene;
    Korbii.rotation.y = Math.PI;
    Korbii.position.set(0, 0, 0);
    Korbii.scale.set(0.3, 0.3, 0.3);

    // The original GLB's only animation was a Blender path-follow bake
    // (BézierCircle.002Action on the Empty node) — that's what caused the orbit.
    // It has been stripped from Korbii-prototype.glb, so no mixer is needed.
    // Wire up mixer here when a proper walk-cycle animation is added.

    korbiiMesh = Korbii;

    korbiiPathGroup = new THREE.Group();
    korbiiPathGroup.add(Korbii);
    fullLandscaping.add(korbiiPathGroup);
  },
  undefined,
  (error) => {
    console.error("GLB load error:", error);
  },
);

// ─── Korbitat ─────────────────────────────────────────────────────────────────
class Korbitat {
  constructor(ability, numberofkorbiis, stardust) {
    this.ability = ability;
    this.numberofkorbiis = numberofkorbiis;
    this.stardust = stardust;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(0, 0, 0);
    fullLandscaping.add(this.mesh);
  }
}

let storeNormalKorbitat = new Korbitat("normal", 0, 0);

const korbiiCubeGroup = new THREE.Group();
scene.add(korbiiCubeGroup);
korbiiCubeGroup.add(fullLandscaping);

// ─── Render loop ──────────────────────────────────────────────────────────────
function render() {
  requestAnimationFrame(render);
  const del = clock.getDelta();
  if (mixer) mixer.update(del);

  // Walk Korbii in a square on the top face of the cube (cube-local space).
  if (korbiiMesh && korbiiPathGroup) {
    const side = 4.5;
    const speed = 1.2;
    korbiiAngle += del * speed;
    const perimeter = side * 4;
    let dist = (korbiiAngle * side) % perimeter;
    let x = 0,
      z = 0,
      rot = 0;
    const cornerBlend = 0.18;

    if (dist < side) {
      x = -side / 2 + dist;
      z = -side / 2;
      rot = 0;
      if (dist > side - cornerBlend) {
        rot = ((dist - (side - cornerBlend)) / cornerBlend) * (Math.PI / 2);
      }
    } else if (dist < side * 2) {
      x = side / 2;
      z = -side / 2 + (dist - side);
      rot = Math.PI / 2;
      if (dist > side * 2 - cornerBlend) {
        rot =
          Math.PI / 2 +
          ((dist - (side * 2 - cornerBlend)) / cornerBlend) * (Math.PI / 2);
      }
    } else if (dist < side * 3) {
      x = side / 2 - (dist - side * 2);
      z = side / 2;
      rot = Math.PI;
      if (dist > side * 3 - cornerBlend) {
        rot =
          Math.PI +
          ((dist - (side * 3 - cornerBlend)) / cornerBlend) * (Math.PI / 2);
      }
    } else {
      x = -side / 2;
      z = side / 2 - (dist - side * 3);
      rot = -Math.PI / 2;
      if (dist > perimeter - cornerBlend) {
        rot =
          -Math.PI / 2 +
          ((dist - (perimeter - cornerBlend)) / cornerBlend) * (Math.PI / 2);
      }
    }

    korbiiPathGroup.position.set(x, korbiiYOffset, z);
    korbiiMesh.rotation.y = rot;
  }

  renderer.render(scene, camera);
}
render();
