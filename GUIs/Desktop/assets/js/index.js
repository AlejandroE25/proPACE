let response = document.getElementById("response-text")
let queryText = document.getElementById("query-text")

window.onload = function() {
    //connect to the websocket server
    connect()
    currentTime()

    fetch("https://api.ipify.org/?format=json").then(res => res.json()).then(data => {
        document.getElementById("ipaddress").innerText = data.ip
    })

    // get the titles from the local news.json file, then append them to the newsItems ul as .news-items
    fetch("./news.json").then(res => res.json()).then(data => {
        let newsItems = document.getElementById("newsItems")
        for (let i = 0; i < data.length; i++) {
            let li = document.createElement("li")
            li.className = "news-item"
            li.innerHTML = data[i].title
            newsItems.appendChild(li)
        }
    })
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
    ws = new WebSocket("ws://73.110.35.182:9001");
    ws.onmessage = function (evt) {
        let received_msg = evt.data;

        // split the response into an array at the '$$' character, where the first element is the query and the second is the response
        let splitResponse = received_msg.split("$$")
        queryText.innerHTML = splitResponse[0]
        response.innerHTML = splitResponse[1]

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

var iSentTheMessage = true

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
        iSentTheMessage = true
        inputline.value = ""
        queryText.innerHTML = ""
        response.innerHTML = ""
    }
}