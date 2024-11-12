let tabs = [];
let activeTabId = null;
let isSaving = false;

function generateUniqueId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

const tabsContainer = document.getElementById('tabs');
const webviewContainer = document.getElementById('webview-container');
const addTabButton = document.getElementById('add-tab');
const addTabInput = document.getElementById('add-tab-input');
const refreshButton = document.getElementById('refresh-tab');

function injectWebviewStyles(webview) {
    webview.addEventListener('dom-ready', () => {
        webview.insertCSS(`
            :host {
                display: flex;
                flex-direction: column;
                height: 100%;
            }
            body {
                display: flex;
                flex-direction: column;
                height: 100%;
                margin: 0;
            }
            iframe {
                flex: 1;
                height: 100%;
            }
        `);
    });

    webview.addEventListener('click', () => {
        resetAddTab();
    });

}


function createTab(url, select = true, name = null) {
    const id = generateUniqueId();

    // Parse and format the URL
    const formattedUrl = formatUrl(url);

    const tabElement = document.createElement('div');
    tabElement.classList.add('tab');
    tabElement.dataset.id = id;
    tabElement.draggable = true; // Make the tab draggable

    const tabTitle = document.createElement('span');
    tabTitle.textContent = name || formattedUrl;
    tabElement.appendChild(tabTitle);

    const closeBtn = document.createElement('span');
    closeBtn.textContent = '×';
    closeBtn.classList.add('close-btn');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeTab(id);
    });
    tabElement.appendChild(closeBtn);

    tabElement.addEventListener('click', () => {
        selectTab(id);
    });

    tabElement.addEventListener('dblclick', () => {
        renameTab(id, tabTitle);
    });

    // Add drag event listeners
    tabElement.addEventListener('dragstart', dragStart);
    tabElement.addEventListener('dragover', dragOver);
    tabElement.addEventListener('drop', drop);
    tabElement.addEventListener('dragenter', dragEnter);
    tabElement.addEventListener('dragleave', dragLeave);
    tabElement.addEventListener('dragend', dragEnd);

    tabsContainer.insertBefore(tabElement, addTabButton);

    const webview = document.createElement('webview');
    webview.src = formattedUrl;
    webview.dataset.id = id;
    injectWebviewStyles(webview);
    webview.style.display = 'none';

    webviewContainer.appendChild(webview);

    tabs.push({ id: id, url: formattedUrl, name: tabTitle.textContent });

    if (select) {
        selectTab(id);
    }

    console.log(`Created tab with id: ${id} and url: ${formattedUrl}`); // Debug log
}

function formatUrl(url) {
    // Remove leading and trailing whitespace
    url = url.trim();

    // Check if the URL already starts with a protocol
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }

    // Check if the URL starts with 'www.'
    if (url.startsWith('www.')) {
        return 'https://' + url;
    }

    // Check if the URL contains a dot (assuming it's a domain)
    if (url.includes('.')) {
        return 'https://' + url;
    }

    // If it's just a word or phrase, treat it as a search query
    return 'https://www.google.com/search?q=' + encodeURIComponent(url);
}

function renameTab(id, tabTitleElement) {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = tabTitleElement.textContent;
    input.style.width = '100%';
    tabTitleElement.replaceWith(input);
    input.focus();
    input.select();

    const finishRename = (save) => {
        if (save) {
            tabTitleElement.textContent = input.value;
            const tab = tabs.find(t => t.id === id);
            if (tab) tab.name = input.value;
        }
        input.replaceWith(tabTitleElement);
    };

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            finishRename(true);
        } else if (event.key === 'Escape') {
            finishRename(false);
        }
    });

    document.addEventListener('click', (event) => {
        if (!input.contains(event.target)) {
            finishRename(true);
        }
    }, { once: true });
}

function selectTab(id) {
    console.log(`Selecting tab with id: ${id}`); // Debug log

    const previousTab = document.querySelector('.tab.active');
    if (previousTab) previousTab.classList.remove('active');

    const previousWebview = document.querySelector('webview.active');
    if (previousWebview) {
        previousWebview.classList.remove('active');
        previousWebview.style.display = 'none';
    }

    const selectedTab = document.querySelector(`.tab[data-id='${id}']`);
    if (selectedTab) {
        selectedTab.classList.add('active');
        console.log('Tab element activated'); // Debug log
    } else {
        console.log('Selected tab element not found'); // Debug log
    }

    const selectedWebview = document.querySelector(`webview[data-id='${id}']`);
    if (selectedWebview) {
        selectedWebview.classList.add('active');
        selectedWebview.style.display = 'flex';
        console.log('Webview displayed'); // Debug log
    } else {
        console.log('Selected webview not found'); // Debug log
    }

    activeTabId = id;

    refreshButton.style.opacity = activeTabId ? '1' : '0.5';
    refreshButton.style.pointerEvents = activeTabId ? 'auto' : 'none';

    resetTabStyles();
}

function removeTab(id) {
    const tabElement = document.querySelector(`.tab[data-id='${id}']`);
    const webview = document.querySelector(`webview[data-id='${id}']`);

    if (tabElement) tabElement.remove();
    if (webview) webview.remove();

    tabs = tabs.filter(tab => tab.id !== id);

    if (activeTabId === id) {
        activeTabId = tabs.length > 0 ? tabs[0].id : null;
        if (activeTabId) selectTab(activeTabId);
    }
}

function restoreTabs() {
    const savedTabs = window.electronAPI.getTabs(); // Retrieve saved tabs
    console.log('Restoring tabs:', savedTabs); // Debug log

    if (savedTabs.length === 0) {
        createTab('https://www.google.com');
    } else {
        savedTabs.forEach((tab) => {
            createTab(tab.url, false, tab.name);
        });
        selectTab(tabs[0].id); // Select the first tab
    }

    if (tabs.length > 0) {
        selectTab(tabs[0].id);
    } else {
        refreshButton.style.opacity = '0.5';
        refreshButton.style.pointerEvents = 'none';
    }
}

// Listen for the 'save-tabs' event from the main process
window.electronAPI.onSaveTabs((event, isQuitting) => {
    if (isQuitting) {
        saveAndQuit();
    } else {
        saveTabs();
    }
});

function saveTabs() {
    if (isSaving) return; // Prevent multiple simultaneous saves
    
    try {
        isSaving = true;
        console.log('Saving tabs:', tabs); // Debug log
        
        const tabsData = tabs.map(tab => ({
            id: tab.id,
            url: tab.url,
            name: tab.name
        }));

        window.electronAPI.sendSaveTabs(tabsData);
        isSaving = false;
    } catch (error) {
        console.error('Error saving tabs:', error);
        isSaving = false;
    }
}

// Add periodic saving
setInterval(() => {
    if (tabs.length > 0) {
        saveTabs();
    }
}, 60000); // Save every minute

addTabButton.addEventListener('click', () => {
    addTabButton.style.display = 'none';
    addTabInput.style.display = 'block';
    addTabInput.focus();
});

addTabInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        const url = addTabInput.value.trim();
        if (url) {
            createTab(url);
        }
        resetAddTab();
    } else if (event.key === 'Escape') {
        resetAddTab();
    }
});

document.addEventListener('click', (event) => {
    if (!addTabInput.contains(event.target) && !addTabButton.contains(event.target)) {
        resetAddTab();
    }
});

function resetAddTab() {
    addTabInput.style.display = 'none';
    addTabInput.value = '';
    addTabButton.style.display = 'block';
}

refreshButton.addEventListener('click', refreshActiveTab);

function refreshActiveTab() {
    const activeWebview = document.querySelector('webview.active');
    if (activeWebview) {
        console.log('Refreshing active webview'); // Debug log
        activeWebview.reload();
    } else {
        console.log('No active webview found'); // Debug log
    }
}

// Initialize the application
restoreTabs();

// Drag and drop event handlers
function dragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.dataset.id);
    e.target.style.opacity = '0.5';
    
    // Add cleanup in case drag operation ends unexpectedly
    setTimeout(() => {
        const allTabs = document.querySelectorAll('.tab');
        allTabs.forEach(tab => {
            tab.style.opacity = '1';
        });
    }, 1000);
}

function dragOver(e) {
    e.preventDefault();
}

function dragEnter(e) {
    e.target.classList.add('drag-over');
}

function dragLeave(e) {
    e.target.classList.remove('drag-over');
}

function drop(e) {
    e.preventDefault();
    const draggedTabId = e.dataTransfer.getData('text');
    const draggedTab = document.querySelector(`.tab[data-id="${draggedTabId}"]`);
    const dropZone = e.target.closest('.tab');

    if (draggedTab && dropZone && draggedTab !== dropZone) {
        const draggedIndex = Array.from(tabsContainer.children).indexOf(draggedTab);
        const dropIndex = Array.from(tabsContainer.children).indexOf(dropZone);

        if (draggedIndex < dropIndex) {
            tabsContainer.insertBefore(draggedTab, dropZone.nextSibling);
        } else {
            tabsContainer.insertBefore(draggedTab, dropZone);
        }

        // Update the tabs array to reflect the new order
        const draggedTabData = tabs.splice(draggedIndex, 1)[0];
        tabs.splice(dropIndex, 0, draggedTabData);
    }

    // Reset opacity for all tabs
    const allTabs = document.querySelectorAll('.tab');
    allTabs.forEach(tab => {
        tab.style.opacity = '1';
        tab.classList.remove('drag-over');
    });
}

// Add a dragend handler to ensure opacity is reset
function dragEnd(e) {
    const allTabs = document.querySelectorAll('.tab');
    allTabs.forEach(tab => {
        tab.style.opacity = '1';
        tab.classList.remove('drag-over');
    });
}

// Add this new function
function saveAndQuit() {
    if (isSaving) return;
    
    try {
        isSaving = true;
        console.log('Saving tabs before quit:', tabs);
        
        const tabsData = tabs.map(tab => ({
            id: tab.id,
            url: tab.url,
            name: tab.name
        }));

        window.electronAPI.sendSaveTabs(tabsData);
        
        // Only call tabsSaved when actually quitting
        setTimeout(() => {
            window.electronAPI.tabsSaved();
            isSaving = false;
        }, 500);
    } catch (error) {
        console.error('Error saving tabs before quit:', error);
        isSaving = false;
    }
}

// Add this function to periodically reset tab styles
function resetTabStyles() {
    const allTabs = document.querySelectorAll('.tab');
    allTabs.forEach(tab => {
        tab.style.opacity = '1';
        tab.classList.remove('drag-over');
        
        // Reset text color for tab and its children
        tab.style.color = '#fff';
        const span = tab.querySelector('span');
        if (span) {
            span.style.color = '#fff';
        }
    });
}

// Call resetTabStyles periodically
setInterval(resetTabStyles, 30000); // Reset every 30 seconds


