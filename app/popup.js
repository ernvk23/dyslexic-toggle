const DEFAULTS = {
    enabled: false,
    letterSpacing: 0,
    wordSpacing: 0,
    lineHeight: 140,
    fontSize: 100,
    theme: 'system'
};

const RESTRICTED = ['chrome://', 'chrome-extension://', 'file://', 'about:', 'edge://', 'brave://', 'data:'];

const els = {
    toggle: document.getElementById('toggleBtn'),
    letterSlider: document.getElementById('letterSpacing'),
    wordSlider: document.getElementById('wordSpacing'),
    lineSlider: document.getElementById('lineHeight'),
    fontSlider: document.getElementById('fontSize'),
    letterVal: document.getElementById('letterValue'),
    wordVal: document.getElementById('wordValue'),
    lineVal: document.getElementById('lineValue'),
    fontVal: document.getElementById('fontSizeValue'),
    reset: document.getElementById('resetBtn'),
    exclude: document.getElementById('excludeSite'),
    themeToggle: document.getElementById('themeToggleBtn')
};

let currentDomain = null;
let sliderTimeout = null;

// Initialize
chrome.storage.local.get(['enabled', 'letterSpacing', 'wordSpacing', 'lineHeight', 'fontSize', 'excludedDomains', 'theme'], (result) => {
    updateToggleUI(result.enabled || false);

    els.letterSlider.value = result.letterSpacing ?? DEFAULTS.letterSpacing;
    els.wordSlider.value = result.wordSpacing ?? DEFAULTS.wordSpacing;
    els.lineSlider.value = result.lineHeight ?? DEFAULTS.lineHeight;
    els.fontSlider.value = result.fontSize ?? DEFAULTS.fontSize;

    // Set theme
    const theme = result.theme ?? DEFAULTS.theme;
    applyTheme(theme);

    updateDisplayValues();
    initExclusion(result.excludedDomains || [], result.enabled || false);
});

async function initExclusion(excludedDomains, enabled) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab?.url && !RESTRICTED.some(p => tab.url.startsWith(p))) {
        try {
            const url = new URL(tab.url);
            currentDomain = url.hostname;
            const isExcluded = excludedDomains.includes(currentDomain);

            els.exclude.checked = isExcluded;
            els.exclude.disabled = false;
            updateSlidersState(isExcluded, enabled);
        } catch (e) {
            els.exclude.disabled = true;
            updateSlidersState(true, enabled);
        }
    } else {
        els.exclude.disabled = true;
        updateSlidersState(true, enabled);
    }
}

function updateDisplayValues() {
    els.letterVal.textContent = formatEm(els.letterSlider.value);
    els.wordVal.textContent = formatEm(els.wordSlider.value);
    const lineHeightValue = (els.lineSlider.value / 100).toFixed(2);
    els.lineVal.textContent = lineHeightValue === '-0.00' ? '0.00' : lineHeightValue;
    els.fontVal.textContent = els.fontSlider.value + '%';
}

function formatEm(value) {
    const result = value / 1000;

    if (result === 0) {
        return '0';
    }

    const fixedResult = result.toFixed(2);

    // Prevent displaying -0.00 em
    if (fixedResult === '-0.00') {
        return '0.00 em';
    }

    return fixedResult + ' em';
}

function updateToggleUI(enabled) {
    els.toggle.classList.toggle('active', enabled);
    // Apply the same active class to all slider inputs
    [els.letterSlider, els.wordSlider, els.lineSlider, els.fontSlider].forEach(slider => {
        slider.classList.toggle('active', enabled);
    });
}

function updateSlidersState(isExcluded, isEnabled) {
    const disabled = !isEnabled || isExcluded;
    [els.letterSlider, els.wordSlider, els.lineSlider, els.fontSlider].forEach(s => s.disabled = disabled);
}

// Toggle button
els.toggle.addEventListener('click', async (e) => {
    e.preventDefault();

    const { enabled } = await chrome.storage.local.get('enabled');
    const newState = !enabled;

    updateToggleUI(newState);
    await chrome.storage.local.set({ enabled: newState });

    // Update sliders
    const { excludedDomains } = await chrome.storage.local.get('excludedDomains');
    const isExcluded = currentDomain && excludedDomains.includes(currentDomain);
    updateSlidersState(isExcluded, newState);

    // The background script now handles updating all tabs via storage listener
});

// Exclusion checkbox
els.exclude.addEventListener('change', async () => {
    if (!currentDomain) return;

    const { excludedDomains, enabled } = await chrome.storage.local.get(['excludedDomains', 'enabled']);
    let domains = excludedDomains || [];

    if (els.exclude.checked) {
        if (!domains.includes(currentDomain)) domains.push(currentDomain);
    } else {
        domains = domains.filter(d => d !== currentDomain);
    }

    await chrome.storage.local.set({ excludedDomains: domains });
    updateSlidersState(els.exclude.checked, enabled);
});

// Sliders with debounced input for performance
[els.letterSlider, els.wordSlider, els.lineSlider, els.fontSlider].forEach(slider => {
    slider.addEventListener('input', () => {
        // Update display values immediately for instant feedback
        updateDisplayValues();

        // Debounce the style updates to prevent excessive re-rendering
        if (sliderTimeout) {
            clearTimeout(sliderTimeout);
        }

        sliderTimeout = setTimeout(() => {
            // Update current tab with 10ms delay for smooth performance
            updateCurrentTabStyles(getCurrentSettings());
        }, 10);
    });

    slider.addEventListener('change', () => {
        // Clear any pending timeout when slider is released
        if (sliderTimeout) {
            clearTimeout(sliderTimeout);
            sliderTimeout = null;
        }

        // When slider is released, save to storage and broadcast to all tabs
        saveSettingsAndBroadcast();
    });

    slider.addEventListener('wheel', (e) => {
        e.preventDefault();
        const step = parseInt(slider.step) || 1;
        const delta = -Math.sign(e.deltaY);
        let val = parseInt(slider.value) + (delta * step);
        val = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), val));
        slider.value = val;
        updateDisplayValues();

        // Clear any pending timeout
        if (sliderTimeout) {
            clearTimeout(sliderTimeout);
        }

        // Apply styles immediately for wheel events (less frequent than dragging)
        updateCurrentTabStyles(getCurrentSettings());
        // Save to storage on wheel release
        saveSettingsAndBroadcast();
    });
});

function getCurrentSettings() {
    return {
        letterSpacing: parseInt(els.letterSlider.value),
        wordSpacing: parseInt(els.wordSlider.value),
        lineHeight: parseInt(els.lineSlider.value),
        fontSize: parseInt(els.fontSlider.value)
    };
}

async function updateCurrentTabStyles(settings) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
        // Send message to content script to update styles immediately without storage
        // Use try/catch for better error handling
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: 'UPDATE_STYLES',
                settings: settings
            });
        } catch (error) {
            // Content script not injected or tab not ready - this is normal
        }
    }
}

async function saveSettingsAndBroadcast() {
    const settings = getCurrentSettings();
    await chrome.storage.local.set(settings);
}

// Theme toggle button
els.themeToggle.addEventListener('click', async (e) => {
    e.preventDefault();

    const { theme: currentTheme } = await chrome.storage.local.get('theme');
    const themes = ['system', 'light', 'dark'];
    const currentIndex = themes.indexOf(currentTheme || DEFAULTS.theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];

    applyTheme(nextTheme);
    await chrome.storage.local.set({ theme: nextTheme });
});

// Reset button
els.reset.addEventListener('click', async () => {
    els.letterSlider.value = DEFAULTS.letterSpacing;
    els.wordSlider.value = DEFAULTS.wordSpacing;
    els.lineSlider.value = DEFAULTS.lineHeight;
    els.fontSlider.value = DEFAULTS.fontSize;

    applyTheme(DEFAULTS.theme);
    updateDisplayValues();
    await saveSettingsAndBroadcast();
    await chrome.storage.local.set({ theme: DEFAULTS.theme });

    if (currentDomain) {
        const { excludedDomains } = await chrome.storage.local.get('excludedDomains');
        const domains = (excludedDomains || []).filter(d => d !== currentDomain);
        await chrome.storage.local.set({ excludedDomains: domains });
        els.exclude.checked = false;

        const { enabled } = await chrome.storage.local.get('enabled');
        updateSlidersState(false, enabled);
    }
});

// Theme application function
function applyTheme(theme) {
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}
