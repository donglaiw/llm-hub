# Codex Agent Project Spec: Tiled LLM Hub Dashboard Extension

## Goal
Build a lightweight Manifest V3 browser extension that works with a tiled browser layout:

- ChatGPT tab
- Claude tab
- Gemini tab
- one extension dashboard tab

The three provider tabs remain the real first-party web apps. The dashboard tab provides a shared composer and control surface that can send a prompt to one provider or to all three current chats at once.

This project is designed for Chromium browsers with strong tab tiling workflows, especially Vivaldi. Opera may also work depending on the user’s split-screen support, but the extension must not depend on controlling browser layout APIs.

---

## Product Requirements

### Core UX
- Provide a full extension page, not just a popup:
  - `dashboard.html`
  - opened as a regular browser tab
- Assume the user arranges 4 tabs manually in a tiled layout:
  - top area: ChatGPT, Claude, Gemini
  - bottom area: extension dashboard tab
- Dashboard must include:
  - one multiline shared textarea at the bottom
  - one `Send to all` action
  - per-provider send actions:
    - `Send to ChatGPT`
    - `Send to Claude`
    - `Send to Gemini`
  - per-provider status display
  - a detect / refresh control
- The user can interact with each provider tab directly as normal.
- The dashboard only automates prompt insertion and sending into the current open chat in each provider tab.

### Technical Constraints
- Use Manifest V3.
- Do not use provider APIs.
- Do not embed provider pages in iframes.
- Do not assume the extension can create or manage the browser’s tiled layout.
- Keep all logic local in the browser.
- Prefer minimal permissions.
- Keep site-specific DOM logic modular because selectors will change.

### Non-Goals
- No response scraping or summarization.
- No chat transcript synchronization across providers.
- No automated browser tiling or pane sizing.
- No remote storage or backend.
- No custom provider API layer.

---

## Architecture

### Files
- `manifest.json`
- `dashboard.html`
- `dashboard.css`
- `dashboard.js`
- `service_worker.js`
- `content-chatgpt.js`
- `content-claude.js`
- `content-gemini.js`
- `shared/dom-utils.js`
- `README.md`

Optional:
- small placeholder popup that only opens the dashboard tab
- icons

### Component Responsibilities

#### Dashboard Tab
Responsible for:
- rendering provider cards and shared composer
- sending commands to the service worker
- showing detection and send results per provider
- allowing one-to-one send or broadcast send

#### Service Worker
Responsible for:
- opening or reusing the dashboard tab
- locating provider tabs
- preferring provider tabs in the same browser window as the dashboard tab
- falling back to matching tabs in other windows if necessary
- injecting or messaging content scripts
- aggregating structured results

#### Content Scripts
Responsible for:
- identifying the composer in their site
- inserting text in a React/contenteditable-compatible way
- locating and triggering the send action
- returning structured status objects

---

## Recommended Behavior

### Browser Layout Model
- The user manually arranges the layout in a tiling-capable browser.
- The extension does not control the 70% / 30% split or grid layout directly.
- The dashboard tab should work even if the user is not tiled, but the intended workflow is:
  - three provider tabs visible together
  - dashboard tab visible below them

### Tab Discovery Rules
For each target site:
1. Search all open tabs for matching URL patterns.
2. Prefer matches in the same window as the dashboard tab.
3. Within the preferred set, favor pinned tabs if present.
4. If multiple matches still exist, favor the active tab, then the earliest tab index.
5. If no matching tab exists, return a clear error.

Suggested URL matching:
- ChatGPT:
  - `chatgpt.com`
  - `chat.openai.com`
- Claude:
  - `claude.ai`
- Gemini:
  - `gemini.google.com`

### Prompt Routing Rules
- Shared composer text may be sent to:
  - one provider
  - all providers
- `Send to all` should attempt all three targets even if one fails.
- Results must be returned per provider.

### Prompt Insertion Rules
- Use resilient DOM queries.
- Support `textarea` and `contenteditable`.
- Use native setters and simulated input events rather than naive direct mutation when needed.
- Verify that the text is present before sending.

### Send Rules
- Locate the send action with layered selectors and contextual search.
- Ensure the action is enabled before clicking.
- For Gemini, allow a keyboard-send fallback if button detection is unreliable.
- Return structured statuses such as:
  - `sent`
  - `tab_not_found`
  - `composer_not_found`
  - `injection_failed`
  - `send_button_not_found`
  - `send_button_disabled`
  - `messaging_failed`
  - `unknown_error`

---

## Manifest Guidance

Likely permissions:
- `tabs`
- `scripting`

Host permissions:
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`

The browser action should open or focus the dashboard tab instead of relying on a popup-first flow.

---

## Suggested Implementation Plan

### Phase 1: Dashboard MVP
Implement:
- dashboard tab UI
- action click opens dashboard tab
- service worker tab discovery for 3 providers
- send one / send all message flow
- content scripts for ChatGPT, Claude, and Gemini

Success criteria:
- user opens dashboard tab
- user types one prompt
- user sends it to one provider or all three
- prompt is submitted in each native provider tab

### Phase 2: Hardening
Add:
- better selectors and fallback search
- same-window targeting improvements
- retry logic for delayed page load
- clear per-provider error reporting
- dashboard auto-refresh of target detection

### Phase 3: Polish
Add:
- reuse existing dashboard tab when action icon is clicked
- last prompt persistence in local storage if desired
- quick open links for missing providers
- optional keyboard shortcut to focus the dashboard

---

## DOM Strategy Notes
These provider apps are dynamic and may use React, ProseMirror, Quill, or custom editors. The implementation should:

- centralize reusable DOM helpers
- isolate site-specific selectors
- avoid assuming a single selector will remain valid
- prefer accessibility labels, roles, and data-testid patterns before brittle class selectors

Recommended helper shape per site:
- `findComposer()`
- `setPromptText(text)`
- `findSendButton()`
- `clickSendButton()`
- `handleInjectAndSend(prompt)`

Potential editor patterns:
- `textarea`
- `div[contenteditable="true"]`
- ProseMirror editors
- Quill editors

---

## Error Handling Requirements
The service worker should always return structured aggregate results, for example:

```json
{
  "chatgpt": {"ok": true, "status": "sent"},
  "claude": {"ok": false, "status": "send_button_not_found", "message": "Composer found but no supported send button selector matched."},
  "gemini": {"ok": true, "status": "sent"}
}
```

The dashboard should show concise statuses and a summary line.

---

## Security / Privacy Requirements
- No remote server.
- No analytics.
- No external dependencies unless clearly justified.
- No prompt logging beyond optional local-only storage.
- Make it obvious that the tool automates already-open first-party tabs.

---

## Testing Checklist
Test at least these cases:

- all three tabs open in the same window
- one provider missing
- providers present in another window
- fresh page load still rendering
- empty prompt
- multiline prompt
- long prompt
- send to one provider
- send to all providers
- one provider succeeds while another fails
- Gemini fallback send path

---

## Deliverables for Codex Agent
Please produce:
1. A working Manifest V3 extension.
2. A dashboard-tab workflow suited for tiled browser layouts.
3. Clean, commented source code.
4. A `README.md` with setup, dashboard usage, permissions, limitations, and troubleshooting.
5. Clear selector abstraction so provider DOM updates are easy to patch.

---

## Coding Preferences
- Use plain JavaScript.
- Keep dependencies at zero.
- Favor readability and maintainability.
- Comment brittle DOM automation logic.
- Return structured status objects instead of opaque exceptions.

---

## Acceptance Criteria
The project is complete when:
- the user can keep ChatGPT, Claude, and Gemini open in browser tabs
- the user can open the extension dashboard as a regular tab
- the user can type one prompt into the dashboard
- clicking `Send to all` reliably inserts and sends that prompt in the current chat for all available provider tabs
- clicking a per-provider send button reliably targets only that provider tab
