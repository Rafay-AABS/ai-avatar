import * as THREE from 'https://esm.sh/three@0.161.0';
import { GLTFLoader } from 'https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js';

// --- Chat Logic ---
const input = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const historyDiv = document.getElementById('chat-history');
const avatarHalo = document.querySelector('.avatar-halo');

// --- Settings UI ---
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');

// Dropdown Elements
const voiceDropdown = document.getElementById('voice-dropdown');
const voiceTrigger = voiceDropdown.querySelector('.select-trigger');
const voiceOptionsContainer = voiceDropdown.querySelector('.select-options');
const voiceTriggerText = voiceDropdown.querySelector('.selected-text');

let selectedVoiceIndex = 0;

// Speech Synthesis Setup
const synth = window.speechSynthesis;
let voices = [];
let isTalking = false;

// --- Three.js Avatar ---
const canvas = document.getElementById('avatar-canvas');
let renderer = null;
let scene = null;
let camera = null;
let avatarModel = null;
let mixer = null;
const clock = new THREE.Clock();

function initThreeAvatar() {
    if (!canvas) return;

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.4, 2.4);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e293b, 1.2);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.6);
    rimLight.position.set(-2, 2, -2);
    scene.add(rimLight);

    const loader = new GLTFLoader();
    loader.load(
        './696ce12c29115399d7fe8f2f.glb',
        (gltf) => {
            avatarModel = gltf.scene;
            scene.add(avatarModel);

            const box = new THREE.Box3().setFromObject(avatarModel);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            avatarModel.position.sub(center);

            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const scale = 1.6 / maxDim;
            avatarModel.scale.setScalar(scale);

            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(avatarModel);
                mixer.clipAction(gltf.animations[0]).play();
            }
        },
        undefined,
        (error) => {
            console.error('Failed to load GLB avatar', error);
        }
    );

    const handleResize = () => {
        const { clientWidth, clientHeight } = canvas;
        if (!clientWidth || !clientHeight) return;
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(clientWidth, clientHeight, false);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const animate = () => {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();

        if (mixer) mixer.update(delta);

        if (avatarModel) {
            const t = clock.elapsedTime;
            avatarModel.rotation.y = Math.sin(t * 0.6) * 0.15;
            const bob = isTalking ? 0.02 : 0.01;
            avatarModel.position.y = Math.sin(t * (isTalking ? 6 : 2)) * bob;
        }

        renderer.render(scene, camera);
    };

    animate();
}

function loadVoices() {
    voices = synth.getVoices();
    voiceOptionsContainer.innerHTML = '';
    
    voices.forEach((voice, index) => {
        const option = document.createElement('div');
        option.classList.add('custom-option');
        
        // Build label
        let label = `${voice.name} (${voice.lang})`;
        if (voice.default) label += ' ★';
        option.textContent = label;
        
        // Handle Selection
        option.addEventListener('click', () => {
             selectedVoiceIndex = index;
             updateDropdownUI();
             voiceDropdown.classList.remove('open');
        });

        if (index === selectedVoiceIndex) {
            option.classList.add('selected');
        }

        voiceOptionsContainer.appendChild(option);
    });

    // Auto-select if not set
    if (voices.length > 0 && selectedVoiceIndex === 0) {
        // Try to find helper default
         const defaultIndex = voices.findIndex(v => v.lang.includes('en') && (v.name.includes('Male') || v.name.includes('David') || v.name.includes('Mark'))) 
        || voices.findIndex(v => v.lang.includes('en')) 
        || 0;
        
        if (defaultIndex !== -1) {
            selectedVoiceIndex = defaultIndex;
        }
    }
    
    updateDropdownUI();
}

function updateDropdownUI() {
    if (voices[selectedVoiceIndex]) {
        voiceTriggerText.textContent = `${voices[selectedVoiceIndex].name} (${voices[selectedVoiceIndex].lang})`;
    } else {
        voiceTriggerText.textContent = "Select voice...";
    }
    
    // Update active class on options
    const options = voiceOptionsContainer.querySelectorAll('.custom-option');
    options.forEach((opt, idx) => {
        if (idx === selectedVoiceIndex) opt.classList.add('selected');
        else opt.classList.remove('selected');
    });
}

loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = loadVoices;
}

// Generate a random session ID
const sessionId = 'user_audio_' + Math.random().toString(36).substr(2, 9);

initThreeAvatar();

function speak(text, onTextUpdate) {
    if (synth.speaking) {
        synth.cancel();
    }
    
    // ... setup logic ...
    const utterThis = new SpeechSynthesisUtterance(text);
    
    // Select a voice from settings or fallback
    const voice = voices[selectedVoiceIndex]; 
    if (voice) utterThis.voice = voice;
    
    utterThis.pitch = 1;
    utterThis.rate = 1;

    utterThis.onstart = () => {
        isTalking = true;
        startLipSync();
    };

    utterThis.onboundary = (event) => {
        if (onTextUpdate && event.name === 'word') {
             // Reconstruct text up to current word
             const partial = text.substring(0, event.charIndex + (event.charLength || 0));
             onTextUpdate(partial);
        }
    };

    utterThis.onend = () => {
        isTalking = false;
        stopLipSync();
        if (onTextUpdate) onTextUpdate(text); // Ensure complete text
    };

    utterThis.onerror = () => {
        isTalking = false;
        stopLipSync();
    };

    synth.speak(utterThis);
}

function startLipSync() {
    if (avatarHalo) avatarHalo.classList.add('active');
}

function stopLipSync() {
    if (avatarHalo) avatarHalo.classList.remove('active');
}

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    // Display user message
    addMessageToUI('You', text, 'user-msg');
    input.value = '';
    
    // Stop previous speech if any
    synth.cancel();
    stopLipSync();

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
        const msgBubble = addMessageToUI('AI', '...', 'ai-msg');
        
        // Speak the response
        speak(data.response, (textUpdate) => {
            msgBubble.textContent = textUpdate;
            historyDiv.scrollTop = historyDiv.scrollHeight;
        });

    } catch (error) {
        console.error('Error:', error);
        addMessageToUI('System', 'Error communicating with server.', 'ai-msg');
    }
}

function addMessageToUI(sender, text, className) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', className);
    
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.textContent = text; // Just text, "Sender:" is implied by side/color
    
    msgDiv.appendChild(contentDiv);
    
    historyDiv.appendChild(msgDiv);
    historyDiv.scrollTop = historyDiv.scrollHeight;
    return contentDiv; // Return content div for text updates
}

// Replaced by sophisticated lip sync
function animateAvatar() {
    // Legacy holder
}

sendBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sendMessage();
});
input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
    }
});


// Settings Modal & Dropdown Logic
settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('active');
    // Ensure UI matches current state
    updateDropdownUI();
});

function closeSettings() {
    settingsModal.classList.remove('active');
    voiceDropdown.classList.remove('open');
}

// Toggle Dropdown
voiceTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    voiceDropdown.classList.toggle('open');
});

// Close dropdown when clicking outside
window.addEventListener('click', (e) => {
    if (!voiceDropdown.contains(e.target)) {
        voiceDropdown.classList.remove('open');
    }
});

closeSettingsBtn.addEventListener('click', closeSettings);
settingsModal.querySelector('.modal-backdrop').addEventListener('click', closeSettings);

saveSettingsBtn.addEventListener('click', () => {
    // Selection is already updated in real-time via index
    closeSettings();
});