import * as THREE from "three";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";
import { materialLineWidth } from "three/tsl";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let mixer;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xfcdcf4);
const camera = new THREE.PerspectiveCamera(
  100,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
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
  opacity: 0.5
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

// draggable plane
let isDragging = false;
let mouseCords = { x: 0, y: 0, z: 0 };

document.addEventListener("mousedown", (event) => {
  console.log("down");
  isDragging = true;
  mouseCords.x = event.clientX;
  mouseCords.y = event.clientY;
});

document.addEventListener("mousemove", (event) => {
  if (!isDragging) return;

  const x = event.clientX - mouseCords.x;
  const y = event.clientY - mouseCords.y;

  fullLandscaping.rotation.y += x * 0.0001;
  fullLandscaping.rotation.x += y * 0.0001;

  mouseCords.y = event.clientX;
  mouseCords.x = event.clientY;
});

document.addEventListener("mouseup", (event) => {
  isDragging = false;
});

const KorbiiLoader = new GLTFLoader();
KorbiiLoader.load(
  "Korbii-prototype.glb",
  (gltf) => {
    const Korbii = gltf.scene;

    Korbii.rotation.y = Math.PI;
    Korbii.position.y = 0.05 + 0.05;
    Korbii.scale.set(0.3, 0.3, 0.3);

    mixer = new THREE.AnimationMixer(Korbii);
    const clips = gltf.animations;
    console.log("animations found:", gltf.animations);
    if (clips && clips.length > 0) {
      const action = mixer.clipAction(clips[0]);
      action.play();
    }


    fullLandscaping.add(Korbii);
  },
  undefined,
  (error) => {
    console.error(error);
  },
);


console.log(isDragging);

class Korbitat {
  constructor(ability, numberofkorbiis, stardust) {
    this.ability = ability;
    this.numberofkorbiis = numberofkorbiis;
    this.stardust = stardust;

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    this.mesh = new THREE.Mesh(geometry, material);

    const boxSize = 2.5;
    const face = Math.floor(Math.random() * 6);
    let pos = [0, 0, 0];

    this.mesh.position.set(...pos);

    fullLandscaping.add(this.mesh);
  }
}

let storeNormalKorbitat = new Korbitat("normal", 0, 0);

const korbiiCubeGroup = new THREE.Group();
scene.add(korbiiCubeGroup);
korbiiCubeGroup.add(fullLandscaping);

function render() {
  requestAnimationFrame(render);
  const del = clock.getDelta()
  if (mixer) mixer.update(del);
  renderer.render(scene, camera);
}
render();
