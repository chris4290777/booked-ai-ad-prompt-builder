# Booked AI Systems Ad Prompt Builder

A single-page React/Vite app for generating copy-ready ad prompts from the Booked AI Systems product knowledge base.

## Database decision

The current product brief does not require a hosted database. The original Supabase setup had no persistent tables; it only used an edge function as the prompt-generation brain. In this build, that knowledge base lives in typed app data and the prompt composer runs locally in the frontend.

Add a database only when the app needs saved prompt history, user accounts, multi-brand workspaces, uploaded brand assets, or shared team libraries.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
