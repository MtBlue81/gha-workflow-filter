import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyFilter,
  createFilterUI,
  fetchAllWorkflows,
  getVisibleWorkflowLinks,
  insertFilterUI,
  isActionsPage,
  resetState,
} from "../src/core.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const actionsPageHtml = readFileSync(
  resolve(fixturesDir, "actions-page.html"),
  "utf-8",
);
const page2Html = readFileSync(resolve(fixturesDir, "page-2.html"), "utf-8");

function setupDOM(html) {
  document.body.innerHTML = html;
}

function setLocation(pathname) {
  window.history.replaceState(null, "", pathname);
}

beforeEach(() => {
  resetState();
  document.body.innerHTML = "";
  setLocation("/owner/repo/actions");
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- applyFilter ---

describe("applyFilter", () => {
  beforeEach(() => {
    setupDOM(actionsPageHtml);
  });

  it("空クエリで全ワークフロー表示", () => {
    applyFilter("");
    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    for (const item of items) {
      expect(item.classList.contains("ghawf-hidden")).toBe(false);
    }
  });

  it("部分一致でフィルタ", () => {
    applyFilter("build");
    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    const visible = Array.from(items).filter(
      (i) => !i.classList.contains("ghawf-hidden"),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain("CI Build");
  });

  it("大文字小文字を無視", () => {
    applyFilter("CI BUILD");
    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    const visible = Array.from(items).filter(
      (i) => !i.classList.contains("ghawf-hidden"),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain("CI Build");
  });

  it("マッチなしで全非表示", () => {
    applyFilter("nonexistent");
    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    const visible = Array.from(items).filter(
      (i) => !i.classList.contains("ghawf-hidden"),
    );
    expect(visible).toHaveLength(0);
  });

  it("フィルタ解除で全復元", () => {
    applyFilter("build");
    applyFilter("");
    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    for (const item of items) {
      expect(item.classList.contains("ghawf-hidden")).toBe(false);
    }
  });
});

// --- fetchAllWorkflows ---

describe("fetchAllWorkflows", () => {
  beforeEach(() => {
    setupDOM(actionsPageHtml);
  });

  it("showMore なしで何もしない", async () => {
    // showMore 要素を除去
    const showMore = document.querySelector(
      '[data-target="nav-list-group.showMoreItem"]',
    );
    showMore.remove();

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await fetchAllWorkflows();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("正常系で items 追加", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(page2Html),
    });

    await fetchAllWorkflows();

    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    expect(items).toHaveLength(5); // 元3件 + 新2件
    expect(items[3].textContent).toContain("Release");
    expect(items[4].textContent).toContain("Security Scan");
  });

  it("fetch 失敗時はログ出力のみ", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: () => Promise.resolve(""),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await fetchAllWorkflows();

    expect(warnSpy).toHaveBeenCalled();
    // 元の3件のまま
    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    expect(items).toHaveLength(3);
  });

  it("完了後 showMore が hidden", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(page2Html),
    });

    await fetchAllWorkflows();

    const showMore = document.querySelector(
      '[data-target="nav-list-group.showMoreItem"]',
    );
    expect(showMore.hidden).toBe(true);
  });
});

// --- isActionsPage ---

describe("isActionsPage", () => {
  it("/owner/repo/actions → true", () => {
    setLocation("/owner/repo/actions");
    expect(isActionsPage()).toBe(true);
  });

  it("/owner/repo/actions/ → true", () => {
    setLocation("/owner/repo/actions/");
    expect(isActionsPage()).toBe(true);
  });

  it("/owner/repo/actions/workflows/ci.yml → true", () => {
    setLocation("/owner/repo/actions/workflows/ci.yml");
    expect(isActionsPage()).toBe(true);
  });

  it("/owner/repo/pulls → false", () => {
    setLocation("/owner/repo/pulls");
    expect(isActionsPage()).toBe(false);
  });

  it("/actions → false", () => {
    setLocation("/actions");
    expect(isActionsPage()).toBe(false);
  });
});

// --- insertFilterUI ---

describe("insertFilterUI", () => {
  beforeEach(() => {
    setupDOM(actionsPageHtml);
  });

  it("nav にフィルタ UI 挿入", () => {
    insertFilterUI();
    const input = document.querySelector("#ghawf-filter-input");
    expect(input).not.toBeNull();
  });

  it("2回呼んでも重複しない", () => {
    insertFilterUI();
    insertFilterUI();
    const inputs = document.querySelectorAll("#ghawf-filter-input");
    expect(inputs).toHaveLength(1);
  });
});

// --- getVisibleWorkflowLinks ---

describe("getVisibleWorkflowLinks", () => {
  beforeEach(() => {
    setupDOM(actionsPageHtml);
  });

  it("全表示時は全リンク", () => {
    const links = getVisibleWorkflowLinks();
    expect(links).toHaveLength(3);
  });

  it("一部 hidden 時は除外", () => {
    applyFilter("build");
    const links = getVisibleWorkflowLinks();
    expect(links).toHaveLength(1);
  });
});

// --- createFilterUI ---

describe("createFilterUI", () => {
  beforeEach(() => {
    setupDOM(actionsPageHtml);
  });

  it("input イベントでフィルタ発火", () => {
    const ui = createFilterUI();
    document.querySelector('nav[aria-label="Actions Workflows"]').prepend(ui);

    const input = ui.querySelector("#ghawf-filter-input");
    input.value = "deploy";
    input.dispatchEvent(new Event("input"));

    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    const visible = Array.from(items).filter(
      (i) => !i.classList.contains("ghawf-hidden"),
    );
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toContain("Deploy Production");
  });

  it("Escape で入力クリア", () => {
    const ui = createFilterUI();
    document.querySelector('nav[aria-label="Actions Workflows"]').prepend(ui);

    const input = ui.querySelector("#ghawf-filter-input");
    input.value = "deploy";
    input.dispatchEvent(new Event("input"));

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(input.value).toBe("");
    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    for (const item of items) {
      expect(item.classList.contains("ghawf-hidden")).toBe(false);
    }
  });

  it("クリアボタン動作", () => {
    const ui = createFilterUI();
    document.querySelector('nav[aria-label="Actions Workflows"]').prepend(ui);

    const input = ui.querySelector("#ghawf-filter-input");
    const clearBtn = ui.querySelector(".ghawf-filter-clear");

    input.value = "lint";
    input.dispatchEvent(new Event("input"));

    clearBtn.click();

    expect(input.value).toBe("");
    const items = document.querySelectorAll(
      'li[data-test-selector="workflow-rendered"]',
    );
    for (const item of items) {
      expect(item.classList.contains("ghawf-hidden")).toBe(false);
    }
  });
});
