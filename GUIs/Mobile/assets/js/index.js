let transcript = document.getElementById("transcript-text")

window.onload = function() {
    //connect to the websocket server
    ws = new WebSocket("ws://10.0.0.227:9001");
    ws.onmessage = function (evt) {
        let received_msg = evt.data;
        transcript.innerHTML = received_msg;
    }
}

let button = document.getElementById("pace_logo")

button.onpointerdown = function() {
    button.style.background = "#242F40"
    button.style.border = "4px solid #FCBE24"
}
button.onpointerup = function() {
    button.style.background = "#161c29"
    button.style.border = "2px solid #FCBE24"
}