const DASHBOARD_PATH = "dashboard.html";
const DASHBOARD_URL = chrome.runtime.getURL(DASHBOARD_PATH);

const SITE_CONFIG = {
  chatgpt: {
    site: "chatgpt",
    label: "ChatGPT",
    hostnames: ["chatgpt.com", "chat.openai.com"],
    launchUrl: "https://chatgpt.com/",
    scriptFiles: ["shared/dom-utils.js", "content-chatgpt.js"]
  },
  claude: {
    site: "claude",
    label: "Claude",
    hostnames: ["claude.ai"],
    launchUrl: "https://claude.ai/",
    scriptFiles: ["shared/dom-utils.js", "content-claude.js"]
  },
  gemini: {
    site: "gemini",
    label: "Gemini",
    hostnames: ["gemini.google.com"],
    launchUrl: "https://gemini.google.com/app",
    scriptFiles: ["shared/dom-utils.js", "content-gemini.js"]
  }
};

chrome.action.onClicked.addListener(async (tab) => {
  await openOrFocusDashboard(tab && typeof tab.windowId === "number" ? tab.windowId : undefined);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    sendResponse({ error: "Invalid extension message." });
    return false;
  }

  if (message.type === "OPEN_DASHBOARD") {
    handleAsyncResponse(
      openOrFocusDashboard(sender.tab && typeof sender.tab.windowId === "number" ? sender.tab.windowId : undefined),
      sendResponse
    );
    return true;
  }

  if (message.type === "DETECT_TARGETS") {
    handleAsyncResponse(
      handleDetectTargets(sender.tab && typeof sender.tab.windowId === "number" ? sender.tab.windowId : undefined),
      sendResponse
    );
    return true;
  }

  if (message.type === "SEND_TO_TARGETS") {
    handleAsyncResponse(
      handleSendToTargets({
        prompt: message.prompt,
        targets: message.targets,
        preferredWindowId:
          sender.tab && typeof sender.tab.windowId === "number" ? sender.tab.windowId : undefined
      }),
      sendResponse
    );
    return true;
  }

  sendResponse({ error: `Unsupported message type: ${message.type}` });
  return false;
});

async function openOrFocusDashboard(preferredWindowId) {
  const tabs = await chrome.tabs.query({});
  const dashboardTabs = tabs.filter((tab) => tab.url === DASHBOARD_URL);
  const dashboardTab = pickDashboardTab(dashboardTabs, preferredWindowId);

  if (dashboardTab && typeof dashboardTab.id === "number") {
    await chrome.tabs.update(dashboardTab.id, { active: true });
    if (typeof dashboardTab.windowId === "number") {
      await chrome.windows.update(dashboardTab.windowId, { focused: true });
    }

    return {
      ok: true,
      dashboardTabId: dashboardTab.id,
      dashboardWindowId: dashboardTab.windowId
    };
  }

  const createProperties = {
    url: DASHBOARD_URL,
    active: true
  };

  if (typeof preferredWindowId === "number") {
    createProperties.windowId = preferredWindowId;
  }

  const createdTab = await chrome.tabs.create(createProperties);

  return {
    ok: true,
    dashboardTabId: createdTab.id,
    dashboardWindowId: createdTab.windowId
  };
}

async function handleDetectTargets(preferredWindowId) {
  const tabs = await chrome.tabs.query({});
  return buildDetectionPayload(tabs, preferredWindowId);
}

async function handleSendToTargets({ prompt, targets, preferredWindowId }) {
  const normalizedPrompt = typeof prompt === "string" ? prompt : "";
  const requestedTargets = normalizeTargets(targets);

  if (!normalizedPrompt.trim()) {
    return buildEmptyPromptResults(requestedTargets);
  }

  if (requestedTargets.length === 0) {
    return {
      error: "No valid targets were requested."
    };
  }

  const tabs = await chrome.tabs.query({});
  const targetTabs = findTargetTabs(tabs, preferredWindowId);
  const resultEntries = await Promise.all(
    requestedTargets.map(async (site) => {
      const tab = targetTabs[site];

      if (!tab || typeof tab.id !== "number") {
        return [
          site,
          buildFailure(
            site,
            "tab_not_found",
            `No ${SITE_CONFIG[site].label} tab matched the supported domains.`
          )
        ];
      }

      const result = await sendPromptToTab(tab.id, site, normalizedPrompt);
      return [site, result];
    })
  );

  return Object.fromEntries(resultEntries);
}

function buildDetectionPayload(tabs, preferredWindowId) {
  const matches = findTargetTabs(tabs, preferredWindowId);

  return Object.fromEntries(
    Object.keys(SITE_CONFIG).map((site) => [
      site,
      describeTargetTab(site, matches[site], preferredWindowId)
    ])
  );
}

function findTargetTabs(tabs, preferredWindowId) {
  return Object.fromEntries(
    Object.entries(SITE_CONFIG).map(([site, config]) => [
      site,
      pickBestTab(tabs, config.hostnames, preferredWindowId)
    ])
  );
}

function pickBestTab(tabs, hostnames, preferredWindowId) {
  const candidates = tabs.filter((tab) => matchesSiteHost(tab, hostnames));

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftSameWindow = Number(left.windowId === preferredWindowId);
    const rightSameWindow = Number(right.windowId === preferredWindowId);
    if (leftSameWindow !== rightSameWindow) {
      return rightSameWindow - leftSameWindow;
    }

    if (left.pinned !== right.pinned) {
      return Number(right.pinned) - Number(left.pinned);
    }

    if (left.active !== right.active) {
      return Number(right.active) - Number(left.active);
    }

    return (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER);
  });

  return candidates[0];
}

function pickDashboardTab(tabs, preferredWindowId) {
  if (tabs.length === 0) {
    return null;
  }

  const sorted = [...tabs].sort((left, right) => {
    const leftSameWindow = Number(left.windowId === preferredWindowId);
    const rightSameWindow = Number(right.windowId === preferredWindowId);
    if (leftSameWindow !== rightSameWindow) {
      return rightSameWindow - leftSameWindow;
    }

    if (left.active !== right.active) {
      return Number(right.active) - Number(left.active);
    }

    return (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER);
  });

  return sorted[0];
}

function matchesSiteHost(tab, hostnames) {
  if (!tab || !tab.url) {
    return false;
  }

  try {
    const hostname = new URL(tab.url).hostname.toLowerCase();
    return hostnames.some((candidate) => {
      const normalizedCandidate = candidate.toLowerCase();
      return hostname === normalizedCandidate || hostname.endsWith(`.${normalizedCandidate}`);
    });
  } catch (error) {
    return false;
  }
}

function describeTargetTab(site, tab, preferredWindowId) {
  if (!tab) {
    return {
      site,
      found: false,
      sameWindow: false,
      pinned: false,
      active: false,
      title: "",
      url: "",
      launchUrl: SITE_CONFIG[site].launchUrl,
      status: "tab_not_found"
    };
  }

  return {
    site,
    found: true,
    sameWindow: tab.windowId === preferredWindowId,
    pinned: Boolean(tab.pinned),
    active: Boolean(tab.active),
    title: tab.title || "",
    url: tab.url || "",
    launchUrl: SITE_CONFIG[site].launchUrl,
    status: "ready"
  };
}

async function sendPromptToTab(tabId, site, prompt) {
  try {
    return await sendMessageToTab(tabId, site, prompt);
  } catch (error) {
    if (isMissingReceiverError(error)) {
      const injectionResult = await injectContentScripts(tabId, site);
      if (!injectionResult.ok) {
        return injectionResult;
      }

      await delay(80);

      try {
        return await sendMessageToTab(tabId, site, prompt);
      } catch (retryError) {
        return buildFailure(site, "messaging_failed", formatMessagingError(retryError));
      }
    }

    return buildFailure(site, "messaging_failed", formatMessagingError(error));
  }
}

async function sendMessageToTab(tabId, site, prompt) {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "INJECT_AND_SEND",
    prompt
  });

  if (!response || typeof response !== "object") {
    return buildFailure(site, "messaging_failed", "No response received from the content script.");
  }

  return {
    ...response,
    site,
    ok: Boolean(response.ok),
    status: response.status || (response.ok ? "sent" : "unknown_error")
  };
}

async function injectContentScripts(tabId, site) {
  const config = SITE_CONFIG[site];

  if (!config) {
    return buildFailure(site, "messaging_failed", "Unsupported site configuration.");
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: config.scriptFiles
    });

    return { ok: true };
  } catch (error) {
    return buildFailure(
      site,
      "messaging_failed",
      "Failed to inject the content script. Refresh the target tab and try again."
    );
  }
}

function normalizeTargets(targets) {
  if (!Array.isArray(targets)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const target of targets) {
    if (typeof target !== "string" || !SITE_CONFIG[target] || seen.has(target)) {
      continue;
    }

    seen.add(target);
    normalized.push(target);
  }

  return normalized;
}

function buildEmptyPromptResults(targets) {
  return Object.fromEntries(
    targets.map((site) => [site, buildFailure(site, "empty_prompt", "Prompt cannot be empty.")])
  );
}

function handleAsyncResponse(promise, sendResponse) {
  promise
    .then((result) => {
      sendResponse(result);
    })
    .catch((error) => {
      sendResponse({
        error: error && error.message ? error.message : "Unexpected extension error."
      });
    });
}

function isMissingReceiverError(error) {
  const message = error && error.message ? error.message : "";
  return (
    message.includes("Receiving end does not exist") ||
    message.includes("Could not establish connection")
  );
}

function formatMessagingError(error) {
  const message = error && error.message ? error.message : "";

  if (message.includes("The tab was closed") || message.includes("No tab with id")) {
    return "The target tab is no longer available.";
  }

  if (message.includes("Could not establish connection")) {
    return "Could not communicate with the target tab.";
  }

  return message || "Unknown messaging failure.";
}

function buildFailure(site, status, message) {
  return {
    ok: false,
    site,
    status,
    message
  };
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
