import { createRequire } from "node:module";

const requireFromApi = createRequire(new URL("../apps/api/package.json", import.meta.url));
const webpush = requireFromApi("web-push");

const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:kodi-travel-companion@example.com";
const { publicKey, privateKey } = webpush.generateVAPIDKeys();

const renderVariables = {
  VAPID_PUBLIC_KEY: publicKey,
  VAPID_PRIVATE_KEY: privateKey,
  VAPID_SUBJECT: subject
};

console.log("# Kodi Web Push variables for Render");
console.log("# Paste these into the kodi-travel-companion Render service environment.");
console.log("# Do not commit these generated values.");
console.log("");

for (const [key, value] of Object.entries(renderVariables)) {
  console.log(`${key}=${value}`);
}
