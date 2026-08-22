# Codex-account speech-to-text integration

Research checked 2026-08-22 against current official OpenAI documentation,
the installed ChatGPT/Codex Windows app 26.818.3698.0, and this repository. No
private endpoint was called and no credential was read or copied.

## Question

How difficult would it be to add dictation/speech-to-text to the Agent
Coordination Framework while reusing the ChatGPT account already signed in to
the Codex desktop app, rather than paying separately for OpenAI API usage?

## Executive answer

The installed desktop app contains two private dictation paths:

- a batch `POST /transcribe` request containing an audio file; and
- an optional WebSocket stream at `/dictation/stream`, bootstrapped by a
  desktop-only connection-info bridge.

This is an important difference from the Read aloud/TTS implementation. Read
aloud identifies an existing ChatGPT conversation and assistant message;
dictation sends audio and receives text. The batch function has no conversation
or message identifier and is also used to retry a saved recording. Static code
therefore strongly supports that the service can transcribe audio independent
of a chat, at least for audio produced by the app's recorder.

However, **the desktop app's account-backed dictation service is still a private
app implementation, not a documented integration surface**. Its main process
owns the ChatGPT credential and Electron IPC boundary. The framework is a
separate Node/localhost-browser application and cannot call that bridge or
inherit its authentication through the supported Codex SDK. Reproducing the
request externally would require depending on undocumented routes and
repurposing a private credential, so it is unsuitable for a product feature.

The technically supported OpenAI route is `POST /v1/audio/transcriptions` with
an API credential and separate API-platform usage. A no-OpenAI-charge feature
should instead use an operating-system or packaged local recognizer.

## What the installed app does

The following is implementation evidence from a minified installed bundle, not
a public API contract. Locations refer to:

`C:\Program Files\WindowsApps\OpenAI.Codex_26.818.3698.0_x64__2p2nqsd0c76g0\app\resources\app.asar`

The MSIX package version is 26.818.3698.0; its internal application metadata
reports version 26.818.31338/build 6892.

### Batch fallback: multipart audio to `/transcribe`

The renderer function near offset 8,997,916 in ASAR entry
`webview/assets/app-initial-izy3qYQi.js`:

- accepts a `Blob` plus optional content type, filename, language, and abort
  signal;
- defaults the media type to `audio/webm` and the filename to
  `codex.<media-subtype>`;
- constructs `multipart/form-data` with a required `file` part and an optional
  `language` part;
- base64-encodes the complete multipart byte sequence only for transport across
  the renderer-to-main IPC bridge; and
- performs `POST /transcribe`, returning `response.body.text`.

The request includes internal transport marker `x-codex-base64: 1`, plus
desktop markers requesting ChatGPT authentication and integrity state. The
main-process fetch wrapper removes the base64 marker and restores the original
binary multipart body before the network request (ASAR entry
`.vite/build/main-B6Z1yw33.js`, approximately offset 1,167,539).

The production API base embedded in
`.vite/build/window-all-closed-BazhJdtt.js` is
`https://chatgpt.com/backend-api` (approximately offset 4,286,241), so the
normal installed-app target resolves to
`https://chatgpt.com/backend-api/transcribe`.

The app captures a single audio channel with `getUserMedia`, records it with
the browser's default `MediaRecorder`, collects `dataavailable` chunks, and
uses the recorder's MIME type with an `audio/webm` fallback
(`app-initial-izy3qYQi.js`, approximately offsets 8,926,506 and 9,013,574).
The composer rejects recordings shorter than 250 ms and stops at approximately
595 seconds. Those are UI limits; static inspection does not establish the
server's independent limits.

On failure, the UI retains the recording when possible and can pass saved audio
back through the same batch function. Dictation history retry explicitly reads
stored audio, rebuilds a `Blob` with its saved MIME type, and calls the batch
transcriber (`app-initial-izy3qYQi.js`, approximately offset 10,694,435).

### Optional streaming path

When enabled, the app starts streaming while simultaneously retaining a
`MediaRecorder` recording for fallback. The renderer first posts to the local
pseudo-route `/codex/dictation-stream-connect-info`. The Electron main process
intercepts that exact route rather than sending it over HTTP. It asks the local
app-server connection for the current ChatGPT auth token, then returns a
WebSocket URL and subprotocol list to the renderer
(`.vite/build/main-B6Z1yw33.js`, approximately offsets 1,156,300 and
1,169,989).

The WebSocket URL resolves in production to
`wss://chatgpt.com/backend-api/dictation/stream`. One WebSocket subprotocol
carries the bearer credential; the other protocol identifiers mark ChatGPT
dictation and the Codex desktop client. This keeps credential acquisition in
the trusted main process, although the renderer necessarily receives the
short-lived connection material. No credential value was inspected during
this research.

The renderer sends JSON events over that WebSocket
(`app-initial-izy3qYQi.js`, approximately offsets 8,987,952-8,995,000):

- `session.start` requests mono `pcm16` at the current `AudioContext` sample
  rate, a 4 MiB maximum buffer, 30-second maximum utterances, a five-minute
  session TTL, server voice-activity detection, and final-only transcript
  delivery;
- `audio.append` contains base64-encoded signed 16-bit PCM chunks;
- `session.close` completes the stream; and
- server events include session/speech state, transcript delta/segment/final,
  transcript failure, and session error. The composer joins final utterance
  texts into the resulting transcript.

If stream setup, streaming, or finalization fails, the app falls back to the
recorded batch blob and `POST /transcribe`.

## Authentication and entitlement boundary

Dictation capability is statically gated on browser media support, a feature
flag, and `authMethod === "chatgpt"`
(`app-initial-izy3qYQi.js`, approximately offset 4,322,608). For the batch
route, the renderer asks the main process to attach authentication. The main
process gets or refreshes the token through its app-server connection, adds
bearer and account context, maintains integrity state, and retries once after a
401. For streaming, the special main-process handler obtains that same ChatGPT
token and embeds it in the WebSocket negotiation material.

These facts establish that **the Codex desktop app itself reuses its ChatGPT
sign-in for dictation**. They do not establish a right or supported mechanism
for another application to reuse that credential. They also do not document
whether dictation has plan limits, is subject to fair-use controls, or could
later be separately metered. “No separate charge” is plausible for use through
the app UI, but is not a published third-party entitlement.

The documented Codex SDK surface used by this repository starts/resumes coding
threads and yields text/tool events; it does not expose microphone capture,
dictation, a desktop fetch bridge, or raw ChatGPT credentials. The framework's
[`CodexAgentRuntime`](../../../src/runtime/codex-agent-runtime.ts) therefore
cannot inherit this private feature merely because both applications use the
same signed-in account.

## Does the private service accept arbitrary audio?

**Established by static implementation:** the batch client accepts a `Blob`,
media type, filename, and optional language. Its request contains no
conversation ID, message ID, prompt, thread ID, or Codex task ID. The saved
recording retry path proves that input need not be a currently live microphone
stream.

**Strong inference:** a valid standalone recording in the format normally
created by Chromium's `MediaRecorder` can be transcribed without first creating
a ChatGPT message. This makes STT technically much better suited to a framework
adapter than the ID-bound Read aloud/TTS service.

**Not established without a bounded live test:** accepted codecs and container
formats beyond the app's actual recorder output; file-size and duration limits;
whether arbitrary uploaded files receive the same entitlement as UI recordings;
language validation; rate limits; or server-side error semantics. The generic
content-type/filename parameters show client flexibility but are not proof that
the private server accepts every advertised type.

The streaming path is less suitable for arbitrary pre-recorded files because
it expects real-time mono PCM events, VAD, session state, and expiring
WebSocket authorization. A client could theoretically decode a file to PCM and
pace the chunks, but that is an unsupported reimplementation with no advantage
over the batch route.

## Manual global dictation workflow

The installed Electron app exposes global dictation on Windows and macOS; its
platform check excludes Linux. The capability is Electron-only, feature-gated,
requires microphone access and a usable ChatGPT-authenticated session, and does
nothing until at least one shortcut is configured. The settings label the two
bindings **Hold-to-dictate hotkey** and **Toggle dictation hotkey**, described as
holding anywhere on the desktop to dictate at the cursor, or pressing once to
start and again to stop. No factory-default binding is present in this build:
the first-use prompt asks the user to record one, and the hold and toggle
bindings must be different (`app-initial-izy3qYQi.js`, approximately offsets
4,324,911, 6,715,640, 10,706,768, and 13,937,409-13,964,960;
`.vite/build/main-B6Z1yw33.js`, approximately offset 2,353,955).

The practical workflow is:

1. Configure either global shortcut in the app's dictation settings and grant
   microphone permission. An optional persistent, inactive dictation overlay
   can remain visible; first-time shortcut setup enables it automatically.
2. Put the caret in the framework composer, then hold the hold shortcut for the
   full utterance, or press the toggle shortcut once to start and once to stop.
   Releasing the hold shortcut stops hold-mode recording. A toggle press does
   not cancel a hold-mode session.
3. Wait for transcription/optional cleanup. Outside a focused Codex window the
   overlay deliberately avoids taking focus, snapshots the clipboard, writes
   the final transcript plus a trailing space, sends the platform paste action,
   waits briefly, and restores the prior clipboard only if the temporary value
   is still present. On Windows the paste action is Ctrl+V. Inside a focused
   Codex window, the app instead uses its in-app insertion events
   (`main-B6Z1yw33.js`, approximately offsets 2,333,258 and 2,340,622).

This is final-result dictation, not live text streaming into the target. It is
best-effort: shortcut registration can conflict with other software; focus can
move before paste; secure, elevated, non-editable, or Ctrl+V-blocking controls
may reject insertion; and concurrent clipboard changes can race with delivery.
Only one app instance can own global dictation. A second owner reports that
global dictation is already active in another ChatGPT instance.

The app can optionally clean the raw transcript using nearby text and a user
dictation dictionary; cleanup failure falls back to the raw transcript. Its
local dictation history retains audio/text to support retry, download, and
deletion. Static main-process code recovers unfinished recordings as
interrupted and prunes to the newest 20 completed/non-recording entries while
preserving any active recording. This local retention is an additional privacy
consideration for manual use; it is not framework-managed history
(`main-B6Z1yw33.js`, approximately offset 1,767,720).

Consequently, the lowest-effort no-separate-API-bill experiment is entirely
manual: focus the framework text box and invoke the Codex/ChatGPT global
shortcut. It requires no framework code and leaves credentials inside the
desktop app, but it is a user convenience rather than a supported integration
contract or automation surface.

## Fit with this framework and effort

The repository is a host-native Node application serving a React UI over
localhost. The browser is a presentation adapter, and the host/core owns
authoritative state. See [`docs/architecture.md`](../../../docs/architecture.md).
There is currently no microphone, audio upload, or dictation adapter.

A provider-neutral dictation feature fits cleanly: browser-local capture and
permission state, a narrow host endpoint only when a server-side provider is
needed, and insertion of returned text into an existing user composer. Audio
should be ephemeral by default and should not enter coordination SQLite or
attempt transcripts merely because it was recorded.

Estimated implementation effort for one experienced contributor:

| Option | Separate OpenAI API charge | Support status | Estimated effort | Assessment |
| --- | --- | --- | --- | --- |
| Drive the Codex app's global/composer dictation UI | No separate API charge established | App UI only | Near-zero code for manual use; 2-5 days for brittle UI automation | Useful personal workflow, not a framework integration |
| Call private batch `/transcribe` with Codex account | Not publicly established | Unsupported | 3-7 days for a version-pinned spike; unbounded for a maintainable product | HTTP is easy; obtaining/refreshing auth safely is the blocker |
| Reuse private WebSocket stream | Not publicly established | Unsupported | 1-2 weeks for a spike; unbounded for a product | More protocol, timing, auth, and failure surface than batch |
| OpenAI Audio API | Yes | Supported | 3-7 days for capture/upload, secure key handling, errors, limits, and tests | Predictable cloud route |
| OS/local speech recognition | No OpenAI usage charge | Platform/engine dependent | Roughly 1-3 weeks for one production-quality platform path | Best match when avoiding OpenAI billing is mandatory |

The private batch request itself is straightforward. A framework adapter could
capture a browser `Blob`, send it to a host-side provider, and insert returned
text. The hard part is that the app's trusted Electron main process—not the
Codex SDK—owns authentication, refresh, integrity state, and request routing.
There is no documented IPC, plugin, MCP, localhost, or app-server method that
lets this framework ask the running app to transcribe a blob.

Possible workarounds should not be productized:

- extracting or reading the desktop credential and reproducing the private
  request;
- injecting code into the signed Electron app to call its renderer bridge;
- patching the MSIX/ASAR; or
- accessibility/UI automation that focuses a framework text box and invokes
  global dictation.

The last option is the safest personal experiment because the app retains
credential ownership, but focus, clipboard/keystroke delivery, permissions,
and UI selectors make it operationally fragile.

## Supported OpenAI alternative

OpenAI publicly documents `POST /v1/audio/transcriptions` as multipart form
data with a required audio file and model. Current accepted formats include
FLAC, MP3/MP4/MPEG, M4A, OGG, WAV, and WebM; the response contains transcribed
text. [Official transcription API reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create).

That endpoint uses normal OpenAI API bearer authentication and reports usage
for an API organization/project. It is therefore a separate API-platform path,
not a documented use of the ChatGPT/Codex subscription credential.
[Official API authentication reference](https://developers.openai.com/api/reference/overview#authentication).

OpenAI states that API data is not used for training unless the customer opts
in. Its current endpoint table lists `/v1/audio/transcriptions` with no abuse-
monitoring or application-state retention by default and as eligible for Zero
Data Retention; these controls can change and should be rechecked during
implementation. [Official API data controls](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint).

## Recommendation

1. Treat Codex desktop dictation as a valuable **manual feature**, not a reusable
   service contract. It genuinely uses ChatGPT sign-in internally, but the app
   exposes no supported bridge to this framework.
2. If the immediate goal is hands-free entry, first test the app's existing
   global dictation workflow while the framework composer is focused. Keep it a
   documented user workflow rather than automated framework behavior.
3. For a product feature, add a small provider boundary around ephemeral audio
   capture and transcript insertion. Select either the supported OpenAI Audio
   API with explicit API billing or an OS/local recognizer when zero OpenAI
   usage cost is a hard requirement.
4. Do not extract desktop credentials or ship calls to `/transcribe`,
   `/codex/dictation-stream-connect-info`, or `/dictation/stream`.
5. If product leadership explicitly authorizes an unsupported feasibility
   spike, constrain it to a disposable account, non-sensitive test audio, the
   exact installed build, no credential logging, and no distribution. The
   first questions are accepted recorder MIME type, response/error schema,
   limits, and behavior after app/token refresh—not broad protocol cloning.

## Confidence and unresolved questions

Confidence is **high** about the installed client's request construction,
audio capture, auth bridge, batch response shape, streaming event protocol,
and lack of conversation/message coupling. These are directly visible in the
installed bundle.

Confidence is **high** that the public Audio API is the supported programmable
route and is separately authenticated/metered.

Confidence is **bounded** about the private server contract and entitlement.
Static code cannot establish accepted formats and limits, future stability,
terms of use, plan quotas, or whether OpenAI intends third-party reuse. Those
unknowns are precisely why the private route should remain research evidence
rather than an implementation dependency.
