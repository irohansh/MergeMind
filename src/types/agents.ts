export type RiskLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Batch {
  batch_id: string;
  files: string[];
  focus_areas: string[];
  risk_level: RiskLevel;
}

export interface PlannerOutput {
  pr_summary: string;
  total_files_changed: number;
  overall_risk: RiskLevel;
  security_batches: Batch[];
  logic_batches: Batch[];
  style_batches: Batch[];
  skip_files: string[];
  skip_reason: string;
  error?: string;
}

export interface SecurityFinding {
  id: string;
  file: string;
  line: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  title: string;
  description: string;
  vulnerable_code: string;
  recommendation: string;
  cwe_id?: string;
  owasp?: string;
}

export interface LogicFinding {
  id: string;
  file: string;
  line: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  category: string;
  title: string;
  description: string;
  buggy_code: string;
  fix: string;
  test_case: string;
}

export interface StyleFinding {
  id: string;
  file: string;
  line: number;
  severity: 'MODERATE' | 'MINOR' | 'SUGGESTION';
  category: string;
  title: string;
  current_code: string;
  suggestion: string;
  rationale: string;
}

export interface FocusValidation {
  focus_area: string;
  confirmed: boolean;
  finding_id?: string;
  note?: string;
}

export interface SecurityAgentOutput {
  batch_id: string;
  agent: 'security';
  findings: SecurityFinding[];
  planner_focus_validation: FocusValidation[];
  files_with_no_issues: string[];
  review_notes?: string;
}

export interface LogicAgentOutput {
  batch_id: string;
  agent: 'logic';
  findings: LogicFinding[];
  planner_focus_validation: FocusValidation[];
  files_with_no_issues: string[];
}

export interface StyleAgentOutput {
  batch_id: string;
  agent: 'style';
  findings: StyleFinding[];
  praise: { file: string; note: string }[];
  files_with_no_issues: string[];
}

export interface AgentLog {
  run_id: string;
  role: string;
  model: string;
  batch_id: string;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  timestamp: string;
}
