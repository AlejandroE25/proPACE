import openai

openai.api_key = "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"

prompt = "The following is a conversion between a User and Elvis Presley\n\nUser:"


def generateResponse(text):
    global prompt
    prompt = prompt + text + "\nElvis:"
    response = openai.Completion.create(
        engine="ada",
        prompt=prompt,
        temperature=0.9,
        max_tokens=600,
        top_p=1,
        frequency_penalty=0,
        presence_penalty=0.6,
        stop=["User:", "Elvis:"]
    )
    return response["choices"][0]["text"]


def check():
    print(generateResponse("hello"))
