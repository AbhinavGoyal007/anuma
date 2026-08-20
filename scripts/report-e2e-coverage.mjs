/**
 * How many Intelligence end-to-end tests actually ran.
 *
 * The failure this guards against is not a red test — it is a green run in
 * which the authenticated suite never executed. Reading the count out of
 * Playwright's own report and failing on zero makes that impossible to miss,
 * and puts the number in the job summary where somebody will see it.
 */

import { readFileSync } from "node:fs";

const [file] = process.argv.slice(2);
if (!file) {
  console.error("Name the Playwright JSON report.");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync(file, "utf8"));
} catch (failure) {
  console.log("## End-to-end\n\nNo Playwright report was produced — the run did not get that far.");
  console.error(failure instanceof Error ? failure.message : failure);
  process.exit(1);
}

const counts = { executed: 0, passed: 0, failed: 0, skipped: 0 };

function walk(suite) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const intelligence = (test.projectName ?? "").startsWith("intelligence");
      if (!intelligence) continue;
      const status = test.status ?? "unknown";
      if (status === "skipped") counts.skipped += 1;
      else {
        counts.executed += 1;
        if (test.results?.some((result) => result.status === "passed")) counts.passed += 1;
        else counts.failed += 1;
      }
    }
  }
  for (const child of suite.suites ?? []) walk(child);
}

for (const suite of report.suites ?? []) walk(suite);

console.log("## Intelligence end-to-end\n");
console.log(`- executed: **${counts.executed}**`);
console.log(`- passed: ${counts.passed}`);
console.log(`- failed: ${counts.failed}`);
console.log(`- skipped: ${counts.skipped}`);

if (counts.executed === 0) {
  console.log("\n**Zero Intelligence tests executed. That is a failure, not a pass.**");
  process.exit(1);
}
if (counts.skipped > 0) {
  console.log("\n**An Intelligence test was skipped. The suite must not skip itself.**");
  process.exit(1);
}
