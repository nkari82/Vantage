import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(process.cwd(), "data");

export function appendMetric(filename: string, data: any) {
  const filePath = path.join(DATA_DIR, filename);
  const entry = JSON.stringify({ ...data, timestamp: Date.now() }) + "\n";
  fs.appendFileSync(filePath, entry, "utf8");
}

export function readMetrics(filename: string, limit = 100) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .trim()
    .split("\n")
    .slice(-limit)
    .map((line) => JSON.parse(line));
}
