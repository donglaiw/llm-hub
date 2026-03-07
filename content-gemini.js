(function registerGeminiContentScript() {
  if (globalThis.__llmHubGeminiLoaded) {
    return;
  }

  globalThis.__llmHubGeminiLoaded = true;

  const DomUtils = globalThis.LlmHubDomUtils;
  const SITE = "gemini";
  const COMPOSER_SELECTORS = [
    ".ql-editor[contenteditable='true']",
    "rich-textarea [contenteditable='true']",
    "rich-textarea textarea",
    "textarea[aria-label*='message']",
    "textarea[placeholder*='message']",
    "form textarea",
    "[contenteditable='true'][role='textbox']",
    "main [contenteditable='true']"
  ];
  const SEND_BUTTON_SELECTORS = [
    "button[aria-label*='Send']",
    "button[aria-label*='send']",
    "button[data-testid*='send']",
    "button[mattooltip*='Send']",
    "button[type='submit']",
    "form button"
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
            error && error.message ? error.message : "Unknown Gemini content script error."
          )
        );
      });

    return true;
  });

  function resolveComposer(element) {
    if (!element) {
      return null;
    }

    if (DomUtils.isEditable(element)) {
      return element;
    }

    return (
      element.querySelector("textarea") ||
      element.querySelector("[contenteditable='true']") ||
      element.querySelector("[role='textbox']")
    );
  }

  function isComposerCandidate(element) {
    const composer = resolveComposer(element);
    if (!composer || !DomUtils.isEditable(composer)) {
      return false;
    }

    const meta = DomUtils.getSearchableText(composer);
    return (
      meta.includes("message") ||
      meta.includes("gemini") ||
      meta.includes("ql-editor") ||
      meta.includes("textbox") ||
      Boolean(composer.closest("form")) ||
      Boolean(composer.closest("main"))
    );
  }

  function findComposer() {
    for (const selector of COMPOSER_SELECTORS) {
      const candidate = DomUtils.findFirstVisible([selector], {
        predicate: isComposerCandidate
      });

      const composer = resolveComposer(candidate);
      if (composer && DomUtils.isEditable(composer)) {
        return composer;
      }
    }

    const fallback = DomUtils.findFirstVisible(["textarea", "[contenteditable='true']", "[role='textbox']"], {
      predicate: isComposerCandidate
    });

    return resolveComposer(fallback);
  }

  function isSendButtonCandidate(element) {
    if (!DomUtils.isButtonLike(element)) {
      return false;
    }

    const meta = DomUtils.getSearchableText(element);
    return (
      meta.includes("send") ||
      meta.includes("submit") ||
      meta.includes("run") ||
      meta.includes("message")
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

  function tryKeyboardSend(composer) {
    return DomUtils.triggerKeyboardSend(composer, {
      key: "Enter",
      code: "Enter",
      keyCode: 13
    });
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
        "No supported Gemini composer selector matched."
      );
    }

    const inserted = setPromptText(composer, normalizedPrompt);
    if (!inserted) {
      await DomUtils.sleep(80);
      if (!setPromptText(composer, normalizedPrompt)) {
        return DomUtils.failure(
          SITE,
          "injection_failed",
          "Failed to populate the Gemini composer."
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
      if (tryKeyboardSend(composer)) {
        return DomUtils.success(SITE, "sent", { method: "keyboard" });
      }

      return DomUtils.failure(
        SITE,
        "send_button_not_found",
        "Composer found, but no supported Gemini send control matched."
      );
    }

    const enabledButton = await waitForEnabledSendButton(composer);
    if (!enabledButton) {
      return DomUtils.failure(
        SITE,
        "send_button_disabled",
        "The Gemini send button never became enabled."
      );
    }

    clickSendButton(enabledButton);
    return DomUtils.success(SITE, "sent");
  }
})();
