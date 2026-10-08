"use strict";

/*
 * Privileged part of the extension (WebExtension Experiment).
 * Runs in the parent process with full browser privileges.
 *
 * ExtensionAPI, Services, Cc, Ci, ChromeUtils already exist in the sandbox
 * Firefox loads this file into, so no imports are needed.
 */

/* global ExtensionAPI, Services, Cc, Ci, ChromeUtils */

const THEMES = {
  "ink": "ink.css",
  "gloss": "gloss.css",
  // Skeletons — not implemented yet (see themes/*.css TODOs):
  // "stock": native Firefox look adapted to Vitrina widgets
  // "contrast": super-contrast, strictly #000 + #fff
};
const DEFAULT_THEME = "ink";
const DEFAULT_ACCENT = "#1c1c22";

// Widget ids that Vitrina relocates. Kept in one place so ensureWidgets and
// setupMenus never drift apart.
const LEFT_WIDGET_IDS = ["stop-reload-button", "back-button", "forward-button", "developer-button"];
const RIGHT_WIDGET_IDS = ["firefox-view-button", "unified-extensions-button"];
const ALL_MANAGED_WIDGET_IDS = [...LEFT_WIDGET_IDS, ...RIGHT_WIDGET_IDS];

// IDs of the container elements Vitrina injects; a managed widget is
// "already moved" when its closest of these is not null.
const MANAGED_CONTAINERS = ["min-nav-flyout", "min-right-flyout", "min-pinned-deck"];

// Fallbacks for geometry tokens (see themes docs). Overridden by CSS vars.
const FALLBACK = { closeY: 115, closeMarginX: 110, closeMarginXNear: 40, pinnedBtnWidth: 28 };

// Hand-picked colors for common sites; the rest come from a domain hash.
const PALETTE = {
  "github.com": "#24292e",
  "youtube.com": "#cc181e",
  "google.com": "#1a73e8",
  "telegram.org": "#2481cc",
  "reddit.com": "#ff4500",
  "wikipedia.org": "#2b569b",
  "yandex.ru": "#fc3f1d",
  "ya.ru": "#fc3f1d",
  "vk.com": "#0077ff",
  "twitter.com": "#1d9bf0",
  "x.com": "#1d9bf0",
  "twitch.tv": "#9146ff",
  "spotify.com": "#1db954",
  "discord.com": "#5865f2",
};

function hostOf(uri) {
  try {
    if (uri) {
      if (typeof uri === "string") {
        const u = new URL(uri);
        return u.hostname.replace(/^www\./, "");
      }
      if (uri.schemeIs?.("http") || uri.schemeIs?.("https")) {
        return uri.host.replace(/^www\./, "");
      }
    }
  } catch (_) {}
  return "";
}

function domainColor(host) {
  if (!host) {
    return "";
  }
  if (PALETTE[host]) {
    return PALETTE[host];
  }
  let hash = 0;
  for (let i = 0; i < host.length; i++) {
    hash = (host.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 38%)`;
}

// Read a numeric geometry token from :root custom properties, falling back to
// the hardcoded default so JS and CSS stay in sync via one source (P1.3).
function cssPx(win, prop, fallback) {
  try {
    const raw = win.getComputedStyle(win.document.documentElement).getPropertyValue(prop);
    const val = parseFloat(raw);
    return Number.isFinite(val) ? val : fallback;
  } catch (_) {
    return fallback;
  }
}

this.vitrina = class extends ExtensionAPI {
  getAPI(_context) {
    // getAPI is called per context (background, popup), so all state lives
    // on the API instance itself, not here.
    return {
      vitrina: {
        init: async theme => this.start(theme),
        setTheme: async theme => this.applyTheme(theme),
        setTabColor: async (tabId, color) => this.setTabColor(tabId, color),
        setMenuOptions: async (alwaysShowLeft, alwaysShowRight) => this.setMenuOptions(alwaysShowLeft, alwaysShowRight),
      },
    };
  }

  start(theme) {
    if (this.started) {
      this.applyTheme(theme);
      return;
    }
    this.started = true;
    this.theme = THEMES[theme] ? theme : DEFAULT_THEME;
    this.windows = new Map();

    // chrome://vitrina/content/ -> the themes/ folder inside the extension.
    const aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"]
      .getService(Ci.amIAddonManagerStartup);
    const manifestURI = Services.io.newURI("manifest.json", null, this.extension.rootURI);
    this.chromeHandle = aomStartup.registerChrome(manifestURI, [
      ["content", "vitrina", "themes/"],
    ]);

    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.gBrowserInit?.delayedStartupFinished) {
        this.setupWindow(win);
      }
    }

    // New windows: fires once gBrowser and the tabs are ready.
    this.windowObserver = win => this.setupWindow(win);
    Services.obs.addObserver(this.windowObserver, "browser-delayed-startup-finished");
  }

  sheetURL(theme) {
    return `chrome://vitrina/content/${THEMES[theme]}`;
  }

  /*
   * Styles are attached per window (windowUtils), not globally via
   * nsIStyleSheetService: a global sheet would leak into every website too.
   */
  applyTheme(theme) {
    if (!THEMES[theme] || theme === this.theme) {
      return;
    }
    this.theme = theme;
    const url = this.sheetURL(theme);
    for (const [win, state] of this.windows) {
      const utils = win.windowUtils;
      utils.removeSheetUsingURIString(state.sheet, utils.USER_SHEET);
      utils.loadSheetUsingURIString(url, utils.USER_SHEET);
      state.sheet = url;
    }
  }

  setMenuOptions(alwaysShowLeft, alwaysShowRight) {
    this.alwaysShowLeft = !!alwaysShowLeft;
    this.alwaysShowRight = !!alwaysShowRight;
    for (const [win, state] of this.windows) {
      win.document.documentElement.setAttribute("always-show-left-menu", this.alwaysShowLeft ? "true" : "false");
      win.document.documentElement.setAttribute("always-show-right-menu", this.alwaysShowRight ? "true" : "false");
      state.updateMenuOptions?.(this.alwaysShowLeft, this.alwaysShowRight);
    }
  }

  // Returns true if the given widget id is already living inside one of the
  // containers Vitrina injects (so it must not be re-placed into the navbar).
  isWidgetMoved(win, id) {
    const el = win.document.getElementById(id);
    if (!el) {
      return false;
    }
    return MANAGED_CONTAINERS.some(cid => el.closest(`#${cid}`));
  }

  ensureWidgets(win) {
    try {
      const cui = win.CustomizableUI;
      if (cui) {
        for (const id of ALL_MANAGED_WIDGET_IDS) {
          // Skip widgets already relocated into our flyouts/deck: forcing them
          // back into AREA_NAVBAR would fight setupMenus (P1.4).
          if (this.isWidgetMoved(win, id)) {
            continue;
          }
          const placement = cui.getPlacementOfWidget(id);
          if (!placement || placement.area !== cui.AREA_NAVBAR) {
            cui.addWidgetToArea(id, cui.AREA_NAVBAR);
          }
        }
      }
    } catch (_) {}
  }

  setupMenus(win) {
    const doc = win.document;
    const navBar = doc.getElementById("nav-bar");
    if (!navBar) {
      return { cleanup: () => {}, updateMenuOptions: () => {} };
    }

    doc.getElementById("min-control-box")?.remove();
    doc.getElementById("min-right-flyout")?.remove();

    doc.documentElement.setAttribute("always-show-left-menu", this.alwaysShowLeft ? "true" : "false");
    doc.documentElement.setAttribute("always-show-right-menu", this.alwaysShowRight ? "true" : "false");

    const switcher = doc.querySelector(".searchmode-switcher, #urlbar-searchmode-switcher");
    if (switcher) {
      switcher.removeAttribute("tooltiptext");
      switcher.removeAttribute("title");
    }

    // 1. LEFT MENU
    const controlBox = doc.createXULElement ? doc.createXULElement("hbox") : doc.createElement("div");
    controlBox.id = "min-control-box";

    const controlBtn = doc.createXULElement ? doc.createXULElement("toolbarbutton") : doc.createElement("button");
    controlBtn.id = "min-control-btn";
    controlBtn.className = "toolbarbutton-1";

    const controlIcon = doc.createXULElement ? doc.createXULElement("image") : doc.createElement("img");
    controlIcon.className = "toolbarbutton-icon";
    // Clean vector control icon (sliders / control center)
    const controlSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round'><path d='M2.5 4h11M2.5 8h11M2.5 12h11'/><circle cx='5.5' cy='4' r='1.2' fill='white'/><circle cx='10.5' cy='8' r='1.2' fill='white'/><circle cx='6.5' cy='12' r='1.2' fill='white'/></svg>";
    controlIcon.setAttribute("src", controlSvg);
    controlIcon.style.listStyleImage = `url("${controlSvg}")`;
    controlBtn.setAttribute("tooltiptext", "Control panel");
    controlBtn.appendChild(controlIcon);

    const leftFlyout = doc.createXULElement ? doc.createXULElement("hbox") : doc.createElement("div");
    leftFlyout.id = "min-nav-flyout";

    // Move the REAL native Firefox buttons: reload, back, forward, developer tools
    const movedLeft = [];
    for (const id of LEFT_WIDGET_IDS) {
      const el = doc.getElementById(id) || win.CustomizableUI?.getWidget(id)?.forWindow(win)?.node;
      if (el) {
        el.setAttribute("data-vitrina-moved", "1");
        movedLeft.push({ el, parent: el.parentNode, next: el.nextSibling });
        leftFlyout.appendChild(el);
      }
    }

    controlBox.appendChild(controlBtn);
    controlBox.appendChild(leftFlyout);
    navBar.insertBefore(controlBox, navBar.firstChild);

    const toggleLeftFlyout = open => {
      if (this.alwaysShowLeft) {
        controlBox.classList.add("nav-open");
        doc.documentElement.setAttribute("left-menu-open", "true");
        return;
      }
      const isOpen = typeof open === "boolean" ? open : !controlBox.classList.contains("nav-open");
      if (isOpen) {
        controlBox.classList.add("nav-open");
        doc.documentElement.setAttribute("left-menu-open", "true");
      } else {
        controlBox.classList.remove("nav-open");
        doc.documentElement.removeAttribute("left-menu-open");
      }
    };

    // Open the left menu only on left-click
    const onControlClick = e => {
      if (e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        toggleLeftFlyout(true);
      }
    };

    const onControlContextMenu = e => {
      e.preventDefault();
      e.stopPropagation();
    };

    controlBtn.addEventListener("click", onControlClick);
    controlBtn.addEventListener("contextmenu", onControlContextMenu);

    // 2. RIGHT MENU
    const rightFlyout = doc.createXULElement ? doc.createXULElement("hbox") : doc.createElement("div");
    rightFlyout.id = "min-right-flyout";

    const movedRight = [];
    for (const id of RIGHT_WIDGET_IDS) {
      const el = doc.getElementById(id) || win.CustomizableUI?.getWidget(id)?.forWindow(win)?.node;
      if (el) {
        el.setAttribute("data-vitrina-moved", "1");
        movedRight.push({ el, parent: el.parentNode, next: el.nextSibling });
        rightFlyout.appendChild(el);
      }
    }

    const settingsBtn = doc.createXULElement ? doc.createXULElement("toolbarbutton") : doc.createElement("button");
    settingsBtn.id = "min-settings-btn";
    settingsBtn.className = "toolbarbutton-1";
    settingsBtn.setAttribute("tooltiptext", "Settings");
    const settingsIcon = doc.createXULElement ? doc.createXULElement("image") : doc.createElement("img");
    settingsIcon.className = "toolbarbutton-icon";
    const settingsSvg = "chrome://global/skin/icons/settings.svg";
    settingsIcon.setAttribute("src", settingsSvg);
    settingsIcon.style.listStyleImage = `url("${settingsSvg}")`;
    settingsBtn.appendChild(settingsIcon);
    settingsBtn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const menuBtn = doc.getElementById("PanelUI-menu-button");
      if (menuBtn) {
        menuBtn.click();
      }
    });
    rightFlyout.appendChild(settingsBtn);

    const pinnedDeck = doc.createXULElement ? doc.createXULElement("hbox") : doc.createElement("div");
    pinnedDeck.id = "min-pinned-deck";

    const panelBtn = doc.getElementById("PanelUI-button");
    if (panelBtn) {
      navBar.insertBefore(pinnedDeck, panelBtn);
      navBar.insertBefore(rightFlyout, panelBtn);
    } else {
      navBar.appendChild(pinnedDeck);
      navBar.appendChild(rightFlyout);
    }

    let rightOpen = false;
    let rightJustOpened = false;
    const toggleRightFlyout = open => {
      if (this.alwaysShowRight) {
        rightOpen = true;
        rightFlyout.classList.add("open");
        panelBtn?.classList.remove("flyout-open");
        doc.documentElement.setAttribute("right-menu-open", "true");
        return;
      }
      const wasOpen = rightOpen;
      rightOpen = typeof open === "boolean" ? open : !rightOpen;
      if (rightOpen) {
        rightFlyout.classList.add("open");
        panelBtn?.classList.add("flyout-open");
        doc.documentElement.setAttribute("right-menu-open", "true");
        if (!wasOpen) {
          // The click that opened us lands on a different target once the
          // hamburger is hidden, which would instantly re-close the flyout.
          // Ignore close attempts until the next task.
          rightJustOpened = true;
          win.setTimeout(() => { rightJustOpened = false; }, 0);
        }
      } else {
        rightFlyout.classList.remove("open");
        panelBtn?.classList.remove("flyout-open");
        doc.documentElement.removeAttribute("right-menu-open");
      }
    };

    const onPanelBtnMouseDown = e => {
      if (e.button !== 0) return;
      if (this.alwaysShowRight) return;
      if (!rightOpen) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        toggleRightFlyout(true);
      }
    };

    const onPanelBtnClick = e => {
      if (this.alwaysShowRight) return;
      // The hamburger opens the flyout, never the native app menu (the gear
      // button inside the flyout serves that). Suppress it in all cases.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };

    panelBtn?.addEventListener("mousedown", onPanelBtnMouseDown, true);
    panelBtn?.addEventListener("click", onPanelBtnClick, true);

    const appPopup = doc.getElementById("appMenu-popup") || doc.getElementById("PanelUI-popup");
    const onPopupHidden = () => toggleRightFlyout(false);
    appPopup?.addEventListener("popuphidden", onPopupHidden);

    // 3. CLOSE ON CLICK OUTSIDE (a click on the menu buttons does NOT close it!)
    const onDocClick = e => {
      if (e.target.closest?.(".searchmode-switcher-panel, #searchmode-switcher-popup, .searchmode-switcher, #urlbar, .urlbarView, #urlbar-container")) {
        return;
      }
      if (!this.alwaysShowLeft && !controlBox.contains(e.target)) {
        toggleLeftFlyout(false);
      }
      if (!this.alwaysShowRight && rightOpen && !rightJustOpened && !rightFlyout.contains(e.target) && !panelBtn?.contains(e.target)) {
        toggleRightFlyout(false);
      }
    };
    doc.addEventListener("click", onDocClick, true);

    // 4. CLOSE WHEN THE CURSOR MOVES FAR AWAY
    const onDocMouseMove = e => {
      const isLeftOpen = !this.alwaysShowLeft && controlBox.classList.contains("nav-open");
      const isRightOpen = !this.alwaysShowRight && rightOpen;
      if (!isLeftOpen && !isRightOpen) return;

      const x = e.clientX;
      const y = e.clientY;
      const closeY = cssPx(win, "--mg-close-threshold-y", FALLBACK.closeY);
      const marginX = cssPx(win, "--mg-close-margin-x", FALLBACK.closeMarginX);
      const marginNear = cssPx(win, "--mg-close-margin-x-near", FALLBACK.closeMarginXNear);

      if (y > closeY) {
        if (isLeftOpen) toggleLeftFlyout(false);
        if (isRightOpen) toggleRightFlyout(false);
        return;
      }

      if (isLeftOpen) {
        const leftRect = leftFlyout.getBoundingClientRect();
        if (x > leftRect.right + marginX || x < leftRect.left - marginNear) {
          toggleLeftFlyout(false);
        }
      }

      if (isRightOpen) {
        const rightRect = rightFlyout.getBoundingClientRect();
        const panelRect = panelBtn ? panelBtn.getBoundingClientRect() : rightRect;
        if (x < rightRect.left - marginX || x > panelRect.right + marginNear) {
          toggleRightFlyout(false);
        }
      }
    };
    doc.addEventListener("mousemove", onDocMouseMove);

    // 5. PINNED EXTENSIONS DECK
    const movedPinned = [];
    const movedPinnedSet = new Set();
    const updatePinnedExtensions = () => {
      const target = doc.getElementById("nav-bar-customization-target");
      if (!target) return;

      const extSelector = '[id*="-browser-action"], .webextension-action, .unified-extensions-item';
      const found = target.querySelectorAll(extSelector);
      for (const item of found) {
        let topEl = item;
        while (topEl.parentNode && topEl.parentNode !== target && topEl.parentNode !== pinnedDeck) {
          topEl = topEl.parentNode;
        }
        if (topEl.parentNode === target && !movedPinnedSet.has(topEl)) {
          movedPinnedSet.add(topEl);
          topEl.setAttribute("data-vitrina-moved", "1");
          movedPinned.push({ el: topEl, parent: target, next: topEl.nextSibling });
          pinnedDeck.appendChild(topEl);
        }
      }

      const count = pinnedDeck.children.length;
      const width = count * FALLBACK.pinnedBtnWidth;
      doc.documentElement.style.setProperty("--pinned-extensions-width", `${width}px`);
      if (count > 0) {
        doc.documentElement.setAttribute("has-pinned-extensions", "true");
      } else {
        doc.documentElement.removeAttribute("has-pinned-extensions");
      }
    };

    win.setTimeout(updatePinnedExtensions, 300);

    const navTarget = doc.getElementById("nav-bar-customization-target");
    let extObserver = null;
    if (navTarget && win.MutationObserver) {
      extObserver = new win.MutationObserver(() => updatePinnedExtensions());
      extObserver.observe(navTarget, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "style", "class"] });
    }

    const updateMenuOptions = (alwaysLeft, alwaysRight) => {
      if (alwaysLeft) {
        controlBox.classList.add("nav-open");
        doc.documentElement.setAttribute("left-menu-open", "true");
      } else {
        controlBox.classList.remove("nav-open");
        doc.documentElement.removeAttribute("left-menu-open");
      }

      if (alwaysRight) {
        rightOpen = true;
        rightFlyout.classList.add("open");
        panelBtn?.classList.remove("flyout-open");
        doc.documentElement.setAttribute("right-menu-open", "true");
      } else {
        rightOpen = false;
        rightFlyout.classList.remove("open");
        panelBtn?.classList.remove("flyout-open");
        doc.documentElement.removeAttribute("right-menu-open");
      }
      updatePinnedExtensions();
    };

    return {
      cleanup: () => {
        extObserver?.disconnect();
        doc.removeEventListener("click", onDocClick, true);
        doc.removeEventListener("mousemove", onDocMouseMove);
        controlBtn.removeEventListener("click", onControlClick);
        controlBtn.removeEventListener("contextmenu", onControlContextMenu);
        panelBtn?.removeEventListener("mousedown", onPanelBtnMouseDown, true);
        panelBtn?.removeEventListener("click", onPanelBtnClick, true);
        appPopup?.removeEventListener("popuphidden", onPopupHidden);

        for (const { el, parent, next } of movedLeft) {
          el.removeAttribute("data-vitrina-moved");
          if (parent) parent.insertBefore(el, next);
        }
        for (const { el, parent, next } of movedRight) {
          el.removeAttribute("data-vitrina-moved");
          if (parent) parent.insertBefore(el, next);
        }
        for (const { el, parent, next } of movedPinned) {
          el.removeAttribute("data-vitrina-moved");
          if (parent) parent.insertBefore(el, next);
        }

        // Remove the flyout-open class the right flyout may have left behind (P1.2).
        panelBtn?.classList.remove("flyout-open");

        controlBox.remove();
        rightFlyout.remove();
        pinnedDeck.remove();
        doc.documentElement.removeAttribute("always-show-left-menu");
        doc.documentElement.removeAttribute("always-show-right-menu");
        doc.documentElement.removeAttribute("left-menu-open");
        doc.documentElement.removeAttribute("right-menu-open");
        doc.documentElement.removeAttribute("has-pinned-extensions");
        doc.documentElement.style.removeProperty("--pinned-extensions-width");
      },
      updateMenuOptions,
    };
  }

  setupWindow(win) {
    if (!win.gBrowser || this.windows.has(win)) {
      return;
    }
    this.ensureWidgets(win);
    const { cleanup: removeMenus, updateMenuOptions } = this.setupMenus(win);
    const utils = win.windowUtils;
    const strip = win.gBrowser.tabContainer;
    const state = { sheet: this.sheetURL(this.theme), updateMenuOptions };
    utils.loadSheetUsingURIString(state.sheet, utils.USER_SHEET);
    if (this.alwaysShowLeft || this.alwaysShowRight) {
      updateMenuOptions(this.alwaysShowLeft, this.alwaysShowRight);
    }

    // Clicking the already-active tab focuses the URL bar (Min behavior).
    // On mousedown the tab has not switched yet, so we remember its state.
    let wasSelected = false;
    const onMouseDown = e => {
      const tab = e.button === 0 ? e.target.closest?.(".tabbrowser-tab") : null;
      wasSelected = !!tab?.selected;
    };
    const onClick = e => {
      if (e.button !== 0 || !wasSelected) {
        return;
      }
      wasSelected = false;
      if (e.target.closest?.(".tab-close-button, .tab-icon-overlay, .tab-audio-button")) {
        return;
      }
      if (e.target.closest?.(".tabbrowser-tab")?.selected) {
        // After the tab's own handlers, so the focus is not stolen.
        win.setTimeout(() => win.gURLBar.select(), 0);
      }
    };
    const onTabSelect = () => this.refresh(win);

    // In-tab navigation — recompute the accent color.
    const progressListener = {
      onLocationChange: (webProgress, _request, _location, flags) => {
        if (webProgress.isTopLevel && !(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT)) {
          this.refresh(win);
        }
      },
      QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener", "nsISupportsWeakReference"]),
    };

    const onUnload = () => this.windows.delete(win);

    strip.addEventListener("mousedown", onMouseDown, true);
    strip.addEventListener("click", onClick);
    strip.addEventListener("TabSelect", onTabSelect);
    win.gBrowser.addProgressListener(progressListener);
    win.addEventListener("unload", onUnload, { once: true });

    state.cleanup = () => {
      removeMenus();
      strip.removeEventListener("mousedown", onMouseDown, true);
      strip.removeEventListener("click", onClick);
      strip.removeEventListener("TabSelect", onTabSelect);
      win.gBrowser.removeProgressListener(progressListener);
      win.removeEventListener("unload", onUnload);
      utils.removeSheetUsingURIString(state.sheet, utils.USER_SHEET);
      win.document.documentElement.style.removeProperty("--site-accent");
    };

    this.windows.set(win, state);
    this.refresh(win);
  }

  /* Color from <meta name="theme-color">, sent by the content script. */
  setTabColor(tabId, color) {
    let nativeTab;
    try {
      nativeTab = this.extension.tabManager.get(tabId).nativeTab;
    } catch (_) {
      return;
    }
    const win = nativeTab.ownerGlobal;
    const valid = color && color.length < 64 && win.CSS.supports("color", color);
    nativeTab._vitrinaColor = valid ? color : "";
    // Remember the domain so a stale color is not applied on navigation.
    nativeTab._vitrinaHost = hostOf(nativeTab.linkedBrowser?.currentURI);
    if (nativeTab.selected && this.windows.has(win)) {
      this.refresh(win);
    }
  }

  refresh(win) {
    try {
      const tab = win.gBrowser.selectedTab;
      const uri = win.gBrowser.selectedBrowser?.currentURI || tab?.linkedBrowser?.currentURI;
      const spec = uri?.spec || "";

      // Hide the bookmark star on the home page and about:* internal tabs
      const starBox = win.document.getElementById("star-button-box");
      if (starBox) {
        if (spec.startsWith("about:") || !spec) {
          starBox.style.setProperty("display", "none", "important");
        } else {
          starBox.style.removeProperty("display");
        }
      }

      const host = hostOf(uri);
      const own = tab?._vitrinaColor && tab?._vitrinaHost === host ? tab._vitrinaColor : "";
      const color = own || domainColor(host) || DEFAULT_ACCENT;
      win.document.documentElement.style.setProperty("--site-accent", color);
    } catch (e) {
      console.error("[Vitrina] refresh failed:", e);
    }
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown || !this.started) {
      return;
    }
    Services.obs.removeObserver(this.windowObserver, "browser-delayed-startup-finished");
    for (const state of this.windows.values()) {
      state.cleanup();
    }
    this.windows.clear();
    this.chromeHandle.destruct();
    this.chromeHandle = null;
    // Otherwise Firefox may serve stale CSS from cache after an update.
    Services.obs.notifyObservers(null, "startupcache-invalidate");
  }
};
