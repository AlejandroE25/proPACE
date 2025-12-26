/**
 * proPACE Web UI
 * Elegant, responsive interface for any device
 */

let ws = null;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const reconnectDelay = 1000;

// Initialize on page load
window.onload = function() {
    connect();
    currentTime();
    setupMouseFollowing();
    setupLogoClick();
    setupInputHandler();
};

/**
 * Mouse-following blob effect (from existing UI)
 */
function setupMouseFollowing() {
    const blob = document.getElementById("blob");

    document.body.onpointermove = event => {
        const { clientX, clientY } = event;

        blob.animate({
            left: `${clientX}px`,
            top: `${clientY}px`,
        }, { duration: 500, fill: "forwards" });
    };
}

/**
 * Update clock display (from existing UI)
 */
function currentTime() {
    let date = new Date();
    let hh = date.getHours();
    let mm = date.getMinutes();
    let session = "AM";

    if (hh === 0) {
        hh = 12;
    }
    if (hh > 12) {
        hh = hh - 12;
        session = "PM";
    }

    hh = (hh < 10) ? "0" + hh : hh;
    mm = (mm < 10) ? "0" + mm : mm;

    let time = hh + ":" + mm + " " + session;

    document.getElementById("time").innerText = time;
    setTimeout(currentTime, 1000);
}

/**
 * Connect to WebSocket server
 */
function connect() {
    const wsUrl = `ws://${window.location.host}`;

    updateConnectionStatus('connecting', 'Connecting...');

    try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            onConnected();
        };

        ws.onmessage = (event) => {
            try {
                // Try to parse as JSON first
                const message = JSON.parse(event.data);
                handleMessage(message);
            } catch (error) {
                // Not JSON, must be legacy text format (message$$response)
                handleLegacyMessage(event.data);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
            onDisconnected();
        };
    } catch (error) {
        console.error('Connection error:', error);
        onDisconnected();
    }
}

/**
 * Handle successful connection
 */
function onConnected() {
    reconnectAttempts = 0;
    updateConnectionStatus('connected', 'Connected');

    // Subscribe to all events
    sendMessage({
        type: 'subscribe',
        events: '*'
    });

    // Request initial health status
    sendMessage({
        type: 'get_health'
    });

    // No connection message in chat
}

/**
 * Handle disconnection
 */
function onDisconnected() {
    updateConnectionStatus('disconnected', 'Disconnected');

    if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1);

        setTimeout(() => {
            connect();
        }, delay);
    }
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(message) {
    switch (message.type) {
        case 'welcome':
            console.log('Welcome:', message);
            break;

        case 'health':
            updateHealth(message.data);
            break;

        case 'event':
            handleEvent(message.event);
            break;

        case 'response':
            addSystemMessage(message.text || message.message);
            break;

        case 'error':
            addSystemMessage(message.message || 'An error occurred');
            break;
    }
}

/**
 * Handle legacy text format messages (message$$response)
 */
function handleLegacyMessage(data) {
    if (data.includes('$$')) {
        const parts = data.split('$$');
        const response = parts[1];
        if (response && response !== '🔍 Processing...') {
            addSystemMessage(response);
        }
    }
}

/**
 * Handle system events
 */
function handleEvent(event) {
    console.log('Event received:', event);
    // Could show events in activity log
}

/**
 * Send message to server
 */
function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(status, text) {
    const dot = document.getElementById('connection-dot');
    const statusText = document.getElementById('connection-text');

    dot.className = `status-dot ${status}`;
    statusText.textContent = text;
}

/**
 * Update health dashboard
 */
function updateHealth(health) {
    // Update health ring only
    const healthRing = document.getElementById('health-ring');
    if (healthRing) {
        const healthClass = health.healthy ? 'healthy' : 'unhealthy';
        healthRing.className = `health-ring ${healthClass}`;
    }
}

/**
 * Poll health endpoint via REST API (for health ring only)
 */
async function pollHealth() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();
        updateHealth(data);
    } catch (error) {
        // Silent fail - health ring will just not update
    }
}

/**
 * Start periodic health polling (every 60 seconds)
 */
setInterval(pollHealth, 60000);

/**
 * Add user message to conversation
 */
function addUserMessage(text) {
    const messages = document.getElementById('messages');
    const message = document.createElement('div');
    message.className = 'message user';
    message.innerHTML = `
        <span class="label">You:</span>
        <span class="text">${escapeHtml(text)}</span>
    `;
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
}

/**
 * Add system message to conversation with typewriter effect
 */
function addSystemMessage(text) {
    const messages = document.getElementById('messages');
    const message = document.createElement('div');
    message.className = 'message system';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'PACE:';

    const textSpan = document.createElement('span');
    textSpan.className = 'text';

    message.appendChild(label);
    message.appendChild(textSpan);
    messages.appendChild(message);

    // Typewriter effect
    typewriterEffect(textSpan, text);
}

/**
 * Typewriter effect with markdown support
 */
function typewriterEffect(element, text) {
    const messages = document.getElementById('messages');

    // Parse markdown to HTML
    const parsedText = parseMarkdown(text);

    // For simplicity, just show the final rendered HTML immediately
    // Typewriter effect with complex HTML/markdown is tricky to implement correctly
    element.innerHTML = parsedText;
    messages.scrollTop = messages.scrollHeight;
}

/**
 * Parse simple markdown to HTML
 */
function parseMarkdown(text) {
    // Escape HTML first
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Inline code first (to protect it from other replacements): `code`
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Use unique ASCII placeholders to handle bold before italic
    // Bold: **text** or __text__
    html = html.replace(/\*\*([^*]+)\*\*/g, '___BOLD_START___$1___BOLD_END___');
    html = html.replace(/__([^_]+)__/g, '___BOLD_START___$1___BOLD_END___');

    // Italic: *text* or _text_ (now safe, bold is protected)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');

    // Replace bold placeholders with actual tags
    html = html.replace(/___BOLD_START___/g, '<strong>');
    html = html.replace(/___BOLD_END___/g, '</strong>');

    // Newlines are preserved by white-space: pre-wrap in CSS

    return html;
}

/**
 * Setup input handler
 */
function setupInputHandler() {
    const inputline = document.getElementById('inputline');

    inputline.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { // Enter key
            const text = inputline.value.trim();
            if (text) {
                sendCommand(text);
                inputline.value = '';
            }
        }
    });
}

/**
 * Send command to server
 */
async function sendCommand(command) {
    addUserMessage(command);

    try {
        // Send via WebSocket if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
            sendMessage({
                type: 'command',
                text: command,
                timestamp: new Date().toISOString()
            });
        } else {
            addSystemMessage('Not connected to server');
        }
    } catch (error) {
        console.error('Failed to send command:', error);
        addSystemMessage('Failed to send command');
    }
}

/**
 * Setup logo click handler
 */
function setupLogoClick() {
    // Logo click functionality can be added here
}

/**
 * Format uptime duration
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
