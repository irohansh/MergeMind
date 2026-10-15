export type ReviewState =
  | 'INITIALIZING'
  | 'PLANNING'
  | 'PARALLEL_ANALYSIS'
  | 'AGENTIC_INVESTIGATION'
  | 'EVIDENCE_VERIFICATION'
  | 'SYNTHESIZING'
  | 'PUBLISHING'
  | 'COMPLETED'
  | 'FAILED';

export interface StateTransitionEvent {
  from: ReviewState;
  to: ReviewState;
  timestamp: string;
  metadata?: Record<string, any> | undefined;
}

export class ReviewStateMachine {
  private currentState: ReviewState = 'INITIALIZING';
  private transitions: StateTransitionEvent[] = [];

  constructor() {
    this.recordTransition('INITIALIZING', { note: 'Review initialized' });
  }

  getState(): ReviewState {
    return this.currentState;
  }

  transitionTo(nextState: ReviewState, metadata?: Record<string, any>): void {
    const valid = this.isValidTransition(this.currentState, nextState);
    if (!valid) {
      throw new Error(`Invalid state transition from ${this.currentState} to ${nextState}`);
    }
    this.recordTransition(nextState, metadata);
    this.currentState = nextState;
  }

  private recordTransition(to: ReviewState, metadata?: Record<string, any>): void {
    this.transitions.push({
      from: this.currentState,
      to,
      timestamp: new Date().toISOString(),
      metadata,
    });
  }

  private isValidTransition(from: ReviewState, to: ReviewState): boolean {
    if (to === 'FAILED') return true; // Can always fail cleanly

    const allowed: Record<ReviewState, ReviewState[]> = {
      INITIALIZING: ['INITIALIZING', 'PLANNING', 'FAILED'],
      PLANNING: ['PARALLEL_ANALYSIS', 'FAILED'],
      PARALLEL_ANALYSIS: ['AGENTIC_INVESTIGATION', 'EVIDENCE_VERIFICATION', 'FAILED'],
      AGENTIC_INVESTIGATION: ['AGENTIC_INVESTIGATION', 'EVIDENCE_VERIFICATION', 'FAILED'],
      EVIDENCE_VERIFICATION: ['SYNTHESIZING', 'FAILED'],
      SYNTHESIZING: ['PUBLISHING', 'COMPLETED', 'FAILED'],
      PUBLISHING: ['COMPLETED', 'FAILED'],
      COMPLETED: [],
      FAILED: [],
    };

    return allowed[from]?.includes(to) ?? false;
  }

  getHistory(): StateTransitionEvent[] {
    return [...this.transitions];
  }
}
