import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { upstreamFiles } from "./catalogue.mjs";

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Reads vendor/<project>/SOURCE.json and proves the synced files are complete and unchanged.
export async function readVendor(root, project) {
  const directory = join(root, "vendor", project.id);
  const record = JSON.parse(await readFile(join(directory, "SOURCE.json"), "utf8"));
  const sync = `Run: node scripts/sync.mjs ${project.id}`;
  if (record.repository !== project.repo) throw new Error(`vendor/${project.id}/SOURCE.json names ${record.repository}, expected ${project.repo}. ${sync}`);
  if (!/^[0-9a-f]{40}$/.test(record.commit ?? "")) throw new Error(`vendor/${project.id}/SOURCE.json needs the full source commit. ${sync}`);
  const expected = [...new Set(upstreamFiles(project))].sort();
  const recorded = Object.keys(record.files ?? {}).sort();
  if (JSON.stringify(expected) !== JSON.stringify(recorded)) {
    const missing = expected.filter((file) => !recorded.includes(file));
    const extra = recorded.filter((file) => !expected.includes(file));
    throw new Error(`vendor/${project.id}/SOURCE.json doesn't match the catalogue (missing: ${missing.join(", ") || "none"}; extra: ${extra.join(", ") || "none"}). ${sync}`);
  }
  const files = new Map();
  for (const [file, hash] of Object.entries(record.files)) {
    const bytes = await readFile(join(directory, file));
    if (sha256(bytes) !== hash) throw new Error(`vendor/${project.id}/${file} changed after syncing. Change it upstream in ${project.repo}, then sync again.`);
    files.set(file, bytes);
  }
  return { ...record, contents: files };
}
