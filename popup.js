const domainListEl = document.getElementById('domain-list');
const requestListEl = document.getElementById('request-list');
const domainViewEl = document.getElementById('domain-view');
const detailViewEl = document.getElementById('detail-view');
const domainTitleEl = document.getElementById('domain-title');
const backBtn = document.getElementById('backBtn');
const filterInput = document.getElementById('filter');
const clearBtn = document.getElementById('clearBtn');

const domainItemTpl = document.getElementById('domainItemTpl');
const requestItemTpl = document.getElementById('itemTpl');

let currentTabId = null;
let currentView = 'domain'; // 'domain' or 'detail'
let selectedDomain = null;
let allRecords = [];
const MAX_URL_LENGTH = 80;

// Get current active tabId
function updateCurrentTabId(callback) {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        currentTabId = tabs.length ? tabs[0].id : null;
        if (callback) callback();
    });
}

// Format time
function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleString();
}

function elideUrl(url) {
    if (!url) return '';
    if (url.length <= MAX_URL_LENGTH) return url;
    return `${url.slice(0, MAX_URL_LENGTH - 1)}…`;
}

function setUrlDisplay(linkEl, toggleBtn, showFull) {
    const fullUrl = linkEl.dataset.fullUrl || '';
    if (fullUrl.length <= MAX_URL_LENGTH) {
        linkEl.textContent = fullUrl;
        linkEl.classList.remove('elided');
        toggleBtn.style.display = 'none';
        linkEl.dataset.isElided = 'false';
        return;
    }
    toggleBtn.style.display = 'inline';
    if (showFull) {
        linkEl.textContent = fullUrl;
        linkEl.classList.remove('elided');
        toggleBtn.textContent = 'Show less';
        linkEl.dataset.isElided = 'false';
    } else {
        linkEl.textContent = elideUrl(fullUrl);
        linkEl.classList.add('elided');
        toggleBtn.textContent = 'Show more';
        linkEl.dataset.isElided = 'true';
    }
}

// Generate simple curl command
function createCurl(record) {
    const method = record.method || 'GET';
    return `curl -X ${method} ${escapeShell(record.url)}`;
}

function escapeShell(s) {
    if (!s) return "''";
    return `'${s.replace(/'/g, `'\\''`)}'`;
}

function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return 'Unknown';
    }
}

function getDomainSortKey(domain) {
    return domain.toLowerCase().split('.').reverse().join('.');
}

function groupByDomain(records) {
    const groups = {};
    for (const r of records) {
        const domain = getDomain(r.url);
        if (!groups[domain]) {
            groups[domain] = [];
        }
        groups[domain].push(r);
    }
    return groups;
}

function flashButton(btn, text) {
    const old = btn.textContent;
    btn.textContent = text;
    setTimeout(() => btn.textContent = old, 1000);
}

function render() {
    if (currentView === 'domain') {
        renderDomainList();
    } else {
        renderDetailList();
    }
}

function renderDomainList() {
    domainViewEl.style.display = 'flex';
    detailViewEl.style.display = 'none';
    domainListEl.innerHTML = '';

    const groups = groupByDomain(allRecords);
    const domains = Object.keys(groups).sort((a, b) => {
        const keyA = getDomainSortKey(a);
        const keyB = getDomainSortKey(b);
        const keyCompare = keyA.localeCompare(keyB);
        if (keyCompare !== 0) return keyCompare;
        const countCompare = groups[b].length - groups[a].length;
        if (countCompare !== 0) return countCompare;
        return a.localeCompare(b);
    });

    const q = filterInput.value.trim().toLowerCase();

    let hasItems = false;
    for (const domain of domains) {
        if (q && !domain.toLowerCase().includes(q)) continue;

        hasItems = true;
        const records = groups[domain];
        const node = domainItemTpl.content.cloneNode(true);
        node.querySelector('.domain-name').textContent = domain;
        node.querySelector('.count-badge').textContent = records.length;

        // Click to view details
        const itemEl = node.querySelector('.domain-item');
        itemEl.addEventListener('click', () => {
            selectedDomain = domain;
            currentView = 'detail';
            filterInput.value = ''; // Clear filter when entering detail to show all
            render();
        });

        // View Details Button (same action)
        node.querySelector('.view-details').addEventListener('click', (e) => {
            e.stopPropagation();
            selectedDomain = domain;
            currentView = 'detail';
            filterInput.value = '';
            render();
        });

        domainListEl.appendChild(node);
    }

    if (!hasItems) {
        domainListEl.innerHTML = '<div style="text-align:center; padding: 20px; color: #999;">No failed requests found.</div>';
    }
}

function renderDetailList() {
    domainViewEl.style.display = 'none';
    detailViewEl.style.display = 'flex';
    requestListEl.innerHTML = '';

    domainTitleEl.textContent = selectedDomain;

    let records = allRecords.filter(r => getDomain(r.url) === selectedDomain);

    const q = filterInput.value.trim().toLowerCase();
    if (q) {
        records = records.filter(r => (r.url || '').toLowerCase().includes(q) || (r.error || '').toLowerCase().includes(q));
    }

    for (const r of records) {
        const node = requestItemTpl.content.cloneNode(true);
        node.querySelector('.method').textContent = r.method;
        const a = node.querySelector('.url');
        a.dataset.fullUrl = r.url;
        const toggleBtn = node.querySelector('.toggleUrl');
        setUrlDisplay(a, toggleBtn, false);
        a.href = r.url;
        node.querySelector('.time').textContent = formatTime(r.time);
        node.querySelector('.type').textContent = r.type || '';
        node.querySelector('.initiator').textContent = r.initiator || '';
        node.querySelector('.error').textContent = r.error || '';
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleBtn.blur();
            const isElided = a.dataset.isElided === 'true';
            setUrlDisplay(a, toggleBtn, isElided);
        });

        // Copy URL
        node.querySelector('.copyUrl').addEventListener('click', async () => {
            await navigator.clipboard.writeText(r.url);
            flashButton(node.querySelector('.copyUrl'), 'Copied');
        });

        // Copy curl
        node.querySelector('.copyCurl').addEventListener('click', async () => {
            await navigator.clipboard.writeText(createCurl(r));
            flashButton(node.querySelector('.copyCurl'), 'Copied');
        });

        // Open in new tab
        node.querySelector('.open').addEventListener('click', () => {
            chrome.tabs.create({ url: r.url });
        });

        // Remove single item
        node.querySelector('.remove').addEventListener('click', () => {
            chrome.runtime.sendMessage({ type: 'remove-failure', id: r.id }, () => loadData());
        });

        requestListEl.appendChild(node);
    }

    if (records.length === 0) {
        requestListEl.innerHTML = '<div style="text-align:center; padding: 20px; color: #999;">No matching requests.</div>';
    }
}

// Load data from storage
function loadData() {
    chrome.storage.local.get({ failedRequests: [] }, ({ failedRequests }) => {
        if (currentTabId === null) {
            allRecords = [];
        } else {
            allRecords = failedRequests.filter(r => r.tabId === currentTabId);
        }
        render();
    });
}

// Event Listeners
filterInput.addEventListener('input', () => render());

clearBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all failed requests?')) {
        chrome.runtime.sendMessage({ type: 'clear-failures' }, () => {
            currentView = 'domain'; // Reset to domain view
            loadData();
        });
    }
});

backBtn.addEventListener('click', () => {
    currentView = 'domain';
    selectedDomain = null;
    filterInput.value = '';
    render();
});

// Listen for new failure messages from background
chrome.runtime.onMessage.addListener(msg => {
    if (msg.type === 'new-failure') {
        if (msg.record.tabId === currentTabId) {
            // Optimization: append instead of full reload? 
            // For now, full reload is safer for consistency
            loadData();
        }
    }
});

// Initialization
updateCurrentTabId(() => {
    loadData();
});
