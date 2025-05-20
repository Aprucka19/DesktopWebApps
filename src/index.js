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

function isPandoraUrl(url) {
    // Check for various Pandora URL patterns
    const pandoraPatterns = [
        'pandora.com',
        'www.pandora.com',
        'https://pandora.com',
        'https://www.pandora.com',
        'http://pandora.com',
        'http://www.pandora.com'
    ];
    
    return pandoraPatterns.some(pattern => url.includes(pattern));
}

// Add a new helper function to check for Pandora tabs
function isPandoraTab(tab) {
    // Check if it's a Pandora URL
    if (isPandoraUrl(tab.url)) {
        return true;
    }
    
    // Also check if the tab was renamed to "Pandora"
    if (tab.name && tab.name.toLowerCase() === 'pandora') {
        return true;
    }
    
    return false;
}

function createTab(url, select = true, name = null) {
    const id = generateUniqueId();
    const formattedUrl = formatUrl(url);
    console.log('Creating tab with URL:', formattedUrl);

    const tabElement = document.createElement('div');
    tabElement.classList.add('tab');
    tabElement.dataset.id = id;
    tabElement.draggable = true;

    const tabTitle = document.createElement('span');
    tabTitle.textContent = name || formattedUrl;
    tabElement.appendChild(tabTitle);

    // Function to check and update Spotify toggle
    const updateSpotifyToggle = (url) => {
        const existingToggle = tabElement.querySelector('.spotify-toggle');
        if (isPandoraTab({url: url, name: tabTitle.textContent})) {
            if (!existingToggle) {
                console.log('Adding Spotify toggle for Pandora URL:', url);
                const spotifyToggle = document.createElement('div');
                spotifyToggle.classList.add('spotify-toggle');
                spotifyToggle.innerHTML = `
                    <label class="switch">
                        <input type="checkbox" class="spotify-switch">
                        <span class="slider round"></span>
                    </label>
                    <span class="toggle-label">Play on Spotify</span>
                `;
                // Insert before the close button
                const closeBtn = tabElement.querySelector('.close-btn');
                tabElement.insertBefore(spotifyToggle, closeBtn);
                
                // Add event listener
                const spotifySwitch = spotifyToggle.querySelector('.spotify-switch');
                if (spotifySwitch) {
                    spotifySwitch.addEventListener('change', (e) => {
                        if (e.target.checked) {
                            // Start monitoring and Spotify authorization when toggled
                            const webview = document.querySelector(`webview[data-id='${id}']`);
                            if (webview) {
                                startPandoraMonitoring(webview, formattedUrl);
                                window.electronAPI.spotifyAuthorize();
                            }
                        } else {
                            // Stop monitoring when toggle is turned off
                            const webview = document.querySelector(`webview[data-id='${id}']`);
                            if (webview) {
                                if (webview._songCheckInterval) {
                                    clearInterval(webview._songCheckInterval);
                                    webview._songCheckInterval = null;
                                }
                                webview._spotifyEnabled = false;
                                window.electronAPI.logToTerminal('Pandora monitoring stopped');
                            }
                        }
                    });
                }
            }
        } else if (existingToggle) {
            console.log('Removing Spotify toggle for non-Pandora URL:', url);
            existingToggle.remove();
        }
    };

    // Initial check for Spotify toggle
    updateSpotifyToggle(formattedUrl);

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
    
    // Enable webview features with proper security settings
    webview.setAttribute('webpreferences', 'contextIsolation=yes, nodeIntegration=no');
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('preload', './preload.js'); // Fix preload script path
    webview.setAttribute('partition', 'persist:main');
    webview.setAttribute('webpreferences', 'contextIsolation=yes');
    
    // Add CSP meta tag to the webview
    webview.addEventListener('dom-ready', () => {
        webview.executeJavaScript(`
            const meta = document.createElement('meta');
            meta.httpEquiv = 'Content-Security-Policy';
            meta.content = "default-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https: http:;";
            document.head.appendChild(meta);
        `).catch(error => {
            console.error('Error adding CSP meta tag:', error);
        });
    });
    
    // Add event listeners for debugging
    webview.addEventListener('did-start-loading', () => {
        console.log('Webview started loading:', formattedUrl);
    });

    webview.addEventListener('did-finish-load', () => {
        console.log('Webview finished loading:', formattedUrl);
    });

    webview.addEventListener('did-fail-load', (event) => {
        console.error('Webview failed to load:', event.errorCode, event.errorDescription);
    });

    // Add webview event listeners
    webview.addEventListener('dom-ready', () => {
        console.log('Webview DOM ready for URL:', formattedUrl);
        
        // We don't auto-start monitoring anymore - only when toggle is switched on
        // But we add the toggle to all Pandora tabs
        if (isPandoraTab({url: formattedUrl, name: tabTitle.textContent})) {
            console.log('Pandora tab detected, toggle will be available');
            window.electronAPI.logToTerminal('Pandora tab detected: ' + formattedUrl);
        }
    });

    webview.addEventListener('did-navigate', (event) => {
        console.log('Navigation occurred:', event.url);
        const tab = tabs.find(t => t.id === id);
        if (tab) {
            tab.url = event.url;
            updateSpotifyToggle(event.url);
        }
    });

    webview.addEventListener('destroyed', () => {
        if (webview._songCheckInterval) {
            clearInterval(webview._songCheckInterval);
        }
    });

    webviewContainer.appendChild(webview);

    tabs.push({ id: id, url: formattedUrl, name: tabTitle.textContent });

    if (select) {
        selectTab(id);
    }

    console.log(`Created tab with id: ${id} and url: ${formattedUrl}`);
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
            const newName = input.value;
            tabTitleElement.textContent = newName;
            const tab = tabs.find(t => t.id === id);
            if (tab) {
                tab.name = newName;
                
                // Recheck if this is a Pandora tab and add/remove Spotify toggle if needed
                const tabElement = document.querySelector(`.tab[data-id='${id}']`);
                const existingToggle = tabElement.querySelector('.spotify-toggle');
                
                if (isPandoraTab(tab)) {
                    if (!existingToggle) {
                        console.log('Adding Spotify toggle after rename');
                        const spotifyToggle = document.createElement('div');
                        spotifyToggle.classList.add('spotify-toggle');
                        spotifyToggle.innerHTML = `
                            <label class="switch">
                                <input type="checkbox" class="spotify-switch">
                                <span class="slider round"></span>
                            </label>
                            <span class="toggle-label">Play on Spotify</span>
                        `;
                        // Insert before the close button
                        const closeBtn = tabElement.querySelector('.close-btn');
                        tabElement.insertBefore(spotifyToggle, closeBtn);
                        
                        // Re-add the event listener
                        const spotifySwitch = spotifyToggle.querySelector('.spotify-switch');
                        if (spotifySwitch) {
                            spotifySwitch.addEventListener('change', (e) => {
                                if (e.target.checked) {
                                    window.electronAPI.spotifyAuthorize();
                                }
                            });
                        }
                    }
                } else if (existingToggle) {
                    console.log('Removing Spotify toggle after rename');
                    existingToggle.remove();
                }
            }
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
            console.log('Restoring tab:', tab);
            const formattedUrl = formatUrl(tab.url);
            console.log('Formatted URL:', formattedUrl);
            
            // Check if this is a Pandora tab
            if (isPandoraTab(tab)) {
                console.log('Found saved Pandora tab:', tab.name);
            }
            
            createTab(formattedUrl, false, tab.name);
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

// Add CSS for the Spotify toggle
const style = document.createElement('style');
style.textContent = `
    .spotify-toggle {
        display: flex;
        align-items: center;
        margin-left: 10px;
        font-size: 12px;
    }

    .switch {
        position: relative;
        display: inline-block;
        width: 30px;
        height: 17px;
        margin-right: 5px;
    }

    .switch input {
        opacity: 0;
        width: 0;
        height: 0;
    }

    .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #ccc;
        transition: .4s;
    }

    .slider:before {
        position: absolute;
        content: "";
        height: 13px;
        width: 13px;
        left: 2px;
        bottom: 2px;
        background-color: white;
        transition: .4s;
    }

    input:checked + .slider {
        background-color: #1DB954;
    }

    input:checked + .slider:before {
        transform: translateX(13px);
    }

    .slider.round {
        border-radius: 17px;
    }

    .slider.round:before {
        border-radius: 50%;
    }

    .toggle-label {
        color: #666;
        font-size: 11px;
    }
`;
document.head.appendChild(style);

// Add a new function for Pandora monitoring
function startPandoraMonitoring(webview, url) {
    window.electronAPI.logToTerminal('Starting Pandora monitoring for: ' + url);
    
    // Track the current song to avoid repeated plays
    let currentSong = null;
    let currentArtist = null;
    let lastCheckTime = Date.now();
    
    // Clear existing interval if there is one
    if (webview._songCheckInterval) {
        clearInterval(webview._songCheckInterval);
    }
    
    // Setup a handler for navigation
    const navHandler = () => {
        window.electronAPI.logToTerminal('Navigation detected in Pandora webview, resetting interval');
        if (webview._songCheckInterval) {
            clearInterval(webview._songCheckInterval);
            
            // Reset current song when navigating
            currentSong = null;
            currentArtist = null;
            
            // Wait a bit and restart monitoring
            setTimeout(() => {
                if (webview._spotifyEnabled) {
                    startPandoraMonitoring(webview, webview.src);
                }
            }, 3000);
        }
    };
    
    // Remove any existing nav handler before adding a new one
    webview.removeEventListener('did-navigate', navHandler);
    webview.addEventListener('did-navigate', navHandler);
    
    // Mark this webview as having Spotify enabled
    webview._spotifyEnabled = true;
    
    // Direct DOM inspection with more frequent polling
    const checkInterval = setInterval(() => {
        webview.executeJavaScript(`
            (function() {
                try {
                    // Log structured output for debugging
                    console.log("PANDORA DEBUG: Starting song detection");
                    
                    // Brute force approach - collect all text from elements that might contain song info
                    const songTitles = new Set();
                    const artistNames = new Set();
                    
                    // Check specific known selectors
                    const songSelectors = [
                        'div.Marquee__wrapper__content',
                        'div.nowPlayingTopInfo__current__trackName',
                        'div.playerBarSong',
                        'div.playerBarSongTitle',
                        '.AudioInfo__title',
                        '[data-qa="playing_track_title"]',
                        '.nowPlaying__trackName',
                        '.songTitle'
                    ];
                    
                    const artistSelectors = [
                        'div.nowPlayingTopInfo__current__artistName',
                        'div.playerBarArtist',
                        'div.playerBarArtistName',
                        '.AudioInfo__artist',
                        '[data-qa="playing_artist_name"]',
                        '.nowPlaying__artistName',
                        '.artistName'
                    ];
                    
                    // Try each song selector
                    for (const selector of songSelectors) {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            const text = el.textContent.trim();
                            if (text) {
                                console.log("PANDORA DEBUG: Found potential song: '" + text + "' using selector " + selector);
                                songTitles.add(text);
                            }
                        });
                    }
                    
                    // Try each artist selector
                    for (const selector of artistSelectors) {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(el => {
                            const text = el.textContent.trim();
                            if (text) {
                                console.log("PANDORA DEBUG: Found potential artist: '" + text + "' using selector " + selector);
                                artistNames.add(text);
                            }
                        });
                    }
                    
                    // Return all found data for external processing
                    return {
                        songTitles: Array.from(songTitles),
                        artistNames: Array.from(artistNames),
                        timestamp: new Date().toISOString()
                    };
                } catch (error) {
                    console.error("PANDORA ERROR:", error);
                    return { error: error.message };
                }
            })();
        `)
        .then(result => {
            if (result.error) {
                window.electronAPI.logToTerminal('ERROR in Pandora detection: ' + result.error);
                return;
            }
            
            if (result.songTitles.length > 0 && result.artistNames.length > 0) {
                // Clean up song title
                let song = result.songTitles[0];
                const artist = result.artistNames[0];
                
                // Format the song title for better Spotify matching
                if (song) {
                    // Remove duplicate text caused by multiple matches
                    const featIndex = song.toLowerCase().indexOf('(feat.');
                    if (featIndex > 0) {
                        song = song.substring(0, featIndex + song.substring(featIndex).indexOf(')') + 1);
                    }
                    
                    // If the song still doesn't look right, take just the first part
                    if (song.includes(song.substring(0, 20)) && song.length > 40) {
                        song = song.substring(0, song.indexOf(song.substring(0, 20), 20)).trim();
                    }
                }
                
                // Only log and play if the song has changed
                if (song !== currentSong || artist !== currentArtist) {
                    window.electronAPI.logToTerminal('NEW SONG DETECTED: ' + artist + ' - ' + song);
                    currentSong = song;
                    currentArtist = artist;
                    
                    // Play on Spotify
                    window.electronAPI.logToTerminal('PLAYING ON SPOTIFY: ' + artist + ' - ' + song);
                    window.electronAPI.spotifyPlaySong(song, artist);
                } else {
                    // Just a brief status message with less verbosity
                    window.electronAPI.logToTerminal('Current song still playing: ' + artist + ' - ' + song);
                }
            }
        })
        .catch(error => {
            window.electronAPI.logToTerminal('ERROR executing script: ' + error.message);
        });
    }, 1000); // Check every 1 second instead of 5 seconds
    
    // Store interval ID to clean up later
    webview._songCheckInterval = checkInterval;
}


