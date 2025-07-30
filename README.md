## Description

A simple service meant to save time while searching for a home in the Netherlands.<br>
The service is targeted to audience that is looking for a room or apartment without real estate or income restrictions. <br>
Current version only supports Kamernet.nl. Future versions will support scraping from private groups of a well-known platform that doesn't like to be scraped.<br>

## How it works
<br>**Scraping** follows a strategy pattern where each service is scraped in a different way. The scraper.module exports each strategy/service.

<br>**Classification** is done using the Open AI API, preparing the listing format and using the prompt found in data/classification-prompt.txt (this prompt can and should be edited by the user according to their needs and preferances)

<br>**Notification service** immediately sends a notification once a new listing that matches the user's criteria is spotted. Once every iteration the user is notified with an error report if there were unhadled or critical errors. 

<br>**No database design.** The service doesn't use a database, instead it's working with live data only storing the new and viewed listings.

<br>**A background service**, running in an infinate loop, executes the above pattern in sequence, and makes sure that the service is only running during the workhours in the .env file.

## Clone and install the project
Inside the parent folder you want the project in, simply run:
```bash
git clone https://github.com/gpanag93/homely-kitsune.git
```
Install by opening the downloaded folder and running:
```bash
cd homely-kitsune
npm install
```
## Project setup
Rename the .env.example to .env and fill with the appropriate settings, credentials and API keys.
<br>
<br>For Kamernet you should provide the search base url that serves as the entry point for scraping Kamernet (KAMERNET_SEARCH_BASE_URL of the .env variables (<a href="https://kamernet.nl/en/for-rent/properties-den-haag?radius=7&minSize=0&maxRent=15&searchView=1&sort=1&availabilityPeriods=1&hasInternet=false&isBathroomPrivate=false&isKitchenPrivate=false&isToiletPrivate=false&suitableForNumberOfPersons=2&suitableForGenders=1%2C2&suitableForWorkStatuses=4%2C1&isSmokingInsideAllowed=false&isPetsInsideAllowed=false&nwlat=54.216270703936516&nwlng=-3.267085312500001&selat=50.130263513834905&selng=12.5532271875&mapZoom=7&mapMarkerLat=0&mapMarkerLng=0" target="_blank">For Example</a>)

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

<!-- 
## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.
-->

## Consider supporting and following Nest.js for their awesome tool

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->
