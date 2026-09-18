const getToken = async () => {
  try {
    const authHeaders = await window.electron.getAuthHeaders();
    const response = await fetch("https://api.ascendara.app/auth/token", {
      headers: authHeaders,
    });

    if (!response.ok) {
      throw new Error("Failed to obtain token");
    }

    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error("Error getting token:", error);
    throw error;
  }
};

const fetchEarlyChanges = async () => {
  try {
    const token = await getToken();
    const response = await fetch("https://api.ascendara.app/app/earlychanges/read", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.ok) {
      return await response.json();
    } else if (response.status === 401) {
      // If token expired, try once with a new token
      const newToken = await getToken();
      const retryResponse = await fetch(
        "https://api.ascendara.app/app/earlychanges/read",
        {
          headers: {
            Authorization: `Bearer ${newToken}`,
          },
        }
      );

      if (retryResponse.ok) {
        return await retryResponse.json();
      }
      throw new Error("Failed to fetch early changes after token refresh");
    }
    throw new Error("Failed to fetch early changes");
  } catch (error) {
    console.error("Error fetching early changes:", error);
    throw error;
  }
};

const voteForFeature = async (featureId, voteType) => {
  const promise = (async () => {
    {
      // Ensure featureId is a number
      const numericFeatureId = parseInt(featureId, 10);
      if (isNaN(numericFeatureId)) {
        throw new Error("Invalid feature ID");
      }

      const token = await getToken();
      const response = await fetch("https://api.ascendara.app/app/earlychanges/vote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          featureId: numericFeatureId,
          voteType, // "up" or "down"
        }),
      });

      const data = await response.json();

      if (response.ok) {
        return data;
      } else if (response.status === 401) {
        // If token expired, try once with a new token
        const newToken = await getToken();
        const retryResponse = await fetch(
          "https://api.ascendara.app/app/earlychanges/vote",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${newToken}`,
            },
            body: JSON.stringify({
              featureId,
              voteType,
            }),
          }
        );

        if (retryResponse.ok) {
          return await retryResponse.json();
        } else {
          throw new Error("Failed to submit vote after token refresh");
        }
      } else {
        throw new Error("Failed to submit vote");
      }
    }
  })();

  return promise;
};

export default {
  fetchEarlyChanges,
  voteForFeature,
};
