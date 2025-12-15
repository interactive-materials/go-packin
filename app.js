/**
 * Functional implementation of the Scanner App with Gemini API
 */
//
// --- Configuration ---
// --- Configuration ---
// API Key is now in state.config
// const API_KEY = '...'; // Removed
// const API_URL = variable inside callGemini
const originalPrompt = `You are a red cross member in a game about preparing a GO-bag for different kinds of individuals, the player will submit a list of items and you are to evaluate the suitability of the items for the individual and the scenario. 
Rate and provide a score from 1 to 100 on how appropriate the items are for a GO-bag.
The definition of a GO-bag is A Go Bag is an essential item that should be prepared in advance and kept readily accessible at all times. It is recommended to be well-stocked with the necessary supplies to ensure your safety, health, and basic comfort for up to three days (72 hours), or until the situation stabilizes and normal conditions are restored, or help arrives.
|| Required non-negotiable items that should be found in the GO-bag include: 
First Aid Kit, N95 Mask, A set of spare clothing. ||
Items that are also important and required but can be substituted for with similar items: 
Torchlight, Water, Whistle, Non-perishable food. Note that Bottle of Water or Ritz Biscuits or Canned Meat were be marked as correct are they fufill their purpose as water or non-perishable food||
If the player has included items that do not represent the listed items required but may be suitable substitutes, evaluate them based on their suitability for use in the context of an emergency GO-bag.
A 100 point score would be a GO bag that has all the non-negotiables and required items (or very close substitutes) and any other items which are required for the individual.
oss evaluator in a game, and the goal is to evaluate the items in a emergency bag. Rate from 1 to 100 how apporiate the items are for a GO emergency bag and give ONE description 1 line for the entire list of items in the bag. Required non-negotiable items that should be found in the GO bag include: First Aid Kit, N95 Mask, A set of spare clothing. Items that are required but can be substituted are: Torchlight, A bottle of Water, Whistle, Dry food (For example Phone as flashlight). words/items that aligned with the definition also count.`;
const essentialCriteria = 'When evaluating the rating give a 0 if nothing or "No Item Scanned" is packed in the bag and point out essential items that are missing. Be harsher with the rating and give below 50 if there are missing essential items however reward it greater if the items are there. If essential items are included but no specific items give a score of about 60. Give penalties for completely irrelevant items but you may give some points if items and partitally subtitude the essential items. Point out what essential items are missing. If all essential and situation specific items are there you can give 100.'
const expressionPrompt = 'When generating the description response, use the tone of a friendly mascot character. Comment on 1 good item for the GO bag. Talk about 1 bad item for the GO bag if there are any, explain why it is bad and try to make a pun about it. Be specific if you are recommending "essentials" which are be missing. If they are bad explain why they are bad and suggest what should be included and why.'
const promptformat = '. Return a JSON object with this structure: { "rating": "x/100", "description": "your description here", "reasoning": "your reasoning...", "items": [ { "name": "Item Name", "status": "correct" | "okay" | "wrong" } ] }. Output ONLY raw JSON. No Markdown, no code blocks. Evaluate the items if they are correct and part of the list or good suitable for such items carefully. If there are no items in the bag, do not list out any items.';

//sounds
const bgm = new Howl({
    src: ['./audio/scan_timer_loop.mp3'],
    loop: true,
    volume: 0.5
});

// --- State Management ---

// Helper to load settings from localStorage
const loadSettings = () => {
    try {
        const stored = localStorage.getItem('appConfig');
        return stored ? JSON.parse(stored) : null;
    } catch (e) {
        console.warn('Failed to load settings', e);
        return null;
    }
};

const loadCustomSituations = () => {
    try {
        const stored = localStorage.getItem('customSituations');
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.warn('Failed to load custom situations', e);
        return [];
    }
};

const defaultSettings = {
    randomizeOrChoose: true,
    timer: '120',
    showDebug: false,
    itemLimit: 15,
    showManualInput: false,
    backgroundSpeed: 20, // seconds
    backgroundOffset: 0, // initial offset
    apiKey: 'null' // END OF PROJECT - Valencia's Key Default
};

const savedSettings = loadSettings();

const initialState = {
    currentScreen: 'start',
    introStep: 0,
    demoStep: 0, // NEW: For demo state
    scannedData: [],
    aiResponse: '',
    currentSituation: '', // Now an object
    isLoading: false,
    error: null,
    timeLeft: 0,
    countdownValue: 0, // For "3-2-1 Go"
    lastPrompt: '',
    selectionResult: null, // 'correct' or 'wrong'
    selectedItem: null,
    interstitialMessage: null,
    customSituations: loadCustomSituations(),
    config: savedSettings || defaultSettings
};

// --- API Logic ---
// --- API Logic ---
const constructPrompt = (items, situationObj) => {
    const situationText = typeof situationObj === 'object' ? situationObj.situation : situationObj;
    const situationModelAnswer = typeof situationObj === 'object' ? situationObj.modelAnswer : situationObj;
    const situationRationale = typeof situationObj === 'object' ? situationObj.rationale : situationObj;
    const situationContext = `The scenario involves a: ${situationText}. `;

    const itemsText = items.length > 0 ? items.join(', ') : "Nothing";
    return originalPrompt + situationContext + "Additional items that are NEEDED IN THE EMERGENCY BAG for this specific situation include: " + situationModelAnswer + "|| The player has packed the following items: " + itemsText + ". ||This is the situation rationale u should take into account: " + situationRationale + ". This is the essential criteria u should take into account: " + essentialCriteria + expressionPrompt + promptformat;
};

const callGemini = async (fullPrompt, currentApiKey) => {
    try {
        if (!currentApiKey) return "Error: No API Key configured.";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${currentApiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: fullPrompt
                    }]
                }]
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error('Gemini API failed:', error);
        return "Error: Could not evaluate items. Please try again.";
    }
};

// --- Helper Functions ---

// Format seconds to M:SS (e.g., 120 -> "2:00", 65 -> "1:05")
const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- View Components (Pure Functions) ---

const createButton = (id, text, onClick) => {
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = text;
    if (onClick) {
        btn.addEventListener('click', onClick);
    }
    return btn;
};

// Helper for Navigation Buttons (HTML)
const createNavButton = (text, qrSrc, colorClass, extraClass = '') => {
    const container = document.createElement('div');
    container.className = `nav-button ${colorClass} ${extraClass}`;

    // QR Image
    const img = document.createElement('img');
    img.src = qrSrc;
    img.alt = text;

    // Text
    const span = document.createElement('span');
    span.textContent = text;

    // Default Order: QR Left, Text Right
    container.appendChild(img);
    container.appendChild(span);

    return container;
};

const createScreen = (id, isActive, title, desc, children = []) => {
    const screen = document.createElement('div');
    screen.id = id;
    screen.className = `screen ${isActive ? 'active' : ''}`;

    if (title) {
        const h1 = document.createElement('h1');
        h1.textContent = title;
        screen.appendChild(h1);
    }

    if (desc) {
        const p = document.createElement('p');
        p.textContent = desc;
        screen.appendChild(p);
    }

    children.forEach(child => screen.appendChild(child));

    return screen;
};

// Helper to create grid slots
const createGrid = (items, limit, categorizedItems = null) => {
    const grid = document.createElement('div');
    grid.className = 'items-grid';

    // Create fixed number of slots based on limit
    for (let i = 0; i < limit; i++) {
        const slot = document.createElement('div');
        slot.className = 'item-slot';

        const itemText = items[i] || ''; // Get item text if exists

        if (itemText) {
            slot.textContent = itemText;
            slot.classList.add('filled');

            // Apply evaluation status if available
            if (categorizedItems) {
                // Find matching item in categorized list (naive matching by name)
                const match = categorizedItems.find(ci => ci.name === itemText);
                if (match) {
                    if (match.status === 'correct') slot.classList.add('status-correct');
                    else if (match.status === 'okay') slot.classList.add('status-okay');
                    else if (match.status === 'wrong') slot.classList.add('status-wrong');
                }
            }
        }

        grid.appendChild(slot);
    }
    return grid;
};



const CountdownScreen = (state, dispatch) => {
    const countDiv = document.createElement('div');
    countDiv.className = 'countdown-text';

    // Remove READY, just 3-2-1
    let text = state.countdownValue <= 0 ? "GO!" : state.countdownValue.toString();

    countDiv.textContent = text;
    countDiv.style.fontSize = "8rem";
    countDiv.style.fontWeight = "900";
    countDiv.style.color = "#2F3061";

    // Different color for GO
    if (state.countdownValue <= 0) {

        countDiv.style.color = '#FBBF24'; // Yellow


    }

    if (state.countdownValue <= 0 && state.currentScreen === 'countdown') {
        const sound = new Howl({
            src: ['./audio/start_beep.mp3'],
        });

        sound.play();


    }

    return createScreen(
        'countdown-screen',
        state.currentScreen === 'countdown',
        null,  // Removed "Get Ready..." title
        null,
        [countDiv]
    );
};




const StartScreen = (state, dispatch) => {
    const logo = document.createElement('img');
    logo.src = 'Logo.png';
    logo.style.maxWidth = '18%'; // Reduced from 60% as requested (3.5x smaller)
    logo.style.height = 'auto';
    logo.style.marginBottom = '5vh'; // Use vh for responsive spacing

    const instruction = document.createElement('p');
    instruction.textContent = "";

    // Start Button
    const startBtn = createNavButton("SCAN TO\nSTART", "nextCodeOnly.jpg", "blue", "center-bottom");
    // Enable multiline
    const btnSpan = startBtn.querySelector('span');
    if (btnSpan) {
        btnSpan.style.whiteSpace = 'pre'; // Respect newline
        btnSpan.style.textAlign = 'left';
    }

    startBtn.style.transform = 'translateX(-50%)'; // Removed scale(1.3), kept centering
    startBtn.style.bottom = '80px';
    startBtn.onclick = () => dispatch({ type: 'START_SITUATION' });

    // Append button to screen
    // We can append to screen directly. StartScreen is centered flex column.
    // .center-bottom class uses absolute positioning.

    // Actually, StartScreen layout is flex-col center.
    // If we want absolute bottom, append to screen.
    // Screen has position: absolute.

    return createScreen(
        'start-screen',
        state.currentScreen === 'start',
        null, // No Title
        null, // No Desc
        [logo, startBtn] // content
    );
};

// --- Intro Screen Component ---
const IntroScreen = (state, dispatch) => {


    const container = document.createElement('div');
    container.className = 'intro-container';

    // Panda Image
    const pandaContainer = document.createElement('div');
    pandaContainer.className = 'panda-container';

    // Using PNG for animation
    const pandaImg = document.createElement('img');
    pandaImg.src = 'BravoTheRedPandaDialogue.png';
    pandaImg.id = 'panda-img'; // For animation
    pandaImg.className = 'panda-img';
    pandaContainer.appendChild(pandaImg);

    // Dialogue Box
    // Wrapper for Dialogue and Button to allow relative positioning "Outside"
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative'; /* To anchor the absolute button */
    // Wrapper doesn't need size, just holds the box. 
    // But text box has margin-right 20%. 
    // Let's make wrapper match text box positioning?
    wrapper.className = 'intro-wrapper';
    wrapper.style.maxWidth = '50%';
    wrapper.style.marginRight = '20%';

    // Text Box (Relative to Wrapper?)
    const textBox = document.createElement('div');
    textBox.className = 'intro-text-box text-box-style';
    textBox.id = 'intro-text-box';
    // Remove margin from textBox itself, put on wrapper
    textBox.style.margin = '0';
    textBox.style.maxWidth = '100%';

    textBox.textContent = ''; // Typewriter fills this

    // Next Button (formatted as per requirements)
    // Next Button (formatted as per requirements)
    const nextBtn = createNavButton("NEXT", "nextCodeOnly.jpg", "red", "outside-dialogue dialogue");
    nextBtn.onclick = () => dispatch({ type: 'INTRO_NEXT' });

    wrapper.appendChild(textBox);
    wrapper.appendChild(nextBtn);

    container.appendChild(pandaContainer);
    container.appendChild(wrapper);

    return createScreen(
        'intro-screen',
        state.currentScreen === 'intro',
        null,
        null,
        [container]
    );
};

// --- Demo Screen Component ---
const DemoScreen = (state, dispatch) => {
    const container = document.createElement('div');
    container.className = 'feedback-container';  // Reuse feedback layout

    // The styled dialogue box (same as FeedbackScreen)
    const textBox = document.createElement('div');
    textBox.className = 'feedback-text';

    // Character face image (inside the box)
    const faceImg = document.createElement('img');
    faceImg.src = 'bravo-face.svg';
    faceImg.alt = 'Bravo the Red Panda';
    faceImg.className = 'character-face';

    // The actual text message
    const textContent = document.createElement('p');
    textContent.className = 'feedback-message';

    let situationText = state.currentSituation.situation;
    if (situationText === undefined) {
        situationText = 'primary school student';
    }
    // Content depends on demoStep
    if (state.demoStep === 0) {
        textContent.innerHTML = "Now let's try packing a Go bag! Look at the cards with items around you. <br>If you think an item should be in the bag, scan the QR code on it!";
    } else {
        const time = state.config.timer;
        const limit = state.config.itemLimit;
        textContent.innerHTML = `I'd like you to try packing a Go-bag for a friend of mine! <br> You have <span class="text-emphasis-salmon">${time}s</span> to put up to <span class="text-emphasis-salmon">${limit}</span> things into the bag! <br><br> You'll be packing a bag for... <br>a <span class="text-emphasis-salmon">${situationText}!</span>`;
    }

    // Build structure: face + text inside the box
    textBox.appendChild(faceImg);
    textBox.appendChild(textContent);

    // NEXT Button inside text box
    const nextBtn = createNavButton("NEXT", "nextCodeOnly.jpg", "red", "inside-box small");
    nextBtn.onclick = () => dispatch({ type: 'DEMO_NEXT' });
    textBox.appendChild(nextBtn);

    // Video box (to the right of dialogue box)
    const videoBox = document.createElement('div');
    videoBox.className = 'demo-video-box';

    const video = document.createElement('video');
    video.src = 'demovid.mp4';
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    videoBox.appendChild(video);

    // Add both boxes to container
    container.appendChild(textBox);
    container.appendChild(videoBox);

    return createScreen(
        'demo-screen',
        state.currentScreen === 'demo',
        null,
        null,
        [container]
    );
};

const SettingsScreen = (state, dispatch) => {
    const container = document.createElement('div');
    container.className = 'input-group settings-scroll-container'; // Added Scroll Class
    container.style.textAlign = 'center';

    // Display Cached Settings
    const cachedInfo = document.createElement('div');
    cachedInfo.style.marginBottom = '20px';
    cachedInfo.style.padding = '10px';
    cachedInfo.style.background = '#f1f5f9';
    cachedInfo.style.border = '1px solid #cbd5e1';
    cachedInfo.style.borderRadius = '8px';
    cachedInfo.style.fontSize = '0.9rem';
    cachedInfo.style.color = '#475569';
    cachedInfo.style.maxHeight = '200px';
    cachedInfo.style.overflowY = 'auto';

    // Construct scenario list
    let scenariosHtml = `<strong>Loaded Scenarios (${state.customSituations.length}):</strong><br>`;
    if (state.customSituations.length > 0) {
        scenariosHtml += '<ul style="margin: 5px 0 0 15px; padding: 0; list-style-type: disc;">';
        state.customSituations.forEach(sit => {
            const label = sit.situation || 'Unknown';
            scenariosHtml += `<li>${label}</li>`;
        });
        scenariosHtml += '</ul>';
    } else {
        scenariosHtml += '<em>No custom scenarios loaded.</em>';
    }

    cachedInfo.innerHTML = `
        <strong>Current Config:</strong><br>
        Mode: ${state.config.randomizeOrChoose ? 'Randomize' : 'Choose'}<br>
        Timer: ${state.config.timer}s<br>
        Limit: ${state.config.itemLimit}<br>
        <hr style="margin: 8px 0; border: 0; border-top: 1px solid #ccc;">
        ${scenariosHtml}
    `;

    // Randomize Toggle
    const toggleBtn = createButton('btn-toggle-mode',
        `Mode: ${state.config.randomizeOrChoose ? 'Randomize' : 'Choose'}`,
        () => dispatch({ type: 'TOGGLE_RANDOMIZE' })
    );
    toggleBtn.style.marginBottom = '20px';
    toggleBtn.style.width = '200px';

    // Debug Toggle
    const debugBtn = createButton('btn-toggle-debug',
        `Debug Log: ${state.config.showDebug ? 'ON' : 'OFF'}`,
        () => dispatch({ type: 'TOGGLE_DEBUG' })
    );
    debugBtn.style.marginBottom = '20px';
    debugBtn.style.width = '200px';
    debugBtn.style.backgroundColor = state.config.showDebug ? '#28a745' : '#6c757d';

    // Manual Input Toggle
    const manualInputBtn = createButton('btn-toggle-manual',
        `Manual Input: ${state.config.showManualInput ? 'ON' : 'OFF'}`,
        () => dispatch({ type: 'TOGGLE_MANUAL_INPUT' })
    );
    manualInputBtn.style.marginBottom = '20px';
    manualInputBtn.style.width = '200px';
    manualInputBtn.style.backgroundColor = state.config.showManualInput ? '#28a745' : '#6c757d';

    // API Key Input Section
    const keyContainer = document.createElement('div');
    keyContainer.style.marginBottom = '20px';
    keyContainer.style.background = '#e2e8f0';
    keyContainer.style.padding = '15px';
    keyContainer.style.borderRadius = '8px';

    const keyLabel = document.createElement('label');
    keyLabel.textContent = 'Update API Key: ';
    keyLabel.style.display = 'block';
    keyLabel.style.fontWeight = 'bold';
    keyLabel.style.marginBottom = '5px';

    const apiInput = document.createElement('input');
    apiInput.type = 'password';
    apiInput.id = 'api-key-input';
    apiInput.placeholder = 'Paste new API Key here...';
    apiInput.style.marginBottom = '10px';
    // Do NOT set value to state.config.apiKey to keep it hidden/secure

    const updateKeyBtn = createButton('btn-update-key', 'Save New Key', () => {
        const newKey = apiInput.value.trim();
        if (newKey) {
            dispatch({ type: 'UPDATE_APIKEY', payload: newKey });
            apiInput.value = ''; // Clear field
            alert('API Key Updated Successfully!');
        } else {
            alert('Please enter a valid key.');
        }
    });
    updateKeyBtn.style.width = '100%';
    updateKeyBtn.style.backgroundColor = '#0ea5e9';

    keyContainer.appendChild(keyLabel);
    keyContainer.appendChild(apiInput);
    keyContainer.appendChild(updateKeyBtn);

    // Add to main container
    // We replace the previous plain input logic
    // ...



    // Timer Input
    const timerLabel = document.createElement('label');
    timerLabel.textContent = 'Timer (seconds): ';
    timerLabel.style.display = 'block';
    timerLabel.style.marginBottom = '5px';
    timerLabel.style.fontWeight = 'bold';

    const timerInput = document.createElement('input');
    timerInput.type = 'number';
    timerInput.id = 'settings-timer-input'; // Added ID for focus preservation
    timerInput.value = state.config.timer;
    timerInput.placeholder = 'Enter seconds...';
    timerInput.style.marginBottom = '20px';
    timerInput.addEventListener('input', (e) =>
        dispatch({ type: 'UPDATE_TIMER', payload: e.target.value })
    );

    // Item Limit Input
    const limitLabel = document.createElement('label');
    limitLabel.textContent = 'Item Limit: ';
    limitLabel.style.display = 'block';
    limitLabel.style.marginBottom = '5px';
    limitLabel.style.fontWeight = 'bold';

    const limitInput = document.createElement('input');
    limitInput.type = 'number';
    limitInput.id = 'settings-limit-input';
    limitInput.value = state.config.itemLimit;
    limitInput.placeholder = 'Default: 15';
    limitInput.style.marginBottom = '20px';
    limitInput.addEventListener('input', (e) =>
        dispatch({ type: 'UPDATE_ITEM_LIMIT', payload: e.target.value })
    );

    // File Upload Input
    const fileLabel = document.createElement('label');
    fileLabel.textContent = 'Import Config (JSON): ';
    fileLabel.style.display = 'block';
    fileLabel.style.marginBottom = '5px';
    fileLabel.style.fontWeight = 'bold';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json, .txt';
    fileInput.style.marginBottom = '20px';
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target.result);
                    if (Array.isArray(json)) {
                        dispatch({ type: 'LOAD_CUSTOM_CONFIG', payload: json });
                        alert('Configuration loaded successfully!');
                    } else {
                        alert('Invalid configuration format. Expected an array of situations.');
                    }
                } catch (error) {
                    alert('Error parsing JSON file.');
                }
            };
            reader.readAsText(file);
        }
    });

    // Clear Custom Config Button
    const clearConfigBtn = createButton('btn-clear-config',
        `Clear Custom Configs (${state.customSituations?.length || 0})`,
        () => {
            if (confirm("Are you sure you want to clear all custom situations?")) {
                dispatch({ type: 'CLEAR_CUSTOM_CONFIG' });
            }
        }
    );
    clearConfigBtn.style.marginBottom = '20px';
    clearConfigBtn.style.backgroundColor = '#dc3545';

    // --- Scenario Creator Form ---
    const formDivider = document.createElement('h3');
    formDivider.textContent = 'Or Add New Scenario Manually';
    formDivider.style.marginTop = '20px';
    formDivider.style.marginBottom = '10px';
    formDivider.style.borderTop = '1px solid #ccc';
    formDivider.style.paddingTop = '10px';

    // Scenario Name
    const creatorSitInput = document.createElement('input');
    creatorSitInput.type = 'text';
    creatorSitInput.placeholder = 'Scenario (e.g. Earthquake)';
    creatorSitInput.id = 'creator-sit-input';

    // Model Answer Items
    const creatorItemsInput = document.createElement('input');
    creatorItemsInput.type = 'text';
    creatorItemsInput.placeholder = 'Required Items (comma separated)';
    creatorItemsInput.id = 'creator-items-input';

    // Rationale
    const creatorRatInput = document.createElement('input');
    creatorRatInput.type = 'text';
    creatorRatInput.placeholder = 'Rationale (Why these items?)';
    creatorRatInput.id = 'creator-rat-input';

    // Add Button
    const addScenarioBtn = createButton('btn-add-scenario', 'Add Scenario', () => {
        const sit = document.getElementById('creator-sit-input').value;
        const items = document.getElementById('creator-items-input').value;
        const rat = document.getElementById('creator-rat-input').value;

        if (sit && items) {
            const newSit = {
                situation: sit,
                modelAnswer: items,
                rationale: rat
            };
            dispatch({ type: 'ADD_CUSTOM_SITUATION', payload: newSit });
            alert('Scenario Added!');
            // Clear inputs
            document.getElementById('creator-sit-input').value = '';
            document.getElementById('creator-items-input').value = '';
            document.getElementById('creator-rat-input').value = '';
        } else {
            alert('Please enter at least a Scenario and Items.');
        }
    });

    // Back Button
    const backBtn = createButton('btn-back', 'Back to Start', () =>
        dispatch({ type: 'NAVIGATE', payload: 'start' })
    );
    backBtn.style.backgroundColor = '#6c757d'; // Grey color for back button

    // --- Layout Assembly (Split Screen) ---
    // Clear styles for specific container
    container.style.textAlign = 'left';
    container.style.display = 'grid';
    container.style.gridTemplateColumns = '1fr 1fr';
    container.style.gap = '40px';
    container.style.padding = '20px';
    container.style.alignItems = 'start';

    const leftPanel = document.createElement('div');
    leftPanel.className = 'settings-left';
    leftPanel.style.display = 'flex';
    leftPanel.style.flexDirection = 'column';
    leftPanel.style.gap = '15px';

    const rightPanel = document.createElement('div');
    rightPanel.className = 'settings-right';
    rightPanel.style.display = 'flex';
    rightPanel.style.flexDirection = 'column';
    rightPanel.style.gap = '15px';

    // Left Panel: Inputs
    leftPanel.appendChild(keyContainer);

    // Timer & Limit Group
    const timerGroup = document.createElement('div');
    timerGroup.appendChild(timerLabel);
    timerGroup.appendChild(timerInput);
    leftPanel.appendChild(timerGroup);

    const limitGroup = document.createElement('div');
    limitGroup.appendChild(limitLabel);
    limitGroup.appendChild(limitInput);
    leftPanel.appendChild(limitGroup);

    // File Import
    const fileGroup = document.createElement('div');
    fileGroup.appendChild(fileLabel);
    fileGroup.appendChild(fileInput);
    leftPanel.appendChild(fileGroup);

    // Creator Form
    leftPanel.appendChild(formDivider);
    leftPanel.appendChild(creatorSitInput);
    leftPanel.appendChild(creatorItemsInput);
    leftPanel.appendChild(creatorRatInput);
    leftPanel.appendChild(addScenarioBtn);


    // Right Panel: Buttons & Toggles & Config
    rightPanel.appendChild(backBtn); // Back button at top of actions? Or bottom? User said Buttons on Right.
    rightPanel.appendChild(toggleBtn);
    rightPanel.appendChild(debugBtn);
    rightPanel.appendChild(manualInputBtn);
    rightPanel.appendChild(clearConfigBtn);

    // Config Preview at Bottom Right
    // Spacer to push config to bottom if needed, or just append
    const spacer = document.createElement('div');
    spacer.style.flexGrow = '1';
    rightPanel.appendChild(spacer);
    rightPanel.appendChild(cachedInfo);

    container.appendChild(leftPanel);
    container.appendChild(rightPanel);

    return createScreen(
        'settings-screen',
        state.currentScreen === 'settings',
        'Settings',
        'Configure application settings below.',
        [container]
    );
};



const SelectionScreen = (state, dispatch) => {
    const container = document.createElement('div');
    container.className = 'selection-container';

    // Instruction textbox with Bravo head
    const instructionBox = document.createElement('div');
    instructionBox.className = 'selection-textbox';

    const bravoHead = document.createElement('img');
    bravoHead.src = 'bravo-face.svg';
    bravoHead.alt = 'Bravo the Red Panda';
    bravoHead.className = 'bravo-head';

    const instructionText = document.createElement('div');
    instructionText.innerHTML = `
        <h2>Which of these is a Go-Bag?</h2>
        <p>Scan the QR code of the one you think is correct!</p>
    `;

    instructionBox.appendChild(bravoHead);
    instructionBox.appendChild(instructionText);

    // Cards container
    const cardsRow = document.createElement('div');
    cardsRow.className = 'selection-cards-row';

    // Images
    const images = [
        { src: 'FirstAidKit.png', name: 'First Aid Kit' },
        { src: 'FirstAidBag.png', name: 'First Aid Bag' },
        { src: 'GoBag.png', name: 'GoBag' }
    ];

    images.forEach(imgData => {
        const card = document.createElement('div');
        card.className = 'selection-card';
        card.onclick = () => dispatch({ type: 'SELECT_ITEM', payload: imgData.name });

        // QR code image
        const qrCodeImg = document.createElement('img');
        qrCodeImg.src = `images/QRcode/${imgData.src}`;
        qrCodeImg.alt = `${imgData.name} QR Code`;
        qrCodeImg.className = 'selection-qr-code';

        // Bag image
        const bagImg = document.createElement('img');
        bagImg.src = imgData.src;
        bagImg.alt = imgData.name;
        bagImg.className = 'selection-bag-image';

        card.appendChild(qrCodeImg);
        card.appendChild(bagImg);
        cardsRow.appendChild(card);
    });

    // Assemble screen
    container.appendChild(instructionBox);
    container.appendChild(cardsRow);

    return createScreen(
        'selection-screen',
        state.currentScreen === 'selection',
        null,
        null,
        [container]
    );
};

const FeedbackScreen = (state, dispatch) => {
    const container = document.createElement('div');
    container.className = 'feedback-container';

    // The styled dialogue box
    const feedbackText = document.createElement('div');
    feedbackText.className = 'feedback-text';

    // Character face image (inside the box)
    const face = document.createElement('img');
    face.src = 'bravo-face.svg';
    face.alt = 'Bravo the Red Panda';
    face.className = 'character-face';

    // The actual text message
    // The actual text message
    const feedbackMsg = document.createElement('p');
    feedbackMsg.className = 'feedback-message';

    let msgText = "";
    if (state.selectionResult === 'correct') {
        // GoBag
        msgText = "That’s right, a Go-Bag is a regular bag that you pack! It should be prepared in advance and kept accessible at all times. <br><br>The bag should have the necessary supplies to ensure your safety, health, and comfort for three days.";
    } else {
        if (state.selectedItem === 'First Aid Kit') {
            msgText = "Not quite! While a First Aid Kit is a vital component that could belong in your Go Bag, it isn't the bag itself. <br><br>A First Aid Kit treats injuries, but it lacks the food, water, clothing, and documents that you may need in an emergency! Try again!";
        } else if (state.selectedItem === 'First Aid Bag') {
            msgText = "Not quite! This is a First Responder Trauma Kit, with equipment used to treat immediate, life-threatening injuries. It does not contain general survival supplies like hygiene items, nutrition, and clothing needed for a multi-day emergency. Try again!";
        } else {
            msgText = "Not quite. Think about what is essential for survival.";
        }
    }
    feedbackMsg.innerHTML = msgText;

    // Build structure: face + text inside the box
    feedbackText.appendChild(face);
    feedbackText.appendChild(feedbackMsg);

    // NEXT Button inside text box
    const nextBtn = createNavButton("NEXT", "nextCodeOnly.jpg", "red", "inside-box small");
    nextBtn.onclick = () => {
        if (state.selectionResult === 'correct') {
            dispatch({ type: 'NAVIGATE', payload: 'demo' });
        } else {
            dispatch({ type: 'NAVIGATE', payload: 'selection' });
        }
    };
    feedbackText.appendChild(nextBtn);

    // Image box (to the right of dialogue box)
    const feedbackImgBox = document.createElement('div');
    feedbackImgBox.className = 'feedback-image-box';

    // Dynamic Image Selection
    // Map Item Name -> Filename
    let itemImageSrc = 'GoBag.png'; // Default
    if (state.selectedItem === 'First Aid Kit') itemImageSrc = 'FirstAidKit.png';
    else if (state.selectedItem === 'First Aid Bag') itemImageSrc = 'FirstAidBag.png';
    else if (state.selectedItem === 'GoBag') itemImageSrc = 'GoBag.png';

    const bagImg = document.createElement('img');
    bagImg.src = itemImageSrc;
    bagImg.alt = state.selectedItem || 'Go Bag';
    feedbackImgBox.appendChild(bagImg);

    // Overlay Icon (Tick or Cross)
    const overlayIcon = document.createElement('img');
    overlayIcon.className = 'feedback-overlay-icon';
    if (state.selectionResult === 'correct') {
        overlayIcon.src = 'tick.png';
        overlayIcon.alt = 'Correct';
    } else {
        overlayIcon.src = 'cross.png';
        overlayIcon.alt = 'Wrong';
    }
    feedbackImgBox.appendChild(overlayIcon);

    // Add both boxes to container
    container.appendChild(feedbackText);
    container.appendChild(feedbackImgBox);

    return createScreen(
        'feedback-screen',
        state.currentScreen === 'feedback',
        state.selectionResult === 'correct' ? 'Correct!' : 'Incorrect',
        'Scan NEXT to continue.',
        [container]
    );
};

const PreGameScreen = (state, dispatch) => {
    return createScreen(
        'pregame-screen',
        state.currentScreen === 'pregame',
        'Get Ready',
        'Are you ready to pack a go-bag for your selected person? Scan NEXT to start.',
        []
    );
};

const SituationScreen = (state, dispatch) => {
    const situationDisplay = document.createElement('div');
    situationDisplay.className = 'result-box';
    // Style: Bigger, Brighter Blue, Bold
    situationDisplay.style.fontSize = '3.5rem'; // Even Bigger
    situationDisplay.style.fontWeight = '900';
    situationDisplay.style.textAlign = 'center';
    situationDisplay.style.padding = '30px';
    situationDisplay.style.color = '#0066ff'; // Electric Blue
    situationDisplay.style.textShadow = '0px 0px 2px rgba(0,0,0,0.1)'; // Slight shadow for boldness
    situationDisplay.style.lineHeight = '1.2';

    situationDisplay.textContent = state.currentSituation ? (state.currentSituation.situation || state.currentSituation) : '';

    const instruction = document.createElement('p');
    instruction.textContent = "Scan NEXT to Continue";
    instruction.style.marginTop = "30px";
    instruction.style.fontWeight = "bold";
    instruction.style.fontSize = "1.5rem";

    // Add Red Timer Text (Time Limit Info)
    const timeLimitInfo = document.createElement('div');
    timeLimitInfo.textContent = `Time Limit: ${state.config.timer}s`;
    timeLimitInfo.style.color = '#dc2626'; // RED
    timeLimitInfo.style.fontSize = '2rem';
    timeLimitInfo.style.fontWeight = 'bold';
    timeLimitInfo.style.marginTop = '20px';

    return createScreen(
        'situation-screen',
        state.currentScreen === 'situation',
        'Scenario',
        'You are packing a bag for:',
        [situationDisplay, timeLimitInfo, instruction]
    );
};

const ScanScreen = (state, dispatch) => {
    // Main vertical layout
    const layout = document.createElement('div');
    layout.className = 'scan-layout';

    // --- Timer Box (Top) ---
    const timerBox = document.createElement('div');
    timerBox.className = 'timer-box';
    if (state.timeLeft <= 10 && state.timeLeft > 0) {
        timerBox.classList.add('warning');
    }

    const timerText = document.createElement('div');
    timerText.id = 'timer-display';
    timerText.className = 'timer-text';
    timerText.textContent = formatTime(state.timeLeft);

    timerBox.appendChild(timerText);

    // --- Scenario Box (Middle) ---
    const scenarioBox = document.createElement('div');
    scenarioBox.className = 'scenario-box';

    const scenarioImg = document.createElement('img');
    scenarioImg.src = 'GoBag.png';
    scenarioImg.alt = 'Go Bag';
    scenarioImg.className = 'scenario-box-image';

    const scenarioText = document.createElement('div');
    scenarioText.className = 'scenario-box-text';
    const situationText = state.currentSituation ? (state.currentSituation.situation || state.currentSituation) : 'Standard Emergency';
    scenarioText.innerHTML = `Packing a bag for: <br> a <span class="text-emphasis-salmon">${situationText}!</span>`;

    scenarioBox.appendChild(scenarioImg);
    scenarioBox.appendChild(scenarioText);

    // --- Grid Container (Bottom) ---
    const gridContainer = document.createElement('div');
    gridContainer.className = 'scan-grid-container';

    const grid = document.createElement('div');
    grid.className = 'scan-items-grid';

    // Create 16 slots (4x4 grid)
    const slotCount = 16;
    const itemLimit = parseInt(state.config.itemLimit) || 16;

    for (let i = 0; i < slotCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'scan-item-slot';

        if (i >= itemLimit) {
            // Slot is beyond the limit - unused
            slot.classList.add('unused');
        } else {
            const itemText = state.scannedData[i] || '';
            if (itemText) {
                slot.textContent = itemText;
                slot.classList.add('filled');
            }
            // Empty slots (i < itemLimit but no item) keep base styling
        }

        grid.appendChild(slot);
    }

    // --- Item Counter Box ---
    const counterBox = document.createElement('div');
    counterBox.className = 'item-counter-box';
    counterBox.id = 'item-counter';
    counterBox.textContent = `${state.scannedData.length}/${itemLimit}`;

    gridContainer.appendChild(counterBox);
    gridContainer.appendChild(grid);

    // --- Hidden Input for Barcode Scanning ---
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'scan-input';
    input.placeholder = 'Type an item here...';
    input.autocomplete = 'off';

    // Hide input if manual input is disabled
    if (!state.config.showManualInput) {
        input.style.position = 'absolute';
        input.style.opacity = '0';
        input.style.pointerEvents = 'none';
        input.style.height = '0';
    }

    if (state.currentScreen === 'scan') {
        setTimeout(() => input.focus(), 50);
    }

    const handleAdd = () => {
        const val = input.value.trim();
        if (val) {
            dispatch({ type: 'ADD_ITEM', payload: val });
            input.value = '';
            input.focus();
        } else {
            input.style.borderColor = '#ef4444';
            setTimeout(() => input.style.borderColor = '', 500);
        }
    };

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdd();
    });

    // --- Content Container (wraps scenario box + grid) ---
    const contentContainer = document.createElement('div');
    contentContainer.className = 'scan-content-container';
    contentContainer.appendChild(scenarioBox);
    contentContainer.appendChild(gridContainer);

    // Assemble layout
    // Assemble layout
    layout.appendChild(timerBox);
    layout.appendChild(contentContainer);
    layout.appendChild(input); // Hidden input for scanning

    return createScreen(
        'scan-screen',
        state.currentScreen === 'scan',
        null,
        null,
        [layout]
    );
};

const ScanInterstitialScreen = (state) => {
    // Debug log
    if (state.currentScreen === 'scan_interstitial') {
        console.log("RENDER: ScanInterstitialScreen active. Msg:", state.interstitialMessage);
    }
    const msgDiv = document.createElement('div');
    msgDiv.className = 'scan-interstitial-message countdown-text'; // Add animation class
    msgDiv.textContent = state.interstitialMessage || "Processing...";

    // Ensure visibility with z-index
    msgDiv.style.zIndex = '9999';
    msgDiv.style.position = 'relative'; // Helps with z-index

    // Play Notification Sound
    // Prevent double play if re-rendering, but ScanInterstitial creates new DOM each render anyway
    // Play Notification Sound
    if (state.currentScreen === 'scan_interstitial') {
        try {
            bgm.stop();
            const sound = new Howl({
                src: ['./audio/timer_end.mp3']
            });
            sound.play();
        } catch (e) {
            console.warn("Audio Playback Error:", e);
        }
    }

    // Style it big and centered

    // Style it big and centered
    msgDiv.style.display = 'flex';
    msgDiv.style.justifyContent = 'center';
    msgDiv.style.alignItems = 'center';
    msgDiv.style.height = '100vh';
    msgDiv.style.fontSize = '6rem'; // Slightly smaller than 8rem to fit longer text "Time's up!"
    msgDiv.style.fontWeight = '900';
    msgDiv.style.fontFamily = '"Dogica Pixel", sans-serif'; // Match font
    msgDiv.style.color = '#2F3061'; // Default
    msgDiv.style.textAlign = 'center';

    if (state.interstitialMessage === "Time's up!") {
        msgDiv.style.color = '#dc2626'; // Red for timeout
    } else if (state.interstitialMessage === "Bag Full!") {
        msgDiv.style.color = '#ca8a04'; // Yellow/Orange
    } else {
        msgDiv.style.color = '#10b981'; // Green for submit
    }

    return createScreen(
        'scan-interstitial-screen',
        state.currentScreen === 'scan_interstitial',
        null, // No title
        null,
        [msgDiv]
    );
};

const LoadingScreen = (state) => {
    const spinner = document.createElement('div');
    spinner.textContent = '⏳ Analyzing items...';
    spinner.style.fontSize = '20px';
    spinner.style.textAlign = 'center';
    spinner.style.padding = '20px';

    return createScreen(
        'loading-screen',
        state.currentScreen === 'loading',
        'Please Wait',
        null,
        [spinner]
    );
};

const EvaluateScreen = (state, dispatch) => {
    // Parse AI Response first
    let rating = '';
    let description = state.aiResponse;
    let categorizedItems = null;
    if (state.currentScreen == "evaluate") {
        const sound = new Howl({
            src: ['./audio/applause.wav'],
        });

        sound.play();
    }

    try {
        let cleanResponse = state.aiResponse.trim();
        // Remove markdown code blocks if present
        if (cleanResponse.startsWith('```json')) {
            cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanResponse.startsWith('```')) {
            cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        const parsed = JSON.parse(cleanResponse);
        if (parsed.rating && parsed.description) {
            rating = parsed.rating;
            description = parsed.description;
        }
        if (parsed.items && Array.isArray(parsed.items)) {
            categorizedItems = parsed.items;
        }
    } catch (e) {
        console.warn('Failed to parse AI response as JSON:', e);
    }

    // Main vertical layout (matching ScanScreen)
    const layout = document.createElement('div');
    layout.className = 'scan-layout';

    // --- Score Box (Top) - reusing score-box style ---
    const scoreBox = document.createElement('div');
    scoreBox.className = 'score-box';

    const scoreText = document.createElement('div');
    scoreText.className = 'timer-text';
    scoreText.textContent = rating || '?/100';

    scoreBox.appendChild(scoreText);

    // --- Comment Box (Middle) - evaluation specific style ---
    const commentBox = document.createElement('div');
    commentBox.className = 'eval-comment-box';

    const bravoImg = document.createElement('img');
    bravoImg.src = 'bravo-face.svg';
    bravoImg.alt = 'Bravo the Red Panda';
    bravoImg.className = 'scenario-box-image';

    const commentText = document.createElement('div');
    commentText.className = 'eval-comment-text';
    commentText.textContent = description || 'Evaluating your bag...';

    commentBox.appendChild(bravoImg);
    commentBox.appendChild(commentText);

    // --- Grid Container (Bottom) ---
    const gridContainer = document.createElement('div');
    gridContainer.className = 'scan-grid-container';

    const grid = document.createElement('div');
    grid.className = 'scan-items-grid';

    // Create 16 slots (4x4 grid) with color coding
    const slotCount = 16;
    const itemLimit = parseInt(state.config.itemLimit) || 16;

    for (let i = 0; i < slotCount; i++) {
        const slot = document.createElement('div');
        slot.className = 'scan-item-slot';

        if (i >= itemLimit) {
            // Slot is beyond the limit - unused
            slot.classList.add('unused');
        } else {
            const itemText = state.scannedData[i] || '';
            if (itemText) {
                slot.textContent = itemText;
                slot.classList.add('filled');

                // Apply evaluation status color if available
                if (categorizedItems) {
                    const match = categorizedItems.find(ci =>
                        ci.name.toLowerCase() === itemText.toLowerCase()
                    );
                    if (match) {
                        if (match.status === 'correct') slot.classList.add('status-correct');
                        else if (match.status === 'okay') slot.classList.add('status-okay');
                        else if (match.status === 'wrong') slot.classList.add('status-wrong');
                    }
                }
            }
            // Empty slots keep base styling
        }

        grid.appendChild(slot);
    }

    gridContainer.appendChild(grid);

    // --- Content Container (wraps comment box + grid) ---
    const contentContainer = document.createElement('div');
    contentContainer.className = 'scan-content-container';
    contentContainer.appendChild(commentBox);
    contentContainer.appendChild(gridContainer);

    // Assemble layout
    layout.appendChild(scoreBox);
    layout.appendChild(contentContainer);

    return createScreen(
        'evaluate-screen',
        state.currentScreen === 'evaluate',
        null,
        null,
        [layout]
    );
};

// --- Main App Logic ---

const App = (rootId) => {
    const root = document.getElementById(rootId);
    let state = { ...initialState };
    let timerInterval = null; // Timer interval variable
    let interstitialTimer = null; // Debounce for interstitial timeout

    const getRandomSituation = () => {
        let pool = [];
        if (typeof SITUATIONS !== 'undefined' && SITUATIONS.length > 0) {
            pool = [...pool, ...SITUATIONS];
        }
        if (state.customSituations && state.customSituations.length > 0) {
            pool = [...pool, ...state.customSituations];
        }

        if (pool.length > 0) {
            const randomIndex = Math.floor(Math.random() * pool.length);
            return pool[randomIndex];
        }
        return { situation: "Standard Emergency", modelAnswer: "", rationale: "" };
    };

    const update = (state, action) => {
        switch (action.type) {
            case 'START_SITUATION':
                return { ...state, currentScreen: 'intro', introStep: 0 }; // Go to Intro first
            case 'INTRO_NEXT':
                const nextStep = state.introStep + 1;
                // 0: Hey there..., 1: I'd like to show you...
                // If nextStep > 1, go to selection
                if (nextStep > 1) {
                    return { ...state, currentScreen: 'selection' };
                }
                return { ...state, introStep: nextStep };

            case 'START_COUNTDOWN':
                return {
                    ...state,
                    currentScreen: 'countdown',
                    countdownValue: 3 // Reset to 3 (No READY)
                };

            case 'COUNTDOWN_TICK':
                const nextVal = state.countdownValue - 1;
                if (nextVal < 0) {
                    // Done, go to scan
                    const initialTime = parseInt(state.config.timer) || 0;
                    return { ...state, currentScreen: 'scan', timeLeft: initialTime, countdownValue: 0 };
                }
                return { ...state, countdownValue: nextVal };
            case 'SELECT_ITEM':
                const item = action.payload;
                const isCorrect = item.toLowerCase() === 'gobag';
                if (!isCorrect) {
                    // For wrong items (First Aid Kit/Bag) - do we stay or show feedback?
                    // Original logic went to 'feedback'.
                    // User didn't specify changing this behavior for wrong items,
                    // but said "After GoBag screen... replace gobag image...".
                    // So if GoBag is correct, go to Demo.
                    return {
                        ...state,
                        currentScreen: 'feedback',
                        selectedItem: item,
                        selectionResult: 'wrong'
                    };
                }

                // If Correct (GoBag)
                // Go to FEEDBACK screen as requested
                return {
                    ...state,
                    currentScreen: 'feedback',
                    selectedItem: item, // Fix: Update item even if correct, to overwrite previous wrong selection
                    selectionResult: 'correct'
                };

            case 'DEMO_NEXT':
                if (state.demoStep === 0) {
                    return { ...state, demoStep: 1 };
                } else {
                    const initialTime = parseInt(state.config.timer) || 0;

                    // We set the situation here so it is ready for Scan
                    return {
                        ...state,
                        currentScreen: 'countdown', // Go to Countdown
                        countdownValue: 3, // Start 3s (No READY)
                        introStep: 0,
                        demoStep: 0,
                        timeLeft: initialTime
                    };
                }
            case 'NAVIGATE':
                // When navigating TO scan, initialize timer
                if (action.payload === 'scan') {
                    const initialTime = parseInt(state.config.timer) || 0;
                    return { ...state, currentScreen: action.payload, timeLeft: initialTime };
                }
                // Situation logic moved to after PreGame
                if (action.payload === 'situation') {
                    return { ...state, currentScreen: 'situation', currentSituation: getRandomSituation() };
                }
                // Set random situation when entering demo
                if (action.payload === 'demo') {
                    return { ...state, currentScreen: 'demo', currentSituation: getRandomSituation() };
                }
                return { ...state, currentScreen: action.payload };
                return { ...state, currentScreen: action.payload };
            case 'ADD_ITEM':
                // H) Disable entering into list unless in SCAN state
                if (state.currentScreen !== 'scan') {
                    return state;
                }

                const newItemList = [...state.scannedData, action.payload];
                // Note: Logic for limit check is primarily in dispatch to triggering side effect,
                // but we update state here.
                return { ...state, scannedData: newItemList };
            case 'EVALUATE_START':
                performEvaluation();
                return { ...state, currentScreen: 'loading', isLoading: true };
            case 'EVALUATE_SUCCESS':
                return {
                    ...state,
                    currentScreen: 'loading', // Stay on loading
                    isLoading: false,
                    aiReady: true, // Flag that AI is done
                    aiResponse: action.payload
                };
            case 'LOADING_COMPLETE':
                return {
                    ...state,
                    currentScreen: 'evaluate',
                    aiReady: false // Reset flag
                };
            case 'EVALUATE_ERROR':
                return { ...state, currentScreen: 'evaluate', isLoading: false, aiResponse: action.payload };
            case 'RESET':
                return { ...initialState, config: state.config, customSituations: state.customSituations }; // Keep config and custom sits
            case 'TOGGLE_RANDOMIZE':
                return {
                    ...state,
                    config: { ...state.config, randomizeOrChoose: !state.config.randomizeOrChoose }
                };
            case 'UPDATE_TIMER':
                return {
                    ...state,
                    config: { ...state.config, timer: action.payload }
                };
            case 'TOGGLE_DEBUG':
                return {
                    ...state,
                    config: { ...state.config, showDebug: !state.config.showDebug }
                };
            case 'UPDATE_ITEM_LIMIT':
                return {
                    ...state,
                    config: { ...state.config, itemLimit: action.payload }
                };
            case 'UPDATE_APIKEY':
                return {
                    ...state,
                    config: { ...state.config, apiKey: action.payload }
                };
            case 'TOGGLE_MANUAL_INPUT':
                return {
                    ...state,
                    config: { ...state.config, showManualInput: !state.config.showManualInput }
                };
            case 'TICK':
                return {
                    ...state,
                    timeLeft: state.timeLeft > 0 ? state.timeLeft - 1 : 0
                };
            case 'SCAN_COMPLETE':
                console.log("REDUCER: SCAN_COMPLETE triggered", action.payload);
                return {
                    ...state,
                    currentScreen: 'scan_interstitial',
                    interstitialMessage: action.payload
                };
            case 'INTERSTITIAL_TIMEOUT':
                // Timeout finished, now start evaluation (loading)
                performEvaluation();
                return { ...state, currentScreen: 'loading', isLoading: true };

            case 'LOAD_CUSTOM_CONFIG':
                const newSituations = [...state.customSituations, ...action.payload];
                return { ...state, customSituations: newSituations };
            case 'ADD_CUSTOM_SITUATION':
                return { ...state, customSituations: [...state.customSituations, action.payload] };
            case 'CLEAR_CUSTOM_CONFIG':
                return { ...state, customSituations: [] };
            default:
                return state;
        }
    };
    const performEvaluation = async () => {
        //if list
        setTimeout(async () => {
            const prompt = constructPrompt(state.scannedData, state.currentSituation);
            dispatch({ type: 'SET_LAST_PROMPT', payload: prompt });
            if (state.config.showDebug) {
                console.log("DEBUG PROMPT:", prompt);
            }
            const result = await callGemini(prompt, state.config.apiKey);
            if (state.config.showDebug) {
                console.log("DEBUG RESPONSE:", result);
            }
            dispatch({ type: 'EVALUATE_SUCCESS', payload: result });
        }, 1000);
    };

    const dispatch = (action) => {
        // Wrapper to handle side effects like Limit Reached
        if (action.type === 'ADD_ITEM') {
            const prevState = { ...state };

            // Play Scan Sound
            try {
                if (state.currentScreen == "scan") {
                    const sound = new Howl({
                        src: ['./audio/add_item.mp3']
                    });
                    sound.play();
                }
            } catch (e) {
                console.warn("Scan Sound Error:", e);
            }

            state = update(state, action);

            // Check if we hit limit
            const limit = parseInt(state.config.itemLimit) || 15;
            if (state.scannedData.length >= limit && state.currentScreen === 'scan') {
                dispatch({ type: 'SCAN_COMPLETE', payload: 'Bag Full!' }); // Trigger Interstitial
                return; // Stop processing this specific dispatch call further
            }
        }
        else if (action.type === 'TICK' && state.currentScreen === 'scan') {
            // Handle Timer Expiry for Scan
            if (state.timeLeft <= 1) { // If about to hit 0
                dispatch({ type: 'SCAN_COMPLETE', payload: "Time's up!" });
                return;
            }
            state = update(state, action);
        }
        else {
            state = update(state, action);
        }

        // Side Effect for Interstitial Timeout
        // Side Effect for Interstitial Timeout
        if (state.currentScreen === 'scan_interstitial') {
            if (!interstitialTimer) {
                console.log("DEBUG: Starting Interstitial Timer (2.5s)");
                interstitialTimer = setTimeout(() => {
                    console.log("DEBUG: Interstitial Timer FIRED");
                    // Ensure we are still in that state
                    if (window.appState.currentScreen === 'scan_interstitial') {
                        dispatch({ type: 'INTERSTITIAL_TIMEOUT' });
                    } else {
                        console.log("DEBUG: Timer fired but screen changed to", window.appState.currentScreen);
                    }
                    interstitialTimer = null;
                }, 2500);
            }
        } else {
            // Left the screen? Clear timer
            if (interstitialTimer) {
                console.log("DEBUG: Clearing Interstitial Timer (Screen changed to " + state.currentScreen + ")");
                clearTimeout(interstitialTimer);
                interstitialTimer = null;
            }
        }

        const activeElement = document.activeElement;
        const activeId = activeElement ? activeElement.id : null;
        const selectionStart = activeElement ? activeElement.selectionStart : null;
        const selectionEnd = activeElement ? activeElement.selectionEnd : null;

        window.appState = state; // Expose state for debugging/usage
        window.dispatchApp = dispatch; // Expose dispatch for global events (like video ended)

        // Timer Side Effects
        // Timer Side Effects
        const needsTimer = state.currentScreen === 'scan' || state.currentScreen === 'countdown';

        if (needsTimer) {
            // Entered Scan or Countdown Screen
            if (!timerInterval) {
                timerInterval = setInterval(() => {
                    // Use window.appState to get the absolute latest state avoiding closure staleness if any
                    const current = window.appState || state;
                    if (current.currentScreen === 'scan') {
                        dispatch({ type: 'TICK' });
                    } else if (current.currentScreen === 'countdown') {
                        dispatch({ type: 'COUNTDOWN_TICK' });
                    }
                }, 1000);
            }
        } else {
            // Left Scan/Countdown Screen
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
        }

        if (action.type === 'TICK' && state.timeLeft === 0) {
            // Timer finished
            if (timerInterval) {
                clearInterval(timerInterval);
                timerInterval = null;
            }
            // Force evaluation if on scan screen
            if (state.currentScreen === 'scan') {
                dispatch({ type: 'EVALUATE_START' });
            }
        }

        if (action.type === 'TICK') {
            const timerEl = document.getElementById('timer-display');
            if (timerEl) {
                timerEl.textContent = formatTime(state.timeLeft);
                // Update timer box warning state
                const timerBox = timerEl.parentElement;
                if (timerBox && timerBox.classList.contains('timer-box')) {
                    if (state.timeLeft <= 10 && state.timeLeft > 0) {
                        timerBox.classList.add('warning');
                    } else {
                        timerBox.classList.remove('warning');
                    }
                }
                return; // Skip full render
            }
        }

        // Helper to save settings on change
        if (action.type.startsWith('TOGGLE_') || action.type.startsWith('UPDATE_')) {
            localStorage.setItem('appConfig', JSON.stringify(state.config));
        }
        if (action.type.includes('CUSTOM_CONFIG')) {
            localStorage.setItem('customSituations', JSON.stringify(state.customSituations));
        }

        // Logic to Manage BGM (Play ONLY in Scan state)
        if (state.currentScreen === 'scan') {
            if (typeof bgm !== 'undefined' && !bgm.playing()) {
                bgm.play();
            }
        } else {
            if (typeof bgm !== 'undefined' && bgm.playing()) {
                bgm.stop();
            }
        }

        render();

        // Restore focus and cursor position
        if (activeId) {
            const el = document.getElementById(activeId);
            if (el) {
                el.focus();
                if (selectionStart !== null && selectionEnd !== null && (el.type === 'text' || el.type === 'number' || el.tagName === 'TEXTAREA')) {
                    try {
                        el.setSelectionRange(selectionStart, selectionEnd);
                    } catch (e) {
                        console.warn('Could not restore selection range', e);
                    }
                }
            }
        }
    };


    const ThankYouScreen = (state, dispatch) => {
        const container = document.createElement('div');
        container.className = 'thankyou-container';

        // Image: BravoThankYou.png? User mentioned it.
        // User image shows Bravo on left, box on right/center.
        // Let's create the Box first.

        const thankYouBox = document.createElement('div');
        thankYouBox.className = 'thankyou-box';

        // Title
        const title = document.createElement('h1');
        title.className = 'thankyou-title';
        title.textContent = "Thank you for playing!";

        // Text: Developed by...
        const text = document.createElement('p');
        text.className = 'thankyou-text';
        text.innerHTML = `
        Developed by the Interaction Materials Lab<br>
        at the National University of Singapore<br>
        in collaboration with<br>
        Red Cross Singapore Youth<br><br>
        Scan this QR-code (with your phone) to find out more!
    `;

        // QR Code for external link
        const code = document.createElement('img');
        code.className = 'thankyou-code-img';
        code.src = 'thankyoucode.png'; // Verified filename
        code.alt = 'Scan for more info';

        thankYouBox.appendChild(title);
        thankYouBox.appendChild(text);
        thankYouBox.appendChild(code);

        // Bravo Image (Decoration)
        const bravoImg = document.createElement('img');
        bravoImg.src = 'BravoThankYou.png'; // Verified filename
        bravoImg.className = 'bravo-thankyou-img';

        // Play Again Button (Red)
        const playAgainBtn = createNavButton("PLAY AGAIN", "nextCodeOnly.jpg", "red", "default-pos");
        playAgainBtn.onclick = () => dispatch({ type: 'RESET' });

        // Append to container
        container.appendChild(thankYouBox);
        container.appendChild(bravoImg);
        container.appendChild(playAgainBtn);

        return createScreen(
            'thank-you-screen',
            state.currentScreen === 'thankyou',
            null, // Title handled by box
            null, // Desc handled by box
            [container]
        );
    };


    const render = () => {
        // Hide QR code on selection screen
        const qrCode = document.getElementById('qr-code');
        if (qrCode) {
            if (state.currentScreen === 'selection') {
                qrCode.style.display = 'none';
            } else {
                qrCode.style.display = 'block';
            }
        }

        root.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'app-container';

        container.appendChild(StartScreen(state, dispatch));
        container.appendChild(IntroScreen(state, dispatch)); // Add Intro Screen
        container.appendChild(SettingsScreen(state, dispatch));
        container.appendChild(ThankYouScreen(state, dispatch));
        container.appendChild(SelectionScreen(state, dispatch));
        container.appendChild(FeedbackScreen(state, dispatch));
        container.appendChild(DemoScreen(state, dispatch)); // Add Demo Screen
        container.appendChild(PreGameScreen(state, dispatch));
        container.appendChild(SituationScreen(state, dispatch));
        container.appendChild(CountdownScreen(state, dispatch));
        container.appendChild(ScanScreen(state, dispatch));
        container.appendChild(ScanInterstitialScreen(state)); // Add Interstitial Screen
        container.appendChild(LoadingScreen(state));
        container.appendChild(EvaluateScreen(state, dispatch));

        // Apply Background Classes based on State
        // Apartment: Intro, Selection, Situation, Demo
        // Seamless: Scan, Evaluate, Countdown, Loading, ThankYou, Feedback, Start

        const apartmentStates = ['intro', 'selection', 'situation', 'demo'];
        // Start removed from apartmentStates to allow seamless scrolling

        // Let's assume Feedback is Apartment too since it's pre-game.
        apartmentStates.push('feedback');

        if (apartmentStates.includes(state.currentScreen)) {
            container.classList.add('bg-apartment');
            container.classList.remove('bg-scrolling');
        } else {
            container.classList.add('bg-scrolling');
            container.classList.remove('bg-apartment');
        }


        root.appendChild(container);

        // --- Persistent Navigation Buttons (HTML Version) ---

        // EXIT / RESTART Button (Global)
        let exitBtn = document.getElementById('nav-exit-container');
        if (!exitBtn) {
            exitBtn = createNavButton('RESTART', 'exitCodeOnly.jpg', 'blue', 'default-pos');
            exitBtn.id = 'nav-exit-container';
            exitBtn.style.top = '30px';
            exitBtn.style.left = '30px';
            exitBtn.style.bottom = 'auto';
            exitBtn.style.right = 'auto';
            exitBtn.onclick = () => dispatch({ type: 'RESET' });
            document.body.appendChild(exitBtn);
        }

        // Hide Restart on Start, Countdown, Evaluate, ThankYou
        // User requested: Remove on pregame? No, specifically: Welcome, Countdown, Evaluate, ThankYou.
        // Welcome = start.
        if (['start', 'countdown', 'evaluate', 'thankyou'].includes(state.currentScreen)) {
            exitBtn.style.display = 'none';
        } else {
            exitBtn.style.display = 'flex';
        }
        // Ensure it's visible? It's persistent.

        // NEXT Button - Removed Global Logic. Handled per-screen.
        // We might want to generic next button for 'PreGame' / 'Evaluate' / 'Scan' if they don't have custom logic?
        // Let's add specific Next buttons to those screens too? or keep a fallback here?
        // User requirements were specific for Start/Intro/Feedback/Demo/ThankYou.
        // What about PreGame/Situation/Scan/Evaluate?
        // PreGame/Situation: "NEXT" generally required.
        // Scan: "NEXT" triggers Evaluate.
        // Evaluate: "NEXT" triggers ThankYou.
        // So we DO need a generic fallback next button for screens NOT handled above?
        // Or better: Add it to those screens directly.
        // Screens missing custom Next: PreGame, Situation, Scan, Evaluate.

        const screensNeedingGenericNext = ['pregame', 'situation', 'scan', 'evaluate'];
        if (screensNeedingGenericNext.includes(state.currentScreen)) {
            let genericNext = document.getElementById('nav-generic-next');
            if (!genericNext) {
                genericNext = createNavButton('NEXT', 'nextCodeOnly.jpg', 'red', 'default-pos');
                genericNext.id = 'nav-generic-next';
                document.body.appendChild(genericNext);
            }
            genericNext.style.display = 'flex';

            // Default Styling
            if (state.currentScreen === 'scan') {
                genericNext.querySelector('span').textContent = 'DONE';
            } else {
                genericNext.querySelector('span').textContent = 'NEXT';
            }
            genericNext.className = 'nav-button red default-pos'; // Reset classes

            // Positioning overrides
            if (['scan', 'evaluate'].includes(state.currentScreen)) {
                // Top Right
                genericNext.style.top = '30px';
                genericNext.style.bottom = 'auto';
            } else {
                // Default Bottom Right
                genericNext.style.top = 'auto';
                genericNext.style.bottom = '30px';
            }

            // Onclick logic? Dispatch generic nav? handled by valid keydown logic mostly.
            // But clicks useful.
            genericNext.onclick = () => {
                // Simulate Enter NEXT logic
                if (state.currentScreen === 'start') dispatch({ type: 'START_SITUATION' });
                if (state.currentScreen === 'pregame') dispatch({ type: 'NAVIGATE', payload: 'situation' });
                if (state.currentScreen === 'situation') { /* Nothing? Automatic? Or user scans next? */ }
                if (state.currentScreen === 'scan') dispatch({ type: 'EVALUATE_START' });
                if (state.currentScreen === 'evaluate') {
                    dispatch({ type: 'NAVIGATE', payload: 'thankyou' });
                }
            };
        } else {
            const genericNext = document.getElementById('nav-generic-next');
            if (genericNext) genericNext.style.display = 'none';
        }

        // --- Persistent Loading Screen (Overlay) ---
        let loadingOverlay = document.getElementById('loading-overlay');
        if (!loadingOverlay) {
            loadingOverlay = document.createElement('div');
            loadingOverlay.id = 'loading-overlay';
            loadingOverlay.style.position = 'fixed';
            loadingOverlay.style.top = '0';
            loadingOverlay.style.left = '0';
            loadingOverlay.style.width = '100%';
            loadingOverlay.style.height = '100%';
            loadingOverlay.style.background = 'rgba(255, 255, 255, 0.5)'; // Semi-transparent
            loadingOverlay.style.backdropFilter = 'blur(5px)'; // optional blur
            loadingOverlay.style.zIndex = '10000'; // Top of everything
            loadingOverlay.style.display = 'none';
            loadingOverlay.style.alignItems = 'center';
            loadingOverlay.style.justifyContent = 'center';
            loadingOverlay.style.flexDirection = 'column';

            // White Box Wrapper
            const loadingBox = document.createElement('div');
            loadingBox.style.background = '#FFFFFF';
            loadingBox.style.border = '8px solid #2F3061';
            loadingBox.style.boxShadow = '8px 8px 0 0 rgba(0,0,0,0.25)';
            loadingBox.style.padding = '20px';
            loadingBox.style.maxWidth = '1000px';
            loadingBox.style.width = '90%';
            loadingBox.style.textAlign = 'center';

            const video = document.createElement('video');
            video.id = 'loading-video';
            video.style.width = '100%';
            video.style.height = 'auto';
            video.muted = true;
            video.playsInline = true;

            // Text Logic ("Waiting for AI...")
            const loadingText = document.createElement('div');
            loadingText.id = 'loading-text-display';
            loadingText.className = 'feedback-message';
            loadingText.style.marginTop = '20px';
            loadingText.style.textAlign = 'center';
            loadingText.textContent = "Packing your bag...";

            loadingBox.appendChild(video);
            loadingBox.appendChild(loadingText);
            loadingOverlay.appendChild(loadingBox); // Append box to overlay
            document.body.appendChild(loadingOverlay);

            // ERROR HANDLING / EMERGENCY SKIP
            const skipLoading = () => {
                const vid = document.getElementById('loading-video');
                vid.pause();
                if (window.dispatchApp) window.dispatchApp({ type: 'LOADING_COMPLETE' });
            };

            // If video fails (missing file?), skip automatically after short delay
            video.addEventListener('error', (e) => {
                const err = video.error;
                console.error("Loading Video Error:", err);
                // Show simple message and skip
                loadingText.textContent = "Loading..."; // Keep it clean, or "Skipping" if you prefer
                setTimeout(skipLoading, 500); // Faster skip if error
            });

            // Click text to force skip (Emergency)
            loadingText.style.cursor = 'pointer';
            loadingText.title = 'Click to skip animation';
            loadingText.onclick = skipLoading;

            // EVENTS
            video.addEventListener('ended', () => {
                const vid = document.getElementById('loading-video');
                const src = vid.getAttribute('src'); // use getAttribute to be safe or vid.src

                // Determine current clip from filename
                // Using includes() for safety against absolute paths
                // Note: Windows filenames are case-insensitive usually, but let's match exact file list: AnimationA.mp4
                if (src.includes('AnimationA.mp4')) {
                    // A done -> B
                    vid.src = 'AnimationB.mp4';
                    vid.play();
                } else if (src.includes('AnimationB.mp4')) {
                    // B done. Check AI
                    const appState = window.appState; // Access global state
                    if (appState && appState.aiReady) {
                        // AI Ready -> C
                        vid.src = 'AnimationC.mp4';
                        vid.play();
                    } else {
                        // Not ready -> Loop B
                        vid.play();
                    }
                } else if (src.includes('AnimationC.mp4')) {
                    // C done -> Finish
                    // Dispatch via global dispatch? We don't have dispatch here easily unless we capture it.
                    // But we can trigger a custom event or click a hidden button?
                    // Or access a global dispatcher if available? 
                    // `dispatch` is inside App scope.
                    // We can expose dispatch globally or re-structure.
                    // EASY HACK: Click the hidden generic next button? No logic mismatch.
                    // BETTER: Expose dispatch on window.
                    if (window.dispatchApp) {
                        window.dispatchApp({ type: 'LOADING_COMPLETE' });
                    }
                }
            });
        }

        // Logic to Show/Hide and Start Animation
        if (state.currentScreen === 'loading') {
            if (loadingOverlay.style.display === 'none') {
                // Just entered loading state
                loadingOverlay.style.display = 'flex';
                const vid = document.getElementById('loading-video');
                vid.src = 'AnimationA.mp4';
                vid.play().catch(e => console.log("Autoplay blocked", e));
            }
        } else {
            loadingOverlay.style.display = 'none';
            // Pause video to save resources?
            const vid = document.getElementById('loading-video');
            if (vid) vid.pause();
        }
    }; // Close render
    // Global Key Listener for Auto-Focus and Barcode Navigation
    let keyBuffer = '';

    document.addEventListener('keydown', (e) => {
        // Barcode Navigation Logic
        if (e.key === 'Enter') {
            const buffer = keyBuffer.toUpperCase().trim();
            if (state.config.showDebug) console.log(`DEBUG KEYDOWN: Ent received. Buffer: '${buffer}'`);

            // EXIT Code Logic - Global

            // EXIT Code Logic - Global
            if (buffer.endsWith('EXIT')) {
                dispatch({ type: 'RESET' });
                keyBuffer = '';
                return;
            }

            if (buffer.endsWith('NEXT') || buffer.endsWith('START')) { // Support START too
                e.preventDefault();
                e.stopPropagation();

                // Trigger Navigation
                switch (state.currentScreen) {
                    case 'start':
                        dispatch({ type: 'START_SITUATION' });
                        break;
                    case 'intro':
                        dispatch({ type: 'INTRO_NEXT' });
                        break;
                    case 'demo':
                        dispatch({ type: 'DEMO_NEXT' });
                        break;
                    case 'feedback':
                        // If wrong, go back to selection. If correct, go to demo
                        if (state.selectionResult === 'correct') {
                            dispatch({ type: 'NAVIGATE', payload: 'demo' });
                        } else {
                            dispatch({ type: 'NAVIGATE', payload: 'selection' });
                        }
                        break;
                    case 'pregame':
                        dispatch({ type: 'NAVIGATE', payload: 'situation' });
                        break;
                    case 'situation': // situation handled in pregame transition mostly
                        break;
                    case 'scan':
                        dispatch({ type: 'SCAN_COMPLETE', payload: 'Submitted!' });
                        break;
                    case 'evaluate':
                        dispatch({ type: 'NAVIGATE', payload: 'thankyou' });
                        // Timer Removed as requested
                        break;
                    case 'thankyou':
                        // Allow manual skip
                        dispatch({ type: 'RESET' });
                        break;
                }
                keyBuffer = '';
                return;
            } else if (buffer.endsWith('SETTINGS')) {
                e.preventDefault();
                e.stopPropagation();
                dispatch({ type: 'NAVIGATE', payload: 'settings' });
                keyBuffer = '';
                return;
            } else if (state.currentScreen === 'selection') {
                // Check for selection barcodes
                // Normalize buffer: remove spaces to match "FIRSTAIDKIT" format
                const cleanBuffer = buffer.replace(/\s+/g, '');

                if (cleanBuffer.endsWith('FIRSTAIDKIT')) {
                    dispatch({ type: 'SELECT_ITEM', payload: 'First Aid Kit' });
                    keyBuffer = '';
                    return;
                } else if (cleanBuffer.endsWith('FIRSTAIDBAG')) {
                    dispatch({ type: 'SELECT_ITEM', payload: 'First Aid Bag' });
                    keyBuffer = '';
                    return;
                } else if (cleanBuffer.endsWith('GOBAG')) {
                    dispatch({ type: 'SELECT_ITEM', payload: 'GoBag' });
                    keyBuffer = '';
                    return;
                }
            } else if (state.currentScreen === 'scan') {
                // Capture barcode scan if not manually typing
                // If manual input is HIDDEN, we treat buffer as item
                if (!state.config.showManualInput && buffer.length > 0) {
                    // Basic check to avoid small random inputs
                    if (buffer.length > 2) {
                        dispatch({ type: 'ADD_ITEM', payload: keyBuffer.trim() });
                    }
                }
            }

            keyBuffer = '';
        } else if (e.key.length === 1) {
            keyBuffer += e.key;
        }

        // Auto-Focus Logic (Only for Scan screen, if manual input is ON)
        if (state.currentScreen === 'scan' && state.config.showManualInput) {
            const input = document.getElementById('scan-input');
            if (input && document.activeElement !== input) {
                if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                    input.focus();
                }
            }
        }
    }, true); // Use capture to intercept before input listeners

    // --- Typewriter Effect Logic ---
    let typewriterInterval = null;
    let currentTypeIndex = 0;
    let lastIntroStep = -1;
    let currentText = "";

    // Dialogues
    // Dialogues
    const dialogues = [
        "Hey there! Welcome to GO Packin’!\nI’m Bravo the Red Panda!",
        "I’d like to show you how to pack a Go Bag and what you should put inside!\nBut first, do you know what a Go Bag looks like?"
    ];

    const handleTypewriter = () => {
        const current = window.appState || state; // Use latest

        if (current.currentScreen !== 'intro') {
            if (typewriterInterval) {
                clearInterval(typewriterInterval);
                typewriterInterval = null;
            }
            return;
        }

        // Check if step changed
        if (current.introStep !== lastIntroStep) {
            lastIntroStep = current.introStep;
            currentTypeIndex = 0;
            currentText = dialogues[current.introStep] || "";
            // Clear element immediately
            const el = document.getElementById('intro-text-box');
            if (el) el.textContent = "";

            // Start typing
            if (typewriterInterval) clearInterval(typewriterInterval);

            typewriterInterval = setInterval(() => {
                const textBox = document.getElementById('intro-text-box');
                if (!textBox) return;

                if (currentTypeIndex < currentText.length) {
                    textBox.textContent += currentText.charAt(currentTypeIndex);
                    currentTypeIndex++;

                    // Toggle talking sprite per letter
                    const panda = document.getElementById('panda-img');
                    if (panda) {
                        if (currentTypeIndex % 2 === 0) {
                            panda.src = 'BravoTheRedPandaDialogueTalking.png';
                        } else {
                            panda.src = 'BravoTheRedPandaDialogue.png';
                        }
                    }

                } else {
                    clearInterval(typewriterInterval);
                    typewriterInterval = null;

                    // Reset to Idle
                    const pandaDone = document.getElementById('panda-img');
                    if (pandaDone) pandaDone.src = 'BravoTheRedPandaDialogue.png';
                }
            }, 50); // Speed: 50ms per char
        } else {
            // Re-render check
            const textBox = document.getElementById('intro-text-box');
            if (textBox && textBox.textContent.length < currentTypeIndex && currentTypeIndex > 0) {
                textBox.textContent = currentText.substring(0, currentTypeIndex);
            }
            // Ensure idle if done
            if (!typewriterInterval) {
                const pandaDone = document.getElementById('panda-img');
                if (pandaDone && pandaDone.src.includes('Talking')) {
                    pandaDone.src = 'BravoTheRedPandaDialogue.png';
                }
            }
        }
    };

    // Hook into render or uses loop?
    // We can hook it into the animateBackground loop or a separate frequent check, 
    // OR just call handleTypewriter inside dispatch/render.
    // Calling in render() is safer to ensure it runs after DOM create.

    const originalRender = render; // Capture original if we weren't replacing the whole function block, but we are inside App scope.
    // We can just add handleTypewriter() call at end of render().

    // We need to modify the existing render() logic to call handleTypewriter?
    // The previous tool replaced text inside App, but we didn't expose 'render' variable easily to wrapper.
    // 'render' is defined as const inside App.
    // I will append the call to `render(); handleTypewriter();` in the `App` initialization or modify `render` itself if I could.
    // Since I can't modify `render` easily with this chunk without replacing huge block, 
    // I'll add a separate interval or hook into `requestAnimationFrame` for checking state.
    // The background loop is running! I can use that!

    // I'll add logic to the animateBackground loop in the next replacement or just use setInterval here.
    setInterval(handleTypewriter, 100); // Check every 100ms


    // --- Background Animation Loop ---
    let bgX = 0;
    let bgY = 0;
    let lastTime = 0;

    const animateBackground = (timestamp) => {
        if (!lastTime) lastTime = timestamp;
        const deltaTime = timestamp - lastTime;
        lastTime = timestamp;

        // Interpret 'speed' from config. 
        // Let's assume config.backgroundSpeed is "pixels per second" or similar.
        // User had "20" as default. Let's try 20px/sec as a base.
        // If the user meant "duration to scroll screen", that's different.
        // Given the previous CSS was 20s for 56px (very slow?), or maybe 20s for something else.
        // Let's aim for a visible but slow scroll. 
        // If value is 20, let's treat it as speed factor.

        const speed = parseFloat(state.config.backgroundSpeed) || 20;

        // Move diagonally (-X and +Y for bottom-left to top-right? Or +X +Y for top-left to bottom-right?)
        // User asked: "move from bottom-left to bottom-right" - wait, bottom-left to bottom-right is horizontal right.
        // User prompt in history said: "rotate 45 degrees and move from bottom-left to bottom-right"
        // Let's do simple diagonal scrolling (Top-Left to Bottom-Right) for now: +X, +Y
        // Adjusted by deltaTime (ms). speed * (deltaTime / 1000) = pixels moved

        const moveAmt = speed * (deltaTime / 1000); // pixels this frame

        bgX += moveAmt;
        bgY += moveAmt; // Diagonal

        // Offset logic: The user wants "updates the position ... based on offset value".
        // Maybe offset is a static shift? Or a speed modifier? Assuming static shift for now plus continuous scroll.

        const staticOffset = parseFloat(state.config.backgroundOffset) || 0;

        // Apply to CSS
        // modifying .app-container::before is hard directly via JS without ID, but we set vars on app-container
        const container = document.querySelector('.app-container');
        if (container) {
            container.style.setProperty('--bg-x', `${bgX + staticOffset}px`);
            container.style.setProperty('--bg-y', `${bgY + staticOffset}px`);
        }

        requestAnimationFrame(animateBackground);
    };

    requestAnimationFrame(animateBackground);

    // Initial Render
    try {
        render();
    } catch (err) {
        console.error("Render Error:", err);
        alert("Error rendering app: " + err.message);
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    try {
        App('app');
    } catch (err) {
        console.error("App Crash:", err);
        alert("Critical App Error: " + err.message);
    }
});
