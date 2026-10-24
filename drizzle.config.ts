import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    // Só usado por comandos que conectam (push/studio); `generate` não conecta.
    url: process.env.DATABASE_URL ?? "postgres://localhost:5432/eneven_agenda",
  },
});
