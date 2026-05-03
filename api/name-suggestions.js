const CHALDEAN_MAP = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 8, G: 3, H: 5, I: 1, J: 1, K: 2, L: 3,
  M: 4, N: 5, O: 7, P: 8, Q: 1, R: 2, S: 3, T: 4, U: 6, V: 6, W: 6, X: 6,
  Y: 1, Z: 7
};

const SUGGESTION_LIMIT = 5;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function digitSum(value) {
  return String(Math.abs(parseInt(value, 10) || 0))
    .split("")
    .reduce((sum, digit) => sum + Number(digit), 0);
}

function reduceToSingle(value) {
  let number = Math.abs(parseInt(value, 10) || 0);
  while (number > 9) number = digitSum(number);
  return number;
}

function chaldeanTotal(text) {
  return Array.from(String(text).toUpperCase()).reduce((sum, char) => {
    return sum + (CHALDEAN_MAP[char] || 0);
  }, 0);
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    first: parts[0] || "",
    surname: parts.slice(1).join(" ")
  };
}

function normalizeSound(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/ee/g, "i")
    .replace(/aa/g, "a")
    .replace(/oo/g, "u")
    .replace(/c/g, "k")
    .replace(/w/g, "v")
    .replace(/y/g, "i");
}

function letterSet(text) {
  return new Set(normalizeSound(text).split(""));
}

function levenshtein(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return rows[a.length][b.length];
}

function similarity(a, b) {
  if (!a && !b) return 1;
  const maxLength = Math.max(a.length, b.length);
  return maxLength ? 1 - levenshtein(a, b) / maxLength : 0;
}

function isAllowedVariant(original, candidate) {
  const originalSound = normalizeSound(original);
  const candidateSound = normalizeSound(candidate);
  if (!originalSound || !candidateSound) return originalSound === candidateSound;
  if (candidateSound[0] !== originalSound[0]) return false;

  const allowedLetters = letterSet(original);
  for (const char of candidateSound) {
    if (!allowedLetters.has(char)) return false;
  }

  return similarity(originalSound, candidateSound) >= 0.45;
}

function validateSuggestion(original, suggestion, targets, correctionType) {
  const first = String(suggestion.first || "").trim();
  const surname = String(suggestion.surname || "").trim();
  const full = [first, surname].filter(Boolean).join(" ");
  if (!first && !surname) return null;

  if (correctionType === "first" && normalizeSound(surname) !== normalizeSound(original.surname)) return null;
  if (correctionType === "surname" && normalizeSound(first) !== normalizeSound(original.first)) return null;

  if (!isAllowedVariant(original.first, first)) return null;
  if (original.surname && !isAllowedVariant(original.surname, surname)) return null;

  const firstTotal = first ? chaldeanTotal(first) : null;
  const surnameTotal = surname ? chaldeanTotal(surname) : null;
  const overallTotal = chaldeanTotal(full);
  const firstSingle = firstTotal ? reduceToSingle(firstTotal) : null;
  const surnameSingle = surnameTotal ? reduceToSingle(surnameTotal) : null;
  const overallSingle = reduceToSingle(overallTotal);

  if (targets.first && firstSingle !== Number(targets.first)) return null;
  if (targets.surname && surnameSingle !== Number(targets.surname)) return null;
  if (targets.overall && overallSingle !== Number(targets.overall)) return null;

  return {
    first,
    surname,
    full,
    reason: String(suggestion.reason || "").slice(0, 240),
    firstTotal,
    surnameTotal,
    overallTotal,
    firstSingle,
    surnameSingle,
    overallSingle
  };
}

function responseJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function extractOutputText(data) {
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    responseJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (!process.env.GEMINI_API_KEY) {
    responseJson(res, 500, { error: "GEMINI_API_KEY is not configured" });
    return;
  }

  const body = req.body || {};
  const fullName = String(body.fullName || "").trim();
  const correctionType = String(body.correctionType || "overall");
  const targets = body.targets || {};
  const original = splitName(fullName);

  if (!fullName || !["first", "surname", "overall"].includes(correctionType)) {
    responseJson(res, 400, { error: "Invalid request" });
    return;
  }

  const prompt = {
    originalName: fullName,
    firstName: original.first,
    surname: original.surname,
    correctionType,
    targets,
    requiredCount: SUGGESTION_LIMIT,
    allowedRules: [
      "Repeating existing letters is allowed.",
      "Deleting existing letters is allowed.",
      "Allowed phonetic substitutions only: i <-> ee, a <-> aa, u <-> oo, c <-> k, v <-> w, y <-> i.",
      "Random new letters are not allowed.",
      "Do not use sh <-> s.",
      "Do not use aa <-> ah.",
      "The corrected first name and surname must still look and sound like sensible names."
    ]
  };

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      suggestions: {
        type: "array",
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            first: { type: "string" },
            surname: { type: "string" },
            reason: { type: "string" }
          },
          required: ["first", "surname", "reason"]
        }
      }
    },
    required: ["suggestions"]
  };

  try {
    const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "You are a careful Indian name-correction assistant for a Chaldean numerology app. Suggest plausible spellings only. The server will verify the final numerology; focus on natural-sounding names and obeying spelling-change rules."
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Return name correction candidates as JSON only.\n\nRequest:\n${JSON.stringify(prompt, null, 2)}`
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.8
        }
      })
    });

    const data = await geminiResponse.json();
    if (!geminiResponse.ok) {
      responseJson(res, geminiResponse.status, { error: data.error?.message || "Gemini request failed" });
      return;
    }

    const parsed = JSON.parse(extractOutputText(data));
    const validated = [];
    const seen = new Set();
    for (const suggestion of parsed.suggestions || []) {
      const valid = validateSuggestion(original, suggestion, targets, correctionType);
      if (valid && !seen.has(valid.full.toLowerCase())) {
        seen.add(valid.full.toLowerCase());
        validated.push(valid);
      }
      if (validated.length >= SUGGESTION_LIMIT) break;
    }

    responseJson(res, 200, { suggestions: validated });
  } catch (error) {
    responseJson(res, 500, { error: error.message || "Unexpected error" });
  }
};
