import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Three.js Setup ---
const container = document.getElementById('avatar-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf0f0f0);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.5, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// --- Avatar Loading ---
const loader = new GLTFLoader();
let avatar;

// Use a reliable example model from Three.js (hosted via CDN)
// This is a "Soldier" character, which is a standard reliable humanoid model.
const modelUrl = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@master/examples/models/gltf/venice_mask.glb';

// Fallback Cube in case no model is loaded
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshStandardMaterial({ color: 0x007bff });
const cube = new THREE.Mesh(geometry, material);
cube.position.y = 1;

// Load the human-like avatar
loader.load(
    modelUrl, 
    (gltf) => {
        avatar = gltf.scene;
        // The Soldier model is scaled appropriately usually, but might need position adjustment
        avatar.scale.set(1.5, 1.5, 1.5);
        avatar.position.y = -1.5; 
        scene.add(avatar);
        console.log("Model loaded successfully");
    },
    undefined,
    (error) => {
        console.warn("Could not load model, displaying fallback cube.", error);
        scene.add(cube);
        avatar = cube;
    }
);

// Animation Loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // Simple idle animation for the cube
    if (avatar === cube) {
        cube.rotation.y += 0.01;
    }

    renderer.render(scene, camera);
}
animate();

// Handle Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Chat Logic ---
const input = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const historyDiv = document.getElementById('chat-history');

// Generate a random session ID
const sessionId = 'user_' + Math.random().toString(36).substr(2, 9);

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    // Display user message
    addMessageToUI('You', text, 'user-msg');
    input.value = '';

    try {
        const response = await fetch('http://localhost:5000/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                session_id: sessionId
            })
        });

        if (!response.ok) throw new Error('Network response was not ok');

        const data = await response.json();
        
        // Display AI response
        addMessageToUI('AI', data.response, 'ai-msg');
        
    } catch (error) {
        console.error('Error:', error);
        addMessageToUI('System', 'Error communicating with server.', 'ai-msg');
    }
}

function addMessageToUI(sender, text, className) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', className);
    msgDiv.textContent = `${sender}: ${text}`;
    historyDiv.appendChild(msgDiv);
    historyDiv.scrollTop = historyDiv.scrollHeight;
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
