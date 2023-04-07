import feedparser
import json
URL = "https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&notcategories=No" \
      "%20publish%7CArchived%7CAutoArchived%7Cdisputed&namespace=0&count=30&hourcount=124&ordermethod=categoryadd" \
      "&stablepages=only"


def getNews():
    feed = feedparser.parse(URL)
    return feed.entries


def generateResponse():
    news = getNews()
    response = ""
    for newsItem in news:
        response = response + newsItem.title + ". "
    return response


def generateNewsJSON():
    news = getNews()
    newsJSON = []
    for newsItem in news:
        newsJSON.append({"title": newsItem.title})
    return newsJSON

def writeJSON():
    print("Writing JSON")
    newsJSON = generateNewsJSON()
    with open(".\GUIs\\Desktop\\news.json", "w") as outfile:
        json.dump(newsJSON, outfile)
    with open(".\GUIs\\Big Display\\news.json", "w") as outfile:
        json.dump(newsJSON, outfile)

def check():
    generateResponse()
