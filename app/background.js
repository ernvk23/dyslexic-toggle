const DEFAULTS = {
    enabled: false,
    letterSpacing: 0,
    wordSpacing: 0,
    lineHeight: 140,
    fontSize: 100,
    excludedDomains: [],
    theme: 'system'
};

const RESTRICTED = ['chrome://', 'chrome-extension://', 'file://', 'about:', 'edge://', 'brave://', 'data:'];

// Initialize on install
chrome.runtime.onInstalled.addListener(async () => {
    const result = await chrome.storage.local.get(Object.keys(DEFAULTS));
    const settings = { ...DEFAULTS, ...result };
    await chrome.storage.local.set(settings);
    updateBadge(settings.enabled);

    // Inject into all existing tabs on install
    if (settings.enabled) {
        await updateAllTabs();
    }
});

// Update badge on startup
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get('enabled', (result) => {
        updateBadge(result.enabled);
    });
});

// Listen for storage changes and update badge
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.enabled) {
        updateBadge(changes.enabled.newValue);
        // Trigger update/injection in all tabs when extension is toggled
        updateAllTabs();
    }
});

function updateBadge(enabled) {
    chrome.action.setBadgeText({ text: enabled ? 'on' : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#0ea5e9' });
}

// Function to inject content script or trigger re-apply in all tabs
async function updateAllTabs() {
    const tabs = await chrome.tabs.query({});
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const tabsToUpdate = [];
    if (activeTab) {
        tabsToUpdate.push(activeTab);
    }

    // Add all other tabs, ensuring we don't duplicate the active tab
    for (const tab of tabs) {
        if (!activeTab || tab.id !== activeTab.id) {
            tabsToUpdate.push(tab);
        }
    }

    for (const tab of tabsToUpdate) {
        if (!tab.url || RESTRICTED.some(p => tab.url.startsWith(p))) continue;

        // 1. Try to send a message to the content script to re-initialize (if already injected)
        chrome.tabs.sendMessage(tab.id, { action: 'REINITIALIZE' }, async () => {
            // If chrome.runtime.lastError is set, the content script is not listening (i.e., not injected)
            if (chrome.runtime.lastError) {
                // 2. If message fails, inject the content script
                try {
                    // Inject CSS first to define @font-face rules
                    await chrome.scripting.insertCSS({
                        target: { tabId: tab.id, allFrames: true },
                        files: ['fonts.css', 'style.css']
                    });

                    // Then inject the content script
                    await chrome.scripting.executeScript({
                        target: { tabId: tab.id, allFrames: true },
                        files: ['content.js']
                    });
                } catch (err) {
                    // Can't inject (restricted page or pre-install tab)
                }
            }
        });
    }
}
