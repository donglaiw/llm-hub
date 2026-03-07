(function registerChatGptContentScript() {
  if (globalThis.__llmHubChatGptLoaded) {
    return;
  }

  globalThis.__llmHubChatGptLoaded = true;

  const DomUtils = globalThis.LlmHubDomUtils;
  const SITE = "chatgpt";
  const COMPOSER_SELECTORS = [
    "#prompt-textarea",
    "textarea[placeholder*='Message']",
    "textarea[placeholder*='message']",
    "form textarea",
    "[contenteditable='true']#prompt-textarea",
    "[contenteditable='true'][data-lexical-editor='true']",
    "[contenteditable='true'][role='textbox']",
    "main textarea",
    "main [contenteditable='true']"
  ];
  const SEND_BUTTON_SELECTORS = [
    "button[data-testid*='send']",
    "button[aria-label*='Send']",
    "button[aria-label*='send']",
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
            error && error.message ? error.message : "Unknown ChatGPT content script error."
          )
        );
      });

    return true;
  });

  function isComposerCandidate(element) {
    if (!DomUtils.isEditable(element)) {
      return false;
    }

    const meta = DomUtils.getSearchableText(element);
    return (
      meta.includes("prompt") ||
      meta.includes("message") ||
      meta.includes("ask anything") ||
      Boolean(element.closest("form")) ||
      Boolean(element.closest("main"))
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
        "No supported ChatGPT composer selector matched."
      );
    }

    const inserted = setPromptText(composer, normalizedPrompt);
    if (!inserted) {
      await DomUtils.sleep(80);
      if (!setPromptText(composer, normalizedPrompt)) {
        return DomUtils.failure(
          SITE,
          "injection_failed",
          "Failed to populate the ChatGPT composer."
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
        "The ChatGPT send button never became enabled."
      );
    }

    clickSendButton(enabledButton);
    return DomUtils.success(SITE, "sent");
  }
})();
