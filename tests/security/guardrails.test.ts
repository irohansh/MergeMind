import { describe, it, expect } from 'vitest';
import { SecurityGuardrails } from '../../src/security/guardrails.js';

describe('Security Guardrails Unit Tests', () => {
  it('strictly forbids automated approval or merge actions', () => {
    expect(() => SecurityGuardrails.assertSafeReviewAction('APPROVE')).toThrow(/SECURITY VIOLATION/);
    expect(() => SecurityGuardrails.assertSafeReviewAction('MERGE')).toThrow(/SECURITY VIOLATION/);
    expect(() => SecurityGuardrails.assertSafeReviewAction('AUTOCLOSE')).toThrow(/SECURITY VIOLATION/);

    // COMMENT action is permitted
    expect(() => SecurityGuardrails.assertSafeReviewAction('COMMENT')).not.toThrow();
  });

  it('detects sensitive credential and key files in PR paths', () => {
    const files = [
      'src/index.ts',
      'config/.env.production',
      'keys/id_rsa',
      'service_account.json',
      'src/utils/format.ts',
    ];

    const alerts = SecurityGuardrails.inspectForLeakedCredentials(files);
    expect(alerts.length).toBe(3);
    expect(alerts[0]).toContain('.env.production');
    expect(alerts[1]).toContain('id_rsa');
    expect(alerts[2]).toContain('service_account.json');
  });

  it('enforces pull request file and addition size boundaries', () => {
    const normal = SecurityGuardrails.validatePRSize(10, 500);
    expect(normal.isWithinLimits).toBe(true);

    const oversizedFiles = SecurityGuardrails.validatePRSize(150, 500);
    expect(oversizedFiles.isWithinLimits).toBe(false);
    expect(oversizedFiles.reason).toContain('150 files');

    const oversizedAdditions = SecurityGuardrails.validatePRSize(10, 12000);
    expect(oversizedAdditions.isWithinLimits).toBe(false);
    expect(oversizedAdditions.reason).toContain('12000 additions');
  });
});
