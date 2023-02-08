from websocket_server import WebsocketServer
import requests, json

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

# Called for every client connecting (after handshake)
def new_client(client, server):
    response = getBotResponse("Hi, I'm back")
    server.send_message(client, response)
    print("New client connected and was given id %d" % client['id'])
    print(f"PACE said: {response}")


# Called for every client disconnecting
def client_left(client, server):
	print("Client(%d) disconnected" % client['id'])


# Called when a client sends a message
def message_received(client, server, message):
    response = getBotResponse(message)
    server.send_message_to_all(response)
    print(f"Client({client['id']}) said: {message}")
    print(f"PACE said: {response}")

HOST = '0.0.0.0'
PORT=9001
server = WebsocketServer(host=HOST, port = PORT)
server.set_fn_new_client(new_client)
server.set_fn_client_left(client_left)
server.set_fn_message_received(message_received)
server.run_forever()