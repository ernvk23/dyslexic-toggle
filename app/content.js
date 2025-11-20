(() => {
    // Browser API detection
    const api = typeof browser !== 'undefined' ? browser : chrome;

    const RESTRICTED = ['chrome://', 'chrome-extension://', 'moz-extension://', 'file://', 'about:', 'edge://', 'brave://', 'data:'];

    const state = {
        enabled: false,
        excluded: false,
        letterSpacing: 0,
        wordSpacing: 0,
        lineHeight: 140
    };

    let animationFrameId = null;
    let observer = null;
    let debounceTimer = null;

    init();

    function init() {
        // Skip initialization on restricted URLs
        if (RESTRICTED.some(prefix => location.href.startsWith(prefix))) {
            return;
        }

        api.storage.local.get(
            ['enabled', 'letterSpacing', 'wordSpacing', 'lineHeight', 'excludedDomains']
        ).then(result => {
            state.enabled = result.enabled || false;
            state.letterSpacing = result.letterSpacing ?? 0;
            state.wordSpacing = result.wordSpacing ?? 0;
            state.lineHeight = result.lineHeight ?? 140;
            state.excluded = (result.excludedDomains || []).includes(location.hostname);

            applyStyles();
        });
    }

    function scheduleUpdate(callback) {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        animationFrameId = requestAnimationFrame(() => {
            callback();
            animationFrameId = null;
        });
    }

    function shouldApplyStyles() {
        return state.enabled && !state.excluded;
    }

    async function applyStyles() {
        const shouldApply = shouldApplyStyles();

        if (shouldApply) {
            scheduleUpdate(() => {
                updateCSSVariables();
                document.documentElement.classList.add('opendyslexic-active');
            });
            startObserver();  // Start monitoring DOM changes for SPAs
        } else {
            scheduleUpdate(removeStyles);
            stopObserver();  // Stop monitoring when disabled
        }
    }

    function updateCSSVariables() {
        const rootStyle = document.documentElement.style;

        rootStyle.setProperty('--od-letter-spacing', `${(state.letterSpacing / 1000).toFixed(3)}em`);
        rootStyle.setProperty('--od-word-spacing', `${(state.wordSpacing / 1000).toFixed(3)}em`);
        rootStyle.setProperty('--od-line-height', (state.lineHeight / 100).toFixed(2));
    }

    function removeStyles() {
        const root = document.documentElement;
        const rootStyle = root.style;

        root.classList.remove('opendyslexic-active');
        rootStyle.removeProperty('--od-letter-spacing');
        rootStyle.removeProperty('--od-word-spacing');
        rootStyle.removeProperty('--od-line-height');
    }

    // Monitor DOM changes for SPA navigation (GitHub, etc.)
    function startObserver() {
        if (observer) return;

        // Wait for document.body to be available
        if (!document.body) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', startObserver, { once: true });
            }
            return;
        }

        observer = new MutationObserver((mutations) => {
            // Early exit if already applied - CRITICAL for performance
            if (document.documentElement.classList.contains('opendyslexic-active')) {
                return;
            }

            // Check if significant DOM changes occurred (like SPA navigation)
            const hasSignificantChanges = mutations.some(mutation =>
                mutation.addedNodes.length > 0 ||
                mutation.removedNodes.length > 0
            );

            if (hasSignificantChanges && shouldApplyStyles()) {
                // Debounce to prevent excessive re-applications during rapid DOM changes
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    // Re-apply styles after DOM changes
                    scheduleUpdate(() => {
                        document.documentElement.classList.add('opendyslexic-active');
                        updateCSSVariables();
                    });
                }, 20);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function stopObserver() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }

    function updateState(newState) {
        let changed = false;

        ['letterSpacing', 'wordSpacing', 'lineHeight'].forEach(key => {
            if (newState[key] !== undefined && state[key] !== newState[key]) {
                state[key] = newState[key];
                changed = true;
            }
        });

        if (newState.excludedDomains !== undefined) {
            const newExcluded = newState.excludedDomains.includes(location.hostname);
            if (state.excluded !== newExcluded) {
                state.excluded = newExcluded;
                changed = true;
            }
        }

        if (newState.enabled !== undefined && state.enabled !== newState.enabled) {
            state.enabled = newState.enabled;
            changed = true;
        }

        return changed;
    }

    api.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'REINITIALIZE') {
            init();
            sendResponse({ success: true });
        } else if (request.action === 'UPDATE_STYLES' && request.settings) {
            if (updateState(request.settings) && shouldApplyStyles()) {
                scheduleUpdate(updateCSSVariables);
            }
            sendResponse({ success: true });
        }
    });

    api.storage.onChanged.addListener((changes, namespace) => {
        if (namespace !== 'local') return;

        const updates = {};
        let needsFullReapply = false;

        if (changes.enabled) {
            updates.enabled = changes.enabled.newValue;
            needsFullReapply = true;
        }

        if (changes.excludedDomains) {
            updates.excludedDomains = changes.excludedDomains.newValue || [];
            needsFullReapply = true;
        }

        ['letterSpacing', 'wordSpacing', 'lineHeight'].forEach(key => {
            if (changes[key]) updates[key] = changes[key].newValue;
        });

        const stateChanged = updateState(updates);

        if (needsFullReapply) {
            applyStyles();
        } else if (stateChanged && shouldApplyStyles()) {
            scheduleUpdate(updateCSSVariables);
        }
    });
})();