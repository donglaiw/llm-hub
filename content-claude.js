(function registerClaudeContentScript() {
  if (globalThis.__llmHubClaudeLoaded) {
    return;
  }

  globalThis.__llmHubClaudeLoaded = true;

  const DomUtils = globalThis.LlmHubDomUtils;
  const SITE = "claude";
  const COMPOSER_SELECTORS = [
    "div.ProseMirror[contenteditable='true']",
    "[data-testid*='composer'] [contenteditable='true']",
    "form [contenteditable='true'][role='textbox']",
    "form div[contenteditable='true']",
    "textarea[placeholder*='Message']",
    "textarea[placeholder*='message']",
    "form textarea"
  ];
  const SEND_BUTTON_SELECTORS = [
    "button[aria-label*='Send']",
    "button[aria-label*='send']",
    "button[data-testid*='send']",
    "form button[type='submit']",
    "button[type='submit']"
  ];

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== "INJECT_AND_SEND") {
      return false;
    }

    handleInjectAndSend(message.prompt)
      .then(sendResponse)
      .catch((error) => {
        sendResponse(
          DomUtils.failure(
            SITE,
            "unknown_error",
            error && error.message ? error.message : "Unknown Claude content script error."
          )
        );
      });

    return true;
  });

  function isComposerCandidate(element) {
    if (!DomUtils.isEditable(element)) {
      return false;
    }

    const meta = DomUtils.getSearchableText(element, ["translate"]);
    return (
      meta.includes("message") ||
      meta.includes("claude") ||
      meta.includes("prosemirror") ||
      meta.includes("talk to") ||
      Boolean(element.closest("form")) ||
      Boolean(element.closest("fieldset"))
    );
  }

  function findComposer() {
    const directMatch = DomUtils.findFirstVisible(COMPOSER_SELECTORS, {
      predicate: isComposerCandidate
    });

    if (directMatch) {
      return directMatch;
    }

    return DomUtils.findFirstVisible(["textarea", "[contenteditable='true']", "[role='textbox']"], {
      predicate: isComposerCandidate
    });
  }

  function isSendButtonCandidate(element) {
    if (!DomUtils.isButtonLike(element)) {
      return false;
    }

    const meta = DomUtils.getSearchableText(element);
    return (
      meta.includes("send") ||
      meta.includes("submit") ||
      (element instanceof HTMLButtonElement && element.type === "submit")
    );
  }

  function findSendButton(composer) {
    const roots = [composer.closest("form"), composer.closest("main"), document].filter(Boolean);

    for (const root of roots) {
      const match = DomUtils.findButton({
        root,
        selectors: SEND_BUTTON_SELECTORS,
        predicate: isSendButtonCandidate
      });

      if (match) {
        return match;
      }
    }

    return DomUtils.findActionButtonNear(composer, {
      selectors: SEND_BUTTON_SELECTORS,
      predicate: isSendButtonCandidate,
      maxAncestorDepth: 6
    });
  }

  async function waitForComposer() {
    return DomUtils.retry(() => findComposer(), {
      attempts: 8,
      intervalMs: 250
    });
  }

  async function waitForSendButton(composer) {
    return DomUtils.retry(() => findSendButton(composer), {
      attempts: 8,
      intervalMs: 250
    });
  }

  async function waitForEnabledSendButton(composer) {
    return DomUtils.retry(() => {
      const button = findSendButton(composer);
      if (button && !DomUtils.isDisabled(button)) {
        return button;
      }

      return null;
    }, {
      attempts: 10,
      intervalMs: 200
    });
  }

  function setPromptText(composer, prompt) {
    return DomUtils.setElementText(composer, prompt);
  }

  function verifyPrompt(composer, prompt) {
    return DomUtils.normalizeText(DomUtils.getEditableText(composer)).includes(
      DomUtils.normalizeText(prompt)
    );
  }

  function clickSendButton(button) {
    return DomUtils.triggerClick(button);
  }

  async function handleInjectAndSend(prompt) {
    const normalizedPrompt = typeof prompt === "string" ? prompt : "";

    if (!normalizedPrompt.trim()) {
      return DomUtils.failure(SITE, "empty_prompt", "Prompt cannot be empty.");
    }

    const composer = await waitForComposer();
    if (!composer) {
      return DomUtils.failure(
        SITE,
        "composer_not_found",
        "No supported Claude composer selector matched."
      );
    }

    const inserted = setPromptText(composer, normalizedPrompt);
    if (!inserted) {
      await DomUtils.sleep(80);
      if (!setPromptText(composer, normalizedPrompt)) {
        return DomUtils.failure(
          SITE,
          "injection_failed",
          "Failed to populate the Claude composer."
        );
      }
    }

    await DomUtils.sleep(120);
    if (!verifyPrompt(composer, normalizedPrompt)) {
      return DomUtils.failure(
        SITE,
        "injection_failed",
        "Prompt verification failed after insertion."
      );
    }

    const sendButton = await waitForSendButton(composer);
    if (!sendButton) {
      return DomUtils.failure(
        SITE,
        "send_button_not_found",
        "Composer found, but no supported send button selector matched."
      );
    }

    const enabledButton = await waitForEnabledSendButton(composer);
    if (!enabledButton) {
      return DomUtils.failure(
        SITE,
        "send_button_disabled",
        "The Claude send button never became enabled."
      );
    }

    clickSendButton(enabledButton);
    return DomUtils.success(SITE, "sent");
  }
})();
