import path from "node:path";
import { defineConfig } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrate: {
    async seed() {
      const { execSync } = await import("node:child_process");
      execSync("tsx src/seed.ts", { stdio: "inherit" });
    },
  },
});
