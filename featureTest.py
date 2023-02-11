import Wolfram
import gpt


def parseResponse(wolframResponse, gptResponse):
    if wolframResponse == None:
        print("Wolfram Response is None")
        return gptResponse
    else:
        print("Wolfram Response is not None")
        return wolframResponse


def generateResponse(text):
    wolframResponse = Wolfram.getWolframResponse(text)
    gptResponse = gpt.generateResponse(text)
    finalResponse = parseResponse(wolframResponse, gptResponse)
    return finalResponse


def check():
    print(generateResponse("What is the capital of illinois?"))
