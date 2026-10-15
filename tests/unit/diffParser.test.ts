import { describe, it, expect } from 'vitest';
import { parseUnifiedDiff, isLockOrGeneratedFile } from '../../src/github/diffParser.js';

describe('DiffParser Unit Tests', () => {
  const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
index 1234567..abcdefg 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -10,2 +10,4 @@
 const a = 1;
 const b = 2;
+const c = 3;
+const d = 4;
diff --git a/package-lock.json b/package-lock.json
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/package-lock.json
@@ -0,0 +1,3 @@
+{
+  "name": "test"
+}
`;

  it('correctly parses multiple files, additions, and deletions', () => {
    const parsed = parseUnifiedDiff(sampleDiff);
    expect(parsed.filesChanged).toBe(2);
    expect(parsed.totalAdditions).toBe(5);
    expect(parsed.totalDeletions).toBe(0);

    const first = parsed.files[0]!;
    expect(first.newPath).toBe('src/index.ts');
    expect(first.additions).toBe(2);

    const second = parsed.files[1]!;
    expect(second.isNew).toBe(true);
    expect(second.newPath).toBe('package-lock.json');
  });

  it('accurately maps new line numbers to diff lines', () => {
    const parsed = parseUnifiedDiff(sampleDiff);
    const indexFile = parsed.files[0]!;
    expect(indexFile.newLineMap.has(12)).toBe(true);
    expect(indexFile.newLineMap.get(12)?.content).toBe('const c = 3;');
    expect(indexFile.newLineMap.get(13)?.content).toBe('const d = 4;');
  });

  it('identifies lockfiles and generated assets for review skipping', () => {
    expect(isLockOrGeneratedFile('package-lock.json')).toBe(true);
    expect(isLockOrGeneratedFile('yarn.lock')).toBe(true);
    expect(isLockOrGeneratedFile('dist/bundle.min.js')).toBe(true);
    expect(isLockOrGeneratedFile('src/api/users.ts')).toBe(false);
  });
});
