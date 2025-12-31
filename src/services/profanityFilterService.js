let wordLists = null;
let fetchPromise = null;

const API_URL = "https://api.ascendara.app/app/json/profanity";

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

function checkForWords(text, wordList) {
  if (!text || typeof text !== "string") {
    return null;
  }

  if (!wordList || wordList.length === 0) {
    return null;
  }

  const normalizedText = text.toLowerCase();

  const foundWord = wordList.find(badWord => {
    const regex = new RegExp(`\\b${badWord}\\b`, "i");
    return regex.test(normalizedText);
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
  const notAllowedWord = checkForWords(text, wordLists.notAllowed);
  if (notAllowedWord) {
    return {
      valid: false,
      error: "Your input contains words that are not allowed",
      type: "notAllowed",
    };
  }

  // Check for inappropriate words
  const inappropriateWord = checkForWords(text, wordLists.inappropriate);
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
