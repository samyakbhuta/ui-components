// Runs before `npm publish`: a prerelease like 0.1.0-beta.0 must not become `latest`,
// or a plain `npm install` would hand people the beta. Publish betas with --tag beta.
import { readFile } from "node:fs/promises";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const tag = process.env.npm_config_tag || "latest";
if (version.includes("-") && tag === "latest") {
  console.error(`${version} is a prerelease. Publish it with: npm publish --tag beta`);
  process.exit(1);
}
console.log(`Publishing ${version} under the "${tag}" tag.`);
