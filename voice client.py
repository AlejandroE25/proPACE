# This a voice client for PACE.  It uses the speech_recognition package to process speech, then send it to pace

import speech_recognition as sr
import websocket
import _thread
import time
import pyfiglet
import rich
import pyttsx3
import os


engine = pyttsx3.init()
voices = engine.getProperty('voices')
rate = engine.getProperty('rate')
engine.setProperty('rate', 175)
engine.setProperty('voice', voices[0].id)
engine.setProperty('volume', 0.0)

os.system("cls")


received = False
hasDetected = False
r = sr.Recognizer()

def on_message(ws, message):
    message = message.split(";")[1]
    rich.print(f"[bold red]proPACE: {message}[/bold red]")
    engine.say(message)
    engine.runAndWait()
    global received
    received = True


def on_error(ws, error):
    print(error)


def on_close(ws):
    print("### closed ###")


def on_open(ws):
    text = pyfiglet.figlet_format("PACE Connected", font="slant")
    print(text)


# loop that sends user input to server
def mainloop():
    global received, hasDetected
    while True:
        if received:
            with sr.Microphone() as source:
                if not hasDetected:
                    print("You: ", end="")
                    hasDetected = True
                r.adjust_for_ambient_noise(source, duration=1)
                try:
                    audio = r.listen(source, timeout=2)
                    try:
                        msg = r.recognize_google(audio)
                        print(msg)

                    except sr.UnknownValueError:
                        continue
                    except sr.RequestError as e:
                        continue
                except sr.WaitTimeoutError:
                    continue
                print(msg)
            if msg == "exit":
                ws.close()
                exit()
            ws.send(msg)
            hasDetected = False
            received = False
        time.sleep(1)


if __name__ == "__main__":
    websocket.enableTrace(False)
    ws = websocket.WebSocketApp("ws://73.110.35.182:9001",
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.on_open = on_open
    _thread.start_new_thread(mainloop, ())
    ws.run_forever()
