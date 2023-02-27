# This a voice client for PACE.  It uses the speech_recognition package to process speech, then send it to pace
import requests
import speech_recognition as sr
import websocket
import _thread
import time
import pyfiglet
import rich
import pyttsx3
import os
import io
import pygame
import whisper
from pydub import AudioSegment

pygame.mixer.init()

engine = pyttsx3.init()
voices = engine.getProperty('voices')
rate = engine.getProperty('rate')
engine.setProperty('rate', 175)
engine.setProperty('voice', voices[0].id)
engine.setProperty('volume', -20.0)

os.system("cls")

received = False
hasDetected = False
iSentTheMessage = True
r = sr.Recognizer()


def speak(text):
    aud = requests.get(f"https://api.carterapi.com/v0/speak/vOxeSZM6JyPBInc7YGithemFFMI4yKtb/{text}", stream=True)
    with open('audio.mp3', 'wb') as f:
        for chunk in aud.iter_content(chunk_size=1024):
            if chunk:
                f.write(chunk)

    line = pygame.mixer.Sound('audio.mp3')
    line.play()
    os.remove('audio.mp3')


def on_message(ws, message):
    global iSentTheMessage
    message = message.split("$$")[1]
    if (iSentTheMessage):
        speak(message)
        iSentTheMessage = False
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
    global received, hasDetected, iSentTheMessage

    model = "tiny"
    verbose = False
    english = True
    energy = 500
    dynamic_energy = False
    pause = 0.8
    save_path = "./audio.wav"

    if model != "large" and english:
        model = model + ".en"
    audio_model = whisper.load_model(model, in_memory=True)

    r = sr.Recognizer()
    r.energy_threshold = energy
    r.pause_threshold = pause
    r.dynamic_energy_threshold = dynamic_energy

    while True:
        with sr.Microphone(sample_rate=16000) as source:
            while received:
                print("Say something!")
                print("Listening...")
                # get and save audio to wav file
                r.adjust_for_ambient_noise(source)
                audio = r.listen(source)
                data = io.BytesIO(audio.get_wav_data())
                audio_clip = AudioSegment.from_file(data)
                audio_clip.export(save_path, format="wav")
                try:
                    if english:
                        print("Transcribing...")
                        result = audio_model.transcribe(
                            save_path, language='english')
                    else:
                        print("Transcribing...")
                        result = audio_model.transcribe(save_path)
                    if not verbose:
                        predicted_text = result["text"]
                        print(f"You said: {predicted_text}")
                        if "exit" in predicted_text.lower():
                            ws.close()
                            exit()
                        ws.send(predicted_text)
                        iSentTheMessage = True
                        hasDetected = False
                        received = False

                    elif "goodbye" in (predicted_text).lower():
                        ws.close()
                        exit()
                    else:
                        print(result)

                except:
                    print("Error: Could not transcribe audio")

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
