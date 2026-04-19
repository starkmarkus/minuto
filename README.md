# Minuto

Minuto is a personalized mobile news-story prototype built with Expo and React Native. It turns selected interests into a short visual story with article images, headline cards, article summaries, and optional narration.

This public repository is intentionally sanitized. It contains the app UI, local mock-data flow, story interactions, summary layout, and video prototype code. Private provider configuration, API keys, personal contact details, and live API wiring are not included.

## Features

- Interest selection with built-in and custom topics
- Story duration control from 30 seconds to 5 minutes
- Story-style player with tap navigation, pause, progress bars, and drag-to-close
- Article detail view focused on a single Minuto Summary
- Local mock-news mode for public demo and UI development
- Local text cleanup for compact headlines and summaries
- Feedback mail draft flow using a placeholder address
- Remotion prototype for rendering vertical news videos

## Public Demo Mode

The public version runs without private credentials. News data, enrichment, image hydration, and premium narration are represented through local/demo-safe code paths.

For a production build, external providers should be called from a backend service, not directly from the mobile client. This avoids exposing credentials in a bundled app.

## Tech Stack

- Expo 54
- React Native 0.81
- TypeScript
- Remotion

## Getting Started

Use Node 22. The project includes an `.nvmrc` because newer Node versions triggered Expo port-scanner issues during development.

```bash
nvm use
npm install
npx expo start --clear --go
```

Then open the generated Expo URL or QR code in Expo Go.

## Scripts

```bash
npm start
npm run ios
npm run android
npm run web
npm run video
npm run video:render
```

## Project Structure

```text
App.tsx                 Main Expo app and UI flow
src/lib/news.ts         Public mock-news adapter
src/lib/media.ts        Public image hydration stub
src/lib/storyEnrichment.ts
                        Local story summary cleanup
src/lib/titleSummary.ts Local title shortening
src/lib/storyCoverage.ts
                        Experimental story/source coverage logic
src/lib/storyTts.ts     Public narration stub
src/video/              Remotion video prototype
src/data/mockNews.ts    Offline/demo stories
```

## Security Notes

- No real API keys are committed.
- No local `.env` file is committed.
- No private provider account IDs are committed.
- No personal email address is committed.
- Live provider integrations should be implemented behind a backend before production use.

Before pushing changes, run:

```bash
git status --short
git check-ignore -v .env
npx tsc --noEmit
```

## Known Limitations

- Public repo uses mock/demo data instead of live news.
- Premium narration is stubbed in the public version.
- Feedback uses a placeholder mail address.
- The source/perspective system is experimental and should not be treated as verified media-bias data.

