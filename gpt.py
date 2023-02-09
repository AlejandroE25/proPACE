import openai

openai.api_key = "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"

prompt = "The following is a conversation with an AI assistant named PACE. The assistant is helpful, creative, clever, and very friendly, although sometimes sarcastic.\n\nUser:"


def generateResponse(text):
    global prompt
    prompt = prompt + text + "\nPACE:"
    response = openai.Completion.create(
        engine="davinci",
        prompt=prompt,
        temperature=0.9,
        max_tokens=150,
        top_p=1,
        frequency_penalty=0,
        presence_penalty=0.6,
        stop=["User:", "PACE:"]
    )
    return response["choices"][0]["text"]


def check():
    generateResponse("hello")
