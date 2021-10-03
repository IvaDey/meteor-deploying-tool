# Meteor deploying tool

## Use

Just run in project directory
```
cliva deploy [deployType]
```

**deployType** – optional parameter, used as ```npm version <deplyType>``` before starting building

## Configuration file

Before start, you should create config file named ```deploy.config.js``` with following structure:

```json
{
  "host": "string",
  "username": "string",

  "appName": "string",

  "buildLocation": "string",

  "env": {}
}
```
