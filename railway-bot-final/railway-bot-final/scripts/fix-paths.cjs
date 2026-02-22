// scripts/fix-paths.cjs
// Reemplaza los imports de @shared/* por rutas relativas correctas en el output compilado
const fs = require("fs");
const path = require("path");

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  // Reemplaza require("@shared/...") por require("../shared/...")
  const fixed = content.replace(/require\(["']@shared\/([^"']+)["']\)/g, 'require("../shared/$1")');
  if (fixed !== content) {
    fs.writeFileSync(filePath, fixed);
    console.log(`Fixed: ${filePath}`);
  }
}

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (file.endsWith(".js")) {
      fixFile(fullPath);
    }
  }
}

walkDir("dist");
console.log("✅ Path aliases fixed.");
