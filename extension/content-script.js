"use strict";

/*
 * Reports the page color from <meta name="theme-color"> to the background.
 * Sends only on change and observes only <head>.
 */
(() => {
  let last = null;
  let timer = 0;
  let observedHead = null;
  let headObserver = null;
  let docObserver = null;

  function pick() {
    for (const meta of document.querySelectorAll('meta[name="theme-color" i]')) {
      const media = meta.getAttribute("media");
      if (media && !window.matchMedia(media).matches) {
        continue;
      }
      const color = (meta.getAttribute("content") || "").trim();
      if (color) {
        return color;
      }
    }
    return "";
  }

  function report() {
    const color = pick();
    if (color === last) {
      return;
    }
    last = color;
    browser.runtime.sendMessage({ type: "THEME_COLOR", color }).catch(() => {});
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(report, 150);
  }

  // (Re)bind the <head> MutationObserver. Re-attaches whenever the current head
  // differs from the one we already observe (some SPAs replace <head>).
  function observeHead() {
    const head = document.head;
    if (!head || head === observedHead) {
      return;
    }
    headObserver?.disconnect();
    observedHead = head;
    headObserver = new MutationObserver(schedule);
    headObserver.observe(head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content", "media", "name"],
    });
  }

  function attach() {
    report();
    observeHead();
    // Safety net: watch the document element so a replaced <head> rebinds.
    if (!docObserver) {
      docObserver = new MutationObserver(() => {
        observeHead();
        report();
      });
      docObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  } else {
    attach();
  }

  // Sites with different theme-color for light and dark schemes.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", report);
})();
