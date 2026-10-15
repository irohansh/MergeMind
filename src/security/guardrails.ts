/**
 * MergeMind Operational Guardrails
 * Enforces non-negotiable security and governance constraints.
 */

export class SecurityGuardrails {
  /**
   * Anti-Auto-Approval Guardrail:
   * AI agents are strictly forbidden from submitting 'APPROVE' or merging PRs.
   */
  static assertSafeReviewAction(action: string): void {
    const forbidden = ['APPROVE', 'MERGE', 'AUTOCLOSE'];
    if (forbidden.includes(action.toUpperCase())) {
      throw new Error(`SECURITY VIOLATION: Agentic action '${action}' violates non-negotiable governance guardrails. AI agents can only comment.`);
    }
  }

  /**
   * Checks for sensitive files checked into diff (e.g. .env, private keys, certificates)
   */
  static inspectForLeakedCredentials(files: string[]): string[] {
    const alerts: string[] = [];
    const sensitivePatterns = [
      /\.env($|\.)/i,
      /id_rsa/i,
      /\.pem$/i,
      /\.key$/i,
      /service[_-]?account.*\.json$/i,
      /credentials\.json$/i,
    ];

    for (const file of files) {
      for (const pattern of sensitivePatterns) {
        if (pattern.test(file)) {
          alerts.push(`CRITICAL: Potentially sensitive secret or credential file detected in PR: ${file}`);
        }
      }
    }
    return alerts;
  }

  /**
   * Validates PR size limits to protect against denial of service or extreme cost
   */
  static validatePRSize(filesChanged: number, totalAdditions: number): { isWithinLimits: boolean; reason?: string } {
    const MAX_FILES = 100;
    const MAX_ADDITIONS = 8000;

    if (filesChanged > MAX_FILES) {
      return {
        isWithinLimits: false,
        reason: `Pull request changes ${filesChanged} files, exceeding safe limit of ${MAX_FILES} files.`,
      };
    }
    if (totalAdditions > MAX_ADDITIONS) {
      return {
        isWithinLimits: false,
        reason: `Pull request contains ${totalAdditions} additions, exceeding safe analysis limit of ${MAX_ADDITIONS} lines.`,
      };
    }
    return { isWithinLimits: true };
  }
}
