import { QueueRepository, type EnqueueJobParams, type ReviewJob } from '../db/repositories/queueRepository.js';

export class JobQueue {
  private repository: QueueRepository;

  constructor(repository?: QueueRepository) {
    this.repository = repository ?? new QueueRepository();
  }

  async enqueue(params: EnqueueJobParams): Promise<boolean> {
    return await this.repository.enqueueJob(params);
  }

  async poll(): Promise<ReviewJob | null> {
    return await this.repository.acquireNextJob();
  }

  async markComplete(jobId: number): Promise<void> {
    await this.repository.completeJob(jobId);
  }

  async markFailed(jobId: number, error: string): Promise<void> {
    await this.repository.failJob(jobId, error);
  }

  async recoverStale(staleMinutes?: number): Promise<number> {
    return await this.repository.recoverStaleJobs(staleMinutes);
  }
}
