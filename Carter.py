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


def parseResponse(response):
    agent_response_text = response['output']['text']
    try:
        agent_response_intent = response['triggers'][0]['type']
    except:
        agent_response_intent = "None"

    if agent_response_intent == "Weather Request":
        city, weather, temp, windchill = Weather.getWeather()
        return agent_response_text.replace("$city$", city).replace("$weather$", weather).replace("$real_temp$",
                                                                                                 str(int(
                                                                                                     temp))).replace(
            "$wind_chill$", str(int(windchill)))
    else:
        return agent_response_text


def generateResponse(text):
    response = getCarterResponse(text)
    finalResponse = parseResponse(response)
    return finalResponse


def check():
    try:
        os.system("ping api.openweathermap.org")
        Weather.check()
        return True
    except:
        return False
