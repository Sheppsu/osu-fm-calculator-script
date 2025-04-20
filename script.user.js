// ==UserScript==
// @name         osu! mp fm multiplier calculator
// @version      1.0.1
// @description  show score after mod multipliers are applied
// @author       Sheppsu
// @match        https://osu.ppy.sh/community/matches/*
// @downloadURL  https://gist.github.com/Sheppsu/07265bed0d613d8df4f2b28afcaf1ec2/raw
// @updateURL    https://gist.github.com/Sheppsu/07265bed0d613d8df4f2b28afcaf1ec2/raw
// ==/UserScript==

var multiplierSettings = null;
var matchAcronym = null;

function formatScore(num) {
    // insert commas for more readable numbers
    let s = "";
    const strNum = num.toString();
    for (const [key, char] of Object.entries(strNum)) {
        const i = parseInt(key);

        s += char;
        if ((strNum.length - i - 1) % 3 === 0 && i !== strNum.length - 1) {
            s += ",";
        }
    }
    return s;
}

function doModsMatch(scoreMods, multiplierMods, isStrict) {
    // strict means the mods must exactly match
    // otherwise it just has to contain the same mods as in multiplierMods
    scoreMods = scoreMods.filter((acronym) => acronym !== "NF");

    if (multiplierMods.length === 1 && multiplierMods[0] === "NM" && scoreMods.length === 0) {
        return true;
    }

    if (isStrict) {
        if (scoreMods.length !== multiplierMods.length) {
            return false;
        }

        for (const mod of scoreMods) {
            if (!multiplierMods.includes(mod)) {
                return false;
            }
        }

        return true;
    }

    for (const mod of multiplierMods) {
        if (!scoreMods.includes(mod)) {
            return false;
        }
    }

    return true;
}

function parseScoreText(text) {
    const a = text.split("→")[0].trim().split("←");
    return parseInt(a[a.length-1].trim().replaceAll(",", ""));
}

function applyMultipliers(gameElm) {
    const settings = multiplierSettings[matchAcronym];

    let blueTeamScore = 0;
    let redTeamScore = 0;

    // check if the game finished
    const scoreElms = gameElm.querySelectorAll(".mp-history-game__player-score.mp-history-player-score");
    if (scoreElms.length === 0) {
        return;
    }
    // calculate new scores
    for (const scoreElm of scoreElms) {
        const scoreTextElm = scoreElm.querySelector(".mp-history-player-score__stat-number.mp-history-player-score__stat-number--large");
        const originalScore = parseScoreText(scoreTextElm.innerText);
        let score = originalScore;

        const scoreMods = Array.from(scoreElm.querySelector(".mp-history-player-score__mods").children).map((mod) => mod.getAttribute("data-acronym")).map((mod) => mod === "NC" ? "DT" : mod);
        for (const multiplier of settings.multipliers) {
            score = Math.round(score * (doModsMatch(scoreMods, multiplier.mods, settings.isStrict) ? multiplier.value : 1.0));
        }

        const isBlue = scoreElm.querySelector(".mp-history-player-score__shapes").getAttribute("style").includes("shapes-team-blue");
        if (isBlue) {
            blueTeamScore += score;
        } else {
            redTeamScore += score;
        }

        if (score === originalScore) {
            scoreTextElm.innerText = formatScore(score);
        } else {
            scoreTextElm.innerText = formatScore(originalScore) + " → " + formatScore(score);
        }
    }

    // set team scores
    const redScoreText = gameElm.querySelector(".mp-history-game__team-score.mp-history-game__team-score--red").querySelector(".mp-history-game__team-score-text.mp-history-game__team-score-text--score");
    const blueScoreText = gameElm.querySelector(".mp-history-game__team-score.mp-history-game__team-score--blue").querySelector(".mp-history-game__team-score-text.mp-history-game__team-score-text--score");
    const originalRedScore = parseScoreText(redScoreText.innerText);
    const originalBlueScore = parseScoreText(blueScoreText.innerText);
    if (originalRedScore !== redTeamScore) {
        redScoreText.innerText = formatScore(originalRedScore) + " → " + formatScore(redTeamScore);
    } else {
        redScoreText.innerText = formatScore(redTeamScore);
    }
    if (originalBlueScore !== blueTeamScore) {
        blueScoreText.innerText = formatScore(blueTeamScore) + " ← " + formatScore(originalBlueScore);
    } else {
        blueScoreText.innerText = formatScore(blueTeamScore);
    }

    // set "team won by x"
    gameElm.querySelector(".mp-history-game__results-text").innerHTML = `<strong>${redTeamScore > blueTeamScore ? "Red" : "Blue"} team wins</strong> by ${formatScore(Math.abs(blueTeamScore - redTeamScore))}`;

    // mark game as calculated
    gameElm.setAttribute("mod-multipliers-processed", null);
}

function hasBeenProcessed(gameElm) {
    return gameElm.hasAttribute("mod-multipliers-processed");
}

function loop() {
    // no settings for this tournament
    if (multiplierSettings[matchAcronym] === undefined) {
        return;
    }

    for (const elm of document.getElementsByClassName("mp-history-game")) {
        if (hasBeenProcessed(elm)) {
            continue;
        }

        // calculate and show new score
        const teamType = elm.querySelector(".mp-history-game__team-type");
        const mods = Array.from(elm.querySelector(".mp-history-game__mods").children).map((mod) => mod.getAttribute("data-acronym"));
        // disregard dt/ht
        const filteredMods = mods.filter((mod) => !["DT", "NC", "HT", "DC"].includes(mod));
        if ((teamType.getAttribute("title") === "Team VS" || teamType.getAttribute("data-orig-title") === "Team VS") && filteredMods.length === 0) {
            applyMultipliers(elm);
        }
    }
}

function saveSettings() {
    localStorage.setItem("fm-multipliers-extension-data", JSON.stringify(multiplierSettings));
}

function loadSettings() {
    try {
        multiplierSettings = JSON.parse(localStorage.getItem("fm-multipliers-extension-data"));
    } catch {
        multiplierSettings = null;
    }

    if (multiplierSettings === null) {
        multiplierSettings = {};
        saveSettings();
    }
}

function onSettingsChange() {
    // get settings from elements
    const multiplierContainer = document.getElementById("fm-multiplier-container");
    const isStrictCheck = document.getElementById("fm-is-strict-checkbox");
    const multipliers = Array.from(multiplierContainer.children).map((row) => {
        const label = row.children.item(2).children.item(0);
        const multiplier = parseFloat(label.innerText.substring(0, label.innerText.length - 1));

        return {
            mods: Array.from(row.children.item(0).children).map((item) => item.getAttribute("mod-acronym")),
            value: multiplier
        }
    });

    multiplierSettings[matchAcronym] = {
        multipliers: multipliers,
        isStrict: isStrictCheck.checked,
    };

    saveSettings();

    // reprocess all games
    for (const elm of document.getElementsByClassName("mp-history-game")) {
        elm.removeAttribute("mod-multipliers-processed");
    }
}

function createButton(label, icon="plus", danger=false) {
    const btn = document.createElement("button");
    btn.classList.add("btn-osu-big");
    if (danger) {
        btn.classList.add("btn-osu-big--danger");
    }

    const content = document.createElement("span");
    content.classList.add("btn-osu-big__content");

    const textContent = document.createElement("span");
    textContent.classList.add("btn-osu-big__left");

    const text = document.createElement("span");
    text.classList.add("btn-osu-big__text-top");
    text.innerText = label;

    const iconContent = document.createElement("span");
    iconContent.classList.add("btn-osu-big__icon");

    const iconOuter = document.createElement("span");
    iconOuter.classList.add("fa", "fa-fw");

    const iconInner = document.createElement("span");
    iconInner.classList.add("fas", "fa-"+icon);

    iconOuter.append(iconInner);
    iconContent.append(iconOuter);
    textContent.append(text);
    content.append(textContent, iconContent);
    btn.append(content);

    return btn;
}

function createModIcon(acronym) {
    const icon = document.createElement("div");
    icon.classList.add("mod", "mod--"+acronym);
    icon.setAttribute("mod-acronym", acronym);
    return icon;
}

function createMultiplierRow(mods, multiplier) {
    const row = document.createElement("div");
    row.setAttribute("style", "display:flex;flex-direction:row;gap:5px;justify-content:space-between;align-items:center;padding:5px;");

    const modContainer = document.createElement("div");
    modContainer.setAttribute("style", "display:flex;flex-direction:row;gap:5px;");

    const modInputContainer = document.createElement("div");

    const modInput = document.createElement("input");
    modInput.classList.add("account-edit-entry__input");
    modInput.type = "text";
    modInput.style.display = "none";
    modInput.style.width = "150px";

    const btnContainer = document.createElement("div");
    btnContainer.setAttribute("style", "display:flex;flex-direction:row;gap:5px;");

    const editBtn = createButton("Edit", "pencil-alt");
    const deleteBtn = createButton("Delete", "trash", true);
    const saveBtn = createButton("Save", "check");
    saveBtn.style.display = "none";

    btnContainer.append(editBtn, deleteBtn, saveBtn);

    for (const mod of mods) {
        modContainer.append(createModIcon(mod));
    }

    const multiplierContainer = document.createElement("div");

    const multiplierLabel = document.createElement("span");
    multiplierLabel.innerText = multiplier+"x";

    const multiplierInput = document.createElement("input");
    multiplierInput.classList.add("account-edit-entry__input");
    multiplierInput.type = "number";
    multiplierInput.step = "0.01";
    multiplierInput.style.display = "none";
    multiplierInput.style.width = "70px";

    multiplierContainer.append(multiplierLabel, multiplierInput);

    modInputContainer.append(modInput);
    row.append(modContainer, modInputContainer, multiplierContainer, btnContainer);

    editBtn.addEventListener("click", () => {
        // update values
        multiplierInput.value = parseFloat(multiplierLabel.innerText.substring(0, multiplierLabel.innerText.length - 1));
        modInput.value = Array.from(modContainer.children).map((mod) => mod.getAttribute("mod-acronym")).join("");

        // hide/show items
        multiplierLabel.style.display = "none";
        multiplierInput.style.display = "block";
        editBtn.style.display = "none";
        deleteBtn.style.display = "none";
        saveBtn.style.display = "block";
        modInput.style.display = "block";
        modContainer.style.display = "none";

        onSettingsChange();
    });
    saveBtn.addEventListener("click", () => {
        // update values
        multiplierLabel.innerText = parseFloat(multiplierInput.value) + "x";
        while (modContainer.children.length > 0) {
            modContainer.children.item(0).remove();
        }
        const mods = modInput.value.toUpperCase();
        for (let i = 0; i < mods.length/2; i++) {
            modContainer.append(createModIcon(mods.substring(i*2, i*2+2)));
        }

        // hide/show items
        multiplierLabel.style.display = "block";
        multiplierInput.style.display = "none";
        editBtn.style.display = "block";
        deleteBtn.style.display = "block";
        saveBtn.style.display = "none";
        modInput.style.display = "none";
        modContainer.style.display = "flex";

        onSettingsChange();
    });
    deleteBtn.addEventListener("click", () => {
        row.remove();
        onSettingsChange();
    });

    return row;
}

function createModMenuBody() {
    const body = document.createElement("div");
    body.setAttribute("style", "display:flex;flex-direction:column;gap:5px;");

    const buttonRow = document.createElement("div");
    buttonRow.setAttribute("style", "display:flex;flex-direction:row;gap:5px;align-items:center;");

    const multiplierContainer = document.createElement("div");
    multiplierContainer.id = "fm-multiplier-container";
    multiplierContainer.setAttribute("style", "display:flex;flex-direction:column;padding:5px;border:solid white 1px;border-radius:5px;");

    const addRowBtn = createButton("Add multiplier");
    addRowBtn.addEventListener("click", () => {
        multiplierContainer.append(createMultiplierRow([], 1.0));
        onSettingsChange();
    });

    const setStrictCheck = document.createElement("input");
    setStrictCheck.type = "checkbox";
    setStrictCheck.id = "fm-is-strict-checkbox";
    setStrictCheck.addEventListener("change", onSettingsChange);

    const setStrictLabel = document.createElement("label");
    setStrictLabel.innerText = "Use strict mod matching";

    // import settings if they exist
    const matchSettings = multiplierSettings[matchAcronym];
    if (matchSettings !== undefined) {
        setStrictCheck.checked = matchSettings.isStrict;

        for (const item of matchSettings.multipliers) {
            multiplierContainer.append(createMultiplierRow(item.mods, item.value));
        }
    }

    buttonRow.append(addRowBtn, setStrictCheck, setStrictLabel);
    body.append(buttonRow, multiplierContainer);

    return body;
}

function createModMenu() {
    const elm = document.createElement("div");
    elm.classList.add("js-spoilerbox", "bbcode-spoilerbox");

    const linkElm = document.createElement("a");
    linkElm.classList.add("js-spoilerbox__link", "bbcode-spoilerbox__link");
    linkElm.href = "#";

    const linkIcon = document.createElement("span");
    linkIcon.classList.add("bbcode-spoilerbox__link-icon");

    const body = createModMenuBody();

    const bodyContainer = document.createElement("div");
    bodyContainer.classList.add("js-spoilerbox__body", "bbcode-spoilerbox__body");
    bodyContainer.style.display = "none";

    linkElm.append(
        linkIcon,
        "FM Multipliers"
    );
    bodyContainer.append(body);
    elm.append(linkElm, bodyContainer);

    return elm;
}

function setup() {
    // wait for mp history to load
    const pageContent = document.querySelector(".mp-history-content");
    if (pageContent === null) {
        setTimeout(setup, 500);
        return;
    }

    loadSettings();

    // create mod menu
    const mpTitle = pageContent.querySelector("h3.mp-history-content__item");
    matchAcronym = mpTitle.innerText.split(":")[0];
    mpTitle.insertAdjacentElement("afterend", createModMenu());

    setInterval(loop, 500);
}

setup();
