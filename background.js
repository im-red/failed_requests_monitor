const MAX_RECORDS = 500;

// Save failed records
async function pushFailure(record) {
    const { failedRequests = [] } = await chrome.storage.local.get({ failedRequests: [] });
    failedRequests.unshift(record);
    if (failedRequests.length > MAX_RECORDS) failedRequests.length = MAX_RECORDS;
    await chrome.storage.local.set({ failedRequests });

    // Update current tab badge
    updateBadgeForCurrentTab();

    // Notify popup
    chrome.runtime.sendMessage({ type: 'new-failure', record });
}

// Get current active tabId
function getActiveTabId(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        callback(tabs.length ? tabs[0].id : null);
    });
}

// Update badge by tabId
async function updateBadgeForTab(tabId) {
    if (tabId === null) return;
    const { failedRequests = [] } = await chrome.storage.local.get({ failedRequests: [] });
    const count = failedRequests.filter(r => r.tabId === tabId).length;

    if (count === 0) {
        chrome.action.setBadgeText({ text: '0', tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#0a0', tabId }); // Green
        chrome.action.setIcon({ path: "icon_good.png", tabId });
    } else {
        chrome.action.setBadgeText({ text: count.toString(), tabId });
        chrome.action.setBadgeBackgroundColor({ color: '#a00', tabId }); // Red
        chrome.action.setIcon({ path: "icon_bad.png", tabId });
    }
}

// Update badge for current active tab
function updateBadgeForCurrentTab() {
    getActiveTabId(tabId => updateBadgeForTab(tabId));
}

// Listen for failed requests
chrome.webRequest.onErrorOccurred.addListener(
    details => {
        if (details.tabId >= 0) { // Only record requests triggered by tab
            const record = {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                time: Date.now(),
                url: details.url,
                method: details.method,
                type: details.type,
                tabId: details.tabId,
                frameId: details.frameId,
                initiator: details.initiator || details.documentUrl || null,
                error: details.error,
                fromCache: details.fromCache,
                ip: details.ip || null,
                statusLine: details.statusLine || null
            };
            pushFailure(record).catch(console.error);
        }
    },
    { urls: ["<all_urls>"] }
);

// Listen for clear / remove requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'clear-failures') {
        chrome.storage.local.set({ failedRequests: [] }).then(() => {
            updateBadgeForCurrentTab();
            sendResponse({ ok: true });
        });
        return true;
    } else if (msg.type === 'remove-failure') {
        chrome.storage.local.get({ failedRequests: [] }).then(({ failedRequests }) => {
            const filtered = failedRequests.filter(r => r.id !== msg.id);
            chrome.storage.local.set({ failedRequests: filtered }).then(() => {
                updateBadgeForCurrentTab();
                sendResponse({ ok: true });
            });
        });
        return true;
    }
});

// Listen for tab switching, update badge
chrome.tabs.onActivated.addListener(activeInfo => {
    updateBadgeForTab(activeInfo.tabId);
});

// Listen for tab updates (e.g. URL changes, can also refresh badge)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.active && changeInfo.status === 'complete') {
        updateBadgeForTab(tabId);
    }
});

// 扩展启动或安装时初始化徽章
chrome.runtime.onInstalled.addListener(updateBadgeForCurrentTab);
chrome.runtime.onStartup.addListener(updateBadgeForCurrentTab);
