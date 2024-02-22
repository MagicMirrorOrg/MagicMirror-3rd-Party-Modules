let allModules = [];
let filteredModuleList = [];
const cardTemplate = document.getElementById("card-template");
const resetButton = document.getElementById("reset-button");
const moduleCardContainer = document.getElementById("module-container");
const searchInput = document.getElementById("search-input");
const tagButtonContainer = document.getElementById("tag-buttons");
const sortDropdown = document.getElementById("sort-dropdown");
const showOutdated = document.getElementById("show-outdated");
const darkMode = document.getElementById("dark-mode");
const tagsList = [
  "calendar",
  "news",
  "motion detection",
  "public transport",
  "smarthome",
  "soccer",
  "stock",
  "text-to-speech",
  "traffic",
  "voice control",
  "weather"
];


function createCard (moduleData) {
  const card = document.importNode(cardTemplate.content, true);

  /* Set the header data */
  card.querySelector(".name").href = moduleData.url;
  card.querySelector(".name").textContent = moduleData.name;

  const maintainerContainer = card.querySelector(".maintainer");
  maintainerContainer.textContent = `${moduleData.maintainer}`;
  maintainerContainer.addEventListener("click", () => {
    filterByMaintainer(moduleData.maintainer);
  });

  if (typeof moduleData.stars === "undefined") {
    card.querySelector(".stars").remove();
  } else {
    card.querySelector(".stars").textContent = `${moduleData.stars} stars`;
  }

  /* Generate the tags, add color asignation */
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
  } else {
    card.querySelector(".tags").remove();
  }

  /* Set the card body */
  card.querySelector(".description").innerHTML = moduleData.description;

  if (moduleData.image) {
    const imagePath = `./images/${moduleData.name}---${moduleData.maintainer}---${moduleData.image}`;
    const image = card.querySelector(".img-container img");
    image.src = imagePath;
    image.alt = `${moduleData.name} image`;

    const overlay = image.nextElementSibling;
    image.onclick = () => {
      overlay.style.display = "block";
      overlay.getElementsByTagName("img")[0].src = image.src;
    };

    overlay.onclick = () => {
      overlay.style.display = "none";
    };
  } else {
    card.querySelector(".img-container").remove();
  }

  if (moduleData.license) {
    const license = card.querySelector(".info .container.license .text");
    license.href = `${moduleData.url}`;
    license.textContent = `©${moduleData.license}`;
  } else {
    card.querySelector(".info .container.license").remove();
  }

  /* Set the card footer */
  if (moduleData.lastCommit) {
    const commit = card.querySelector(".info .container.commit .text");
    commit.href = `${moduleData.url}/commits/`;
    commit.textContent = `${moduleData.lastCommit.split("T")[0]}`;
  } else {
    card.querySelector(".info .container.commit").remove();
  }


  if (moduleData.issues > 0 && !(moduleData.maintainer === "KristjanESPERANTO" && moduleData.issues === 1)) {
    // To reduce imbalance in the default sort order, modules from KristjanESPERANTO get a fake-issue (look at the check_modules.py). This condition is here to avoid displaying the div incorrectly.
    const url = `https://github.com/KristjanESPERANTO/MagicMirror-3rd-Party-Modules/blob/main/result.md#${moduleData.name}-by-${moduleData.maintainer}`;
    card.querySelector(".info .container.issues .text").href = url;
  } else {
    card.querySelector(".info .container.issues").remove();
  }

  /* Add a notice/change styling if the module is outdated */
  if (moduleData.outdated) {
    card.querySelector(".card").classList.add("outdated");
    card.querySelector(".outdated-note").innerHTML = moduleData.outdated;
  } else {
    card.querySelector(".outdated-note").remove();
  }

  moduleCardContainer.appendChild(card);
}

function updateModuleCardContainer () {
  moduleCardContainer.innerHTML = "";

  let moduleCounter = filteredModuleList.length;

  filteredModuleList.forEach((moduleData) => {
    if (!moduleData.outdated || showOutdated.checked) {
      try {
        createCard(moduleData);
      } catch (error) {
        console.error("Error creating module", moduleData);
      }
    } else {
      moduleCounter -= 1;
    }
  });

  const moduleCountElement = document.getElementById("module-count-value");
  moduleCountElement.textContent = `${moduleCounter} of ${allModules.length}`;

  if (moduleCounter === allModules.length) {
    resetButton.style.display = "none";
  } else {
    resetButton.style.display = "block";
  }
}

function sortData (sortOption) {
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
        // Put oudated to the end
        Boolean(a.outdated) - Boolean(b.outdated) ||
        // Sort by issue count
        a.issues - b.issues ||
        // Sort by last commit date
        b.lastCommit.localeCompare(a.lastCommit));
  }
}

function displayTagButtonContainer () {
  tagButtonContainer.innerHTML = "";

  tagsList.forEach((tag) => {
    const button = document.createElement("a");
    button.className = "tag-button";
    button.textContent = tag;
    button.setAttribute("data-tag", tag);

    button.addEventListener("click", () => {
      filterByTag(tag);
    });
    tagButtonContainer.appendChild(button);
  });
}

function removeSelectedMarkingFromTagsAndCards () {
  // Remove the "selected" class from all tag buttons and cards
  const allURLs = document.querySelectorAll(".tag-button, .card");
  allURLs.forEach((url) => url.classList.remove("selected"));
}

function displayStatistics (data) {
  const lastUpdateDate = new Date(data.lastUpdate).toLocaleString();
  const lastUpdateDiv = document.getElementById("last-update");
  lastUpdateDiv.innerHTML = `Last update: ${lastUpdateDate}`;
}

function filterBySearchText (searchText) {
  const searchLower = searchText.toLowerCase();
  filteredModuleList = allModules.filter((card) => {
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
      cardText.includes(searchLower) ||
      cardDescription.includes(searchLower) ||
      cardName.includes(searchLower) ||
      cardMaintainer.includes(searchLower) ||
      cardTags.some((tag) => tag.toLowerCase().includes(searchLower))
    );
  });

  removeSelectedMarkingFromTagsAndCards();

  updateModuleCardContainer();
}

function filterByMaintainer (maintainer) {
  filteredModuleList = allModules.filter((card) => card.maintainer === maintainer);

  searchInput.value = "";

  removeSelectedMarkingFromTagsAndCards();

  updateModuleCardContainer();
}

function filterByTag (tag) {
  filteredModuleList = allModules.filter((card) => {
    const tags = card.tags;
    if (tags) {
      return tags.includes(tag);
    }
    return false;
  });

  searchInput.value = "";

  removeSelectedMarkingFromTagsAndCards();

  updateModuleCardContainer();

  // Mark the selected tag container
  const selectedTagContainers = document.querySelectorAll(`[data-tag="${tag}"]`);
  selectedTagContainers.forEach((container) => {
    container.classList.add("selected");
  });
}

// Add an event listener for clicks on the cards
moduleCardContainer.addEventListener("click", (event) => {
  // Check if the clicked element is a card
  const clickedCard = event.target.closest(".card");
  if (clickedCard) {
    // Remove the "selected" class from all cards
    const allCards = document.querySelectorAll(".card");
    allCards.forEach((card) => card.classList.remove("selected"));

    // Mark the selected card
    clickedCard.classList.add("selected");
  }
});

resetButton.addEventListener("click", () => {
  const root = document.querySelector(":root");
  filteredModuleList = allModules;
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

searchInput.addEventListener("input", () => {
  if (searchInput.value) {
    filterBySearchText(searchInput.value);
  } else {
    filteredModuleList = allModules;
    updateModuleCardContainer();
  }
});

// Add a change event listener to the dropdown menu
sortDropdown.addEventListener("change", () => {
  sortData(sortDropdown.value);
  updateModuleCardContainer();
});

showOutdated.addEventListener("change", () => {
  updateModuleCardContainer();
});

async function initiate () {
  const modulesFile = "data/modules.min.json";
  try {
    const response = await fetch(modulesFile);
    const data = await response.json();
    allModules = data;
    filteredModuleList = data;
    sortData(sortDropdown.value);
    updateModuleCardContainer();
    displayTagButtonContainer();
  } catch (error) {
    console.error("Error fetching data:", error);
  }

  const statisticsFile = "data/stats.json";
  try {
    const response = await fetch(statisticsFile);
    const data = await response.json();
    displayStatistics(data);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}


function DarkMode(){
  const header = document.getElementsByTagName("header")[0];
  const body = document.getElementsByTagName("body")[0];
  const reset_button = document.getElementById("reset-button");
  const sort_button = document.getElementById("sort-dropdown");
  if(darkMode.checked){
    //console.log("enabled");
    header.style. backgroundColor = "#222";
    header.style.color = "#e9e9e9"
    body.style.backgroundColor = "#222";
    sort_button.style.color = "#ddd";
    sort_button.style.backgroundColor = "#555";
    reset_button.style.color = "#ddd";
    reset_button.style.backgroundColor  = "#555";
  }
  else{
    //console.log("disbaled");
    header.style. backgroundColor = "#e9e9e9";
    header.style.color = "#222";
    body.style.backgroundColor = "#e9e9e9";
    sort_button.style.color = "#555";
    sort_button.style.backgroundColor = "#ddd";
    reset_button.style.color = "#555";
    reset_button.style.backgroundColor  = "#ddd";
  }
}

initiate();
