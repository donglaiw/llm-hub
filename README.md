# LLM Hub Dashboard

Vivaldi extension workflow for sending one prompt to three real browser tabs:

- ChatGPT
- Claude
- Gemini

The extension opens a dashboard tab with a shared composer. It sends prompts into the native provider tabs you are already logged into.

## Install In Vivaldi

1. Open `Vivaldi Menu > Tools > Extensions`.
2. Enable `Developer Mode`.
3. Click `Load Unpacked`.
4. Select this folder:
   `llm-hub`
5. Pin the extension icon if needed.

## Open The Tabs

1. Open and log into:
   - `https://chatgpt.com/`
   - `https://claude.ai/`
   - `https://gemini.google.com/app`
2. Click the extension icon to open the dashboard tab.
3. Keep all 4 tabs in the same Vivaldi window:
   - ChatGPT
   - Claude
   - Gemini
   - LLM Hub Dashboard

## Arrange The Tiles

1. Select the 4 tabs in Vivaldi.
2. Use Vivaldi tab tiling to place them in one tiled view.
3. Arrange the 3 provider tabs on top.
4. Keep the dashboard tab on the bottom.
5. Resize the divider so the top area is roughly `70%` and the dashboard is roughly `30%`.

The extension does not control tiling. Vivaldi handles the layout.

## Use The Dashboard

1. Wait for the dashboard to detect ChatGPT, Claude, and Gemini.
2. Use the three buttons to toggle targets on or off.
3. By default, all three are on.
4. Type a prompt in the dashboard textarea.
5. Press `Enter` to send to whichever targets are on.
6. Press `Shift+Enter` for a new line.

## Notes

- The extension prefers provider tabs in the same window as the dashboard.
- If a provider shows `missing`, open that chat tab in the same window.
- If a provider shows `composer not found` or `messaging failed`, refresh that provider tab and try again.
