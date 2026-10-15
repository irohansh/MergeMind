import type { ParsedDiff } from '../github/diffParser.js';

export interface ToolContext {
  parsedDiff: ParsedDiff;
  fileContentMap: Map<string, string>;
}

export class AgenticToolRegistry {
  private context: ToolContext;

  constructor(context: ToolContext) {
    this.context = context;
  }

  /**
   * Tool: readSourceSnippet
   * Reads a bounded window of code from the file to confirm context around a finding.
   * Hard limit: max 50 lines to prevent context blowing.
   */
  readSourceSnippet(filePath: string, startLine: number, endLine: number): { success: boolean; snippet?: string; error?: string } {
    const requestedLines = endLine - startLine + 1;
    if (requestedLines > 50) {
      return { success: false, error: 'Requested line range exceeds maximum tool limit of 50 lines.' };
    }
    if (startLine < 1 || endLine < startLine) {
      return { success: false, error: 'Invalid line range requested.' };
    }

    const fileContent = this.context.fileContentMap.get(filePath);
    if (!fileContent) {
      // Fallback: check if lines exist in diff
      const fileDiff = this.context.parsedDiff.files.find(f => f.newPath === filePath);
      if (!fileDiff) {
        return { success: false, error: `File '${filePath}' not found in repository or diff context.` };
      }
      const matchedLines: string[] = [];
      for (let l = startLine; l <= endLine; l++) {
        const diffLine = fileDiff.newLineMap.get(l);
        if (diffLine) {
          matchedLines.push(`${l}: ${diffLine.content}`);
        }
      }
      if (matchedLines.length === 0) {
        return { success: false, error: `No diff lines found for '${filePath}' in range ${startLine}-${endLine}.` };
      }
      return { success: true, snippet: matchedLines.join('\n') };
    }

    const allLines = fileContent.split('\n');
    const slice = allLines.slice(startLine - 1, endLine);
    const numbered = slice.map((line, idx) => `${startLine + idx}: ${line}`).join('\n');

    return { success: true, snippet: numbered };
  }

  /**
   * Tool: verifyLineRange
   * Checks whether a specific line range was modified in the PR diff.
   */
  verifyLineRange(filePath: string, startLine: number, endLine: number): { isModifiedInPR: boolean; addedLines: number[] } {
    const fileDiff = this.context.parsedDiff.files.find(f => f.newPath === filePath);
    if (!fileDiff) {
      return { isModifiedInPR: false, addedLines: [] };
    }

    const addedLines: number[] = [];
    for (let l = startLine; l <= endLine; l++) {
      if (fileDiff.newLineMap.has(l)) {
        addedLines.push(l);
      }
    }

    return {
      isModifiedInPR: addedLines.length > 0,
      addedLines,
    };
  }

  /**
   * Tool: inspectImports
   * Inspects all import statements declared in the file to verify if required security middlewares exist.
   */
  inspectImports(filePath: string): { imports: string[] } {
    const fileContent = this.context.fileContentMap.get(filePath);
    const lines = fileContent ? fileContent.split('\n') : [];

    // Also look in diff additions if file not fully loaded
    if (lines.length === 0) {
      const fileDiff = this.context.parsedDiff.files.find(f => f.newPath === filePath);
      if (fileDiff) {
        for (const dl of fileDiff.newLineMap.values()) {
          lines.push(dl.content);
        }
      }
    }

    const imports: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('import ') || trimmed.startsWith('const ') && trimmed.includes('require(')) {
        imports.push(trimmed);
      }
    }

    return { imports };
  }
}
