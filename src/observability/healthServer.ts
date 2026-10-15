import http from 'http';
import { getConfig } from '../config/env.js';
import { checkDatabaseConnection } from '../db/connection.js';
import { GitHubWebhookHandler } from '../github/webhookHandler.js';
import { JobQueue } from '../queue/jobQueue.js';
import { logger } from './logger.js';

export function createHealthServer(): http.Server {
  const config = getConfig();
  const webhookHandler = new GitHubWebhookHandler(config.GITHUB_WEBHOOK_SECRET);
  const queue = new JobQueue();
  const startTime = Date.now();

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    // 1. GET /health
    if (method === 'GET' && url === '/health') {
      const dbOk = await checkDatabaseConnection();
      const status = {
        status: 'UP',
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        database: dbOk ? 'CONNECTED' : 'STANDALONE_FALLBACK',
        aiProvider: config.AI_PROVIDER,
        timestamp: new Date().toISOString(),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status, null, 2));
      return;
    }

    // 2. GET /metrics
    if (method === 'GET' && url === '/metrics') {
      const metrics = {
        uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
        maxBudgetUsd: config.MAX_REVIEW_BUDGET_USD,
        batchConcurrency: config.BATCH_CONCURRENCY,
        provider: config.AI_PROVIDER,
        memoryUsage: process.memoryUsage(),
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(metrics, null, 2));
      return;
    }

    // 3. POST /webhook
    if (method === 'POST' && url === '/webhook') {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));

      req.on('end', async () => {
        const rawBody = Buffer.concat(chunks);
        const signatureHeader = req.headers['x-hub-signature-256'] as string | undefined;
        const eventHeader = req.headers['x-github-event'] as string | undefined;
        const deliveryId = (req.headers['x-github-delivery'] as string | undefined) ?? `del-${Date.now()}`;

        // Verify HMAC signature
        const isValid = webhookHandler.verifySignature(rawBody, signatureHeader);
        if (!isValid) {
          logger.warn('Rejected webhook with invalid HMAC signature', { deliveryId });
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid HMAC signature' }));
          return;
        }

        // Parse PR event
        const parsed = webhookHandler.parseEvent(eventHeader ?? '', rawBody.toString('utf8'));
        if (!parsed.isSupported || !parsed.payload) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ignored', reason: parsed.reason }));
          return;
        }

        const payload = parsed.payload;
        const enqueued = await queue.enqueue({
          deliveryId,
          repoOwner: payload.repository.owner.login,
          repoName: payload.repository.name,
          prNumber: payload.pull_request.number,
          headSha: payload.pull_request.head.sha,
        });

        logger.info('Received valid PR webhook', {
          deliveryId,
          pr: payload.pull_request.number,
          enqueued,
        });

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'accepted', deliveryId, enqueued }));
      });
      return;
    }

    // Default 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}

// Standalone execution if run directly via `npm run server`
if (process.argv[1]?.endsWith('healthServer.ts') || process.argv[1]?.endsWith('healthServer.js')) {
  const config = getConfig();
  const server = createHealthServer();
  server.listen(config.PORT, () => {
    console.log(`[server] MergeMind Server listening on port ${config.PORT}`);
    console.log(`[server] Health: http://localhost:${config.PORT}/health`);
    console.log(`[server] Webhook: http://localhost:${config.PORT}/webhook`);
  });
}
