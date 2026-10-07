"use strict";

/*
 * Сообщает фону цвет страницы из <meta name="theme-color">.
 * Отправляет только при изменении значения, наблюдает только за <head>.
 */
(() => {
  let last = null;
  let timer = 0;

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

  function attach() {
    report();
    if (document.head) {
      new MutationObserver(schedule).observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["content", "media", "name"],
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  } else {
    attach();
  }

  // Сайты с разными theme-color для светлой и тёмной темы.
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", report);
})();
