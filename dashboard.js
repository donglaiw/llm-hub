const SITE_LABELS = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini"
};

const SITE_ORDER = ["chatgpt", "claude", "gemini"];

const state = {
  busy: false,
  detection: {}
};

document.addEventListener("DOMContentLoaded", () => {
  const elements = collectElements();

  elements.detectButton.addEventListener("click", () => {
    detectTargets(elements, true);
  });

  elements.sendAllButton.addEventListener("click", () => {
    sendToTargets(elements, SITE_ORDER);
  });

  elements.promptInput.addEventListener("input", () => {
    hideValidation(elements.validationMessage);
  });

  elements.promptInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      sendToTargets(elements, SITE_ORDER);
    }
  });

  for (const button of elements.sendButtons) {
    button.addEventListener("click", () => {
      sendToTargets(elements, [button.dataset.target]);
    });
  }

  renderIdle(elements);
  detectTargets(elements, false);
  window.setInterval(() => {
    if (!state.busy && !document.hidden) {
      detectTargets(elements, false);
    }
  }, 7000);
});

function collectElements() {
  return {
    detectButton: document.getElementById("detectButton"),
    summaryBadge: document.getElementById("summaryBadge"),
    summaryText: document.getElementById("summaryText"),
    promptInput: document.getElementById("promptInput"),
    validationMessage: document.getElementById("validationMessage"),
    sendAllButton: document.getElementById("sendAllButton"),
    sendButtons: document.querySelectorAll(".send-button"),
    cards: Object.fromEntries(
      SITE_ORDER.map((site) => [site, document.getElementById(`card-${site}`)])
    ),
    badges: Object.fromEntries(
      SITE_ORDER.map((site) => [site, document.getElementById(`badge-${site}`)])
    ),
    metas: Object.fromEntries(
      SITE_ORDER.map((site) => [site, document.getElementById(`meta-${site}`)])
    ),
    openLinks: Object.fromEntries(
      SITE_ORDER.map((site) => [site, document.getElementById(`open-${site}`)])
    )
  };
}

async function detectTargets(elements, userInitiated) {
  if (state.busy) {
    return;
  }

  setBusy(elements, true, userInitiated ? "Checking" : "Syncing", "neutral");
  const response = await sendRuntimeMessage({ type: "DETECT_TARGETS" });
  setBusy(elements, false);

  if (!response || response.error) {
    setSummary(
      elements,
      "Error",
      "error",
      response && response.error ? response.error : "Could not inspect current tabs."
    );
    for (const site of SITE_ORDER) {
      setSiteState(elements, site, {
        tone: "error",
        badge: "error",
        meta: "Target inspection failed."
      });
    }
    return;
  }

  state.detection = response;
  renderDetection(elements, response);
}

async function sendToTargets(elements, targets) {
  if (state.busy) {
    return;
  }

  const prompt = elements.promptInput.value;
  if (!prompt.trim()) {
    showValidation(elements.validationMessage, "Prompt cannot be empty.");
    setSummary(elements, "Need prompt", "warn", "Enter a prompt before sending.");
    return;
  }

  hideValidation(elements.validationMessage);
  setBusy(elements, true, targets.length === SITE_ORDER.length ? "Broadcasting" : "Sending", "neutral");

  for (const site of targets) {
    setSiteState(elements, site, {
      tone: "neutral",
      badge: "sending",
      meta: `Sending prompt to ${SITE_LABELS[site]}...`
    });
  }

  const response = await sendRuntimeMessage({
    type: "SEND_TO_TARGETS",
    prompt,
    targets
  });

  setBusy(elements, false);

  if (!response || response.error) {
    setSummary(
      elements,
      "Error",
      "error",
      response && response.error ? response.error : "The extension did not return a result."
    );
    for (const site of targets) {
      setSiteState(elements, site, {
        tone: "error",
        badge: "error",
        meta: "The send operation failed before the target tab responded."
      });
    }
    return;
  }

  renderSendResults(elements, targets, response);
}

async function sendRuntimeMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return {
      error: error && error.message ? error.message : "Extension messaging failed."
    };
  }
}

function renderIdle(elements) {
  setSummary(
    elements,
    "Idle",
    "neutral",
    "Arrange this dashboard below your provider tabs in a tiled browser layout."
  );

  for (const site of SITE_ORDER) {
    setSiteState(elements, site, {
      tone: "neutral",
      badge: "unknown",
      meta: "No tab detected yet."
    });
  }
}

function renderDetection(elements, detection) {
  let readySameWindow = 0;
  let foundCount = 0;

  for (const site of SITE_ORDER) {
    const info = detection[site];
    const tone = detectionTone(info);
    const badge = detectionBadge(info);
    const meta = detectionMeta(info);

    setSiteState(elements, site, { tone, badge, meta });

    if (info && info.found) {
      foundCount += 1;
    }

    if (info && info.found && info.sameWindow) {
      readySameWindow += 1;
    }

    if (info && info.launchUrl) {
      elements.openLinks[site].href = info.launchUrl;
    }
  }

  if (readySameWindow === 3) {
    setSummary(elements, "Ready", "success", "All three provider tabs are available in this window.");
    return;
  }

  if (foundCount === 3) {
    setSummary(
      elements,
      "Detected",
      "warn",
      "All providers were found, but at least one is in another window."
    );
    return;
  }

  const missingSites = SITE_ORDER.filter((site) => !(detection[site] && detection[site].found));
  setSummary(
    elements,
    missingSites.length ? "Missing" : "Detected",
    missingSites.length ? "error" : "warn",
    missingSites.length
      ? `Missing provider tabs: ${missingSites.map((site) => SITE_LABELS[site]).join(", ")}.`
      : "Provider tabs detected."
  );
}

function renderSendResults(elements, targets, response) {
  const normalizedResults = Object.fromEntries(
    targets.map((site) => [site, normalizeResult(response[site], site)])
  );

  let successCount = 0;
  const failures = [];

  for (const site of targets) {
    const result = normalizedResults[site];
    const tone = result.ok ? "success" : failureTone(result.status);
    const badge = humanizeStatus(result.status);
    const meta = result.ok
      ? `Prompt sent to ${SITE_LABELS[site]}.`
      : result.message || `Send failed for ${SITE_LABELS[site]}.`;

    if (result.ok) {
      successCount += 1;
    } else {
      failures.push(`${SITE_LABELS[site]}: ${humanizeStatus(result.status)}`);
    }

    setSiteState(elements, site, { tone, badge, meta });
  }

  if (successCount === targets.length) {
    setSummary(
      elements,
      targets.length === 3 ? "Sent to all" : "Sent",
      "success",
      targets.length === 3
        ? "Prompt sent to ChatGPT, Claude, and Gemini."
        : `Prompt sent to ${SITE_LABELS[targets[0]]}.`
    );
    return;
  }

  if (successCount > 0) {
    setSummary(elements, "Partial", "warn", failures.join(" | "));
    return;
  }

  setSummary(elements, "Failed", "error", failures.join(" | "));
}

function normalizeResult(result, site) {
  if (result && typeof result === "object") {
    return {
      ok: Boolean(result.ok),
      site,
      status: result.status || (result.ok ? "sent" : "unknown_error"),
      message: result.message || ""
    };
  }

  return {
    ok: false,
    site,
    status: "unknown_error",
    message: "No response received from the target tab."
  };
}

function detectionTone(info) {
  if (!info || !info.found) {
    return "error";
  }

  if (!info.sameWindow) {
    return "warn";
  }

  return "success";
}

function detectionBadge(info) {
  if (!info || !info.found) {
    return "missing";
  }

  if (!info.sameWindow) {
    return "other window";
  }

  return "ready";
}

function detectionMeta(info) {
  if (!info || !info.found) {
    return "No matching tab found. Use Open to create or log into the provider tab.";
  }

  const locationText = info.sameWindow ? "same window" : "other window";
  const pinnedText = info.pinned ? ", pinned" : "";
  const titleText = info.title ? `"${truncate(info.title, 84)}"` : "Untitled tab";
  return `${titleText} in ${locationText}${pinnedText}.`;
}

function failureTone(status) {
  const warnStatuses = new Set(["empty_prompt", "send_button_disabled"]);
  return warnStatuses.has(status) ? "warn" : "error";
}

function setBusy(elements, busy, badgeLabel, tone) {
  state.busy = busy;
  elements.detectButton.disabled = busy;
  elements.sendAllButton.disabled = busy;
  for (const button of elements.sendButtons) {
    button.disabled = busy;
  }

  if (busy) {
    setSummary(elements, badgeLabel, tone, "Waiting for target tabs to respond...");
  }
}

function setSummary(elements, badgeLabel, tone, text) {
  elements.summaryBadge.textContent = badgeLabel;
  elements.summaryBadge.className = `summary-badge ${tone}`;
  elements.summaryText.textContent = text;
}

function setSiteState(elements, site, { tone, badge, meta }) {
  elements.cards[site].className = `target-card ${tone}`;
  elements.badges[site].textContent = badge;
  elements.badges[site].className = `target-badge ${tone}`;
  elements.metas[site].textContent = meta;
}

function showValidation(element, message) {
  element.textContent = message;
  element.classList.remove("hidden");
}

function hideValidation(element) {
  element.textContent = "";
  element.classList.add("hidden");
}

function humanizeStatus(status) {
  return String(status || "unknown_error").replace(/_/g, " ");
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
