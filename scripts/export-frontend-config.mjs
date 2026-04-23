import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const deploymentsDir = path.join(rootDir, "deployments");
const outputPath = path.join(rootDir, "frontend", "src", "lib", "contract-config.js");

function getPreferredDeployment() {
  const preferredNetworks = ["local", "testnet", "mainnet"];
  for (const networkName of preferredNetworks) {
    const candidate = path.join(deploymentsDir, `${networkName}.json`);
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf8"));
    }
  }

  return null;
}

const deployment = getPreferredDeployment();
const fileContents = `export const mindBloomConfig = ${JSON.stringify(
  {
    contractName: "MindBloom",
    fallbackContractId: deployment?.contractId || "",
    fallbackNetwork: deployment?.network || "testnet",
    generatedAt: deployment?.deployedAt || "",
    limits: {
      minSessionMinutes: 5,
      maxSessionMinutes: 480,
      minGoalMinutes: 30,
      maxGoalMinutes: 5000
    }
  },
  null,
  2
)};\n`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, fileContents);

console.log(`Frontend contract config written to ${outputPath}`);
