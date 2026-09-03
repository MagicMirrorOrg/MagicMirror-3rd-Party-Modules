import { createCard } from "./card.js?v=__ASSET_VERSION__";

let allModules = [];
let skippedModules = [];
let filteredModuleList = [];
const resetButton = document.getElementById("reset-button");
const moduleCardContainer = document.getElementById("module-container");
const searchInput = document.getElementById("search-input");
const tagButtonContainer = document.getElementById("tag-buttons");
const sortDropdown = document.getElementById("sort-dropdown");
const showOutdated = document.getElementById("show-outdated");
const darkMode = document.getElementById("dark-mode");

const tagsList = [
  "calendar",
  "media",
  "motion detection",
  "news",
  "public transport",
  "smart home",
  "sports",
  "stock",
  "text-to-speech",
  "traffic",
  "voice control",
  "weather"
];

function toggleMenu() {
  const navMenu = document.getElementById("nav-menu");
  navMenu.classList.toggle("visible");
}

function updateModuleCardContainer() {
  moduleCardContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();

  let moduleCounter = filteredModuleList.length;

  filteredModuleList.forEach((moduleData) => {
    if ((!moduleData.outdated || showOutdated.checked) && (!moduleData.skipped || showOutdated.checked)) {
      try {
        const cardNode = createCard(moduleData, { filterByMaintainer, filterByTag });
        if (cardNode) {
          fragment.appendChild(cardNode);
        }
      }
      catch (error) {
        console.error("Error creating module", moduleData, error);
      }
    }
    else {
      moduleCounter -= 1;
    }
  });

  moduleCardContainer.appendChild(fragment);

  const moduleCountElement = document.getElementById("module-count-value");
  const totalModules = allModules.length + (showOutdated.checked ? skippedModules.length : 0);
  moduleCountElement.textContent = `${moduleCounter} of ${totalModules}`;

  if (moduleCounter === totalModules) {
    resetButton.style.display = "none";
  }
  else {
    resetButton.style.display = "block";
  }

  const navMenu = document.getElementById("nav-menu");
  if (navMenu.classList.contains("visible")) {
    toggleMenu();
  }
}

function sortData(sortOption) {
  switch (sortOption) {
    case "lastcommit":
      filteredModuleList.sort((a, b) =>
        b.lastCommit.localeCompare(a.lastCommit));
      break;
    case "stars":
      filteredModuleList.sort((a, b) => {
        const starsA = a.stars || 0;
        const starsB = b.stars || 0;
        return starsB - starsA;
      });
      break;
    case "name":
      filteredModuleList.sort((a, b) => {
        const nameA = a.name.replace("MMM-", "");
        const nameB = b.name.replace("MMM-", "");
        return nameA.localeCompare(nameB);
      });
      break;
    default:
      filteredModuleList.sort((a, b) =>
        // Sort by defaultSortWeight (outdated at the end, rest by issue count)
        a.defaultSortWeight - b.defaultSortWeight
        // Sort by last commit date
        || b.lastCommit.localeCompare(a.lastCommit));
  }
}

function displayTagButtonContainer() {
  tagButtonContainer.innerHTML = "";

  tagsList.forEach((tag) => {
    const button = document.createElement("a");
    button.className = "tag-button";
    button.textContent = tag;
    button.setAttribute("data-tag", tag);

    button.addEventListener("click", () => {
      filterByTag(tag);
      resetCategoryFilter();
    });
    tagButtonContainer.appendChild(button);
  });
}

function resetCategoryFilter() {
  const categoryFilter = document.getElementById("category-filter");
  categoryFilter.value = "all";
}

function removeSelectedMarkingFromTagsAndCards() {
  // Remove the "selected" class from all tag buttons and cards
  const allURLs = document.querySelectorAll(".tag-button, .card");
  allURLs.forEach(url => url.classList.remove("selected"));
}

function displayStatistics(data) {
  const lastUpdateDate = new Date(data.lastUpdate).toLocaleString();
  const lastUpdateDiv = document.getElementById("last-update");
  lastUpdateDiv.textContent = `Last Update: ${lastUpdateDate}`;
}

function filterBySearchText(searchText) {
  const searchLower = searchText.toLowerCase();
  const allModulesList = allModules.concat(skippedModules);
  filteredModuleList = allModulesList.filter((card) => {
    const cardText = card.text
      ? card.text.toLowerCase()
      : "";
    const cardDescription = card.description
      ? card.description.toLowerCase()
      : "";
    const cardName = card.name
      ? card.name.toLowerCase()
      : "";
    const cardMaintainer = card.maintainer
      ? card.maintainer.toLowerCase()
      : "";
    const cardTags = card.tags
      ? card.tags
      : [];

    return (
      cardText.includes(searchLower)
      || cardDescription.includes(searchLower)
      || cardName.includes(searchLower)
      || cardMaintainer.includes(searchLower)
      || cardTags.some(tag => tag.toLowerCase().includes(searchLower))
    );
  });

  removeSelectedMarkingFromTagsAndCards();

  sortData(sortDropdown.value);
  updateModuleCardContainer();
}

function filterByMaintainer(maintainer) {
  filteredModuleList = allModules.filter(card => card.maintainer === maintainer);

  searchInput.value = "";

  removeSelectedMarkingFromTagsAndCards();

  sortData(sortDropdown.value);
  updateModuleCardContainer();
}

function filterByTag(tag) {
  filteredModuleList = allModules.filter((card) => {
    const tags = card.tags;
    if (tags) {
      return tags.includes(tag);
    }
    return false;
  });

  searchInput.value = "";

  removeSelectedMarkingFromTagsAndCards();

  sortData(sortDropdown.value);
  updateModuleCardContainer();

  const selectedTagContainers = document.querySelectorAll(`[data-tag="${tag}"]`);
  selectedTagContainers.forEach((container) => {
    container.classList.add("selected");
  });
}

function addCategoryFilter() {
  const categoryFilter = document.getElementById("category-filter");
  const categories = [...new Set(allModules.map(module => module.category))];
  categories.sort();
  categories.push("Problematic Modules");

  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });

  categoryFilter.addEventListener("change", () => {
    const selectedCategory = categoryFilter.value;
    if (selectedCategory === "all") {
      filteredModuleList = allModules.concat(skippedModules);
    }
    else if (selectedCategory === "Problematic Modules") {
      filteredModuleList = skippedModules;
    }
    else {
      filteredModuleList = allModules.filter(module => module.category === selectedCategory);
    }

    searchInput.value = "";
    removeSelectedMarkingFromTagsAndCards();
    sortData(sortDropdown.value);
    updateModuleCardContainer();
  });
}

moduleCardContainer.addEventListener("click", (event) => {
  const clickedCard = event.target.closest(".card");
  if (clickedCard) {
    const allCards = document.querySelectorAll(".card");
    allCards.forEach(card => card.classList.remove("selected"));

    clickedCard.classList.add("selected");
  }
});

resetButton.addEventListener("click", () => {
  resetCategoryFilter();
  const root = document.querySelector(":root");
  filteredModuleList = allModules.concat(skippedModules);
  searchInput.value = "";
  showOutdated.checked = true;
  removeSelectedMarkingFromTagsAndCards();
  sortDropdown.value = "default";
  sortData(sortDropdown.value);
  root.style.setProperty("--color-accent-header", "var(--color-background)");
  root.style.setProperty("--color-accent-light", "#ebf8ff");
  root.style.setProperty("--color-accent-dark", "#033454");
  updateModuleCardContainer();
});

let searchDebounceTimer = null;
searchInput.addEventListener("input", () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = setTimeout(() => {
    if (searchInput.value) {
      filterBySearchText(searchInput.value);
    }
    else {
      filteredModuleList = allModules.concat(skippedModules);
      sortData(sortDropdown.value);
      updateModuleCardContainer();
    }
  }, 180);
});

sortDropdown.addEventListener("change", () => {
  sortData(sortDropdown.value);
  updateModuleCardContainer();
});

showOutdated.addEventListener("change", () => {
  const urlParams = new URLSearchParams(window.location.search);
  urlParams.set("showOutdated", showOutdated.checked);
  window.history.replaceState({}, "", `${window.location.pathname}?${urlParams}`);
  updateModuleCardContainer();
});

document.addEventListener("click", (event) => {
  const navMenu = document.getElementById("nav-menu");
  const navToggler = document.getElementById("nav-toggler");
  if (navMenu.classList.contains("visible")) {
    if (!navMenu.contains(event.target) && !navToggler.contains(event.target)) {
      toggleMenu();
    }
  }
});

const navLinks = document.querySelectorAll("#nav-menu a");
navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    const navMenu = document.getElementById("nav-menu");
    if (navMenu.classList.contains("visible")) {
      toggleMenu();
    }
  });
});

async function initiate() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has("showOutdated")) {
    const showOutdatedParam = urlParams.get("showOutdated");
    showOutdated.checked = showOutdatedParam === "true";
  }

  const modulesFile = "data/modules.min.json";
  try {
    const response = await fetch(modulesFile);
    const data = await response.json();
    allModules = data.modules;
  }
  catch (error) {
    allModules = [];
    console.error("Error fetching modules:", error);
  }

  try {
    const skippedRes = await fetch("data/skipped_modules.json");
    const skippedRaw = await skippedRes.json();
    skippedModules = skippedRaw.map(moduleObj => ({ ...moduleObj, skipped: true, defaultSortWeight: 1000, lastCommit: "" }));
  }
  catch {
    skippedModules = [];
  }

  filteredModuleList = allModules.concat(skippedModules);
  sortData(sortDropdown.value);
  updateModuleCardContainer();
  displayTagButtonContainer();
  addCategoryFilter();

  const statisticsFile = "data/stats.json";
  try {
    const response = await fetch(statisticsFile);
    const data = await response.json();
    displayStatistics(data);
  }
  catch (error) {
    console.error("Error fetching data:", error);
  }
}

function switchDarkMode() {
  const header = document.getElementsByTagName("header")[0];
  const body = document.getElementsByTagName("body")[0];
  const root = document.querySelector(":root");
  const sortButton = document.getElementById("sort-dropdown");
  const isDark = darkMode.checked;

  header.style.backgroundColor = isDark ? "#222" : "#e9e9e9";
  header.style.color = isDark ? "#e9e9e9" : "#222";
  body.style.backgroundColor = isDark ? "#222" : "#e9e9e9";
  sortButton.style.color = isDark ? "#ddd" : "#555";
  sortButton.style.backgroundColor = isDark ? "#555" : "#ddd";
  resetButton.style.color = isDark ? "#ddd" : "#555";
  resetButton.style.backgroundColor = isDark ? "#555" : "#ddd";
  root.style.setProperty("--color-card-background", isDark ? "#ddd" : "#fff");

  const navMenu = document.getElementById("nav-menu");
  if (navMenu.classList.contains("visible")) {
    toggleMenu();
  }
}

darkMode.addEventListener("click", switchDarkMode);
for (const id of ["close-menu", "nav-toggler"]) {
  document.getElementById(id).addEventListener("click", toggleMenu);
}
initiate();
