import feedparser

URL = "https://en.wikinews.org/w/index.php?title=Special:NewsFeed&feed=atom&categories=Published&notcategories=No%20publish%7CArchived%7CAutoArchived%7Cdisputed&namespace=0&count=30&hourcount=124&ordermethod=categoryadd&stablepages=only"


def getNews():
    feed = feedparser.parse(URL)
    return feed['entries']


def generateResponse():
    news = getNews()
    response = ""
    for newsItem in news:
        response = response + newsItem['title'] + "\n"
    return response


def check():
    print(generateResponse())


check()

