# Gain Control (Angular)

An Angular rework of the daily tap counter that records anonymous tallies to Firebase Realtime Database and shows a weekly view of your progress.

## Getting started
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm start
   ```
   The app is served at [http://localhost:4200](http://localhost:4200).

## Testing
Run unit tests with Karma and Jasmine:
```bash
npm test
```

## Notes
- Firebase anonymous authentication is used automatically on load; the configuration lives in `src/app/app.component.ts`.
- A minimal PWA manifest is available at `src/manifest.webmanifest`; icons live under `src/assets/icons/`.
