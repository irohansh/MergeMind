import type { TokenUsage } from '../providers/aiProvider.js';

export class BudgetManager {
  private maxBudgetUsd: number;
  private currentCostUsd: number = 0;
  private totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private maxIterations: number;
  private currentIteration: number = 0;

  constructor(maxBudgetUsd: number = 0.25, maxIterations: number = 2) {
    this.maxBudgetUsd = maxBudgetUsd;
    this.maxIterations = maxIterations;
  }

  recordUsage(usage: TokenUsage, costUsd: number): void {
    this.totalUsage.promptTokens += usage.promptTokens;
    this.totalUsage.completionTokens += usage.completionTokens;
    this.totalUsage.totalTokens += usage.totalTokens;
    this.currentCostUsd += costUsd;
  }

  isBudgetExceeded(): boolean {
    return this.currentCostUsd >= this.maxBudgetUsd;
  }

  canInvestigateFurther(): boolean {
    if (this.isBudgetExceeded()) return false;
    return this.currentIteration < this.maxIterations;
  }

  incrementIteration(): number {
    this.currentIteration++;
    return this.currentIteration;
  }

  getMetrics(): {
    costUsd: number;
    maxBudgetUsd: number;
    totalUsage: TokenUsage;
    iterations: number;
    budgetExceeded: boolean;
  } {
    return {
      costUsd: Number(this.currentCostUsd.toFixed(6)),
      maxBudgetUsd: this.maxBudgetUsd,
      totalUsage: { ...this.totalUsage },
      iterations: this.currentIteration,
      budgetExceeded: this.isBudgetExceeded(),
    };
  }
}
