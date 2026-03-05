# Project Sunny

An AI therapeutic learning companion built for my daughter **Ila**, who has ADHD, dyslexia, and a language disorder.

Every session Sunny helps Ila is a session that matters.

## What it does

Sunny is a voice-enabled AI tutor. You type a message in the terminal, Sunny responds through Claude with warmth and patience, then speaks the response out loud using ElevenLabs text-to-speech.

**Pipeline:** text in → Claude → ElevenLabs speaks

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your keys:

```bash
cp .env.example .env
```

3. Run:

```bash
npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `ELEVENLABS_API_KEY` | Your ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | The ElevenLabs voice ID to use |

## Tech

- TypeScript
- Anthropic Claude SDK
- ElevenLabs TTS SDK
- Node.js readline for terminal input
