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
    const news = document.getElementById("news")

    // scroll through the news element really slowly, then reset the scroll position with an ease animtion
    setInterval(() => {
        news.scrollBy(0, 1)
        if (news.scrollTop == news.scrollHeight - news.clientHeight) {
            news.animate({
                scrollTop: 0
            }, {duration: 10000, fill: "forwards"})
        }
    }, 100)
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
        speakText(splitResponse[1])
    }
    ws.onclose = function() {
        console.log("Connection is closed...");
        setTimeout(connect, 1000);
    }
}

function speakText(textToSpeak){
  var myAudio = new Audio("https://api.carterapi.com/v0/speak/vOxeSZM6JyPBInc7YGithemFFMI4yKtb/" + textToSpeak);
  console.log(myAudio.src)
  myAudio.play()
}