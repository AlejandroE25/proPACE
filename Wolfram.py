import wolframalpha

wolframKey = "5LKAYP-WUV6X6YXKR"

wolframClient = wolframalpha.Client(wolframKey)


def getWolframResponse(query):
    res = wolframClient.query(query)
    try:
        return next(res.results).text
    except:
        return None


def check():
    getWolframResponse("what is the meaning of life?")
