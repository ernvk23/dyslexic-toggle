const DEFAULTS = {
    enabled: false,
    letterSpacing: 0,
    wordSpacing: 0,
    lineHeight: 140,
    fontSize: 100,
    excludedDomains: [],
    theme: 'system'
};

const RESTRICTED = ['chrome://', 'chrome-extension://', 'moz-extension://', 'file://', 'about:', 'edge://', 'brave://', 'data:'];

const sliders = ['letterSpacing', 'wordSpacing', 'lineHeight', 'fontSize'];
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
let wheelTimeout = null;
let backgroundUpdateTimeout = null;
let storageSaveTimeout = null;

browser.storage.local.get(Object.keys(DEFAULTS)).then(result => {
    const settings = { ...DEFAULTS, ...result };

    updateToggleUI(settings.enabled);
    els.letterSlider.value = settings.letterSpacing;
    els.wordSlider.value = settings.wordSpacing;
    els.lineSlider.value = settings.lineHeight;
    els.fontSlider.value = settings.fontSize;

    applyTheme(settings.theme);
    updateDisplayValues();
    initExclusion(settings.excludedDomains, settings.enabled);
});

async function initExclusion(excludedDomains, enabled) {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

    if (tab?.url && !RESTRICTED.some(p => tab.url.startsWith(p))) {
        const url = new URL(tab.url);
        currentDomain = url.hostname;
        const isExcluded = excludedDomains.includes(currentDomain);

        els.exclude.checked = isExcluded;
        els.exclude.disabled = false;
        updateSlidersState(isExcluded, enabled);
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
    if (result === 0) return '0';
    const fixedResult = result.toFixed(2);
    return fixedResult === '-0.00' ? '0.00 em' : fixedResult + ' em';
}

function updateToggleUI(enabled) {
    els.toggle.classList.toggle('active', enabled);
    [els.letterSlider, els.wordSlider, els.lineSlider, els.fontSlider].forEach(slider => {
        slider.classList.toggle('active', enabled);
    });
}

function updateSlidersState(isExcluded, isEnabled) {
    const disabled = !isEnabled || isExcluded;
    [els.letterSlider, els.wordSlider, els.lineSlider, els.fontSlider].forEach(s => s.disabled = disabled);
}

els.toggle.addEventListener('click', async (e) => {
    e.preventDefault();
    const { enabled } = await browser.storage.local.get('enabled');
    const newState = !enabled;

    updateToggleUI(newState);
    updateCurrentTabStyles({ enabled: newState });
    browser.storage.local.set({ enabled: newState });
    scheduleBackgroundUpdate();

    const { excludedDomains } = await browser.storage.local.get('excludedDomains');
    const isExcluded = currentDomain && (excludedDomains || []).includes(currentDomain);
    updateSlidersState(isExcluded, newState);
});

els.exclude.addEventListener('change', async () => {
    if (!currentDomain) return;

    const { excludedDomains, enabled } = await browser.storage.local.get(['excludedDomains', 'enabled']);
    let domains = excludedDomains || [];

    if (els.exclude.checked) {
        if (!domains.includes(currentDomain)) domains.push(currentDomain);
    } else {
        domains = domains.filter(d => d !== currentDomain);
    }

    updateCurrentTabStyles({ excludedDomains: domains });
    browser.storage.local.set({ excludedDomains: domains });
    scheduleBackgroundUpdate();
    updateSlidersState(els.exclude.checked, enabled);
});

[els.letterSlider, els.wordSlider, els.lineSlider, els.fontSlider].forEach(slider => {
    slider.addEventListener('input', () => {
        updateDisplayValues();

        if (sliderTimeout) clearTimeout(sliderTimeout);
        sliderTimeout = setTimeout(() => updateCurrentTabStyles(getCurrentSettings()), 15);
    }, { passive: true });

    slider.addEventListener('change', () => {
        if (sliderTimeout) {
            clearTimeout(sliderTimeout);
            sliderTimeout = null;
        }
        updateCurrentTabStyles(getCurrentSettings());

        // Debounced storage update - only the last one wins
        if (storageSaveTimeout) clearTimeout(storageSaveTimeout);
        storageSaveTimeout = setTimeout(() => {
            saveSettingsAndBroadcast();
            storageSaveTimeout = null;
        }, 500);
    }, { passive: true }); // Can be passive since we don't call preventDefault()

    slider.addEventListener('wheel', (e) => {
        e.preventDefault();
        const step = parseInt(slider.step) || 1;
        const delta = -Math.sign(e.deltaY);
        let val = parseInt(slider.value) + (delta * step);
        val = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), val));
        slider.value = val;

        updateDisplayValues();

        // Update current tab styles with 10ms debounce
        if (wheelTimeout) clearTimeout(wheelTimeout);
        wheelTimeout = setTimeout(() => {
            updateCurrentTabStyles(getCurrentSettings());
            wheelTimeout = null;
        }, 15);

        // Schedule storage update only when wheel stops for 500ms
        if (storageSaveTimeout) clearTimeout(storageSaveTimeout);
        storageSaveTimeout = setTimeout(() => {
            saveSettingsAndBroadcast();
            storageSaveTimeout = null;
        }, 500);
    }, { passive: false });
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
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
        // Try to send message to content script
        const response = await browser.tabs.sendMessage(tab.id, {
            action: 'UPDATE_STYLES',
            settings: settings
        }).catch(() => null);

        // If content script isn't loaded, inject it and send message
        if (!response) {
            injectContentScript(tab.id).then(() => {
                // Send the message after injection to ensure current settings are applied
                browser.tabs.sendMessage(tab.id, {
                    action: 'UPDATE_STYLES',
                    settings: settings
                }).catch(() => { });
            });
        }
    }
}

function injectContentScript(tabId) {
    return Promise.all([
        browser.scripting.insertCSS({
            target: { tabId: tabId, allFrames: true },
            files: ['fonts.css', 'style.css']
        }).catch(() => { }),
        browser.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: ['content.js']
        }).catch(() => { })
    ]);
}

function saveSettingsAndBroadcast() {
    browser.storage.local.set(getCurrentSettings());
    scheduleBackgroundUpdate();
}

function scheduleBackgroundUpdate() {
    if (backgroundUpdateTimeout) clearTimeout(backgroundUpdateTimeout);
    backgroundUpdateTimeout = setTimeout(() => {
        browser.runtime.sendMessage({ action: 'UPDATE_BACKGROUND_TABS' });
    }, 500);
}

els.themeToggle.addEventListener('click', async (e) => {
    e.preventDefault();
    const { theme: currentTheme } = await browser.storage.local.get('theme');
    const themes = ['system', 'light', 'dark'];
    const currentIndex = themes.indexOf(currentTheme || DEFAULTS.theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    applyTheme(nextTheme);
    browser.storage.local.set({ theme: nextTheme });
});

els.reset.addEventListener('click', async () => {
    els.letterSlider.value = DEFAULTS.letterSpacing;
    els.wordSlider.value = DEFAULTS.wordSpacing;
    els.lineSlider.value = DEFAULTS.lineHeight;
    els.fontSlider.value = DEFAULTS.fontSize;

    applyTheme(DEFAULTS.theme);
    updateDisplayValues();

    const { enabled, excludedDomains } = await browser.storage.local.get(['enabled', 'excludedDomains']);
    updateCurrentTabStyles(getCurrentSettings());

    if (currentDomain) {
        const domains = (excludedDomains || []).filter(d => d !== currentDomain);
        els.exclude.checked = false;
        updateSlidersState(false, enabled);
        updateCurrentTabStyles({ excludedDomains: domains });
        browser.storage.local.set({ excludedDomains: domains });
    }

    browser.storage.local.set({ ...getCurrentSettings(), theme: DEFAULTS.theme });
    scheduleBackgroundUpdate();
});

function applyTheme(theme) {
    if (theme === 'system') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}