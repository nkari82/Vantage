import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.static(distDir, {
  extensions: ["html"],
  immutable: true,
  maxAge: "1h",
}));

app.get("*", (_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[vantage-dashboard] serving ${distDir} on ${port}`);
});
