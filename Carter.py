import json
import requests
import os

try:
    import Weather
except:
    pass


def getCarterResponse(text):
    data = json.dumps({
        "api_key": "vOxeSZM6JyPBInc7YGithemFFMI4yKtb",
        "query": f"{text}",
        "uuid": "Pixel",
    })
    headers = {"Content-Type": "application/json"}

    resp = requests.request("POST", "https://api.carterapi.com/v0/chat", data=data, headers=headers, stream=True)

    return resp.json()


def check():
    os.system("ping api.openweathermap.org")
    Weather.check()
    getCarterResponse("hello")
