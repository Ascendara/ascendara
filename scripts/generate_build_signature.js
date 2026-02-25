/**
 * Generate Build Signature
 * Creates a unique signature for each build that cannot be replicated by forked projects
 * This signature is embedded during the build process and validated by the backend
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

// Load BUILD_SECRET from config file or environment
function getBuildSecret() {
  // First try environment variable
  if (process.env.BUILD_SECRET) {
    return process.env.BUILD_SECRET;
  }

  // Then try local config file
  const configPath = path.join(__dirname, "..", "build.config.json");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.BUILD_SECRET) {
        return config.BUILD_SECRET;
      }
    } catch (error) {
      console.error("Warning: Failed to read build.config.json:", error.message);
    }
  }

  return null;
}

// Generate unique build signature
function generateBuildSignature() {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(32).toString("hex");
  const version = require("../package.json").version;

  const signatureData = `${timestamp}:${randomBytes}:${version}`;

  const buildSecret = getBuildSecret();

  if (!buildSecret) {
    console.error("❌ ERROR: BUILD_SECRET is not configured!");
    console.error("");
    console.error("Option 1: Create build.config.json in project root:");
    console.error("  {");
    console.error('    "BUILD_SECRET": "your-secret-here"');
    console.error("  }");
    console.error("");
    console.error("Option 2: Set environment variable:");
    console.error('  Windows (PowerShell): $env:BUILD_SECRET="your-secret-here"');
    console.error("  Windows (CMD):        set BUILD_SECRET=your-secret-here");
    console.error('  Linux/Mac:            export BUILD_SECRET="your-secret-here"');
    console.error("");
    console.error("Generate a random secret:");
    console.error(
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
    console.error("");
    process.exit(1);
  }

  const signature = crypto
    .createHmac("sha256", buildSecret)
    .update(signatureData)
    .digest("hex");

  const buildSignature = {
    signature,
    timestamp,
    version,
    buildId: crypto.randomBytes(16).toString("hex"),
  };

  return buildSignature;
}

// Generate and save build signature
const buildSignature = generateBuildSignature();

// Create build-signature.json file that will be embedded in the app
const outputPath = path.join(__dirname, "..", "electron", "build-signature.json");
fs.writeFileSync(outputPath, JSON.stringify(buildSignature, null, 2));

console.log("✅ Build signature generated:");
console.log(`   Build ID: ${buildSignature.buildId}`);
console.log(`   Version: ${buildSignature.version}`);
console.log(`   Timestamp: ${new Date(buildSignature.timestamp).toISOString()}`);
console.log(`   Signature: ${buildSignature.signature.substring(0, 16)}...`);

// Also output for CI/CD to register with backend
console.log("\n📝 Register this build with backend:");
console.log(JSON.stringify(buildSignature));

module.exports = { generateBuildSignature };
