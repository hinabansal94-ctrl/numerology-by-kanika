# Numerology By Kanika - Web Version

This is a browser version of the existing Tkinter app. The first screen is designed to match the desktop view, and the name correction panel appears only after calculations are done.

## Files

- `index.html` - Shopify/static page markup
- `styles.css` - screenshot-style UI
- `app.js` - Chaldean calculations, history, local suggestions, feedback capture

## Shopify Use

For Shopify, add this as a custom page/section or upload the assets and embed the markup in a custom Liquid template.

For true AI recommendations, keep the API key outside Shopify frontend JavaScript. This folder now includes a Vercel-style backend endpoint:

- `/api/name-suggestions`

Set these environment variables in Vercel:

```text
OPENAI_API_KEY=your OpenAI API key
OPENAI_MODEL=gpt-5-mini
```

## Feedback Training

Accept/reject clicks are stored locally right now. This is version B: OpenAI suggestions only, database later. With a database connected, feedback should be stored and used in future prompts/ranking. This is how the agent improves over time; it does not retrain itself automatically inside Shopify.

## Current Correction Rules

Allowed:

- Repeat letters already in the name
- Delete letters already in the name
- Phonetic substitutions: `i <-> ee`, `a <-> aa`, `u <-> oo`, `c <-> k`, `v <-> w`, `y <-> i`

Not allowed:

- Random new letters
- Changing the name into something unrelated
- `sh <-> s`
- `aa <-> ah`

The app asks OpenAI for candidates, then validates all returned names again before showing them.
