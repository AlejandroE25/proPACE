import datetime
import rich
import Weather
import Carter

'''

Carter + GPT-3

def parseResponse(carterResponse, gptResponse):
    agent_response_text = carterResponse['output']['text']
    try:
        agent_response_intent = carterResponse['triggers'][0]['type']
    except:
        rich.print(f"[bold yellow]GPT Response[/bold yellow]")
        return gptResponse

    if agent_response_intent == "Weather Request":
        rich.print(f"[bold yellow]Carter Response[/bold yellow]")
        city, weather, temp, windchill = Weather.getWeather()
        return agent_response_text.replace("$city$", city).replace("$weather$", weather).replace("$real_temp$",
                                                                                                 str(int(
                                                                                                     temp))).replace(
            "$wind_chill$", str(int(windchill)))
    elif agent_response_intent == "time-request":
        rich.print(f"[bold yellow]Carter Response[/bold yellow]")
        time = datetime.datetime.now().strftime("%I:%M %p")
        return agent_response_text.replace("$time", time)
    else:
        rich.print(f"[bold yellow]Carter Response[/bold yellow]")
        return agent_response_text
'''

'''

Wolfram + GPT-3

def parseResponse(wolframResponse, gptResponse):
    if wolframResponse == None:
        rich.print(f"[bold yellow]GPT Response[/bold yellow]")
        return gptResponse
    else:
        rich.print(f"[bold yellow]Wolfram Response[/bold yellow]")
        return wolframResponse


def generateResponse(text):
    # wolframResponse = Wolfram.getWolframResponse(text)
    gptResponse = gpt.generateResponse(text)
    # finalResponse = parseResponse(wolframResponse, gptResponse)
    # return finalResponse
    return gptResponse
'''

def generateResponse(text):
    carterResponse = Carter.getCarterResponse(text)

    agent_response_text = carterResponse['output']['text']
    try:
        agent_response_intent = carterResponse['triggers'][0]['type']
    except:
        rich.print(f"[bold yellow]Carter Response | No Intents[/bold yellow]")
        return agent_response_text

    if agent_response_intent == "Weather Request":
        rich.print(f"[bold yellow]Carter Response | Weather[/bold yellow]")
        city, weather, temp, windchill = Weather.getWeather()
        return agent_response_text.replace("$city$", city).replace("$weather$", weather).replace("$real_temp$",
                                                                                                 str(int(
                                                                                                     temp))).replace(
            "$wind_chill$", str(int(windchill)))
    elif agent_response_intent == "time-request":
        rich.print(f"[bold yellow]Carter Response | Time[/bold yellow]")
        time = datetime.datetime.now().strftime("%I:%M %p")
        return agent_response_text.replace("$time", time)
    else:
        rich.print(f"[bold yellow]Carter Response | No Intents[/bold yellow]")
        return agent_response_text


def check():
    print(generateResponse("1+1"))

