const ignoredCodes = new Set(["composition_file_too_large"]);

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}

const input = Buffer.concat(chunks).toString("utf8").trim();
if (!input) {
  process.exit(0);
}

const report = JSON.parse(input);
const findings = Array.isArray(report.findings) ? report.findings : [];
const visibleFindings = findings.filter((finding) => !ignoredCodes.has(finding.code));
const ignoredFindings = findings.length - visibleFindings.length;
const errorCount = visibleFindings.filter((finding) => finding.severity === "error").length;
const warningCount = visibleFindings.filter((finding) => finding.severity === "warning").length;

for (const finding of visibleFindings) {
  const marker = finding.severity === "error" ? "ERROR" : "WARN";
  console.log(`${marker} ${finding.code}: ${finding.message}`);
  if (finding.file) console.log(`  ${finding.file}`);
  if (finding.fixHint) console.log(`  ${finding.fixHint}`);
}

if (ignoredFindings > 0) {
  console.log(`Ignored ${ignoredFindings} accepted HyperFrames warning(s): ${Array.from(ignoredCodes).join(", ")}`);
}

console.log(`HyperFrames lint: ${errorCount} error(s), ${warningCount} warning(s) after filtering`);
process.exit(errorCount > 0 ? 1 : 0);
