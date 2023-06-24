import json
import requests
import os

try:
    import Weather
except:
    pass

# api_key = "vOxeSZM6JyPBInc7YGithemFFMI4yKtb"
api_key = "36be8e0e-e872-4d67-b30e-62d74d40a18b"
def getCarterResponse(text):
    # data = json.dumps({
    #     "api_key": f"{api_key}",
    #     "query": f"{text}",
    #     "uuid": "Pixel",
    # })

    data = json.dumps({
        "text": f"{text}",
        "key": f"{api_key}",
        "user_id": "Pixel"
    })

    headers = {"Content-Type": "application/json"}

    # resp = requests.request("POST", "https://api.carterapi.com/v0/chat", data=data, headers=headers, stream=True)
    resp = requests.request("POST", "https://api.carterlabs.ai/api/chat", data=data, headers=headers, stream=True)
#     resp = requests.request("POST", "https://unstable.carterlabs.ai/api/chat", data=data, headers=headers, stream=True)
    return resp.json()

def getOpener():
    reqUrl = "https://api.carterlabs.ai/api/opener"
    headers = {"Accept": "*/*",
               "Content-Type": "application/json"}

    payload = json.dumps({
        "key": f"{api_key}",
        "playerId": "Pixel"
    })

    response = requests.request("POST", reqUrl, data=payload, headers=headers)

    return response.json()['sentence']

def check():
    return getCarterResponse("hello")['output']
