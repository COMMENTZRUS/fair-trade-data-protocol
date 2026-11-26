import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcPath = path.resolve(__dirname, "..", "..", "..", "sdk", "dist", "ftdp-snippet.js");
const destDir = path.resolve(__dirname, "..", "public", "sdk");
const destPath = path.join(destDir, "ftdp-snippet.js");

if (fs.existsSync(srcPath)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(srcPath, destPath);
  console.log(`Synced hosted browser snippet -> ${destPath}`);
} else if (!fs.existsSync(destPath)) {
  console.warn(`Warning: ${srcPath} not found; build @ftdp/sdk first to bundle ftdp-snippet.js`);
}
