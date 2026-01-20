/**
 * Device Parser Utility
 * Parses user agent strings to determine device type and platform
 */

/**
 * Parse user agent to determine device information
 * @param {string} userAgent - User agent string
 * @returns {Object} Device information including type, platform, and browser
 */
export const parseDeviceInfo = userAgent => {
  if (!userAgent) {
    return {
      type: "unknown",
      platform: "Unknown",
      browser: "Unknown",
      icon: "Monitor",
    };
  }

  const ua = userAgent.toLowerCase();

  // Detect device type
  let type = "desktop";
  let platform = "Unknown";
  let icon = "Monitor";

  // Mobile devices
  if (/iphone|ipod/.test(ua)) {
    type = "mobile";
    platform = "iPhone";
    icon = "Smartphone";
  } else if (/ipad/.test(ua)) {
    type = "tablet";
    platform = "iPad";
    icon = "Tablet";
  } else if (/android/.test(ua)) {
    if (/mobile/.test(ua)) {
      type = "mobile";
      platform = "Android";
      icon = "Smartphone";
    } else {
      type = "tablet";
      platform = "Android Tablet";
      icon = "Tablet";
    }
  }
  // Desktop platforms
  else if (/macintosh|mac os x/.test(ua)) {
    type = "desktop";
    platform = "macOS";
    icon = "Laptop";
  } else if (/windows/.test(ua)) {
    type = "desktop";
    platform = "Windows";
    icon = "Monitor";
  } else if (/linux/.test(ua)) {
    type = "desktop";
    platform = "Linux";
    icon = "Monitor";
  }

  // Detect browser
  let browser = "Unknown";
  if (/edg/.test(ua)) {
    browser = "Edge";
  } else if (/chrome/.test(ua) && !/edg/.test(ua)) {
    browser = "Chrome";
  } else if (/safari/.test(ua) && !/chrome/.test(ua)) {
    browser = "Safari";
  } else if (/firefox/.test(ua)) {
    browser = "Firefox";
  } else if (/opera|opr/.test(ua)) {
    browser = "Opera";
  }

  return {
    type,
    platform,
    browser,
    icon,
  };
};

/**
 * Get a human-readable device description
 * @param {Object} deviceInfo - Device info object from backend
 * @returns {string} Human-readable description
 */
export const getDeviceDescription = deviceInfo => {
  if (!deviceInfo) return "Unknown Device";

  const userAgent = deviceInfo.userAgent || "";
  const parsed = parseDeviceInfo(userAgent);

  // If we have a custom platform from backend, use it
  const platform = deviceInfo.platform || parsed.platform;

  return `${parsed.platform} • ${parsed.browser}`;
};

/**
 * Get device icon name for lucide-react
 * @param {Object} deviceInfo - Device info object from backend
 * @returns {string} Icon name
 */
export const getDeviceIcon = deviceInfo => {
  if (!deviceInfo) return "Monitor";

  const userAgent = deviceInfo.userAgent || "";
  const parsed = parseDeviceInfo(userAgent);

  return parsed.icon;
};
