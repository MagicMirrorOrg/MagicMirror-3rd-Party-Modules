import { describe, it } from "node:test";
import { Window } from "happy-dom";
import assert from "node:assert/strict";

const window = new Window({ url: "https://example.com/index.html" });
globalThis.window = window;
globalThis.document = window.document;
window.marked = { parseInline: text => text };

document.body.innerHTML = `
  <nav id="nav-menu"><a id="nav-toggler"></a><a id="close-menu"></a></nav>
  <header></header>
  <input id="dark-mode" type="checkbox" />
  <input id="show-outdated" type="checkbox" checked />
  <input id="search-input" />
  <select id="sort-dropdown">
    <option value="default">Default</option>
    <option value="stars">Stars</option>
    <option value="name">Name</option>
  </select>
  <select id="category-filter"><option value="all">All</option></select>
  <div id="tag-buttons"></div>
  <button id="reset-button"></button>
  <div id="module-count-value"></div>
  <div id="last-update"></div>
  <main id="module-container"></main>
  <template id="card-template">
    <article class="card">
      <a class="name"></a>
      <div class="description"></div>
      <div class="maintainer"></div>
      <div class="stars"></div>
      <div class="tags"></div>
      <div class="img-container"><img /><div class="overlay"><img /></div></div>
      <div class="info">
        <div class="container issues"><a class="text"></a></div>
        <div class="container commit"><a class="text"></a></div>
        <div class="container license"><a class="text"></a></div>
      </div>
      <div class="outdated-note"></div>
    </article>
  </template>
`;

const modules = [
  {
    name: "MMM-Alpha",
    maintainer: "Alice",
    url: "https://example.com/alpha",
    description: "Weather module",
    category: "weather",
    tags: ["weather"],
    stars: 5,
    lastCommit: "2026-01-01T00:00:00.000Z",
    defaultSortWeight: 1
  },
  {
    name: "MMM-Beta",
    maintainer: "Bob",
    url: "https://example.com/beta",
    description: "Calendar module",
    category: "calendar",
    tags: ["calendar"],
    stars: 10,
    lastCommit: "2026-02-01T00:00:00.000Z",
    defaultSortWeight: 2
  }
];

const skippedModules = [{ name: "MMM-Skipped", error: "Load failed" }];
globalThis.fetch = (url) => {
  const responses = {
    "data/modules.min.json": { modules },
    "data/skipped_modules.json": skippedModules,
    "data/stats.json": { lastUpdate: "2026-03-01T00:00:00.000Z" }
  };
  return { json: () => Promise.resolve(responses[url]) };
};

await import("../../../website/script.js");
await new Promise((resolve) => {
  setTimeout(resolve, 0);
});

function cardNames() {
  return [...document.querySelectorAll("#module-container .name")]
    .map(card => card.textContent);
}

describe("website module catalogue", () => {
  it("loads modules and renders categories", () => {
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta", "MMM-Skipped"]);
    assert.ok(document.querySelector("#category-filter option[value=weather]"));
    assert.equal(document.getElementById("module-count-value").textContent, "3 of 3");
  });

  it("sorts modules by stars", () => {
    const sortDropdown = document.getElementById("sort-dropdown");
    sortDropdown.value = "stars";
    sortDropdown.dispatchEvent(new window.Event("change"));

    assert.deepEqual(cardNames(), ["MMM-Beta", "MMM-Alpha", "MMM-Skipped"]);
  });

  it("filters by category and resets the catalogue", () => {
    const categoryFilter = document.getElementById("category-filter");
    categoryFilter.value = "weather";
    categoryFilter.dispatchEvent(new window.Event("change"));
    assert.deepEqual(cardNames(), ["MMM-Alpha"]);

    document.getElementById("reset-button").click();
    assert.deepEqual(cardNames(), ["MMM-Alpha", "MMM-Beta", "MMM-Skipped"]);
  });
});
