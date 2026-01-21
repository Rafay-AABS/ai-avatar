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
    camera.position.set(0, 1.57, 0.60);

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
        './avatar.glb',
        (gltf) => {
            avatarModel = gltf.scene;
            scene.add(avatarModel);

            const box = new THREE.Box3().setFromObject(avatarModel);
            const size = new THREE.Vector3();
            const center = new THREE.Vector3();
            box.getSize(size);
            box.getCenter(center);

            avatarModel.position.sub(center);
            avatarModel.position.y += 0.1; // Position avatar lower

            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const scale = 1.6 / maxDim;
            avatarModel.scale.setScalar(scale);

            // Store bone references for animation
            avatarModel.userData.leftArm = null;
            avatarModel.userData.rightArm = null;
            avatarModel.userData.leftHand = null;
            avatarModel.userData.rightHand = null;

            avatarModel.traverse((node) => {
                if (node.isMesh) {
                    // Enable morph targets for lipsync
                    if (node.morphTargetDictionary && node.morphTargetInfluences) {
                        node.userData.morphTargets = node.morphTargetDictionary;
                        
                        // Pre-calculate indices for better performance and fuzzy matching
                        const blinkIndices = [];
                        const mouthIndices = [];
                        
                        Object.entries(node.morphTargetDictionary).forEach(([key, index]) => {
                            const k = key.toLowerCase();
                            
                            // Blink Detection
                            if (k.includes('blink') || k.includes('eyeclose') || k.includes('eyesclosed')) {
                                blinkIndices.push(index);
                            }
                            
                            // Mouth Detection
                            if (k.includes('mouthopen') || k.includes('jawopen') || k.includes('viseme_aa')) {
                                mouthIndices.push({ index, name: k }); 
                            }
                        });
                        
                        node.userData.blinkIndices = blinkIndices;
                        node.userData.mouthIndices = mouthIndices;
                    }
                }
                // Store arm and hand bones for animation
                if (node.isBone || node.type === 'Bone') {
                    const name = node.name.toLowerCase();
                    if (name.includes('leftarm') || name.includes('l_arm') || name.includes('leftupperarm')) {
                        avatarModel.userData.leftArm = node;
                    }
                    if (name.includes('rightarm') || name.includes('r_arm') || name.includes('rightupperarm')) {
                        avatarModel.userData.rightArm = node;
                    }
                    if (name.includes('lefthand') || name.includes('l_hand')) {
                        avatarModel.userData.leftHand = node;
                    }
                    if (name.includes('righthand') || name.includes('r_hand')) {
                        avatarModel.userData.rightHand = node;
                    }
                    if (name.includes('lefteye') || name.includes('l_eye')) {
                        avatarModel.userData.leftEye = node;
                    }
                    if (name.includes('righteye') || name.includes('r_eye')) {
                        avatarModel.userData.rightEye = node;
                    }
                }
            });

            if (gltf.animations && gltf.animations.length > 0) {
                mixer = new THREE.AnimationMixer(avatarModel);
                const action = mixer.clipAction(gltf.animations[0]);
                action.play();
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

    // Blinking State
    let isBlinking = false;
    let blinkStartTime = 0;
    let nextBlinkTime = 0;
    const blinkDuration = 0.2; // seconds

    // Eye Movement State
    let nextEyeMoveTime = 0;
    let eyeTargetX = 0;
    let eyeTargetY = 0;

    const animate = () => {
        requestAnimationFrame(animate);
        const delta = clock.getDelta();
        const t = clock.elapsedTime;

        // Blink Logic
        if (!isBlinking && t > nextBlinkTime) {
            isBlinking = true;
            blinkStartTime = t;
            nextBlinkTime = t + 2 + Math.random() * 4; // Blink every 2-6 seconds
        }

        let blinkValue = 0;
        if (isBlinking) {
            const blinkProgress = (t - blinkStartTime) / blinkDuration;
            if (blinkProgress >= 1) {
                isBlinking = false;
                blinkValue = 0;
            } else {
                // Open -> Closed -> Open (0 -> 1 -> 0)
                blinkValue = Math.sin(blinkProgress * Math.PI); 
            }
        }

        if (mixer) mixer.update(delta);

        if (avatarModel) {
            
            avatarModel.rotation.y = 0; // Keep rotation still
            const baseY = 0.1; // Keep avatar positioned lower
            avatarModel.position.y = baseY; // Remove bobbing animation

            // Eye Movement (Saccades)
            if (t > nextEyeMoveTime) {
                // Pick a new random target within a small range
                eyeTargetX = (Math.random() - 0.5) * 0.3; // Horizontal range
                eyeTargetY = (Math.random() - 0.5) * 0.15; // Vertical range (smaller)
                nextEyeMoveTime = t + 1 + Math.random() * 3; // Move every 1-4 seconds
            }

            // Smoothly move eyes to target
            if (avatarModel.userData.leftEye) {
                avatarModel.userData.leftEye.rotation.y = THREE.MathUtils.lerp(avatarModel.userData.leftEye.rotation.y, eyeTargetX, 0.1);
                avatarModel.userData.leftEye.rotation.x = THREE.MathUtils.lerp(avatarModel.userData.leftEye.rotation.x, eyeTargetY, 0.1);
            }
            if (avatarModel.userData.rightEye) {
                avatarModel.userData.rightEye.rotation.y = THREE.MathUtils.lerp(avatarModel.userData.rightEye.rotation.y, eyeTargetX, 0.1);
                avatarModel.userData.rightEye.rotation.x = THREE.MathUtils.lerp(avatarModel.userData.rightEye.rotation.x, eyeTargetY, 0.1);
            }
            
            // Animate hands when talking
            if (isTalking) {
                if (avatarModel.userData.leftArm) {
                    avatarModel.userData.leftArm.rotation.z = Math.sin(t * 2) * 0.15;
                    avatarModel.userData.leftArm.rotation.x = Math.sin(t * 2.5) * 0.1 + 0.3;
                }
                if (avatarModel.userData.rightArm) {
                    avatarModel.userData.rightArm.rotation.z = Math.sin(t * 2.2) * 0.15;
                    avatarModel.userData.rightArm.rotation.x = Math.cos(t * 2.3) * 0.1 + 0.3;
                }
                if (avatarModel.userData.leftHand) {
                    avatarModel.userData.leftHand.rotation.z = Math.sin(t * 3) * 0.1;
                }
                if (avatarModel.userData.rightHand) {
                    avatarModel.userData.rightHand.rotation.z = Math.cos(t * 3) * 0.1;
                }
            } else {
                // Reset arms to low resting position when not talking
                if (avatarModel.userData.leftArm) {
                    avatarModel.userData.leftArm.rotation.z = THREE.MathUtils.lerp(avatarModel.userData.leftArm.rotation.z, 0, 0.1);
                    avatarModel.userData.leftArm.rotation.x = THREE.MathUtils.lerp(avatarModel.userData.leftArm.rotation.x, 0.3, 0.1);
                }
                if (avatarModel.userData.rightArm) {
                    avatarModel.userData.rightArm.rotation.z = THREE.MathUtils.lerp(avatarModel.userData.rightArm.rotation.z, 0, 0.1);
                    avatarModel.userData.rightArm.rotation.x = THREE.MathUtils.lerp(avatarModel.userData.rightArm.rotation.x, 0.3, 0.1);
                }
                if (avatarModel.userData.leftHand) {
                    avatarModel.userData.leftHand.rotation.z = THREE.MathUtils.lerp(avatarModel.userData.leftHand.rotation.z, 0, 0.1);
                }
                if (avatarModel.userData.rightHand) {
                    avatarModel.userData.rightHand.rotation.z = THREE.MathUtils.lerp(avatarModel.userData.rightHand.rotation.z, 0, 0.1);
                }
            }
            
            // Unified Morph Target Animation (Lipsync + Blinking)
            avatarModel.traverse((node) => {
                if (node.isMesh && node.morphTargetInfluences && node.userData.blinkIndices) {
                    
                    const blinkIndices = node.userData.blinkIndices;
                    const mouthIndices = node.userData.mouthIndices;

                    // Apply Blink
                    blinkIndices.forEach(idx => {
                        node.morphTargetInfluences[idx] = blinkValue;
                    });

                    // Apply Lipsync
                    if (mouthIndices) {
                         // Reset mouth first
                        mouthIndices.forEach(item => {
                             node.morphTargetInfluences[item.index] = 0;
                        });

                        if (isTalking) {
                            // Introduce interruptions for more natural speech
                            // High freq = syllables, Low freq = rhythm/pauses
                            const syllabus = Math.sin(t * 20);
                            const rhythm = Math.sin(t * 5) + Math.sin(t * 3.3);
                            
                            let lipValue = 0;
                            if (rhythm > -0.2) {
                                lipValue = Math.abs(syllabus) * 0.25;
                                lipValue *= (0.5 + 0.5 * (rhythm + 1) / 3);
                            }

                            mouthIndices.forEach(item => {
                                // Simple weight logic
                                if (item.name.includes('jawopen')) {
                                    node.morphTargetInfluences[item.index] = lipValue * 0.8;
                                } else {
                                    node.morphTargetInfluences[item.index] = lipValue;
                                }
                            });
                        }
                    }
                }
            });
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