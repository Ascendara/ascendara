// WebView2 shows the hovered link's URL in a status bubble at the bottom of
// the window, and Electrobun does not expose IsStatusBarEnabled to turn it off.
// The bubble only follows anchors that have an href, so a hovered link keeps
// its target in a data attribute and gets it back just before a click.

const PARKED = "data-ascendara-href";

function parkedLink(target) {
  return target instanceof Element ? target.closest(`a[href], a[${PARKED}]`) : null;
}

function park(link) {
  if (!link.hasAttribute("href")) return;
  link.setAttribute(PARKED, link.getAttribute("href"));
  link.removeAttribute("href");
}

function restore(link) {
  if (!link.hasAttribute(PARKED)) return;
  link.setAttribute("href", link.getAttribute(PARKED));
  link.removeAttribute(PARKED);
}

export function hideLinkStatus() {
  document.addEventListener(
    "mouseover",
    event => {
      const link = parkedLink(event.target);
      if (link) park(link);
    },
    true
  );
  document.addEventListener(
    "mouseout",
    event => {
      const link = parkedLink(event.target);
      if (link && !link.contains(event.relatedTarget)) restore(link);
    },
    true
  );
  // Capture runs before the browser's default action, so navigation, routers
  // and new-tab clicks all see the real href. Park it again afterwards.
  for (const type of ["click", "auxclick", "contextmenu", "dragstart"]) {
    document.addEventListener(
      type,
      event => {
        const link = parkedLink(event.target);
        if (!link || !link.hasAttribute(PARKED)) return;
        restore(link);
        setTimeout(() => {
          if (link.matches(":hover")) park(link);
        });
      },
      true
    );
  }
  // Parked anchors lose the pointer cursor browsers give real links.
  const style = document.createElement("style");
  style.textContent = `a[${PARKED}] { cursor: pointer; }`;
  (document.head || document.documentElement).appendChild(style);
}
