let response = document.getElementById("response-text")
let queryText = document.getElementById("query-text")

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

// WebSocket connection
function connect() {
    ws = new WebSocket("ws://10.0.0.69:3000");

    ws.onopen = function() {
        console.log("WebSocket connection established");
        // Enable input field once connected
        inputline.disabled = false;
        inputline.placeholder = "Type your message here...";
    }

    ws.onmessage = function (evt) {
        let received_msg = evt.data;

        // Split response at '$$'
        let splitResponse = received_msg.split("$$");
        let query = splitResponse[0];
        let responseMsg = splitResponse[1];

        // Update message containers with HTML escaping
        queryText.innerHTML = escapeHtml(query);
        response.innerHTML = escapeHtml(responseMsg);

        // Scroll to bottom of chat
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (iSentTheMessage == true) {
            speakText(responseMsg);
            iSentTheMessage = false;
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

// HTML escaping for security
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

var iSentTheMessage = true

function speakText(textToSpeak){
    var myAudio = new Audio("https://api.carterapi.com/v0/speak/vOxeSZM6JyPBInc7YGithemFFMI4yKtb/" + textToSpeak);
    console.log(myAudio.src)
    myAudio.play()
}

// Input handling
let inputline = document.getElementById("inputline")
// Disable input until WebSocket connects
inputline.disabled = true;
inputline.placeholder = "Connecting...";

inputline.addEventListener('keydown', function(e) {
    if (e.key === "Enter" && inputline.value.trim() !== "") {
        // Check if WebSocket is ready before sending
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(inputline.value);
            iSentTheMessage = true;
            inputline.value = "";
        } else {
            console.warn("WebSocket is not connected");
        }
    }
});
