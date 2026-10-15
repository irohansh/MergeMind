import { z } from 'zod';

export const RiskLevelSchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const BatchSchema = z.object({
  batch_id: z.string(),
  files: z.array(z.string()),
  focus_areas: z.array(z.string()),
  risk_level: RiskLevelSchema,
});
export type Batch = z.infer<typeof BatchSchema>;

export const PlannerOutputSchema = z.object({
  pr_summary: z.string(),
  total_files_changed: z.number(),
  overall_risk: RiskLevelSchema,
  security_batches: z.array(BatchSchema),
  logic_batches: z.array(BatchSchema),
  style_batches: z.array(BatchSchema),
  skip_files: z.array(z.string()),
  skip_reason: z.string(),
  error: z.string().optional(),
});
export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export const FindingSeveritySchema = z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']);
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const SecurityFindingSchema = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number(),
  severity: FindingSeveritySchema,
  category: z.string(),
  title: z.string(),
  description: z.string(),
  vulnerable_code: z.string(),
  recommendation: z.string(),
  cwe_id: z.string().optional(),
  owasp: z.string().optional(),
  verified: z.boolean().default(false),
  verification_notes: z.string().optional(),
});
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const LogicFindingSchema = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number(),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW', 'INFO']),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  buggy_code: z.string(),
  fix: z.string(),
  test_case: z.string(),
  verified: z.boolean().default(false),
  verification_notes: z.string().optional(),
});
export type LogicFinding = z.infer<typeof LogicFindingSchema>;

export const StyleFindingSchema = z.object({
  id: z.string(),
  file: z.string(),
  line: z.number(),
  severity: z.enum(['MODERATE', 'MINOR', 'SUGGESTION']),
  category: z.string(),
  title: z.string(),
  current_code: z.string(),
  suggestion: z.string(),
  rationale: z.string(),
  verified: z.boolean().default(false),
  verification_notes: z.string().optional(),
});
export type StyleFinding = z.infer<typeof StyleFindingSchema>;

export const FocusValidationSchema = z.object({
  focus_area: z.string(),
  confirmed: z.boolean(),
  finding_id: z.string().optional(),
  note: z.string().optional(),
});
export type FocusValidation = z.infer<typeof FocusValidationSchema>;

export const SecurityAgentOutputSchema = z.object({
  batch_id: z.string(),
  agent: z.literal('security'),
  findings: z.array(SecurityFindingSchema),
  planner_focus_validation: z.array(FocusValidationSchema),
  files_with_no_issues: z.array(z.string()),
  review_notes: z.string().optional(),
});
export type SecurityAgentOutput = z.infer<typeof SecurityAgentOutputSchema>;

export const LogicAgentOutputSchema = z.object({
  batch_id: z.string(),
  agent: z.literal('logic'),
  findings: z.array(LogicFindingSchema),
  planner_focus_validation: z.array(FocusValidationSchema),
  files_with_no_issues: z.array(z.string()),
});
export type LogicAgentOutput = z.infer<typeof LogicAgentOutputSchema>;

export const StyleAgentOutputSchema = z.object({
  batch_id: z.string(),
  agent: z.literal('style'),
  findings: z.array(StyleFindingSchema),
  praise: z.array(z.object({ file: z.string(), note: z.string() })),
  files_with_no_issues: z.array(z.string()),
});
export type StyleAgentOutput = z.infer<typeof StyleAgentOutputSchema>;

export const EvidenceVerificationSchema = z.object({
  finding_id: z.string(),
  status: z.enum(['VERIFIED', 'DISPROVED', 'UNVERIFIABLE']),
  match_confidence: z.number().min(0).max(1),
  exact_line_matched: z.number().optional(),
  reason: z.string(),
});
export type EvidenceVerification = z.infer<typeof EvidenceVerificationSchema>;
