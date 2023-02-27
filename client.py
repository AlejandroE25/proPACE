import websocket
import _thread
import time
import pyfiglet
import rich

received = False


def on_message(ws, message):
    message = message.split("$$")[1]
    rich.print(f"[bold red]proPACE: {message}[/bold red]")
    global received
    received = True


def on_error(ws, error):
    print(error)


def on_close(ws):
    print("### closed ###")


def on_open(ws):
    text = pyfiglet.figlet_format("PACE Connected", font="slant")
    print(text)


# loop that sends user input to server
def mainloop():
    global received
    while True:
        if received:
            msg = input("Enter a message: ")
            if msg == "exit":
                ws.close()
                exit()
            ws.send(msg)
            received = False
        time.sleep(1)


if __name__ == "__main__":
    websocket.enableTrace(False)
    ws = websocket.WebSocketApp("ws://73.110.35.182:9001",
                                on_message=on_message,
                                on_error=on_error,
                                on_close=on_close)
    ws.on_open = on_open
    _thread.start_new_thread(mainloop, ())
    ws.run_forever()
