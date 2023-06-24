from websocket_server import WebsocketServer
import os
from winsound import Beep
from time import sleep
from ctypes import POINTER, cast

from comtypes import CLSCTX_ALL

import signal
import atexit

from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume

import Carter

os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"
import pygame
import pyfiglet
import rich

# allSubsystems = ["Wolfram", "Carter", "Responses", "Weather", "News"]
allSubsystems = ["Carter", "Responses", "News"]
workingSubsystems = allSubsystems.copy()
pygame.mixer.init()

checkSound = pygame.mixer.Sound("./sounds/checking.wav")
successSound = pygame.mixer.Sound("./sounds/success.wav")
# failureSound = pygame.mixer.Sound("./sounds/failure.wav")
startupCompleteSound = pygame.mixer.Sound("./sounds/startupComplete.wav")


# Called for every client connecting (after handshake)
def new_client(client, server):
    News.writeJSON()
    # if allSubsystems == workingSubsystems:
    #     response = f" $$ All subsystems are working!"
    # else:
    #     brokenSubsystems = set(allSubsystems) - set(workingSubsystems)
    #     response = f" $$ Subsystems: {brokenSubsystems} are not working!"

    response = " $$ " + Carter.getOpener()

    server.send_message(client, response)
    rich.print(f"[bold green]New client connected and was given id {client['id']}[/bold green]")


# Called for every client disconnecting
def client_left(client, server):
    rich.print(f"[bold red]Client disconnected [/bold red]")
    os.system("cls")
    print(pyfiglet.figlet_format("PACE", font="slant"))
    rich.print(f"[purple]Working subsystems: {workingSubsystems}[/purple]\n\n")


# Called when a client sends a message
def message_received(client, server, message):
    rich.print(f"[blue]Client({client['id']}) said: {message}[/blue]")
    generatedMessage = Responses.generateResponse(message)
    response = f"{message}$${generatedMessage}"
    server.send_message_to_all(response)
    rich.print(f"[green]PACE said: {generatedMessage}[/green]")


def handle_exit(*args):
    try:
        os.system("python D:\\xampp\htdocs\public\proPACE\clapOn.py")
    except BaseException as exception:
        print(exception)


if __name__ == "__main__":
    # Check if subsystems are working

    devices = AudioUtilities.GetSpeakers()
    interface = devices.Activate(IAudioEndpointVolume._iid_, CLSCTX_ALL, None)
    volume = cast(interface, POINTER(IAudioEndpointVolume))

    currentVolume = volume.GetMasterVolumeLevel()

    volume.SetMasterVolumeLevel(-65.25 * .5, None)

    for subsystem in workingSubsystems:
        rich.print(f"[bold yellow]Checking {subsystem}...[/bold yellow]")
        Beep(800, 500)
        sleep(1)
        try:
            f = open(f"{subsystem}.py", "r")
            f.close()
            rich.print(f"[bold green]{subsystem} is present![/bold green]")
            try:
                exec(f"import {subsystem}")
                exec(f"{subsystem}.check()")
                Beep(1200, 500)
                rich.print(f"[bold green]{subsystem} is working![/bold green]\n\n")
            except BaseException as exception:
                rich.print(f"[bold red]{subsystem} is not working! {exception}[/bold red]\n\n")
                workingSubsystems.remove(subsystem)
            Beep(1200, 500)
            sleep(1)
        except:
            rich.print(f"[bold red]{subsystem} is missing![/bold red]")
            workingSubsystems.remove(subsystem)
            Beep(900, 500)
            sleep(1)

    if "Responses" not in workingSubsystems:
        rich.print("\033c [bold red] Fatal Error![/bold red]")
        rich.print(f"[bold red]Responses Submodule is not functional.  PACE cannot function[/bold red]")
        Beep(900, 350)
        Beep(900, 350)
        Beep(900, 350)
        exit(1)
    volume.SetMasterVolumeLevel(currentVolume, None)
    print("\033c")
    print("Starting PACE...")
    atexit.register(handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)
    signal.signal(signal.SIGINT, handle_exit)
    HOST = '0.0.0.0'
    PORT = 9001
    server = WebsocketServer(host=HOST, port=PORT)
    server.set_fn_new_client(new_client)
    server.set_fn_client_left(client_left)
    server.set_fn_message_received(message_received)
    startupCompleteSound.play()
    rich.print(f"[yellow] {pyfiglet.figlet_format('PACE', font='slant')} [/yellow]")
    rich.print(f"[purple]Working subsystems: {workingSubsystems}[/purple]\n\n")
    os.system("python3 -m webbrowser http://10.0.0.227/propace/guis/desktop")
    server.run_forever()
