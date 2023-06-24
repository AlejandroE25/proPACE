let response = document.getElementById("response-text")
let queryText = document.getElementById("query-text")

window.onload = function() {
    //connect to the websocket server
    connect()
}

function connect() {
    ws = new WebSocket("ws://73.246.38.149:9001");
    ws.onmessage = function (evt) {
        let received_msg = evt.data;

        // split the response into an array at the '$$' character, where the first element is the query and the second is the response
        let splitResponse = received_msg.split("$$")
        queryText.innerHTML = splitResponse[0]
        response.innerHTML = splitResponse[1]
    }
    ws.onclose = function() {
        console.log("Connection is closed...");
        setTimeout(connect, 1000);
    }
}

let inputline = document.getElementById("inputline")
inputline.onkeydown = function(e) {
    if (e.keyCode === 13) {
        ws.send(inputline.value)
        iSentTheMessage = true
        inputline.value = ""
        queryText.innerHTML = ""
        response.innerHTML = ""
    }
}