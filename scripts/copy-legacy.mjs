import { cpSync } from "node:fs";
// Keep the original workflow builder available in production as well as dev.
cpSync("workflow-prototype", "dist/workflow-prototype", {
  recursive: true,
  filter: (source) =>
    !source.includes("/screens") && !source.endsWith(".test.cjs"),
});
