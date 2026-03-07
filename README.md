# LLM Hub Dashboard

`LLM Hub Dashboard` is a Manifest V3 extension for a tiled browser workflow:

- ChatGPT in one real tab
- Claude in one real tab
- Gemini in one real tab
- one extension dashboard tab used as a shared composer

The dashboard sends prompts into the native provider tabs you are already logged into. It does not call OpenAI, Anthropic, or Google APIs, and it does not embed those sites inside the extension page.

## Intended Workflow

This project is designed for Chromium browsers with strong tab tiling, especially Vivaldi.

Recommended setup:

1. Open ChatGPT, Claude, and Gemini in normal browser tabs.
2. Open the extension dashboard tab.
3. Tile the four tabs manually so the provider tabs are above and the dashboard is below.
4. Use each provider normally in its own tab, or type once in the dashboard and send to one provider or all three.

Important limitation:

- The extension does not manage browser layout.
- The browser handles tiling manually.
- Provider pages block iframe embedding, so the dashboard cannot show the live sites inside itself.

## Features

- Browser action opens or focuses the dashboard tab.
- Shared dashboard composer with:
  - `Send to all`
  - `Send to ChatGPT`
  - `Send to Claude`
  - `Send to Gemini`
- Per-provider status cards
- Same-window tab preference so the dashboard targets the tiled tabs in the current window first
- On-demand content-script injection for tabs that were already open before the extension loaded
- Structured status reporting per provider

## File Layout

- `manifest.json`
- `dashboard.html`
- `dashboard.css`
- `dashboard.js`
- `service_worker.js`
- `content-chatgpt.js`
- `content-claude.js`
- `content-gemini.js`
- `shared/dom-utils.js`

## Install

1. Open `chrome://extensions/` or the equivalent extensions page in your Chromium browser.
2. Enable Developer mode.
3. Click `Load unpacked`.
4. Select this folder:
   `/Users/weidf/Code/misc/llm-hub`

## Usage

1. Click the extension icon to open the dashboard tab.
2. Open or log into:
   - `https://chatgpt.com/`
   - `https://claude.ai/`
   - `https://gemini.google.com/app`
3. Arrange the provider tabs and dashboard tab in your preferred tiled layout.
4. In the dashboard:
   - click `Refresh status` to detect provider tabs
   - type a prompt in the shared composer
   - click a per-provider send button or `Send to all`

Keyboard shortcut inside the dashboard:

- `Cmd+Enter` or `Ctrl+Enter`: send to all

## Permissions

- `tabs`
  - find provider tabs
  - prefer tabs in the same window as the dashboard
- `scripting`
  - inject content scripts into already-open provider tabs when necessary

Host permissions are limited to:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`

## Supported Sites

- ChatGPT
- Claude
- Gemini

## Selection Behavior

When multiple tabs match the same provider, the service worker chooses:

1. a tab in the same window as the dashboard
2. then a pinned tab
3. then an active tab
4. then the earliest matching tab by index

This is meant to align with a tiled multi-tab workflow without requiring any browser-specific layout API.

## Known Limitations

- The extension cannot create or resize Vivaldi, Opera, or Chrome tiled layouts for you.
- Provider DOMs change frequently. Selector updates may be needed in:
  - `content-chatgpt.js`
  - `content-claude.js`
  - `content-gemini.js`
  - `shared/dom-utils.js`
- Login pages, landing pages, or unsupported provider states may not expose a valid composer.
- Gemini currently includes a keyboard-send fallback if button detection fails, but that path may still need tuning if Google changes the editor UI.
- The extension sends prompts only. It does not read responses or synchronize chats.

## Troubleshooting

- If a provider shows `missing`, make sure the tab is open in the same browser profile.
- If a provider shows `other window`, move that tab into the same window as the dashboard if you want the tiled workflow to target it first.
- If the dashboard reports `messaging failed`, refresh the provider tab and try again.
- If the dashboard reports `composer not found`, make sure you are on the actual chat page, not a login or marketing page.
- If the dashboard reports `send button disabled`, wait for the page to finish loading and try again.
- If a provider UI changed, update the selector arrays in that site’s content script.

## Manual Test Checklist

- ChatGPT, Claude, and Gemini open in one window
- one provider missing
- one provider in another window
- send only to ChatGPT
- send only to Claude
- send only to Gemini
- send to all three
- empty prompt
- multiline prompt
- long prompt
- fresh page load still rendering
- one provider succeeds while another fails
