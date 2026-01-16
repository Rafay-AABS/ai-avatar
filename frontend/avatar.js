

// --- Chat Logic ---
const input = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const historyDiv = document.getElementById('chat-history');
const avatarWrapper = document.getElementById('avatar-wrapper');

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
let talkInterval = null;

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

// Mouth shapes map (pre-defined SVG paths or transforms)
// Avataaars generally puts the mouth in a transform group. 
// We will fetch 3 states on load.
const mouthShapes = {
    default: null,
    smile: null
};

async function injectAvatarSVG() {
    // Replace the image tag with actual SVG code to allow for finer transformation control
    const img = document.getElementById('avatar-image');
    if (img) {
        try {
            // 1. Fetch main avatar (default)
            const response = await fetch(img.src);
            const text = await response.text();
            
            // Create a temp container
            const div = document.createElement('div');
            div.innerHTML = text;
            
            const svg = div.querySelector('svg');
            if (svg) {
                svg.id = 'avatar-svg';
                svg.style.width = '100%';
                svg.style.height = '100%';
                svg.style.filter = 'drop-shadow(0 20px 40px rgba(99, 102, 241, 0.2))';
                
                // Replace img with svg
                img.replaceWith(svg);
            }

            // 2. Pre-fetch mouth shapes (Lazy load)
            const baseUrl = 'https://api.dicebear.com/9.x/avataaars/svg';
            // Ensure this matches the index.html src exactly to prevent jumping
            const params = 'seed=Alexander&clothing=blazerAndShirt&accessories=prescription02&clothesColor=3c4f5c,65c9ff,262e33&accessoriesColor=262e33&top=shortWaved&eyes=default&hairColor=2c1b18&skinColor=edb98a';

            const variations = [
                { key: 'smile', url: `${baseUrl}?${params}&mouth=smile` },
                { key: 'default', url: `${baseUrl}?${params}&mouth=default` }
            ];

            for (const v of variations) {
                const r = await fetch(v.url);
                const t = await r.text();
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = t;
                // Identify the mouth group. In DiceBear Avataaars, it's usually inside a group <g transform="translate(X Y)"> 
                // We will look for differences. 
                // Actually, a simpler way is to cache the ENTIRE inner SVG structure of the mouth group if we can find it.
                // But structure varies.
                // Strategy: We will just swap the entire SVG for mouth sync. It's fast enough for simple loop.
                mouthShapes[v.key] = t;
            }
            
            // Verify we have defaults
            if (!mouthShapes.default) mouthShapes.default = text;

        } catch (e) {
            console.error("Failed to inject SVG for animation", e);
        }
    }
}

// Call this on load
injectAvatarSVG();

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
    if (talkInterval) clearInterval(talkInterval);
    const svgContainer = document.getElementById('avatar-wrapper');
    if (!svgContainer || !mouthShapes.default) return; // Wait for load

    // Toggle states
    
    talkInterval = setInterval(() => {
        if (!isTalking) {
            stopLipSync();
            return;
        }
        
        // Randomly pick a mouth state for "flapping"
        const r = Math.random();
        let state = 'default';
        if (r > 0.5) state = 'smile';
        
        // Naive SVG swap - fast enough for modern browsers
        const currentSVG = document.getElementById('avatar-svg');
        if (currentSVG && mouthShapes[state]) {
             // We reuse the ID and styles to keep transition smooth
             const styles = currentSVG.getAttribute('style');
             
             // Create temp to parse
             const parser = new DOMParser();
             const doc = parser.parseFromString(mouthShapes[state], 'image/svg+xml');
             const newSVG = doc.documentElement;
             
             newSVG.id = 'avatar-svg';
             newSVG.setAttribute('style', styles);
             
             currentSVG.replaceWith(newSVG);
        }

    }, 100); // 100ms flap speed
}

function stopLipSync() {
    if (talkInterval) clearInterval(talkInterval);
    const currentSVG = document.getElementById('avatar-svg');
    if (currentSVG && mouthShapes.default) {
         const styles = currentSVG.getAttribute('style');
         const parser = new DOMParser();
         const doc = parser.parseFromString(mouthShapes.default, 'image/svg+xml');
         const newSVG = doc.documentElement;
         newSVG.id = 'avatar-svg';
         newSVG.setAttribute('style', styles);
         currentSVG.replaceWith(newSVG);
    }
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