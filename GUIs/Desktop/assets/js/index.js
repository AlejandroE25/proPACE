let response = document.getElementById("response-text")
let queryText = document.getElementById("query-text")

window.onload = function() {
    //connect to the websocket server
    ws = new WebSocket("ws://73.110.35.182:9001");
    ws.onmessage = function (evt) {
        let received_msg = evt.data;
        
        // split the response into an array at the ';' character, where the first element is the query and the second is the response
        let splitResponse = received_msg.split(";")
        queryText.innerHTML = splitResponse[0]
        response.innerHTML = splitResponse[1]

        speakText(splitResponse[1])
    }
}

function speakText(textToSpeak){
  var myAudio = new Audio("https://api.carterapi.com/v0/speak/vOxeSZM6JyPBInc7YGithemFFMI4yKtb/" + textToSpeak);
  console.log(myAudio.src)
  myAudio.play()
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

// take input from #inputline, send it to the websocket, then clear the input line
let inputline = document.getElementById("inputline")
inputline.onkeydown = function(e) {
    if (e.keyCode === 13) {
        ws.send(inputline.value)
        inputline.value = ""
        queryText.innerHTML = ""
        response.innerHTML = ""
    }
}