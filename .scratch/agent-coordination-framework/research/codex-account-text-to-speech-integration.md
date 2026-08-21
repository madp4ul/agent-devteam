# Codex-account text-to-speech integration

Research checked 2026-08-22 against current official OpenAI documentation,
the installed ChatGPT desktop app 26.818.3698.0 and
`@openai/codex-sdk` 0.146.0 packages, this repository, and primary documentation
for local alternatives.

## Question

How difficult would it be to add read-aloud/text-to-speech to the Agent
Coordination Framework, ideally reusing the ChatGPT account already signed in
to the ChatGPT/Codex desktop app so that speech does not incur separate OpenAI
API charges?

## Executive answer

Adding **a** read-aloud feature is small to medium work. Reusing **the ChatGPT
desktop app's voice service and subscription entitlement inside this
framework** is not a documented or supported integration.

The important distinction is:

- The framework already reuses the user's existing Codex authentication for
  coding-agent turns through the supported Codex SDK. OpenAI documents ChatGPT
  sign-in as subscription access for Codex clients, and the repository already
  instantiates that SDK without a separate API key.
- OpenAI documents ChatGPT Voice as a capability of Chat, Work, and Codex *in
  the ChatGPT desktop app*. It documents the Codex SDK as an interface for
  coding-focused threads whose result and events are text/tool data. It does
  not document a voice or speech-generation method in that SDK.
- OpenAI's supported programmable text-to-speech surface is the Audio API's
  `POST /v1/audio/speech` endpoint. Its documented request uses an API bearer
  credential, its usage belongs to an API organization/project, and its model
  has usage-based API pricing.

Therefore the requested "same signed-in account, no separate charge" route
should be treated as **unsupported/unbounded**, not as an engineering shortcut.
The recommended zero-OpenAI-charge product path is a framework-owned read-aloud
control backed first by the browser/operating-system synthesizer. If consistent
cross-platform neural quality is later important, evaluate a packaged local
engine separately. Use OpenAI TTS only when its quality is worth explicit API
billing and API-key operations.

## What the current OpenAI boundaries support

### Subscription-backed Codex use is supported and already in place

OpenAI distinguishes two Codex sign-in modes: **Sign in with ChatGPT for
subscription access** and **sign in with an API key for usage-based access**.
The ChatGPT desktop app, Codex CLI, and IDE extension accept both for local
work. OpenAI also states that API-key authentication is billed at standard API
rates and uses standard API pricing rather than included ChatGPT plan credits.
[Official Codex authentication documentation](https://learn.chatgpt.com/docs/auth).

The Codex SDK is explicitly intended to integrate Codex into internal tools and
applications. Its documented TypeScript interface starts or resumes local
coding-focused threads and returns `finalResponse` text.
[Official Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk).

This framework already uses that supported arrangement:

- [`src/runtime/codex-agent-runtime.ts`](../../../src/runtime/codex-agent-runtime.ts)
  creates `new Codex(...)`, inherits the process environment, starts or resumes
  a thread, and captures `agent_message.text` as the final response.
- [`docs/tutorials/start-a-process.md`](../../../docs/tutorials/start-a-process.md)
  states that the application uses the installed SDK and the user's existing
  Codex authentication and ordinary Codex configuration.
- The installed SDK's type declaration models an `agent_message` as a string
  and its canonical `ThreadItem` union contains messages, reasoning, command,
  file-change, MCP, search, todo, and error items—not audio. See
  [`node_modules/@openai/codex-sdk/dist/index.d.ts`](../../../node_modules/@openai/codex-sdk/dist/index.d.ts).

So the account-reuse mechanism itself is not missing. What is missing is a
subscription-backed speech capability on that mechanism.

### ChatGPT Voice is an app feature, not a documented SDK service

OpenAI describes ChatGPT Voice as powered by GPT-Live and available in Chat,
Work, and Codex **in the ChatGPT desktop app** on eligible plans. A user starts
a new voice chat through the app UI; the feature provides conversation,
turn-taking, interruption, and task coordination.
[Official ChatGPT Voice documentation](https://learn.chatgpt.com/docs/features/voice).

That documentation does not expose a third-party endpoint, SDK method, token
exchange, audio stream, or desktop automation contract. The Codex SDK
documentation likewise exposes coding threads rather than Voice controls.
Absence from documentation cannot prove technical impossibility, but it does
mean a product cannot depend on this as a supported integration.

The installed Windows app confirms the distinction and also clarifies the
specific **Read aloud** behavior observed by the user. In ChatGPT desktop app
26.818.3698.0, the minified implementation's Read aloud UI passes a ChatGPT
`conversationId`, completed assistant `messageId`, and selected advanced voice
to `synthesizeConversationAudio`; its private client builds a GET request to
`/synthesize` with those identifiers and `format=mp3`. Voice selection calls a
private `/settings/voices` route. The synthesizer accepts message identity, not
arbitrary text, and neither operation appears in the documented Codex SDK
surface. This is useful implementation evidence, **not** a public API or a
permission to call the private routes. Source: installed package
`C:\Program Files\WindowsApps\OpenAI.Codex_26.818.3698.0_x64__2p2nqsd0c76g0\app\resources\app.asar`,
ASAR entries `webview/assets/app-initial-izy3qYQi.js` (approximately offsets
4,307,224 and 4,326,024) and
`webview/assets/chatgpt-thread-visibility-eULvYtep.js` (approximately offset
2,014,902).

There are two tempting but unsuitable experiments:

1. **Read or copy the desktop/Codex login credential and send it to an internal
   ChatGPT/Voice endpoint.** The published API authentication contract accepts
   API keys or short-lived access tokens issued through workload identity
   federation, and usage is attributed to an API organization/project. The
   ChatGPT sign-in documentation only says the browser returns credentials to
   Codex. It does not authorize another application to extract or repurpose
   them. [Official API authentication reference](https://developers.openai.com/api/reference/overview),
   [official Codex authentication documentation](https://learn.chatgpt.com/docs/auth).
2. **Drive the desktop Voice UI by automation.** This would depend on private
   UI state, require the desktop app and an interactive signed-in session, and
   provide no supported lifecycle, error, concurrency, or redistribution
   contract. It would also mix the framework's authoritative run state with a
   second app-owned conversation. This conflicts with this repository's rule
   that React owns presentation and Codex owns agent execution through a
   documented adapter boundary. See
   [`docs/architecture.md`](../../../docs/architecture.md).

Do not test either route with the user's live credential. Beyond the security
risk of exposing a bearer secret, official sources do not establish that this
use is allowed, stable, unmetered, or covered by the user's plan. If OpenAI
later publishes a Voice SDK/desktop integration entitlement, reassess against
that explicit contract; until then, commercial/terms compliance is unconfirmed
rather than something engineering can infer.

### The supported OpenAI TTS route is separately metered API use

The Audio API documents `POST /v1/audio/speech`, authenticated with
`Authorization: Bearer $OPENAI_API_KEY`, returning an audio file or stream.
It supports `gpt-4o-mini-tts`, built-in voices, output formats, speed, and
streaming. [Official speech endpoint](https://developers.openai.com/api/reference/resources/audio/subresources/speech/methods/create),
[official TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech).

As of the research date, OpenAI lists `gpt-4o-mini-tts` at $0.60 per million
text-input tokens and $12 per million audio-output tokens, and marks its free
API tier as unsupported. API pricing and availability can change, so a product
should read the current model page at implementation time.
[Official `gpt-4o-mini-tts` model page](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts).

OpenAI's TTS guide also requires a clear end-user disclosure that the heard
voice is AI-generated. This requirement belongs in the acceptance criteria for
an OpenAI-backed implementation.
[Official TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech).

The safe design would keep the API key server-side, expose a narrow localhost
speech endpoint, validate and length-limit transcript text, stream audio to the
browser, cancel abandoned requests, and add spend/rate/error handling. The API
overview explicitly says not to expose API keys in browser or app client code.
[Official API authentication reference](https://developers.openai.com/api/reference/overview).

## Fit with this framework

The framework is unusually well positioned for a simple read-aloud feature:

- It is a host-native Node application with a localhost React UI.
- The Codex adapter already captures each completed `agent_message.text`.
- `AgentConversationView` already projects transcript message text to the
  browser, and [`AgentConversationDialog.tsx`](../../../src/web/client/AgentConversationDialog.tsx)
  renders each message as a distinct article.
- Browser-local capability/consent state already has a precedent in
  [`desktop-notifications.ts`](../../../src/web/client/desktop-notifications.ts),
  while shared policy flows through the application authority. Speech playback
  itself is ephemeral presentation state and should stay browser-local unless
  a future product requirement makes voice choice or read-aloud policy shared.

The smallest seam is therefore a **Read aloud / Stop** control on each agent
message in `AgentConversationDialog`, not a change to Codex execution, SQLite,
or the agent conversation model. The control should consume the already
projected message text. It should not ask Codex to regenerate or summarize the
message merely to speak it.

For accessibility and repository standards, this should be a labeled button
using the shared SVG icon pattern; it needs keyboard operation, an announced
playing/stopped state, cancellation when the dialog closes or another message
starts, and dark/light appearance coverage. Long messages need sentence-aware
chunking because browser and engine limits vary. Code, URLs, Markdown syntax,
and tool output also need an explicit reading policy; starting with agent
message prose only is the smallest coherent scope.

## Options and evidence-based effort

The time ranges below are engineering estimates for this repository, not
vendor estimates. They assume one experienced contributor, normal review, and
tests in the repository's existing style.

| Option | Separate OpenAI charge | Support status | Estimated effort | Main trade-off |
| --- | --- | --- | --- | --- |
| Reuse ChatGPT desktop Voice/subscription from the framework | Intended answer is no charge, but not established | **No documented integration** | Unbounded; do not schedule as implementation | Private credentials/UI, no stability or entitlement contract |
| Browser/OS speech synthesis | No OpenAI charge | Standard browser/OS capability | Low: 1–3 days for a useful first slice; 3–5 days with robust controls and browser coverage | Voice quality and availability vary by installed/browser voices |
| Windows native installed voices | No OpenAI charge | Microsoft-supported Windows API | Low–medium: roughly 3–7 days, plus distribution testing | Windows-specific host adapter and voice variability |
| Packaged local neural TTS (for example Piper) | No usage charge | Third-party open-source engine | Medium–high: roughly 1–3 weeks for one platform/language; more for cross-platform packaging | Binaries/models, size, updates, licenses, process lifecycle |
| OpenAI Audio API | Yes, API usage-based | **Supported OpenAI developer route** | Medium: roughly 3–7 days for secure streaming, UI, errors, disclosure, and tests | Best predictable OpenAI quality, but key and spend operations |

### Browser/OS synthesis — recommended first slice

The Web Speech API specification defines JavaScript speech synthesis,
including selecting a voice returned by `getVoices`, speaking, pausing,
resuming, canceling, and controlling rate/pitch/volume. It also permits the
user agent's voice service to be local or remote, so this route avoids OpenAI
API billing but does **not** by specification guarantee offline processing or
identical privacy behavior across browsers.
[W3C Web Speech API specification](https://w3c.github.io/speech-api/).

Implementation can remain entirely in the React adapter. A first slice should
feature-detect `speechSynthesis`, explain unavailability, use a language-matched
default, expose stop/replay, and avoid persisting playback state. A production
slice should add chunk sequencing, interruption behavior, dialog cleanup,
voice-change handling, and controlled browser tests. This preserves the
architecture's state ownership: audio playback is a client-device effect, like
operating-system notification permission, rather than coordination truth.

### Windows native synthesis

Microsoft's `Windows.Media.SpeechSynthesis.SpeechSynthesizer` can enumerate
installed signed voices, selects a system default, and synthesizes text to a
stream. [Microsoft SpeechSynthesizer documentation](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechsynthesis.speechsynthesizer.allvoices).

This could provide a predictable Windows implementation without OpenAI spend,
but Node does not currently have a Windows speech adapter in this repository.
It would add an OS-specific bridge or helper process, audio streaming/playback,
lifecycle cleanup, packaging, and platform capability reporting. Prefer the
browser API unless browser behavior proves insufficient or speech must continue
without an open tab.

### Packaged local neural TTS

Piper is a concrete local option: its official repository describes a fast,
local neural TTS engine with a CLI, web server, Python API, and C/C++ API. The
current project is GPL-3.0 and voice/model licenses must also be evaluated
before distribution. [Official Piper repository](https://github.com/OHF-Voice/piper1-gpl).

This route buys offline and vendor-independent generation but moves substantial
work into the product: platform binaries, voice acquisition and provenance,
model storage, first-run/download UX, process supervision, concurrency,
sentence chunking, caching, cleanup, language fallback, security updates, and
license review. It is not justified merely to add a convenient read-aloud
button.

## Recommendation

1. **Do not attempt to reuse or extract the ChatGPT/Codex desktop credential
   for TTS.** The Codex subscription sign-in is supported for Codex coding
   clients and already benefits this framework, but no official source extends
   it to programmable speech generation.
2. **Build the smallest browser-local read-aloud slice** on completed Codex
   agent messages: labeled Read aloud/Stop controls, one active utterance,
   cleanup on navigation/dialog close, feature detection, language default,
   and light/dark/accessibility browser coverage.
3. **Treat voice provider as an adapter only if a second provider is actually
   needed.** Do not add shared domain or database state for ephemeral playback.
4. If browser/OS quality is unacceptable, run a short quality-and-packaging
   prototype comparing Windows installed voices with one local neural engine.
5. Select OpenAI Audio API only through an explicit product decision accepting
   API-key management, separate usage billing, current prices, data handling,
   rate limits, and the AI-voice disclosure.

## Confidence and unresolved questions

Confidence is **high** that current supported APIs separate ChatGPT/Codex
subscription access from usage-based Audio API access, that this framework
already inherits Codex authentication, and that the installed Codex SDK exposes
text rather than audio.

Confidence is necessarily **bounded** about undocumented internals of the
ChatGPT desktop Voice implementation. No official source says reuse is
technically impossible; the actionable finding is that no published third-party
contract makes it supported, stable, unmetered, or authorized.

Before turning the recommendation into a specification, decide only three
product questions:

- Is read-aloud limited to final Codex messages, or should it include user text,
  diagnostics, and tool output?
- Is varying OS/browser voice quality acceptable for the no-charge first
  version?
- Must speech continue when the browser tab is closed? If yes, browser-local
  synthesis is the wrong lifecycle owner and a host adapter needs a separate
  design.
