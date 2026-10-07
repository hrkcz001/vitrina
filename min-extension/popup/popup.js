"use strict";

const btnGlass = document.getElementById("theme-glass");
const btnBw = document.getElementById("theme-bw");
const chkLeft = document.getElementById("always-show-left");
const chkRight = document.getElementById("always-show-right");

function updateUI(theme) {
  if (theme === "bw-gloss") {
    btnBw.classList.add("active");
    btnGlass.classList.remove("active");
  } else {
    btnGlass.classList.add("active");
    btnBw.classList.remove("active");
  }
}

browser.storage.local.get(["activeTheme", "alwaysShowLeftMenu", "alwaysShowRightMenu"]).then((data) => {
  updateUI(data.activeTheme || "min-glass");
  chkLeft.checked = !!data.alwaysShowLeftMenu;
  chkRight.checked = !!data.alwaysShowRightMenu;
});

btnGlass.addEventListener("click", () => {
  updateUI("min-glass");
  browser.runtime.sendMessage({ type: "SWITCH_THEME", theme: "min-glass" });
});

btnBw.addEventListener("click", () => {
  updateUI("bw-gloss");
  browser.runtime.sendMessage({ type: "SWITCH_THEME", theme: "bw-gloss" });
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
