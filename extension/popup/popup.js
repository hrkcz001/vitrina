"use strict";

const btnInk = document.getElementById("theme-ink");
const btnGloss = document.getElementById("theme-gloss");
const chkLeft = document.getElementById("always-show-left");
const chkRight = document.getElementById("always-show-right");

function updateUI(theme) {
  if (theme === "gloss") {
    btnGloss.classList.add("active");
    btnInk.classList.remove("active");
  } else {
    btnInk.classList.add("active");
    btnGloss.classList.remove("active");
  }
}

browser.storage.local.get(["activeTheme", "alwaysShowLeftMenu", "alwaysShowRightMenu"]).then((data) => {
  updateUI(data.activeTheme || "ink");
  chkLeft.checked = !!data.alwaysShowLeftMenu;
  chkRight.checked = !!data.alwaysShowRightMenu;
});

btnInk.addEventListener("click", () => {
  updateUI("ink");
  browser.runtime.sendMessage({ type: "SWITCH_THEME", theme: "ink" });
});

btnGloss.addEventListener("click", () => {
  updateUI("gloss");
  browser.runtime.sendMessage({ type: "SWITCH_THEME", theme: "gloss" });
});

function syncMenuOptions() {
  const alwaysShowLeft = chkLeft.checked;
  const alwaysShowRight = chkRight.checked;
  browser.runtime.sendMessage({
    type: "SET_MENU_OPTIONS",
    alwaysShowLeft,
    alwaysShowRight,
  });
}

chkLeft.addEventListener("change", syncMenuOptions);
chkRight.addEventListener("change", syncMenuOptions);
