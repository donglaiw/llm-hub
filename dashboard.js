const SITE_LABELS = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini"
};

const SITE_ORDER = ["chatgpt", "claude", "gemini"];

const state = {
  busy: false,
  detection: {},
  selectedTargets: new Set(SITE_ORDER)
};

document.addEventListener("DOMContentLoaded", () => {
  const elements = collectElements();

  for (const site of SITE_ORDER) {
    elements.toggleButtons[site].addEventListener("click", () => {
      toggleTarget(elements, site);
    });
  }

  elements.promptInput.addEventListener("input", () => {
    hideValidation(elements.validationMessage);
  });

  elements.promptInput.addEventListener("keydown", (event) => {
    if (event.isComposing) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendToSelectedTargets(elements);
    }
  });

  renderIdle(elements);
  renderTargetToggles(elements);
  detectTargets(elements);

  window.setInterval(() => {
    if (!state.busy && !document.hidden) {
      detectTargets(elements);
    }
  }, 7000);
});

function collectElements() {
  return {
    summaryBadge: document.getElementById("summaryBadge"),
    summaryText: document.getElementById("summaryText"),
    promptInput: document.getElementById("promptInput"),
    validationMessage: document.getElementById("validationMessage"),
    toggleButtons: Object.fromEntries(
      SITE_ORDER.map((site) => [site, document.querySelector(`.toggle-button[data-target="${site}"]`)])
    ),
    cards: Object.fromEntries(
      SITE_ORDER.map((site) => [site, document.getElementById(`card-${site}`)])
    ),
    badges: Object.fromEntries(
      SITE_ORDER.map((site) => [site, document.getElementById(`badge-${site}`)])
    ),
    metas: Object.fromEntries(
      SITE_ORDER.map((site) => [site, document.getElementById(`meta-${site}`)])
    )
  };
}

async function detectTargets(elements) {
  if (state.busy) {
    return;
  }

  setSummary(
    elements,
    "Syncing",
    "neutral",
    "Checking provider tabs in this window first."
  );

  const response = await sendRuntimeMessage({ type: "DETECT_TARGETS" });

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

async function sendToSelectedTargets(elements) {
  if (state.busy) {
    return;
  }

  const targets = getSelectedTargets();
  if (targets.length === 0) {
    showValidation(elements.validationMessage, "Turn on at least one target button.");
    setSummary(
      elements,
      "No targets",
      "warn",
      "All target buttons are off. Turn one on, then press Enter."
    );
    return;
  }

  const prompt = elements.promptInput.value;
  if (!prompt.trim()) {
    showValidation(elements.validationMessage, "Prompt cannot be empty.");
    setSummary(elements, "Need prompt", "warn", "Enter a prompt before sending.");
    return;
  }

  hideValidation(elements.validationMessage);
  setBusy(elements, true);

  for (const site of targets) {
    setSiteState(elements, site, {
      tone: "neutral",
      badge: "sending",
      meta: `Sending prompt to ${SITE_LABELS[site]}...`
    });
  }

  setSummary(
    elements,
    targets.length === SITE_ORDER.length ? "Sending all" : "Sending",
    "neutral",
    `Sending to ${describeTargets(targets)}.`
  );

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
    "All three targets start on. Press Enter to send, or Shift+Enter for a new line."
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
    setSiteState(elements, site, {
      tone: detectionTone(info),
      badge: detectionBadge(info),
      meta: detectionMeta(info)
    });

    if (info && info.found) {
      foundCount += 1;
    }

    if (info && info.found && info.sameWindow) {
      readySameWindow += 1;
    }
  }

  if (readySameWindow === SITE_ORDER.length) {
    setSummary(
      elements,
      "Ready",
      "success",
      `All three provider tabs are available in this window. Enter sends to ${describeTargets(getSelectedTargets())}.`
    );
    return;
  }

  if (foundCount === SITE_ORDER.length) {
    setSummary(
      elements,
      "Detected",
      "warn",
      `All providers were found, but at least one is in another window. Enter sends to ${describeTargets(getSelectedTargets())}.`
    );
    return;
  }

  const missingSites = SITE_ORDER.filter((site) => !(detection[site] && detection[site].found));
  setSummary(
    elements,
    "Missing",
    "error",
    `Missing provider tabs: ${missingSites.map((site) => SITE_LABELS[site]).join(", ")}.`
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
      successCount === SITE_ORDER.length ? "Sent to all" : "Sent",
      "success",
      `Prompt sent to ${describeTargets(targets)}.`
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

function toggleTarget(elements, site) {
  if (state.busy) {
    return;
  }

  if (state.selectedTargets.has(site)) {
    state.selectedTargets.delete(site);
  } else {
    state.selectedTargets.add(site);
  }

  renderTargetToggles(elements);

  const targets = getSelectedTargets();
  setSummary(
    elements,
    targets.length ? "Targets set" : "No targets",
    targets.length ? "neutral" : "warn",
    targets.length
      ? `Enter will send to ${describeTargets(targets)}.`
      : "All target buttons are off. Turn one on, then press Enter."
  );
}

function renderTargetToggles(elements) {
  for (const site of SITE_ORDER) {
    const button = elements.toggleButtons[site];
    const isActive = state.selectedTargets.has(site);
    button.className = `button toggle-button ${isActive ? "is-active" : "is-inactive"}`;
    button.setAttribute("aria-pressed", String(isActive));
    button.textContent = SITE_LABELS[site];
    button.title = `${SITE_LABELS[site]} ${isActive ? "on" : "off"}`;
  }
}

function getSelectedTargets() {
  return SITE_ORDER.filter((site) => state.selectedTargets.has(site));
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
    return "No matching tab found. Open the provider chat in this window.";
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

function setBusy(elements, busy) {
  state.busy = busy;
  for (const site of SITE_ORDER) {
    elements.toggleButtons[site].disabled = busy;
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

function describeTargets(targets) {
  if (!targets.length) {
    return "no targets";
  }

  return targets.map((site) => SITE_LABELS[site]).join(", ");
}

function humanizeStatus(status) {
  return String(status || "unknown_error").replace(/_/g, " ");
}

function truncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
