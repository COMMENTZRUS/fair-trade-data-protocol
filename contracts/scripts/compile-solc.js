const fs = require("fs");
const path = require("path");
const solc = require("solc");

const rootDir = path.resolve(__dirname, "..");
const contractsDir = path.join(rootDir, "contracts");
const nodeModulesDir = path.join(rootDir, "node_modules");
const outDir = path.join(rootDir, "build");

function collectSolFiles(dir, prefix = "") {
  const results = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      Object.assign(results, collectSolFiles(fullPath, relPath));
    } else if (entry.name.endsWith(".sol")) {
      results[relPath] = { content: fs.readFileSync(fullPath, "utf8") };
    }
  }
  return results;
}

function findImports(importPath) {
  const candidates = [
    path.join(contractsDir, importPath),
    path.join(nodeModulesDir, importPath),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }
  return { error: `File not found: ${importPath}` };
}

const sources = collectSolFiles(contractsDir);
const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};

console.log(`Compiling ${Object.keys(sources).length} Solidity files with solc ${solc.version()}...`);
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let hasError = false;
if (output.errors) {
  for (const err of output.errors) {
    const prefix = err.severity === "error" ? "[ERROR]" : "[WARN]";
    console.log(`${prefix} ${err.formattedMessage}`);
    if (err.severity === "error") hasError = true;
  }
}

if (hasError) {
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
let count = 0;
for (const [sourceFile, fileContracts] of Object.entries(output.contracts || {})) {
  for (const [contractName, artifact] of Object.entries(fileContracts)) {
    const outPath = path.join(outDir, `${contractName}.json`);
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          contractName,
          sourceFile,
          abi: artifact.abi,
          bytecode: artifact.evm.bytecode.object ? `0x${artifact.evm.bytecode.object}` : "0x",
        },
        null,
        2
      )
    );
    count++;
  }
}
console.log(`Compiled successfully! Wrote ${count} contract artifacts to ${outDir}`);
