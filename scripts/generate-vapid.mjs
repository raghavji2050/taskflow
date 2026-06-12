import webpush from "web-push";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");

const keys = webpush.generateVAPIDKeys();

let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

if (!env.endsWith("\n") && env.length > 0) {
  env += "\n";
}

const setOrAppend = (key, value) => {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}="${value}"`;
  if (pattern.test(env)) {
    env = env.replace(pattern, line);
  } else {
    if (!env.includes("# Push notifications")) {
      env += "\n# Push notifications (run: npm run generate:vapid)\n";
    }
    env += `${line}\n`;
  }
};

setOrAppend("VAPID_PUBLIC_KEY", keys.publicKey);
setOrAppend("VAPID_PRIVATE_KEY", keys.privateKey);
setOrAppend("NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey);

fs.writeFileSync(envPath, env);

console.log("VAPID keys written to .env");
console.log("Public key:", keys.publicKey);
console.log("Restart the dev server for changes to take effect.");
