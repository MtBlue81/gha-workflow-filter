const SELECTORS = {
  nav: 'nav[aria-label="Actions Workflows"]',
  workflowItem: 'li[data-test-selector="workflow-rendered"]',
  label: ".ActionListItem-label",
  showMore: '[data-target="nav-list-group.showMoreItem"]',
};

const SVG_NS = "http://www.w3.org/2000/svg";
const FILTER_ID = "ghawf-filter-input";

let isProcessing = false;
let setupScheduled = false;

export function resetState() {
  isProcessing = false;
  setupScheduled = false;
}

export function isActionsPage() {
  return /^\/[^/]+\/[^/]+\/actions(\/|$)/.test(location.pathname);
}

function findNav() {
  return document.querySelector(SELECTORS.nav);
}

function findWorkflowList() {
  const nav = findNav();
  if (!nav) return null;
  const items = nav.querySelectorAll(SELECTORS.workflowItem);
  if (items.length === 0) return null;
  return items[0].closest("ul");
}

// --- SVG icon helpers ---

function createSvg(viewBox, pathD) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", viewBox);
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  return svg;
}

function createSearchIcon() {
  return createSvg(
    "0 0 16 16",
    "M10.68 11.74a6 6 0 0 1-7.922-8.982 6 6 0 0 1 8.982 7.922l3.04 3.04a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215ZM11.5 7a4.499 4.499 0 1 0-8.997 0A4.499 4.499 0 0 0 11.5 7Z",
  );
}

function createClearIcon() {
  return createSvg(
    "0 0 16 16",
    "M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z",
  );
}

// --- Pagination: fetch all remaining workflows ---

export async function fetchAllWorkflows() {
  const nav = findNav();
  if (!nav) return;

  const showMoreEl = nav.querySelector(SELECTORS.showMore);
  if (!showMoreEl) return;

  const totalPages = parseInt(showMoreEl.getAttribute("data-total-pages"), 10);
  const currentPage = parseInt(
    showMoreEl.getAttribute("data-current-page"),
    10,
  );
  if (!totalPages || totalPages <= currentPage) return;

  const baseSrc = showMoreEl.getAttribute("src");
  if (!baseSrc) return;

  const ul = findWorkflowList();
  if (!ul) return;

  const pages = [];
  for (let page = currentPage + 1; page <= totalPages; page++) {
    pages.push(page);
  }

  const responses = await Promise.all(
    pages.map((page) => {
      const url = new URL(baseSrc, location.origin);
      url.searchParams.set("page", page);
      return fetch(url.href, {
        headers: { Accept: "text/html" },
        credentials: "include",
      })
        .then((r) => {
          if (!r.ok) {
            console.warn(
              `[GHA Workflow Filter] Failed to fetch page ${page}: ${r.status} ${r.statusText}`,
            );
            return "";
          }
          return r.text();
        })
        .catch((err) => {
          console.warn(
            `[GHA Workflow Filter] Network error fetching page ${page}:`,
            err,
          );
          return "";
        });
    }),
  );

  const parser = new DOMParser();
  for (const html of responses) {
    if (!html) continue;
    const doc = parser.parseFromString(html, "text/html");
    const items = doc.querySelectorAll(SELECTORS.workflowItem);
    for (const item of items) {
      ul.appendChild(document.adoptNode(item));
    }
  }

  showMoreEl.hidden = true;
}

// --- Filter UI ---

export function createFilterUI() {
  const container = document.createElement("div");
  container.className = "ghawf-filter-container";

  const wrapper = document.createElement("div");
  wrapper.className = "ghawf-filter-input-wrapper";

  // Search icon
  const iconSpan = document.createElement("span");
  iconSpan.className = "ghawf-filter-icon";
  iconSpan.appendChild(createSearchIcon());

  // Text input
  const input = document.createElement("input");
  input.type = "text";
  input.id = FILTER_ID;
  input.className = "ghawf-filter-input";
  input.placeholder = "Filter workflows\u2026";
  input.autocomplete = "off";
  input.spellcheck = false;

  // Clear button
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "ghawf-filter-clear";
  clearBtn.title = "Clear filter";
  clearBtn.appendChild(createClearIcon());

  // Events
  input.addEventListener("input", () => {
    applyFilter(input.value);
    clearBtn.classList.toggle("ghawf-visible", input.value.length > 0);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      applyFilter("");
      clearBtn.classList.remove("ghawf-visible");
      input.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const links = getVisibleWorkflowLinks();
      if (links.length > 0) links[0].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const links = getVisibleWorkflowLinks();
      if (links.length > 0) links[links.length - 1].focus();
    }
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    applyFilter("");
    clearBtn.classList.remove("ghawf-visible");
    input.focus();
  });

  wrapper.appendChild(iconSpan);
  wrapper.appendChild(input);
  wrapper.appendChild(clearBtn);
  container.appendChild(wrapper);

  return container;
}

export function insertFilterUI() {
  const nav = findNav();
  if (!nav) return;

  // Don't insert if already present
  if (nav.querySelector(`#${FILTER_ID}`)) return;

  const filterUI = createFilterUI();
  nav.insertBefore(filterUI, nav.firstChild);

  nav.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;

    const link = e.target.closest("a");
    if (!link) return;

    const links = getVisibleWorkflowLinks();
    const index = links.indexOf(link);
    if (index === -1) return;

    e.preventDefault();
    if (e.key === "ArrowDown") {
      if (index < links.length - 1) links[index + 1].focus();
    } else {
      if (index === 0) {
        nav.querySelector(`#${FILTER_ID}`)?.focus();
      } else {
        links[index - 1].focus();
      }
    }
  });
}

// --- Keyboard navigation helpers ---

export function getVisibleWorkflowLinks() {
  const nav = findNav();
  if (!nav) return [];
  return Array.from(
    nav.querySelectorAll(`${SELECTORS.workflowItem}:not(.ghawf-hidden) a`),
  );
}

// --- Filter logic ---

export function applyFilter(query) {
  const nav = findNav();
  if (!nav) return;

  const items = nav.querySelectorAll(SELECTORS.workflowItem);
  const q = query.toLowerCase().trim();

  items.forEach((item) => {
    if (!q) {
      item.classList.remove("ghawf-hidden");
      return;
    }
    const label = item.querySelector(SELECTORS.label);
    const name = label ? label.textContent.trim().toLowerCase() : "";
    item.classList.toggle("ghawf-hidden", !name.includes(q));
  });
}

// --- Main orchestration ---

function scheduleSetup() {
  if (setupScheduled || isProcessing) return;
  setupScheduled = true;
  requestAnimationFrame(() => {
    setupScheduled = false;
    setup();
  });
}

async function setup() {
  if (!isActionsPage()) return;
  if (isProcessing) return;
  isProcessing = true;

  try {
    await fetchAllWorkflows();
    insertFilterUI();
  } finally {
    isProcessing = false;
  }
}

// --- SPA navigation support ---

function setupObserver() {
  const observer = new MutationObserver((mutations) => {
    if (!isActionsPage() || isProcessing) return;

    for (const mutation of mutations) {
      if (mutation.type !== "childList" || mutation.addedNodes.length === 0)
        continue;

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        if (
          node.matches?.(SELECTORS.nav) ||
          node.querySelector?.(SELECTORS.nav)
        ) {
          scheduleSetup();
          return;
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("pagehide", () => observer.disconnect(), {
    once: true,
  });
}

// --- Entry point ---

export function init() {
  setup();
  setupObserver();

  document.addEventListener("turbo:load", () => scheduleSetup());
  document.addEventListener("turbo:frame-render", () => scheduleSetup());
}
