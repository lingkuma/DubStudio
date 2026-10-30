# DubStudio
<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
Delegated by user: React, TypeScript, Vite, WebAV and a reusable timeline component. Static assets on Vercel, same-project optional serverless API adapters. No local models or FFmpeg runtime requirement.

## Users
The owner and other video creators editing spoken Chinese video, replacing individual sentences with cloned speech.

## Product Purpose
Import video, recognize timestamped speech, edit narration/subtitles independently, generate cloned audio per sentence, cut/reorder video, mix tracks and export a playable video.

## Operating Context
Desktop Chrome/Edge first. Real owner-provided video and 10-second voice sample for verification. API credentials are user-entered settings, never shipped in source. The user explicitly delegates all design and implementation decisions and requests independent completion without a design interview.

## Capabilities and Constraints
AI: configurable OpenAI-compatible 0-0.pro endpoint and model, full/selected rewrite with stable segment IDs and timestamps, line-based text/SRT import, AI-assisted matching, transcript-aware conversation, executable edit/generate/export tools. Existing video editing and cloning requirements remain mandatory.
ASR: qwen-audio-3.1-asr-flash-filetrans, async URL-based submission. TTS: AutoDL indextts2-v1, reference audio required. Each utterance has separate source and timeline coordinates. Keep all generated media locally. Export and preview share timeline interpretation. Provide save/reopen and undo/redo.

## Brand Commitments
Modern attractive white interface. Working name DubStudio is an implementation decision, not an existing brand.

## Evidence on Hand
Owner-provided local test files are private, not distributed. No invented testimonials or performance claims.

## Product Principles
- Sentence-focused editing with independent regeneration.
- Local media processing and portable projects.
- Show task failures and stale audio honestly.
- Favor simple Vercel deployment and configurable APIs.
