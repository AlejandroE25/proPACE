let response = document.getElementById("response-text")
let queryText = document.getElementById("query-text")
let ws = null; // WebSocket connection

window.onload = function() {
    //connect to the websocket server
    connect()
    currentTime()
}

// Blob follows mouse
const blob = document.getElementById("blob");

document.body.onpointermove = event => {
    const { clientX, clientY } = event;

    blob.animate({
        left: `${clientX}px`,
        top: `${clientY}px`,
    }, {duration: 500, fill: "forwards"})
}

// Current time display
function currentTime() {
    let date = new Date();
    let hh = date.getHours();
    let mm = date.getMinutes();
    let ss = date.getSeconds();
    let session = "AM";

    if(hh == 0){
        hh = 12;
    }
    if(hh > 12){
        hh = hh - 12;
        session = "PM";
    }

    hh = (hh < 10) ? "0" + hh : hh;
    mm = (mm < 10) ? "0" + mm : mm;

    let time = hh + ":" + mm + " " + session;

    document.getElementById("time").innerText = time;
    let t = setTimeout(function(){ currentTime() }, 1000);
}

// WebRTC and Audio Player instances
let webrtcClient = null;
let audioPlayer = null;

// WebSocket connection
function connect() {
    ws = new WebSocket("ws://10.0.0.69:3000");

    ws.onopen = function() {
        console.log("WebSocket connection established");
        // Enable input field once connected
        inputline.disabled = false;
        inputline.placeholder = "Type your message here...";

        // Initialize WebRTC and audio player
        initializeWebRTC();
    }

    ws.onmessage = function (evt) {
        try {
            // Parse JSON message
            const message = JSON.parse(evt.data);

            // Route WebRTC signaling messages
            if (message.type === 'webrtc-offer' || message.type === 'webrtc-ice') {
                if (webrtcClient) {
                    webrtcClient.handleSignalingMessage(message);
                }
                return;
            }

            // Handle different message types
            if (message.type === 'message') {
                const query = message.query || '';
                const responseMsg = message.response || '';

                // Display user query immediately (only if it's not empty)
                if (query) {
                    queryText.textContent = query;
                }

                // Typewriter effect for AI response with full markdown rendering
                response.innerHTML = "";
                let i = 0;
                let displayText = "";

                function typeWriter() {
                    if (i < responseMsg.length) {
                        displayText += responseMsg.charAt(i);
                        i++;

                        // Render markdown to HTML
                        response.innerHTML = renderMarkdown(displayText);

                        // Scroll to bottom as text appears
                        const chatMessages = document.getElementById('chat-messages');
                        chatMessages.scrollTop = chatMessages.scrollHeight;

                        setTimeout(typeWriter, 20); // Adjust speed (lower = faster)
                    }
                }
                typeWriter();

                // TTS is handled by server-side WebRTC voice interface
                if (iSentTheMessage === true && message.status === 'complete') {
                    iSentTheMessage = false;
                }
            }
        } catch (error) {
            console.error('Error parsing message:', error);
            // Fallback to display raw message
            response.textContent = evt.data;
        }
    }

    ws.onclose = function() {
        console.log("Connection is closed...");
        // Disable input while disconnected
        inputline.disabled = true;
        inputline.placeholder = "Reconnecting...";
        setTimeout(connect, 1000);
    }

    ws.onerror = function(error) {
        console.error("WebSocket error:", error);
    }
}

// Markdown renderer with full feature support
function renderMarkdown(text) {
    let html = text;

    // Escape HTML first to prevent XSS
    html = html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Code blocks (triple backticks) - must come before inline code
    html = html.replace(/```(\w+)?\n([\s\S]+?)```/g, function(match, lang, code) {
        const language = lang || 'text';
        return `<pre><code class="language-${language}">${code.trim()}</code></pre>`;
    });

    // Tables - must come before other processing
    html = html.replace(/(\|.+\|\n)+/g, function(table) {
        const rows = table.trim().split('\n');
        if (rows.length < 2) return table;

        let tableHtml = '<table>';
        let isFirstRow = true;
        let headerProcessed = false;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Skip separator row (|---|---|)
            if (row.match(/^\|[\s\-:|]+\|$/)) {
                headerProcessed = true;
                continue;
            }

            const cells = row.split('|').filter(cell => cell.trim() !== '');

            if (cells.length === 0) continue;

            tableHtml += '<tr>';

            // First row before separator is header
            if (isFirstRow && !headerProcessed) {
                cells.forEach(cell => {
                    tableHtml += `<th>${cell.trim()}</th>`;
                });
                isFirstRow = false;
            } else {
                cells.forEach(cell => {
                    tableHtml += `<td>${cell.trim()}</td>`;
                });
            }

            tableHtml += '</tr>';
        }

        tableHtml += '</table>';
        return tableHtml;
    });

    // Blockquotes (multi-line support)
    html = html.replace(/(^&gt;\s.+$(\n&gt;\s.+$)*)/gm, function(match) {
        // Remove > from each line and wrap in single blockquote
        const lines = match.split('\n')
            .map(line => line.replace(/^&gt;\s/, ''))
            .join('<br>');
        return `<blockquote>${lines}</blockquote>`;
    });

    // Headers (h1-h6)
    html = html.replace(/^######\s(.+)$/gm, '<h6>$1</h6>');
    html = html.replace(/^#####\s(.+)$/gm, '<h5>$1</h5>');
    html = html.replace(/^####\s(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^##\s(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#\s(.+)$/gm, '<h1>$1</h1>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr>');
    html = html.replace(/^\*\*\*$/gm, '<hr>');

    // Unordered lists
    html = html.replace(/^\*\s(.+)$/gm, '<li>$1</li>');
    html = html.replace(/^-\s(.+)$/gm, '<li>$1</li>');
    html = html.replace(/^(\+)\s(.+)$/gm, '<li>$2</li>');

    // Ordered lists
    html = html.replace(/^\d+\.\s(.+)$/gm, '<li>$1</li>');

    // Wrap consecutive <li> in <ul> or <ol>
    html = html.replace(/(<li>.*<\/li>\n?)+/g, function(match) {
        return '<ul>' + match + '</ul>';
    });

    // Links [text](url)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    // Images ![alt](url)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');

    // Bold and italic (must be in this order)
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.+?)_/g, '<em>$1</em>');

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

    // Inline code (after code blocks)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

var iSentTheMessage = true

// TTS is handled server-side via WebRTC voice interface plugin

// Input handling
let inputline = document.getElementById("inputline")
// Disable input until WebSocket connects
inputline.disabled = true;
inputline.placeholder = "Connecting...";

inputline.addEventListener('keydown', function(e) {
    if (e.key === "Enter" && inputline.value.trim() !== "") {
        // Interrupt active TTS playback
        if (audioPlayer && audioPlayer.isPlaying) {
            audioPlayer.stop();
            handleWebRTCStateChange('playback-interrupted');
        }

        // Check if WebSocket is ready before sending (readyState 1 = OPEN)
        if (ws && ws.readyState === 1) {
            ws.send(inputline.value);
            iSentTheMessage = true;
            inputline.value = "";
        } else {
            console.warn("WebSocket is not connected");
        }
    }
});

/**
 * Initialize WebRTC and Audio Player
 */
async function initializeWebRTC() {
    try {
        // Initialize audio player
        audioPlayer = new AudioPlayer();
        await audioPlayer.initialize();
        console.log('[App] Audio player initialized');

        // Initialize WebRTC client
        webrtcClient = new WebRTCClient(null, ws, handleWebRTCStateChange);
        await webrtcClient.initialize();
        console.log('[App] WebRTC client initialized');
    } catch (error) {
        console.error('[App] Failed to initialize WebRTC:', error);
    }
}

/**
 * Handle WebRTC state changes and audio events
 */
function handleWebRTCStateChange(state, data) {
    const logo = document.getElementById('pace_logo');

    console.log('[App] WebRTC state change:', state);

    switch (state) {
        case 'audio-chunk-received':
            // Play audio chunk
            if (audioPlayer && data) {
                audioPlayer.playChunk(data);
                // Add speaking animation when first chunk arrives
                if (logo && !logo.classList.contains('speaking')) {
                    logo.classList.add('speaking');
                }
            }
            break;

        case 'playback-complete':
        case 'playback-stopped':
        case 'playback-interrupted':
            // Remove speaking animation
            if (logo) {
                logo.classList.remove('speaking');
            }
            break;

        case 'webrtc-connected':
            console.log('[App] WebRTC connection established');
            break;

        case 'webrtc-failed':
            console.error('[App] WebRTC connection failed');
            break;

        case 'webrtc-error':
            console.error('[App] WebRTC error:', data);
            break;

        default:
            // Log other state changes for debugging
            console.log('[App] Unhandled state:', state);
    }
}

// Make handleWebRTCStateChange available globally for audio player callbacks
window.handleWebRTCStateChange = handleWebRTCStateChange;
