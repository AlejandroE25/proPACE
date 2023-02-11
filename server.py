from websocket_server import WebsocketServer
import os

os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"
import pygame
import pyfiglet
import rich

workingSubsystems = ["Carter", "Responses", "Weather"]
pygame.mixer.init()

checkSound = pygame.mixer.Sound("./sounds/checking.wav")
successSound = pygame.mixer.Sound("./sounds/success.wav")
# failureSound = pygame.mixer.Sound("./sounds/failure.wav")
startupCompleteSound = pygame.mixer.Sound("./sounds/startupComplete.wav")


# Called for every client connecting (after handshake)
def new_client(client, server):
    response = Responses.generateResponse("Hi, I'm back")
    response = f"Hi, I'm back;{response}"
    server.send_message(client, response)
    rich.print(f"[bold green]New client connected and was given id {client['id']}[/bold green]")


# Called for every client disconnecting
def client_left(client, server):
    rich.print(f"[bold red]Client(%d) disconnected [/bold red]" % client['id'])


# Called when a client sends a message
def message_received(client, server, message):
    rich.print(f"[blue]Client({client['id']}) said: {message}[/blue]")
    generatedMessage = Responses.generateResponse(message)
    response = f"{message};{generatedMessage}"
    server.send_message_to_all(response)
    rich.print(f"[green]PACE said: {generatedMessage}[/green]")


if __name__ == "__main__":
    # Check if subsystems are working
    for subsystem in workingSubsystems:
        rich.print(f"[bold yellow]Checking {subsystem}...[/bold yellow]")
        checkSound.play()
        try:
            f = open(f"{subsystem}.py", "r")
            f.close()
            rich.print(f"[bold green]{subsystem} is present![/bold green]")
            try:
                if subsystem == "Weather":
                    import Weather

                    Weather.check()
                    rich.print(f"[bold green]{subsystem} is working![/bold green]")
                elif subsystem == "Wolfram":
                    import Wolfram

                    Wolfram.check()
                    rich.print(f"[bold green]{subsystem} is working![/bold green]\n\n")

                elif subsystem == "Responses":
                    import Responses

                    Responses.check()
                    rich.print(f"[bold green]{subsystem} is working![/bold green]\n\n")

                elif subsystem == "gpt":
                    import gpt

                    gpt.check()
                    rich.print(f"[bold green]{subsystem} is working![/bold green]\n\n")
            except:
                rich.print(f"[bold red]{subsystem} is down![/bold red]\n\n")
                workingSubsystems.remove(subsystem)
            successSound.play()
        except:
            rich.print(f"[bold red]{subsystem} is missing![/bold red]")
            workingSubsystems.remove(subsystem)

    print("\033c")
    print("Starting PACE...")
    HOST = '0.0.0.0'
    PORT = 9001
    server = WebsocketServer(host=HOST, port=PORT)
    server.set_fn_new_client(new_client)
    server.set_fn_client_left(client_left)
    server.set_fn_message_received(message_received)
    startupCompleteSound.play()
    print(pyfiglet.figlet_format("PACE", font="slant"))
    rich.print(f"[purple]Working subsystems: {workingSubsystems}[/purple]\n\n")
    os.system("python3 -m webbrowser http://10.0.0.227/propace/guis/desktop")
    server.run_forever()
