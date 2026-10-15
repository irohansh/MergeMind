export interface DiffLine {
  type: 'add' | 'delete' | 'context';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
  diffPosition: number; // 1-indexed position relative to the diff hunk for GitHub review comments
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface ParsedFileDiff {
  oldPath: string;
  newPath: string;
  isNew: boolean;
  isDeleted: boolean;
  isRenamed: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  // Map of newLineNumber -> DiffLine for fast line-to-diff lookup
  newLineMap: Map<number, DiffLine>;
}

export interface ParsedDiff {
  files: ParsedFileDiff[];
  totalAdditions: number;
  totalDeletions: number;
  filesChanged: number;
}

export function parseUnifiedDiff(diffText: string): ParsedDiff {
  const files: ParsedFileDiff[] = [];
  const lines = diffText.split('\n');

  let currentFile: ParsedFileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let diffPosition = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    if (line.startsWith('diff --git')) {
      diffPosition = 0;
      const parts = line.split(' ');
      const oldPath = parts[2]?.replace(/^a\//, '') ?? '';
      const newPath = parts[3]?.replace(/^b\//, '') ?? '';

      currentFile = {
        oldPath,
        newPath,
        isNew: false,
        isDeleted: false,
        isRenamed: false,
        additions: 0,
        deletions: 0,
        hunks: [],
        newLineMap: new Map(),
      };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (line.startsWith('new file mode')) {
      currentFile.isNew = true;
      continue;
    }
    if (line.startsWith('deleted file mode')) {
      currentFile.isDeleted = true;
      continue;
    }
    if (line.startsWith('similarity index') || line.startsWith('rename from')) {
      currentFile.isRenamed = true;
      continue;
    }

    // Hunk header: @@ -oldStart,oldLines +newStart,newLines @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
    if (hunkMatch) {
      diffPosition++;
      const oldStart = parseInt(hunkMatch[1] ?? '1', 10);
      const oldLines = parseInt(hunkMatch[2] ?? '1', 10);
      const newStart = parseInt(hunkMatch[3] ?? '1', 10);
      const newLines = parseInt(hunkMatch[4] ?? '1', 10);

      currentHunk = {
        header: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    diffPosition++;

    // Calculate current old & new line numbers
    const previousLines = currentHunk.lines;
    let oldOffset = 0;
    let newOffset = 0;
    for (const prev of previousLines) {
      if (prev.type === 'delete' || prev.type === 'context') oldOffset++;
      if (prev.type === 'add' || prev.type === 'context') newOffset++;
    }

    if (line.startsWith('+')) {
      const newLineNum = currentHunk.newStart + newOffset;
      const diffLine: DiffLine = {
        type: 'add',
        content: line.slice(1),
        newLineNumber: newLineNum,
        diffPosition,
      };
      currentHunk.lines.push(diffLine);
      currentFile.additions++;
      currentFile.newLineMap.set(newLineNum, diffLine);
    } else if (line.startsWith('-')) {
      const oldLineNum = currentHunk.oldStart + oldOffset;
      const diffLine: DiffLine = {
        type: 'delete',
        content: line.slice(1),
        oldLineNumber: oldLineNum,
        diffPosition,
      };
      currentHunk.lines.push(diffLine);
      currentFile.deletions++;
    } else if (line.startsWith(' ') || line === '') {
      const oldLineNum = currentHunk.oldStart + oldOffset;
      const newLineNum = currentHunk.newStart + newOffset;
      const diffLine: DiffLine = {
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldLineNumber: oldLineNum,
        newLineNumber: newLineNum,
        diffPosition,
      };
      currentHunk.lines.push(diffLine);
    }
  }

  let totalAdditions = 0;
  let totalDeletions = 0;
  for (const f of files) {
    totalAdditions += f.additions;
    totalDeletions += f.deletions;
  }

  return {
    files,
    totalAdditions,
    totalDeletions,
    filesChanged: files.length,
  };
}

export function isLockOrGeneratedFile(filepath: string): boolean {
  const lower = filepath.toLowerCase();
  return (
    lower.endsWith('package-lock.json') ||
    lower.endsWith('yarn.lock') ||
    lower.endsWith('pnpm-lock.yaml') ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css') ||
    lower.includes('/dist/') ||
    lower.includes('/build/') ||
    lower.endsWith('.generated.ts') ||
    lower.endsWith('.generated.js')
  );
}
