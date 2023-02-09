import pyfiglet
import rich

workingSubsystems = ["Weather", "Carter"]


def parseResponse(response):
    agent_response_text = response['output']['text']
    agent_response_intent = response['triggers'][0]['type']

    if agent_response_intent == "Weather Request":
        city, weather, temp, windchill = Weather.getWeather()
        return agent_response_text.replace("$city$", city).replace("$weather$", weather).replace("$real_temp$",
                                                                                                 str(int(
                                                                                                     temp))).replace(
            "$wind_chill$", str(int(windchill)))


def generateResponse(text):
    response = Carter.getCarterResponse(text)
    finalResponse = parseResponse(response)
    return finalResponse


if __name__ == "__main__":
    # Check if subsystems are working
    for subsystem in workingSubsystems:
        rich.print(f"[bold yellow]Checking {subsystem}...[/bold yellow]")
        try:
            f = open(f"{subsystem}.py", "r")
            f.close()
            rich.print(f"[bold green]{subsystem} is present![/bold green]")
        except:
            print(f"[bold red]{subsystem} is missing![/bold red]")
            workingSubsystems.remove(subsystem)
        try:
            if subsystem == "Weather":
                import Weather
                Weather.check()
                rich.print(f"[bold green]{subsystem} is working![/bold green]")
            elif subsystem == "Carter":
                import Carter
                Carter.check()
                rich.print(f"[bold green]{subsystem} is working![/bold green]\n\n")
        except:
            rich.print(f"[bold red]{subsystem} is down![/bold red]\n\n")
            workingSubsystems.remove(subsystem)

    print("Starting PACE...")
    print(pyfiglet.figlet_format("PACE", font="slant"))
    rich.print(f"[purple]Working subsystems: {workingSubsystems}[/purple]\n\n")

    print(generateResponse("What's the weather looking like?"))
