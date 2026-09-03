import { describe, it, mock } from "node:test";
import { Window } from "happy-dom";
import assert from "node:assert/strict";

const window = new Window();
globalThis.window = window;
globalThis.document = window.document;
window.marked = { parseInline: text => text };

document.body.innerHTML = `
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

const { createCard } = await import("../../../website/card.js");

const callbacks = {
  filterByMaintainer: mock.fn(),
  filterByTag: mock.fn()
};

describe("createCard", () => {
  it("renders skipped-module errors as text", () => {
    const payload = "<img src=x onerror=alert(1)>";
    const card = createCard({ skipped: true, error: payload }, callbacks);
    const description = card.querySelector(".description");

    assert.equal(description.querySelector("img"), null);
    assert.ok(description.textContent.includes(payload));
  });

  it("renders outdated notices as text", () => {
    const payload = "<img src=x onerror=alert(1)>";
    const card = createCard({
      name: "Test module",
      maintainer: "Test maintainer",
      url: "https://example.com",
      outdated: payload
    }, callbacks);
    const notice = card.querySelector(".outdated-note");

    assert.equal(notice.querySelector("img"), null);
    assert.equal(notice.textContent, payload);
  });
});
