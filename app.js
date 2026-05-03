const CHALDEAN_MAP = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 8, G: 3, H: 5, I: 1, J: 1, K: 2, L: 3,
  M: 4, N: 5, O: 7, P: 8, Q: 1, R: 2, S: 3, T: 4, U: 6, V: 6, W: 6, X: 6,
  Y: 1, Z: 7
};

const PHONETIC_EXPANSIONS = [
  [/i/gi, "ee"],
  [/ee/gi, "i"],
  [/y/gi, "i"],
  [/i/gi, "y"],
  [/a/gi, "aa"],
  [/aa/gi, "a"],
  [/u/gi, "oo"],
  [/oo/gi, "u"],
  [/c/gi, "k"],
  [/k/gi, "c"],
  [/v/gi, "w"],
  [/w/gi, "v"]
];

const HISTORY_KEY = "numerologyByKanika.history";
const FEEDBACK_KEY = "numerologyByKanika.feedback";
const AI_ENDPOINT = window.NUMEROLOGY_AI_ENDPOINT || "/api/name-suggestions";
const SUGGESTION_LIMIT = 5;

const $ = (id) => document.getElementById(id);

function digitSum(value) {
  return String(Math.abs(parseInt(value, 10) || 0))
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);
}

function reduceToSingle(value, keepMasters = false) {
  let number = Math.abs(parseInt(value, 10) || 0);
  while (number > 9 && (!keepMasters || ![11, 22, 33].includes(number))) {
    number = digitSum(number);
  }
  return number;
}

function chaldeanTotal(text) {
  return Array.from(String(text).toUpperCase()).reduce((sum, char) => {
    return sum + (CHALDEAN_MAP[char] || 0);
  }, 0);
}

function numberLabel(text) {
  const total = chaldeanTotal(text);
  return `${total} \u2192 ${reduceToSingle(total)}`;
}

function parseDob(input) {
  const match = String(input).trim().match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { day, month, year, display: `${day}-${month}-${year}` };
}

function calculateKuaNumber(year, gender) {
  let sum = digitSum(year);
  while (sum > 9) sum = digitSum(sum);
  let kua = gender.toLowerCase().startsWith("m") ? 11 - sum : sum + 4;
  return reduceToSingle(kua);
}

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || {};
  } catch {
    return {};
  }
}

function saveHistory(name, result) {
  if (!name) return;
  const history = getHistory();
  history[name] = result;
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history, null, 2));
  populateHistory();
}

function populateHistory() {
  const history = getHistory();
  const select = $("historySelect");
  select.innerHTML = "";
  Object.keys(history).forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.append(option);
  });
}

function calculate() {
  const fullName = $("fullName").value.trim();
  const dob = parseDob($("dob").value);
  const personalYear = $("personalYear").value.trim();
  const digitInput = $("digitInput").value.trim();
  const gender = $("gender").value;
  const lines = [];

  if (fullName) {
    lines.push(`Full Name: ${fullName}`);
    lines.push(`Total: ${numberLabel(fullName)}`);
    lines.push("");
    fullName.split(/\s+/).forEach((part) => {
      lines.push(`${part}: Total ${numberLabel(part)}`);
      lines.push("");
    });
  }

  if ($("dob").value.trim()) {
    if (dob) {
      const moolankTotal = digitSum(dob.day);
      const bhagyankTotal = digitSum(dob.day) + digitSum(dob.month) + digitSum(dob.year);
      lines.push(`DOB: ${dob.display}`);
      lines.push(`Moolank: ${moolankTotal} \u2192 ${reduceToSingle(moolankTotal)}`);
      lines.push(`Bhagyank: ${bhagyankTotal} \u2192 ${reduceToSingle(bhagyankTotal)}`);
      lines.push("");
    } else {
      lines.push("Invalid DOB format. Use DD-MM-YYYY.");
      lines.push("");
    }
  }

  if (dob && /^\d{4}$/.test(personalYear)) {
    const pyTotal = digitSum(dob.day) + digitSum(dob.month) + digitSum(personalYear);
    lines.push(`Personal Year ${personalYear}: ${pyTotal} \u2192 ${reduceToSingle(pyTotal)}`);
    lines.push("");
  }

  if (dob) {
    lines.push(`Kua Number (${gender}, ${dob.year}): ${calculateKuaNumber(dob.year, gender)}`);
    lines.push("");
  }

  if (digitInput && /^\d+$/.test(digitInput)) {
    const total = digitSum(digitInput);
    lines.push(`Digit Adder Input: ${digitInput}`);
    lines.push(`Total: ${total} \u2192 ${reduceToSingle(total)}`);
    lines.push("");
  }

  const output = lines.join("\n");
  $("results").textContent = output;
  if (fullName) saveHistory(fullName, output);
  $("correctionPanel").hidden = !output.trim();
}

function splitName(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || "",
    surname: parts.slice(1).join(" ")
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function generateLocalVariants(name) {
  const clean = name.trim();
  if (!clean) return [];
  const variants = [clean];

  PHONETIC_EXPANSIONS.forEach(([pattern, replacement]) => {
    if (pattern.test(clean)) variants.push(clean.replace(pattern, replacement));
    pattern.lastIndex = 0;
  });

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (/[a-z]/i.test(char)) {
      variants.push(clean.slice(0, index + 1) + char.toLowerCase() + clean.slice(index + 1));
      if (clean.length > 3) variants.push(clean.slice(0, index) + clean.slice(index + 1));
    }
  }

  return unique(variants).slice(0, 120);
}

function validateSuggestion(suggestion, targets) {
  const firstSingle = suggestion.first ? reduceToSingle(chaldeanTotal(suggestion.first)) : null;
  const surnameSingle = suggestion.surname ? reduceToSingle(chaldeanTotal(suggestion.surname)) : null;
  const full = [suggestion.first, suggestion.surname].filter(Boolean).join(" ");
  const overallSingle = full ? reduceToSingle(chaldeanTotal(full)) : null;

  if (targets.first && firstSingle !== Number(targets.first)) return null;
  if (targets.surname && surnameSingle !== Number(targets.surname)) return null;
  if (targets.overall && overallSingle !== Number(targets.overall)) return null;

  return {
    ...suggestion,
    full,
    firstSingle,
    surnameSingle,
    overallSingle,
    firstTotal: suggestion.first ? chaldeanTotal(suggestion.first) : null,
    surnameTotal: suggestion.surname ? chaldeanTotal(suggestion.surname) : null,
    overallTotal: full ? chaldeanTotal(full) : null
  };
}

function localSuggestions(fullName, correctionType, targets) {
  const { first, surname } = splitName(fullName);
  const firstVariants = correctionType === "surname" ? [first] : generateLocalVariants(first);
  const surnameVariants = correctionType === "first" ? [surname] : generateLocalVariants(surname);
  const suggestions = [];

  firstVariants.forEach((firstVariant) => {
    surnameVariants.forEach((surnameVariant) => {
      const valid = validateSuggestion({ first: firstVariant, surname: surnameVariant }, targets);
      if (valid && valid.full !== fullName) suggestions.push(valid);
    });
  });

  return unique(suggestions.map((item) => JSON.stringify(item)))
    .map((item) => JSON.parse(item))
    .slice(0, SUGGESTION_LIMIT);
}

async function aiSuggestions(fullName, correctionType, targets) {
  if (!AI_ENDPOINT) return [];
  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName, correctionType, targets })
  });
  if (!response.ok) throw new Error("AI suggestion request failed");
  const data = await response.json();
  return (data.suggestions || [])
    .map((item) => validateSuggestion(item, targets))
    .filter(Boolean)
    .slice(0, SUGGESTION_LIMIT);
}

function renderSuggestions(suggestions) {
  const container = $("suggestions");
  container.innerHTML = "";
  if (!suggestions.length) {
    container.textContent = "No matching suggestions found for these targets.";
    return;
  }

  suggestions.forEach((suggestion) => {
    const card = document.createElement("article");
    card.className = "suggestion-card";
    card.innerHTML = `
      <h3>${suggestion.full}</h3>
      <p>First: ${suggestion.first || "-"} ${suggestion.firstTotal ? `${suggestion.firstTotal} \u2192 ${suggestion.firstSingle}` : ""}</p>
      <p>Surname: ${suggestion.surname || "-"} ${suggestion.surnameTotal ? `${suggestion.surnameTotal} \u2192 ${suggestion.surnameSingle}` : ""}</p>
      <p>Overall: ${suggestion.overallTotal} \u2192 ${suggestion.overallSingle}</p>
      <div class="feedback">
        <button type="button" data-feedback="accepted">Accept</button>
        <button type="button" data-feedback="rejected">Reject</button>
      </div>
    `;
    card.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => recordFeedback(button.dataset.feedback, suggestion, card));
    });
    container.append(card);
  });
}

async function suggestNames() {
  const fullName = $("fullName").value.trim();
  const correctionType = $("correctionType").value;
  const targets = {
    first: $("firstTarget").value.trim(),
    surname: $("surnameTarget").value.trim(),
    overall: $("overallTarget").value.trim()
  };

  if (!fullName) {
    $("suggestionStatus").textContent = "Enter a full name first.";
    return;
  }

  $("suggestionStatus").textContent = "Finding recommendations...";
  try {
    const ai = await aiSuggestions(fullName, correctionType, targets);
    const fallback = localSuggestions(fullName, correctionType, targets);
    renderSuggestions(unique([...ai, ...fallback].map((item) => JSON.stringify(item))).map((item) => JSON.parse(item)));
    $("suggestionStatus").textContent = "Recommendations ready.";
  } catch (error) {
    renderSuggestions(localSuggestions(fullName, correctionType, targets));
    $("suggestionStatus").textContent = "AI unavailable. Showing validated local recommendations.";
  }
}

async function recordFeedback(action, suggestion, card) {
  const feedback = {
    action,
    suggestion,
    originalName: $("fullName").value.trim(),
    correctionType: $("correctionType").value,
    createdAt: new Date().toISOString()
  };
  const stored = JSON.parse(localStorage.getItem(FEEDBACK_KEY) || "[]");
  stored.push(feedback);
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(stored, null, 2));
  card.dataset.feedback = action;
  card.querySelector(".feedback").innerHTML = `<p>${action === "accepted" ? "Accepted" : "Rejected"}</p>`;

  if (AI_ENDPOINT) {
    fetch(AI_ENDPOINT.replace(/suggestions?$/, "feedback"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(feedback)
    }).catch(() => {});
  }
}

function exportPdf() {
  window.print();
}

function clearAll() {
  ["fullName", "dob", "digitInput", "firstTarget", "surnameTarget", "overallTarget"].forEach((id) => {
    $(id).value = "";
  });
  $("personalYear").value = new Date().getFullYear();
  $("results").textContent = "";
  $("suggestions").innerHTML = "";
  $("correctionPanel").hidden = true;
}

function bindEvents() {
  $("personalYear").value = new Date().getFullYear();
  $("calculate").addEventListener("click", calculate);
  $("clear").addEventListener("click", clearAll);
  $("exportPdf").addEventListener("click", exportPdf);
  $("suggestNames").addEventListener("click", suggestNames);
  $("fontSize").addEventListener("input", (event) => {
    $("results").style.fontSize = `${event.target.value}px`;
  });
  $("loadHistory").addEventListener("click", () => {
    const history = getHistory();
    $("results").textContent = history[$("historySelect").value] || "";
    $("correctionPanel").hidden = !$("results").textContent.trim();
  });
  populateHistory();
}

bindEvents();
