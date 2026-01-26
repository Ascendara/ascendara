let wordLists = null;
let fetchPromise = null;

const API_URL = "https://api.ascendara.app/app/json/profanity";

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeForComparison(text) {
  if (!text || typeof text !== "string") {
    return "";
  }

  let normalized = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");

  normalized = normalized.replace(/[@]/g, "a");
  normalized = normalized.replace(/[\$]/g, "s");
  normalized = normalized.replace(/[0]/g, "o");
  normalized = normalized.replace(/[1!|]/g, "i");
  normalized = normalized.replace(/[3]/g, "e");
  normalized = normalized.replace(/[4]/g, "a");
  normalized = normalized.replace(/[5]/g, "s");
  normalized = normalized.replace(/[7]/g, "t");

  normalized = normalized.replace(/[^a-z0-9]+/g, "");
  normalized = normalized.replace(/(.)\1{2,}/g, "$1$1");

  return normalized;
}

async function fetchBadWords() {
  if (wordLists) {
    return wordLists;
  }

  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = fetch(API_URL)
    .then(response => {
      if (!response.ok) {
        throw new Error("Failed to fetch profanity list");
      }
      return response.json();
    })
    .then(data => {
      wordLists = {
        inappropriate: (data.inappropriate || []).map(word => word.toLowerCase()),
        notAllowed: (data.notAllowed || []).map(word => word.toLowerCase()),
      };
      fetchPromise = null;
      return wordLists;
    })
    .catch(error => {
      console.error("Error fetching profanity list:", error);
      fetchPromise = null;
      wordLists = { inappropriate: [], notAllowed: [] };
      return wordLists;
    });

  return fetchPromise;
}

function checkForWords(text, wordList, listType = "inappropriate") {
  if (!text || typeof text !== "string") {
    return null;
  }

  if (!wordList || wordList.length === 0) {
    return null;
  }

  const normalizedText = text.toLowerCase();
  const normalizedCompactText = normalizeForComparison(text);

  const minLengthForSubstring = listType === "notAllowed" ? 3 : 4;

  const foundWord = wordList.find(badWord => {
    if (!badWord || typeof badWord !== "string") {
      return false;
    }

    const normalizedBadWord = badWord.toLowerCase();
    const escapedBadWord = escapeRegExp(normalizedBadWord);
    const boundaryRegex = new RegExp(`\\b${escapedBadWord}\\b`, "i");
    if (boundaryRegex.test(normalizedText)) {
      return true;
    }

    const compactBadWord = normalizeForComparison(badWord);
    if (!compactBadWord) {
      return false;
    }

    if (compactBadWord.length < minLengthForSubstring) {
      return false;
    }

    return normalizedCompactText.includes(compactBadWord);
  });

  return foundWord || null;
}

export async function validateInput(text, isOwner = false) {
  if (isOwner) {
    return {
      valid: true,
      error: null,
    };
  }

  await fetchBadWords();

  // Check for not allowed words first (higher priority)
  // Use aggressive matching (length >= 3) for reserved/impersonation words
  const notAllowedWord = checkForWords(text, wordLists.notAllowed, "notAllowed");
  if (notAllowedWord) {
    return {
      valid: false,
      error: "Your input contains words that are not allowed",
      type: "notAllowed",
    };
  }

  // Check for inappropriate words
  // Use safer matching (length >= 4) to avoid false positives
  const inappropriateWord = checkForWords(text, wordLists.inappropriate, "inappropriate");
  if (inappropriateWord) {
    return {
      valid: false,
      error: "Please try to avoid harsh or inappropriate words",
      type: "inappropriate",
    };
  }

  return {
    valid: true,
    error: null,
  };
}

export async function initializeProfanityFilter() {
  try {
    await fetchBadWords();
    return true;
  } catch (error) {
    console.error("Failed to initialize profanity filter:", error);
    return false;
  }
}
