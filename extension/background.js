"use strict";

const DEFAULT_THEME = "ink";

async function start() {
  const { activeTheme, alwaysShowLeftMenu, alwaysShowRightMenu } =
    await browser.storage.local.get(["activeTheme", "alwaysShowLeftMenu", "alwaysShowRightMenu"]);
  // Тема передаётся сразу, чтобы при старте не мелькала тема по умолчанию.
  await browser.vitrina.init(activeTheme || DEFAULT_THEME);
  await browser.vitrina.setMenuOptions(!!alwaysShowLeftMenu, !!alwaysShowRightMenu);
}

start().catch(e => console.error("[Vitrina] init failed:", e));

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "THEME_COLOR" && sender.tab) {
    return browser.vitrina.setTabColor(sender.tab.id, msg.color || "");
  }
  if (msg?.type === "SWITCH_THEME") {
    return browser.storage.local
      .set({ activeTheme: msg.theme })
      .then(() => browser.vitrina.setTheme(msg.theme));
  }
  if (msg?.type === "SET_MENU_OPTIONS") {
    return browser.storage.local
      .set({
        alwaysShowLeftMenu: !!msg.alwaysShowLeft,
        alwaysShowRightMenu: !!msg.alwaysShowRight,
      })
      .then(() => browser.vitrina.setMenuOptions(!!msg.alwaysShowLeft, !!msg.alwaysShowRight));
  }
  return undefined;
});
