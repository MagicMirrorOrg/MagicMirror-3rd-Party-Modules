import createDOMPurify from "./vendor/dompurify.mjs";

const cardTemplate = document.getElementById("card-template");
const DOMPurify = createDOMPurify(window);

function renderDescription(description) {
  if (typeof window.marked?.parseInline !== "function") {
    return description || "";
  }

  const rendered = window.marked.parseInline(description || "");
  return DOMPurify.sanitize(rendered);
}

export function createCard(moduleData, { filterByMaintainer, filterByTag }) {
  const card = document.importNode(cardTemplate.content, true);

  if (moduleData.skipped) {
    card.querySelector(".card").classList.add("skipped");
    card.querySelector(".name").textContent = moduleData.name || "Unknown Module";
    card.querySelector(".name").href = moduleData.url || "#";
    card.querySelector(".description").textContent
      = `Error: Module could not be loaded. ${moduleData.error || "Unknown Error"}`;
    card.querySelector(".maintainer").textContent = moduleData.maintainer || "?";
    [".stars", ".tags", ".img-container", ".info", ".outdated-note"].forEach((selector) => {
      const element = card.querySelector(selector);
      if (element) {
        element.remove();
      }
    });
    return card;
  }

  card.querySelector(".name").href = moduleData.url;
  card.querySelector(".name").textContent = moduleData.name;

  const maintainerContainer = card.querySelector(".maintainer");
  maintainerContainer.textContent = `${moduleData.maintainer}`;
  maintainerContainer.addEventListener("click", () => {
    filterByMaintainer(moduleData.maintainer);
  });

  if (typeof moduleData.stars === "undefined") {
    card.querySelector(".stars").remove();
  }
  else {
    card.querySelector(".stars").textContent = `${moduleData.stars} stars`;
  }

  if (moduleData.tags) {
    moduleData.tags.forEach((tag) => {
      const tagElement = document.createElement("div");
      tagElement.setAttribute("data-tag", tag);
      tagElement.textContent = tag;

      tagElement.addEventListener("click", () => {
        filterByTag(tag);
      });

      card.querySelector(".tags").appendChild(tagElement);
    });
  }
  else {
    card.querySelector(".tags").remove();
  }

  const description = card.querySelector(".description");
  description.innerHTML = renderDescription(moduleData.description);
  description.querySelectorAll("a").forEach((link) => {
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });

  if (moduleData.image) {
    const imagePath = `./images/${moduleData.image}`;
    const image = card.querySelector(".img-container img");
    image.src = imagePath;
    image.alt = `${moduleData.name} image`;

    const overlay = image.nextElementSibling;
    image.onclick = () => {
      // Move overlay to body to escape card's overflow/containment
      document.body.appendChild(overlay);
      overlay.style.display = "flex";
      overlay.getElementsByTagName("img")[0].src = image.src;
    };

    overlay.onclick = () => {
      overlay.style.display = "none";
      // Move overlay back to its original position
      image.parentElement.appendChild(overlay);
    };
  }
  else {
    card.querySelector(".img-container").remove();
  }

  const license = card.querySelector(".info .container.license .text");
  license.href = `${moduleData.url}`;
  if (moduleData.license) {
    license.textContent = `©${moduleData.license}`;
  }
  else {
    license.style.color = "red";
    license.textContent = "unknown";
  }

  if (moduleData.lastCommit) {
    const commit = card.querySelector(".info .container.commit .text");
    commit.href = `${moduleData.url}/commits/`;
    commit.textContent = `${moduleData.lastCommit.split("T")[0]}`;
  }
  else {
    card.querySelector(".info .container.commit").remove();
  }

  if (moduleData.issues) {
    const moduleSlug = `${moduleData.name}-by-${moduleData.maintainer.replaceAll(" ", "-").replaceAll("&", "").replaceAll("/", "")}`;
    const url = `result.html?module=${encodeURIComponent(moduleSlug)}#${moduleSlug}`;
    const issuesLink = card.querySelector(".info .container.issues .text");
    issuesLink.href = url;
    issuesLink.target = "_self";
  }
  else {
    card.querySelector(".info .container.issues").remove();
  }

  if (moduleData.outdated) {
    card.querySelector(".card").classList.add("outdated");
    card.querySelector(".outdated-note").textContent = moduleData.outdated;
  }
  else {
    card.querySelector(".outdated-note").remove();
  }

  return card;
}
