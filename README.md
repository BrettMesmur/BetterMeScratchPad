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

### Windows setup help

If `@angular/cdk/drag-drop` or other Angular packages are reported as missing on Windows, run the included `windows-setup.bat` from an **Administrator** PowerShell or Command Prompt. The script logs to `windows-setup.log`, keeps the window open so you can read any errors, and reminds you to rerun as Administrator if permission issues occur.

## Testing
Run unit tests with Karma and Jasmine:
```bash
npm test
```

## Notes
- Firebase anonymous authentication is used automatically on load; the configuration lives in `src/app/app.component.ts`.
- A minimal PWA manifest is available at `src/manifest.webmanifest`; icons live under `src/assets/icons/`.
