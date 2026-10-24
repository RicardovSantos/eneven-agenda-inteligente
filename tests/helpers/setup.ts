import { afterAll } from "vitest";
import { closeTestDbs } from "./test-db";

afterAll(async () => {
  await closeTestDbs();
});
