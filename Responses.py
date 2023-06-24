import datetime
import rich
import Weather
import News
import Carter
import Wolfram

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
    wolframResponse = Wolfram.getWolframResponse(text)

    agent_response_text = carterResponse['output']['text']
    # try:
    #     agent_response_intent = carterResponse['triggers'][0]['type']
    # except:
    #     agent_response_intent = None
    #
    # if agent_response_intent == "Weather Request":
    #     rich.print(f"[bold yellow]Carter Response | Weather[/bold yellow]")
    #     city, weather, temp, windchill = Weather.getWeather()
    #     return agent_response_text.replace("$city$", city).replace("$weather$", weather).replace("$real_temp$",
    #                                                                                              str(int(
    #                                                                                                  temp))).replace(
    #         "$wind_chill$", str(int(windchill)))
    #
    # elif agent_response_intent == "time-request":
    #     rich.print(f"[bold yellow]Carter Response | Time[/bold yellow]")
    #     time = datetime.datetime.now().strftime("%I:%M %p")
    #     return agent_response_text.replace("$time", time)
    #
    # elif agent_response_intent == "News request":
    #     rich.print(f"[bold yellow]Carter Response | News[/bold yellow]")
    #     news = News.generateResponse()
    #     return news
    #
    # elif wolframResponse is not None:
    #     if "(" in wolframResponse:
    #         wolframResponse = wolframResponse.split("(")[0]
    #         wolframResponse = wolframResponse.replace("?", "")
    #     rich.print(f"[bold yellow]Wolfram Response[/bold yellow]")
    #     return wolframResponse
    #
    # else:
    #     rich.print(f"[bold yellow]Carter Response | No Intents[/bold yellow]")
    #     return agent_response_text

    return agent_response_text


def check():
    return generateResponse("1+1")