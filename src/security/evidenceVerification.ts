import type { ParsedDiff } from '../github/diffParser.js';
import type { SecurityFinding, LogicFinding, StyleFinding, EvidenceVerification } from '../agents/schemas.js';

type GenericFinding = SecurityFinding | LogicFinding | StyleFinding;

function normalizeCode(code: string): string {
  return code
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join(' ');
}

export class EvidenceVerificationEngine {
  private parsedDiff: ParsedDiff;
  private fileContentMap: Map<string, string>;

  constructor(parsedDiff: ParsedDiff, fileContentMap?: Map<string, string>) {
    this.parsedDiff = parsedDiff;
    this.fileContentMap = fileContentMap ?? new Map();
  }

  verifyFinding(finding: GenericFinding): EvidenceVerification {
    const fileDiff = this.parsedDiff.files.find(
      f => f.newPath === finding.file || f.oldPath === finding.file
    );

    if (!fileDiff) {
      return {
        finding_id: finding.id,
        status: 'UNVERIFIABLE',
        match_confidence: 0,
        reason: `File '${finding.file}' is not part of the pull request diff.`,
      };
    }

    const findingSnippet =
      'vulnerable_code' in finding
        ? finding.vulnerable_code
        : 'buggy_code' in finding
        ? finding.buggy_code
        : 'current_code' in finding
        ? finding.current_code
        : '';

    const normalizedSnippet = normalizeCode(findingSnippet);

    // 1. Check exact line match in diff
    const exactDiffLine = fileDiff.newLineMap.get(finding.line);
    if (exactDiffLine) {
      const normalizedDiffLine = normalizeCode(exactDiffLine.content);
      if (
        normalizedDiffLine.includes(normalizedSnippet) ||
        normalizedSnippet.includes(normalizedDiffLine) ||
        normalizedSnippet.length === 0
      ) {
        return {
          finding_id: finding.id,
          status: 'VERIFIED',
          match_confidence: 1.0,
          exact_line_matched: finding.line,
          reason: `Exact line and code matched in diff at line ${finding.line}.`,
        };
      }
    }

    // 2. Scan nearby lines (+/- 10 lines) in the diff
    for (const [lineNum, diffLine] of fileDiff.newLineMap.entries()) {
      const distance = Math.abs(lineNum - finding.line);
      if (distance <= 10) {
        const normalizedDiffLine = normalizeCode(diffLine.content);
        if (
          normalizedDiffLine.length > 5 &&
          (normalizedDiffLine.includes(normalizedSnippet) ||
            normalizedSnippet.includes(normalizedDiffLine))
        ) {
          return {
            finding_id: finding.id,
            status: 'VERIFIED',
            match_confidence: 0.9,
            exact_line_matched: lineNum,
            reason: `Code matched nearby in diff at line ${lineNum} (realigned from line ${finding.line}).`,
          };
        }
      }
    }

    // 3. Scan the entire file diff for the code snippet
    for (const [lineNum, diffLine] of fileDiff.newLineMap.entries()) {
      const normalizedDiffLine = normalizeCode(diffLine.content);
      if (
        normalizedSnippet.length > 10 &&
        (normalizedDiffLine.includes(normalizedSnippet) ||
          normalizedSnippet.includes(normalizedDiffLine))
      ) {
        return {
          finding_id: finding.id,
          status: 'VERIFIED',
          match_confidence: 0.75,
          exact_line_matched: lineNum,
          reason: `Code matched in diff at line ${lineNum} (realigned from ${finding.line}).`,
        };
      }
    }

    // 4. If full file content is provided, check the full file
    const fullContent = this.fileContentMap.get(finding.file);
    if (fullContent && normalizedSnippet.length > 5) {
      const fileLines = fullContent.split('\n');
      for (let i = 0; i < fileLines.length; i++) {
        const lineContent = normalizeCode(fileLines[i] ?? '');
        if (lineContent.includes(normalizedSnippet) || normalizedSnippet.includes(lineContent)) {
          return {
            finding_id: finding.id,
            status: 'VERIFIED',
            match_confidence: 0.7,
            exact_line_matched: i + 1,
            reason: `Code found in base file at line ${i + 1}, though not directly altered in this diff hunk.`,
          };
        }
      }
    }

    // Could not verify snippet against code
    return {
      finding_id: finding.id,
      status: 'DISPROVED',
      match_confidence: 0.1,
      reason: `Reported snippet could not be verified against actual code in ${finding.file} around line ${finding.line}.`,
    };
  }

  filterAndEnrichFindings<T extends GenericFinding>(findings: T[]): T[] {
    const verifiedFindings: T[] = [];

    for (const finding of findings) {
      const verification = this.verifyFinding(finding);
      if (verification.status === 'VERIFIED') {
        const enriched = {
          ...finding,
          line: verification.exact_line_matched ?? finding.line,
          verified: true,
          verification_notes: verification.reason,
        };
        verifiedFindings.push(enriched as T);
      } else {
        console.warn(`[evidence-rejected] Finding ${finding.id} in ${finding.file}:${finding.line} rejected: ${verification.reason}`);
      }
    }

    return verifiedFindings;
  }
}
