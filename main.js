import * as THREE from "three";
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const scene = new THREE.Scene();
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

const landscape = new THREE.BoxGeometry(5,5,5);
const landscapingMaterials = new THREE.MeshBasicMaterial({
  color: 0x0fff00
});

const fullLandscaping = new THREE.Mesh(landscape, landscapingMaterials);

fullLandscaping.rotation.set(360,3.5,80);


scene.add(fullLandscaping);

// draggable plane
let isDragging = false;
let mouseCords = {x:0, y:0, z:0};

document.addEventListener("mousedown", (event) => {
    console.log("down")
    isDragging = true;
    mouseCords.x = event.clientX;
    mouseCords.y = event.clientY;

});

document.addEventListener("mousemove", (event) => {
    if (!isDragging) return;

    const x = event.clientX - mouseCords.x;
    const y = event.clientY - mouseCords.y;
    
    // if (x < 0) { return 0 }
    // if (y < 0) { return 0 }

    fullLandscaping.rotation.y += x * 0.0001
    fullLandscaping.rotation.x += y * 0.0001
    fullLandscaping.rotation.z += z * 0.0001

    mouseCords.y = event.clientX;
    mouseCords.x = event.clientY;
})

document.addEventListener("mouseup", (event) => {
    isDragging = false;
})

console.log(isDragging)

const titleRenderer = new CSS2DRenderer();
titleRenderer.setSize(window.innerWidth, window.innerHeight);
titleRenderer.domElement.classList.add("title-renderer");
document.body.appendChild(titleRenderer.domElement);

const title = document.createElement('div');
title.className = 'title';
title.textContent = 'Korbii\'s Tycoon!';

const KorbiisTycoon = new CSS2DObject(title);
KorbiisTycoon.position.set(0,1,0)
fullLandscaping.add(KorbiisTycoon)

function render() {
    requestAnimationFrame(render);
    renderer.render(scene, camera);
    titleRenderer.render(scene, camera)
}
render();

