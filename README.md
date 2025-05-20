# DesktopWebApps

An Electron app with persistent tabs that allows you to use web applications as if they were desktop applications.

## Features

- Persistent tabs that restore when you reopen the app
- Support for playing Pandora songs on your Spotify desktop client
- Drag and drop tab reordering
- Custom tab naming

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Run the app: `npm start`

## Spotify Integration Setup

To use the Pandora to Spotify feature:

1. Copy `src/config.example.js` to `src/config.js`
2. Update `src/config.js` with your Spotify API credentials
   - You can obtain these by creating an app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
   - Make sure to add `http://127.0.0.1:8888/callback` as a Redirect URI in your Spotify app settings

Note: The `config.js` file is ignored by Git to avoid accidentally sharing your API credentials.

## Build

To build the application:

```
npm run dist
```

## License

[MIT](LICENSE)

Learn more about the project here: https://alexander.prucka.com/index.php/projects/desktop-web-apps

I have built the installer for windows and published it in the repository releases section. If you want to use it on mac or linux however, you will need to pull the repository and build the installer locally. Feel free to submit a PR with the mac and linux installers. 

Tips:
Double clicking a tab lets you rename it to whatever you like
Drag tabs to rearrange them

