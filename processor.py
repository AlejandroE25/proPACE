import requests
import os
from playsound import playsound 
import json

def getBotResponse(text):
    data = json.dumps({
        "api_key": "vOxeSZM6JyPBInc7YGithemFFMI4yKtb",
        "query": f"{text}",
        "uuid": "Pixel",
    })
    headers = {"Content-Type": "application/json"}

    resp = requests.request("POST", "https://api.carterapi.com/v0/chat", data=data, headers=headers, stream=True)

    agent_response = resp.json()['output']['text']

    return agent_response


def speak(text):
    aud = requests.get (f"https://api.carterapi.com/v0/speak/vOxeSZM6JyPBInc7YGithemFFMI4yKtb/{text}", stream=True)
    with open('audio.mp3', 'wb') as f:
        for chunk in aud.iter_content(chunk_size=1024):
            if chunk:
                f.write(chunk)

    playsound('audio.mp3')
    os.remove('audio.mp3')
