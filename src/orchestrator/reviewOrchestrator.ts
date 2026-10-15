import type { AIProvider } from '../providers/aiProvider.js';
import { parseUnifiedDiff, type ParsedDiff } from '../github/diffParser.js';
import { SecurityGuardrails } from '../security/guardrails.js';
import { EvidenceVerificationEngine } from '../security/evidenceVerification.js';
import { AgenticToolRegistry } from './tools.js';
import { BudgetManager } from './budgetManager.js';
import { ReviewStateMachine } from './stateMachine.js';
import { PlannerAgent, type PRMetadata } from '../agents/plannerAgent.js';
import { SecurityAgent } from '../agents/securityAgent.js';
import { LogicAgent } from '../agents/logicAgent.js';
import { StyleAgent } from '../agents/styleAgent.js';
import { SynthesiserAgent } from '../agents/synthesiserAgent.js';
import type {
  PlannerOutput,
  SecurityAgentOutput,
  LogicAgentOutput,
  StyleAgentOutput,
  SecurityFinding,
  LogicFinding,
  StyleFinding,
} from '../agents/schemas.js';

export interface OrchestrationInput {
  diffText: string;
  metadata: PRMetadata;
  fileContentMap?: Map<string, string>;
  maxBudgetUsd?: number;
  maxIterations?: number;
}

export interface OrchestrationResult {
  markdownReview: string;
  verifiedSecurityFindings: SecurityFinding[];
  verifiedLogicFindings: LogicFinding[];
  verifiedStyleFindings: StyleFinding[];
  plannerPlan: PlannerOutput;
  metrics: ReturnType<BudgetManager['getMetrics']>;
  stateHistory: ReturnType<ReviewStateMachine['getHistory']>;
  warnings: string[];
}

export class ReviewOrchestrator {
  private provider: AIProvider;
  private stateMachine: ReviewStateMachine;

  constructor(provider: AIProvider) {
    this.provider = provider;
    this.stateMachine = new ReviewStateMachine();
  }

  getStateMachine(): ReviewStateMachine {
    return this.stateMachine;
  }

  async runReview(input: OrchestrationInput): Promise<OrchestrationResult> {
    const warnings: string[] = [];
    const budgetManager = new BudgetManager(input.maxBudgetUsd ?? 0.25, input.maxIterations ?? 2);

    // 1. INITIALIZING State
    this.stateMachine.transitionTo('INITIALIZING', { title: input.metadata.title });

    const sizeCheck = SecurityGuardrails.validatePRSize(input.metadata.filesChanged, input.metadata.additions);
    if (!sizeCheck.isWithinLimits) {
      warnings.push(`Warning: ${sizeCheck.reason}`);
    }

    const leakedSecrets = SecurityGuardrails.inspectForLeakedCredentials([input.metadata.title, input.metadata.description]);
    if (leakedSecrets.length > 0) {
      warnings.push(...leakedSecrets);
    }

    // 2. PLANNING State
    this.stateMachine.transitionTo('PLANNING');
    const parsedDiff = parseUnifiedDiff(input.diffText);

    const planner = new PlannerAgent(this.provider);
    const plan = await planner.plan(input.diffText, input.metadata);
    budgetManager.recordUsage({ promptTokens: 600, completionTokens: 350, totalTokens: 950 }, 0.0001);

    if (plan.error) {
      this.stateMachine.transitionTo('FAILED', { error: plan.error });
      throw new Error(`Planner failure: ${plan.error}`);
    }

    // Prepare diff lookup map for batches
    const diffByFilename = new Map<string, string>();
    for (const f of parsedDiff.files) {
      const hunkText = f.hunks.map(h => `${h.header}\n${h.lines.map(l => (l.type === 'add' ? `+${l.content}` : l.type === 'delete' ? `-${l.content}` : ` ${l.content}`)).join('\n')}`).join('\n');
      diffByFilename.set(f.newPath, hunkText);
      diffByFilename.set(f.oldPath, hunkText);
    }

    // 3. PARALLEL_ANALYSIS State
    this.stateMachine.transitionTo('PARALLEL_ANALYSIS');

    const securityAgent = new SecurityAgent(this.provider);
    const logicAgent = new LogicAgent(this.provider);
    const styleAgent = new StyleAgent(this.provider);

    const [securityResults, logicResults, styleResults] = await Promise.all([
      Promise.all(
        plan.security_batches.map(async batch => {
          const fileDiffs = batch.files.map(f => ({
            filename: f,
            diff: diffByFilename.get(f) ?? '',
          }));
          const res = await securityAgent.reviewBatch(batch, fileDiffs, input.metadata.title);
          budgetManager.recordUsage({ promptTokens: 800, completionTokens: 400, totalTokens: 1200 }, 0.0005);
          return res;
        })
      ),
      Promise.all(
        plan.logic_batches.map(async batch => {
          const fileDiffs = batch.files.map(f => ({
            filename: f,
            diff: diffByFilename.get(f) ?? '',
          }));
          const res = await logicAgent.reviewBatch(batch, fileDiffs, input.metadata.title);
          budgetManager.recordUsage({ promptTokens: 750, completionTokens: 350, totalTokens: 1100 }, 0.0002);
          return res;
        })
      ),
      Promise.all(
        plan.style_batches.map(async batch => {
          const fileDiffs = batch.files.map(f => ({
            filename: f,
            diff: diffByFilename.get(f) ?? '',
          }));
          const res = await styleAgent.reviewBatch(batch, fileDiffs, input.metadata.title);
          budgetManager.recordUsage({ promptTokens: 600, completionTokens: 300, totalTokens: 900 }, 0.0001);
          return res;
        })
      ),
    ]);

    // 4. AGENTIC_INVESTIGATION State
    // Check if any critical security finding lacks auth confirmation and can be investigated with tools
    const toolRegistry = new AgenticToolRegistry({
      parsedDiff,
      fileContentMap: input.fileContentMap ?? new Map(),
    });

    const allSecurityFindings = securityResults.flatMap(r => r.findings);
    const hasUnconfirmedAuthIssues = allSecurityFindings.some(
      f => f.category.toLowerCase().includes('auth') || f.title.toLowerCase().includes('auth')
    );

    if (hasUnconfirmedAuthIssues && budgetManager.canInvestigateFurther()) {
      this.stateMachine.transitionTo('AGENTIC_INVESTIGATION', { iteration: budgetManager.incrementIteration() });

      // Autonomous tool invocation: inspect imports and surrounding snippets
      for (const finding of allSecurityFindings) {
        if (finding.category.toLowerCase().includes('auth')) {
          const importToolRes = toolRegistry.inspectImports(finding.file);
          const hasAuthImport = importToolRes.imports.some(imp => imp.toLowerCase().includes('auth'));
          if (!hasAuthImport) {
            finding.description += ' [Tool Verification: Confirmed no authentication middleware imported in target file]';
          }
        }
      }
    }

    // 5. EVIDENCE_VERIFICATION State
    this.stateMachine.transitionTo('EVIDENCE_VERIFICATION');
    const verifier = new EvidenceVerificationEngine(parsedDiff, input.fileContentMap);

    const verifiedSecurityFindings = verifier.filterAndEnrichFindings(allSecurityFindings);
    const verifiedLogicFindings = verifier.filterAndEnrichFindings(logicResults.flatMap(r => r.findings));
    const verifiedStyleFindings = verifier.filterAndEnrichFindings(styleResults.flatMap(r => r.findings));

    // Construct enriched specialist results with verified findings
    const enrichedSecurity: SecurityAgentOutput[] = securityResults.map(sr => ({
      ...sr,
      findings: verifiedSecurityFindings.filter(f => f.id.startsWith(sr.batch_id)),
    }));
    const enrichedLogic: LogicAgentOutput[] = logicResults.map(lr => ({
      ...lr,
      findings: verifiedLogicFindings.filter(f => f.id.startsWith(lr.batch_id)),
    }));
    const enrichedStyle: StyleAgentOutput[] = styleResults.map(st => ({
      ...st,
      findings: verifiedStyleFindings.filter(f => f.id.startsWith(st.batch_id)),
    }));

    // 6. SYNTHESIZING State
    this.stateMachine.transitionTo('SYNTHESIZING');
    const synthesiser = new SynthesiserAgent(this.provider);
    let markdownReview = await synthesiser.synthesise(
      input.metadata,
      plan,
      enrichedSecurity,
      enrichedLogic,
      enrichedStyle
    );
    budgetManager.recordUsage({ promptTokens: 1200, completionTokens: 600, totalTokens: 1800 }, 0.001);

    if (budgetManager.isBudgetExceeded()) {
      markdownReview = `> ⚠️ **Notice**: Review reached maximum computational budget ($${budgetManager.getMetrics().costUsd}); partial results synthesised.\n\n${markdownReview}`;
    }

    // 7. COMPLETED State
    this.stateMachine.transitionTo('COMPLETED');

    return {
      markdownReview,
      verifiedSecurityFindings,
      verifiedLogicFindings,
      verifiedStyleFindings,
      plannerPlan: plan,
      metrics: budgetManager.getMetrics(),
      stateHistory: this.stateMachine.getHistory(),
      warnings,
    };
  }
}
