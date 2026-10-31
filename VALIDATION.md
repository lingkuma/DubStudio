# Validation record

## Sentence reference selection (2026-10-31)

- New ASR, manual and SRT sentences default to their own original source audio. Uploading/extracting a library voice no longer assigns it automatically; existing saved selections are preserved.
- Browser checks exercised per-sentence selection, the current-voice marker, deletion back to original audio, undo, and uploading another reference without changing sentence sources.
- The existing real video yielded a mono 24kHz WAV of 4.080 seconds for source timestamps 3.57–7.65 seconds. The temporary reference is sent in the request without adding a project asset or library voice.
- Using mocked TTS responses in Ego Browser, the actual batch button submitted a 4.080-second original reference for one sentence and the selected 10.101-second custom reference for another. Changing a sentence source marked its take stale; single regeneration submitted the changed reference. No new paid TTS call or subjective voice-quality claim was made in this pass.
- Regression tests cover source-time extraction routing, empty voice libraries, mixed references, source/configuration staleness, upload defaults, original/custom task recovery, and extraction errors. Production build and tests were run after the change.
- DOM width checks found no document overflow at the tested desktop viewport and 390px mobile width. Screenshot capture was unavailable because Ego's window was minimized; this pass does not claim visual screenshot QA.

## Earlier end-to-end validation

Validated locally with the owner-supplied 182.958333-second, 858×480 H.264/AAC MP4 and 10.135510-second MP3 voice reference. No credentials or signed result URLs are included in this document.

| Requirement | Current evidence |
|---|---|
| Frontend video import | Native file input loaded the full 41.8MB source, dimensions/duration and thumbnail; audio peaks computed |
| Qwen ASR | Browser extracted mono 16kHz WAV, obtained upload policy through the same-site gateway, uploaded directly to OSS, submitted and polled qwen-audio-3.1-asr-flash-filetrans, downloaded 48 timestamped sentences |
| IndexTTS2 reference cloning | Real reference MP3 submitted as a data URL; one AI-rewritten sentence generated a 3.7500208-second WAV and was cached into the project |
| Task recovery | Reload during an in-flight task preserved task ID and reference/text; Continue Query recovered and downloaded the existing task without a new submission |
| AI model | Real gemini-4-argon chat completions through api.0-0.pro |
| Full rewrite | UI showed all 48 distinct ID-linked replacement suggestions with original/new character counts |
| Selected rewrite and cloning | AI replaced only sentence 1 (18→18 characters), returned a generate action, Apply and Execute triggered the real TTS job |
| Line import | A 1-line / 48-sentence mismatch was blocked; 48 lines imported into subtitle-only target; undo restored prior state |
| SRT import | Two timestamped cues created two sentence segments; undo restored all 48 |
| Intelligent import | Supplied matching instructions produced exactly the requested two edits (100米→100颗 and 你找谁→你喝啥); application preserved IDs and timing |
| Timeline edit | Real pointer drag moved a video by 5 seconds and linked subtitle/dubbing positions moved with it; undo restored them. Numeric in/out trimming and playhead split were exercised |
| Full export | Browser output 182.959797-second H.264 video / 182.954666-second 48kHz AAC, 858×480. Full ffmpeg -xerror decode succeeded |
| Precise trim export | Source in=2, out=12 produced 10.000080-second video; full decode succeeded |
| Concatenation and music | Two video assets arranged at 0 and 12 seconds plus an imported background track produced 22.000176-second MP4; full decode succeeded |
| AI export command | Chat returned an export action; Apply and Execute downloaded a full 182.959797-second MP4; full decode succeeded |
| Audio placement | PCM correlation between the cached cloned take and its region in the exported MP4 was 0.99982196 at detected lag 0ms |
| Pitch-preserving fitting | 2-second synthesized 440Hz signal fitted to 1 second measured approximately 440.84Hz; production build exported a real 3.75-second take fitted to a 2-second slot |
| Production export | npm run preview loaded built assets, opened the 48-sentence project, tested API settings, exported a 10.000080-second 640×360 fit test; full decode succeeded |
| Project portability | Downloaded .dubstudio archive contained project JSON plus all 3 media assets. Reopened through native file input; restored original video, voice reference, generated take, text and chat. Key scan of archive project JSON returned no credentials |
| Responsive UI | Captured and opened 1680×957, 1366×768 and 390×844 screenshots; mobile had no document overflow; AI drawer open/close tested |
| Unit/API regressions | 11 tests passed for time mapping, split offsets, ripple delete, SRT round-trip, natural-duration placement, AI ID validation, auth separation, proxy allowlist and UTF8 request chunk handling |
| Build and dependencies | Production build succeeds; npm audit reports 0 vulnerabilities; CSS/UI detector returned [] |
| Secret handling | Git-tracked text scanned for the supplied key prefixes: no matches. Private credentials and real test media remain ignored. No keys are shipped in dist |

## Deployment and operating limits

The deployable unit is static Vite assets plus one Vercel function, api/gateway.js. Local production preview was tested; a public Vercel account deployment was not performed. Only gateway.js is under api/ so test files cannot become accidental endpoints.

Browser direct mode was explicitly probed: AutoDL workflow metadata and 0-0 model listing were reachable, but the Alibaba API and generated AutoDL result download were CORS-blocked. Same-site proxy is therefore the tested default. OSS media upload goes directly from the browser and is not constrained by Vercel function request size.

Primary supported environment is current desktop Chrome/Edge with WebCodecs H.264/AAC support. Pure local video processing still uses browser RAM/storage and device encoding capabilities; arbitrary 4K/hour-long files, all codecs, Safari/mobile export performance and network-failure exhaustiveness were not claimed or tested.

The sample exports prove timing and technical media validity. A human audition is still needed to judge subjective voice similarity, performance and pronunciation. No lip-sync API or vocal-source-separation API was requested for implementation in this iteration; already-burned original subtitles remain in the source picture.

## Review provenance

The isolated finish reviewer was dispatched and retried, but the tool returned unrelated “task empty” responses. The rendered UI review was therefore completed locally under the same five-section review checklist; see .impeccable/finish-review.md. This is not an independent agent approval.
