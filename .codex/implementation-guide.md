# Codex Agent Implementation Guide: Tiled LLM Hub Dashboard Extension

## Objective
Implement a Manifest V3 extension that works with a manual tiled-tab browser workflow:

- ChatGPT tab
- Claude tab
- Gemini tab
- dashboard tab owned by the extension

The extension dashboard provides a shared composer that can send a prompt to one provider or all three already-open web apps. Each provider message must be sent through the real logged-in site so the conversation remains in native history.

---

## Important Constraint
Do not try to embed ChatGPT, Claude, or Gemini inside the extension page. These sites block framing. The browser layout is handled manually by the user in a tiling-capable browser such as Vivaldi.

The extension’s responsibility is:
- find provider tabs
- inject text into the correct composer
- trigger send
- show statuses in the dashboard

---

## Deliverables

Create or update these files:

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
- `popup.html` and `popup.js` only if used as a simple launcher
- icons

---

## Build Order

### Milestone 1: Dashboard Skeleton
Implement:
- Manifest V3
- dashboard tab page
- browser action opens or focuses the dashboard
- dashboard can send a test message to the service worker

Definition of done:
- extension loads via `Load unpacked`
- clicking the action icon opens the dashboard tab
- dashboard renders and can call the worker

### Milestone 2: Provider Discovery
Implement service worker logic to:
- find ChatGPT, Claude, and Gemini tabs
- prefer tabs in the same window as the dashboard tab
- then prefer pinned tabs
- fall back to matching tabs in other windows
- return clear status when a provider is missing

Definition of done:
- dashboard can detect all three targets
- per-provider status is visible

### Milestone 3: Site Injection
Implement content scripts to:
- locate each site composer
- insert prompt text
- dispatch input events
- locate send action
- click send
- return structured results

Definition of done:
- one dashboard prompt can be sent successfully to one provider or all providers

### Milestone 4: Hardening
Implement:
- selector fallbacks
- retries for delayed render
- same-window target preference
- better status messages
- empty prompt validation
- Gemini send fallback if button lookup is unreliable

Definition of done:
- works reliably across refreshes and partially loaded pages

---

## Functional Requirements

### Dashboard UI
Must include:
- title and short instructions
- provider status section
- one multiline textarea
- one primary button: `Send to all`
- per-provider action buttons:
  - `Send to ChatGPT`
  - `Send to Claude`
  - `Send to Gemini`
- one `Detect tabs` or `Refresh status` control
- disabled states while a send is in progress

Recommended layout:
- provider cards or rows near the top
- shared status summary below them
- large shared composer at the bottom
- action bar directly under the composer

### User Flow
1. User opens ChatGPT, Claude, and Gemini tabs.
2. User arranges them in a tiled layout with the dashboard tab.
3. User opens the extension dashboard.
4. User types a prompt into the shared composer.
5. User clicks either a per-provider send button or `Send to all`.
6. Extension finds the provider tabs.
7. Extension sends the prompt payload to content scripts.
8. Each content script inserts prompt and triggers send in that provider tab.
9. Dashboard shows per-provider result.

---

## Suggested Data Flow

### Dashboard -> Service Worker
For detection:
```json
{
  "type": "DETECT_TARGETS"
}
```

For targeted send:
```json
{
  "type": "SEND_TO_TARGETS",
  "prompt": "Summarize the tradeoffs",
  "targets": ["chatgpt", "claude", "gemini"]
}
```

### Service Worker -> Content Script
```json
{
  "type": "INJECT_AND_SEND",
  "prompt": "Summarize the tradeoffs"
}
```

### Content Script -> Service Worker
Success:
```json
{
  "ok": true,
  "status": "sent",
  "site": "gemini"
}
```

Failure:
```json
{
  "ok": false,
  "status": "composer_not_found",
  "site": "claude",
  "message": "No supported composer selector matched."
}
```

### Service Worker -> Dashboard
```json
{
  "chatgpt": {"ok": true, "status": "sent"},
  "claude": {"ok": false, "status": "tab_not_found"},
  "gemini": {"ok": true, "status": "sent"}
}
```

---

## Manifest Guidance

Recommended initial permissions:

```json
{
  "manifest_version": 3,
  "name": "LLM Hub Dashboard",
  "version": "0.1.0",
  "permissions": ["tabs", "scripting"],
  "host_permissions": [
    "https://chatgpt.com/*",
    "https://chat.openai.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*"
  ],
  "action": {
    "default_title": "Open LLM Hub"
  },
  "background": {
    "service_worker": "service_worker.js"
  },
  "content_scripts": [
    {
      "matches": ["https://chatgpt.com/*", "https://chat.openai.com/*"],
      "js": ["shared/dom-utils.js", "content-chatgpt.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://claude.ai/*"],
      "js": ["shared/dom-utils.js", "content-claude.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://gemini.google.com/*"],
      "js": ["shared/dom-utils.js", "content-gemini.js"],
      "run_at": "document_idle"
    }
  ]
}
```

Keep permissions minimal.

---

## Service Worker Requirements

### Required Functions
Implement functions similar to:

- `openOrFocusDashboard()`
- `findTargetTabs(preferredWindowId)`
- `pickBestTab(tabs, hostnamePatterns, preferredWindowId)`
- `sendPromptToTab(tabId, site, prompt)`
- `aggregateResults(results, requestedTargets)`

### Target Selection Policy
When multiple matching tabs exist:
1. Prefer tabs in the same window as the dashboard tab.
2. Within that set, prefer pinned tabs.
3. Then prefer active tabs.
4. Otherwise use the first matching tab by tab index.

### Robustness
- Handle tabs without URL.
- Handle messaging failures.
- Handle tabs where content scripts are not ready.
- If a tab existed before the extension loaded, inject scripts on demand with `chrome.scripting.executeScript`.

---

## Content Script Requirements

Each site script should expose the same internal interface:

- `findComposer()`
- `setPromptText(prompt)`
- `findSendButton()`
- `clickSendButton()`
- `handleInjectAndSend(prompt)`

### Required Behavior
1. Wait briefly for app shell to render if needed.
2. Find the composer.
3. Insert prompt.
4. Verify prompt is present.
5. Find send button or site-specific send fallback.
6. Ensure send control is enabled.
7. Trigger send.
8. Return status object.

---

## DOM Interaction Strategy

### Important
Do not assume one selector will work forever.

### Recommended Approach
Use layered fallbacks:
1. accessibility selectors
2. role-based selectors
3. data-testid selectors
4. generic `textarea` / `contenteditable`
5. contextual action-button search near composer

### Text Insertion
Support:
- `textarea`
- `contenteditable="true"`
- ProseMirror-like editors
- Quill-like editors

For `textarea`:
- focus element
- use native setter if needed
- dispatch `input`
- dispatch `change` if needed

For `contenteditable`:
- focus element
- use `beforeinput` / `input` events
- use selection APIs or direct node replacement as fallback

### Verification
After insertion, verify one of:
- `textarea.value === prompt`
- normalized editable text contains prompt

If verification fails, return `injection_failed`.

---

## Site Selector Strategy Checklist

### ChatGPT
Try selectors like:
- `#prompt-textarea`
- `textarea`
- `[contenteditable="true"]`
- send buttons by `aria-label`, `data-testid`, or nearby submit buttons

### Claude
Try selectors like:
- `div.ProseMirror[contenteditable="true"]`
- `textarea`
- generic editable textbox roles
- send buttons by `aria-label`, `data-testid`, or nearby submit buttons

### Gemini
Try selectors like:
- `.ql-editor[contenteditable="true"]`
- `.ql-container`
- `rich-textarea`
- `textarea`
- send button selectors near the composer
- keyboard-send fallback if necessary

Keep selectors in arrays.

---

## Retry Logic

Implement lightweight retry behavior for:
- composer not yet rendered
- send button not yet rendered
- send button still disabled

Suggested retry:
- 6 to 10 attempts
- 200 to 300 ms interval

Pseudo-flow:
```js
for (let i = 0; i < 8; i++) {
  const composer = findComposer();
  if (composer) break;
  await sleep(250);
}
```

Do not add unnecessary complexity.

---

## Error Model

Standardize statuses across sites:

- `sent`
- `empty_prompt`
- `tab_not_found`
- `composer_not_found`
- `injection_failed`
- `send_button_not_found`
- `send_button_disabled`
- `messaging_failed`
- `unknown_error`

Every failure should include:
- `ok: false`
- `status`
- `site`
- `message`

---

## README Requirements

Include:
- project purpose
- why this uses native tabs instead of APIs or embedded iframes
- recommended browser workflow for Vivaldi-style tab tiling
- install instructions
- permissions explanation
- supported sites
- known limitations
- troubleshooting

### Troubleshooting Section
Must include:
- refresh target tabs if messaging fails
- ensure user is logged in
- ensure the target page is a real chat page, not marketing or login
- if app UI changed, update selectors in the relevant content script
- dashboard does not control browser tiling directly

---

## Testing Plan

### Manual Tests
Run all of these:

#### Happy Path
- all three tabs open in same window
- dashboard tab open
- prompt sends to all successfully

#### Targeted Send
- send only to ChatGPT
- send only to Claude
- send only to Gemini

#### Missing Targets
- ChatGPT missing
- Claude missing
- Gemini missing

#### Window Placement
- providers in same window as dashboard
- provider in another window
- multiple matching tabs for same provider

#### Page State
- fresh page load
- existing conversation page
- new conversation page
- partially loaded page

#### Input Cases
- empty prompt
- one-line prompt
- multi-line prompt
- long prompt
- code block prompt

#### Failure Cases
- send button disabled
- composer not found
- one site succeeds while another fails

### Acceptance Test
Final acceptance:
- open ChatGPT, Claude, and Gemini in a tiled browser workflow
- open the dashboard tab
- enter one prompt
- click `Send to all`
- confirm prompt appears as sent in each native app
- confirm each platform retains the conversation in its own history

---

## Final Instruction to Codex Agent

Build the dashboard-tab workflow, not an embedded multi-iframe app. Optimize for reliability, readable code, and easy selector maintenance. The highest risk is provider DOM churn, so isolate site-specific logic and keep the dashboard simple.
