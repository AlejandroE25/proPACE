import requests
import platform
import subprocess
import os


def getLocation():
    response = requests.get("http://ip-api.com/json")
    response = response.json()

    lat = response['lat']
    lon = response['lon']
    city = response['city']

    return lat, lon, city


def getWeather():
    lat, lon, city = getLocation()
    response = requests.get(
        f"https://api.openweathermap.org/data/2.5/weather?lat={lat}&lon={lon}&units=imperial&appid=67649228bc8b8c19a8eefe11c49cb740")
    response = response.json()

    weather = response['weather'][0]['description']
    temp = response['main']['temp']
    windchill = response['main']['feels_like']

    return city, weather, temp, windchill


# Check to see if we can reach the servers
def check():
    param = '-n' if platform.system().lower() == 'windows' else '-c'

    # Building the command. Ex: "ping -c 1 google.com"
    command = ['ping', param, '1', "api.openweathermap.org"]

    print(getWeather())
    return(subprocess.call(command) == 0)
