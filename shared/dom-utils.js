(function registerDomUtils() {
  if (globalThis.LlmHubDomUtils) {
    return;
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function retry(callback, options = {}) {
    const attempts = Number.isInteger(options.attempts) ? options.attempts : 8;
    const intervalMs = Number.isInteger(options.intervalMs) ? options.intervalMs : 250;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const result = await callback(attempt);
      if (result) {
        return result;
      }

      if (attempt < attempts - 1) {
        await sleep(intervalMs);
      }
    }

    return null;
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    return rect.width > 0 && rect.height > 0;
  }

  function isEditable(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement && typeof element.value === "string")
    ) {
      return !element.readOnly && !element.disabled;
    }

    const contentEditable = element.getAttribute("contenteditable");
    return contentEditable === "" || contentEditable === "true" || element.isContentEditable;
  }

  function isButtonLike(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    if (element instanceof HTMLButtonElement) {
      return true;
    }

    if (element instanceof HTMLInputElement) {
      return element.type === "button" || element.type === "submit";
    }

    return element.getAttribute("role") === "button";
  }

  function isDisabled(element) {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    if ("disabled" in element && element.disabled) {
      return true;
    }

    return element.getAttribute("aria-disabled") === "true";
  }

  function getSearchableText(element, extraAttributes = []) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }

    const values = [];
    const attributeNames = [
      "aria-label",
      "placeholder",
      "data-testid",
      "data-placeholder",
      "role",
      "type",
      ...extraAttributes
    ];

    for (const name of attributeNames) {
      const value = element.getAttribute(name);
      if (value) {
        values.push(value);
      }
    }

    if (element.id) {
      values.push(element.id);
    }

    if ("name" in element && element.name) {
      values.push(element.name);
    }

    if ("title" in element && element.title) {
      values.push(element.title);
    }

    if (typeof element.className === "string" && element.className) {
      values.push(element.className);
    }

    if (element.innerText) {
      values.push(element.innerText);
    }

    return values.join(" ").toLowerCase();
  }

  function normalizeText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim();
  }

  function getEditableText(element) {
    if (!element) {
      return "";
    }

    if (
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement && typeof element.value === "string")
    ) {
      return element.value || "";
    }

    return element.innerText || element.textContent || "";
  }

  function findFirstVisible(selectors, options = {}) {
    const root = options.root || document;
    const predicate = options.predicate || (() => true);

    for (const selector of selectors) {
      let elements;

      try {
        elements = root.querySelectorAll(selector);
      } catch (error) {
        continue;
      }

      for (const element of elements) {
        if (
          element instanceof HTMLElement &&
          isVisible(element) &&
          predicate(element)
        ) {
          return element;
        }
      }
    }

    return null;
  }

  function findButton(options = {}) {
    const selectors = options.selectors || [];
    const root = options.root || document;
    const predicate = options.predicate || (() => true);

    for (const selector of selectors) {
      let matches;

      try {
        matches = root.querySelectorAll(selector);
      } catch (error) {
        continue;
      }

      for (const element of matches) {
        if (
          element instanceof HTMLElement &&
          isButtonLike(element) &&
          isVisible(element) &&
          predicate(element)
        ) {
          return element;
        }
      }
    }

    const fallbackButtons = root.querySelectorAll(
      "button, [role='button'], input[type='button'], input[type='submit']"
    );

    for (const element of fallbackButtons) {
      if (
        element instanceof HTMLElement &&
        isVisible(element) &&
        isButtonLike(element) &&
        predicate(element)
      ) {
        return element;
      }
    }

    return null;
  }

  function findActionButtonNear(anchor, options = {}) {
    const maxAncestorDepth = Number.isInteger(options.maxAncestorDepth)
      ? options.maxAncestorDepth
      : 6;

    let current = anchor;

    for (let depth = 0; current && depth <= maxAncestorDepth; depth += 1) {
      const match = findButton({
        ...options,
        root: current
      });

      if (match) {
        return match;
      }

      current = current.parentElement;
    }

    return findButton(options);
  }

  function focusElement(element) {
    if (element && typeof element.focus === "function") {
      element.focus({ preventScroll: true });
    }
  }

  function createInputEvent(type, inputType, data) {
    try {
      return new InputEvent(type, {
        bubbles: true,
        cancelable: true,
        inputType,
        data
      });
    } catch (error) {
      return new Event(type, {
        bubbles: true,
        cancelable: true
      });
    }
  }

  function setNativeValue(element, value) {
    const descriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      "value"
    );

    if (descriptor && typeof descriptor.set === "function") {
      descriptor.set.call(element, value);
      return;
    }

    element.value = value;
  }

  function selectElementContents(element) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function placeCaretAtEnd(element) {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function replaceContentEditableContents(element, value) {
    const fragment = document.createDocumentFragment();
    const lines = String(value).split("\n");

    lines.forEach((line, index) => {
      if (index > 0) {
        fragment.appendChild(document.createElement("br"));
      }

      if (line) {
        fragment.appendChild(document.createTextNode(line));
      }
    });

    element.replaceChildren(fragment);
    placeCaretAtEnd(element);
  }

  function setElementText(element, value) {
    if (!isEditable(element)) {
      return false;
    }

    focusElement(element);

    if (
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement && typeof element.value === "string")
    ) {
      setNativeValue(element, value);
      element.dispatchEvent(createInputEvent("input", "insertText", value));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return normalizeText(getEditableText(element)).includes(normalizeText(value));
    }

    element.dispatchEvent(
      createInputEvent("beforeinput", "insertReplacementText", value)
    );

    let inserted = false;

    try {
      selectElementContents(element);
      if (typeof document.execCommand === "function") {
        inserted = document.execCommand("insertText", false, value);
      }
    } catch (error) {
      inserted = false;
    }

    if (!inserted) {
      replaceContentEditableContents(element, value);
    }

    element.dispatchEvent(createInputEvent("input", "insertText", value));
    return normalizeText(getEditableText(element)).includes(normalizeText(value));
  }

  function triggerClick(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    focusElement(element);
    element.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    element.dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true })
    );
    element.click();
    return true;
  }

  function triggerKeyboardSend(element, options = {}) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const key = options.key || "Enter";
    const code = options.code || key;
    const keyCode = typeof options.keyCode === "number" ? options.keyCode : 13;
    const bubbles = options.bubbles !== false;
    const cancelable = options.cancelable !== false;
    const modifiers = {
      altKey: Boolean(options.altKey),
      ctrlKey: Boolean(options.ctrlKey),
      metaKey: Boolean(options.metaKey),
      shiftKey: Boolean(options.shiftKey)
    };

    focusElement(element);

    for (const type of ["keydown", "keypress", "keyup"]) {
      element.dispatchEvent(
        new KeyboardEvent(type, {
          key,
          code,
          keyCode,
          which: keyCode,
          bubbles,
          cancelable,
          ...modifiers
        })
      );
    }

    return true;
  }

  function success(site, status = "sent", extra = {}) {
    return {
      ok: true,
      site,
      status,
      ...extra
    };
  }

  function failure(site, status, message, extra = {}) {
    return {
      ok: false,
      site,
      status,
      message,
      ...extra
    };
  }

  globalThis.LlmHubDomUtils = {
    failure,
    findActionButtonNear,
    findButton,
    findFirstVisible,
    getEditableText,
    getSearchableText,
    isButtonLike,
    isDisabled,
    isEditable,
    normalizeText,
    retry,
    setElementText,
    sleep,
    success,
    triggerClick,
    triggerKeyboardSend
  };
})();
