import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig(config, {
  testMatch: "**/*shots.spec.ts",
  testIgnore: [],
});
