import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const packageJsonPath = path.join(rootDir, "package.json");
const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const targetVersion = packageJson.version;

if (!targetVersion) {
  throw new Error("package.json 缺少 version 字段");
}

const cargoToml = readFileSync(cargoTomlPath, "utf8");
const updatedCargoToml = cargoToml.replace(
  /^version\s*=\s*"[^"]+"/m,
  `version = "${targetVersion}"`
);

if (updatedCargoToml === cargoToml) {
  throw new Error("未在 Cargo.toml 中找到可替换的 version 字段");
}

writeFileSync(cargoTomlPath, updatedCargoToml, "utf8");
console.log(`已同步版本到 Cargo.toml: ${targetVersion}`);
