let response = document.getElementById("response-text")
let queryText = document.getElementById("query-text")

window.onload = function() {
    //connect to the websocket server
    connect()
    currentTime()

    
}



const blob = document.getElementById("blob");

document.body.onpointermove = event => {
    const { clientX, clientY } = event;

    blob.animate({
        left: `${clientX}px`,
        top: `${clientY}px`,
    }, {duration: 500, fill: "forwards"})

}

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


function connect() {
    ws = new WebSocket("ws://73.246.38.149:9001");
    ws.onmessage = function (evt) {
        let received_msg = evt.data;

        // split the response into an array at the '$$' character, where the first element is the query and the second is the response
        let splitResponse = received_msg.split("$$")
        queryText.innerHTML = splitResponse[0]
        response.innerHTML = splitResponse[1]
        fitFont(response)
        fitFont(queryText)

        if (iSentTheMessage == true) {
            speakText(splitResponse[1])
            iSentTheMessage = false
        }
    }
    ws.onclose = function() {
        console.log("Connection is closed...");
        setTimeout(connect, 1000);
    }
}

function fitFont(elem){
  var child = elem.children[0];
  var getFontSize = parseFloat(window.getComputedStyle(child).getPropertyValue('font-size'));

  while(child.offsetHeight>elem.clientHeight){
    getFontSize -= .1;
    child.style.fontSize = getFontSize + 'px';
  }
  child.style.visibility = 'visible';
}

var iSentTheMessage = true

function speakText(textToSpeak){
  var myAudio = new Audio("https://api.carterapi.com/v0/speak/vOxeSZM6JyPBInc7YGithemFFMI4yKtb/" + textToSpeak);
  console.log(myAudio.src)
  myAudio.play()
}



// take input from #inputline, send it to the websocket, then clear the input line
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