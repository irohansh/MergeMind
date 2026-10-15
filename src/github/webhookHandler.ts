import crypto from 'crypto';
import { z } from 'zod';

export const WebhookPRPayloadSchema = z.object({
  action: z.string(),
  number: z.number(),
  pull_request: z.object({
    id: z.number(),
    number: z.number(),
    title: z.string(),
    body: z.string().nullable().default(''),
    head: z.object({
      sha: z.string(),
      ref: z.string(),
    }),
    base: z.object({
      sha: z.string(),
      ref: z.string(),
    }),
    user: z.object({
      login: z.string(),
    }),
  }),
  repository: z.object({
    name: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

export type WebhookPRPayload = z.infer<typeof WebhookPRPayloadSchema>;

export class GitHubWebhookHandler {
  private secret?: string | undefined;

  constructor(secret?: string | undefined) {
    this.secret = secret;
  }

  /**
   * Constant-time HMAC-SHA256 signature verification over raw request body
   */
  verifySignature(rawBody: string | Buffer, signatureHeader?: string): boolean {
    if (!this.secret) {
      // If no secret configured, warn but allow in local/development mode
      return true;
    }

    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    const signature = signatureHeader.slice('sha256='.length);
    const expectedSignature = crypto
      .createHmac('sha256', this.secret)
      .update(rawBody)
      .digest('hex');

    if (signature.length !== expectedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    );
  }

  parseEvent(eventHeader: string, rawBody: string): { isSupported: boolean; payload?: WebhookPRPayload; reason?: string } {
    if (eventHeader !== 'pull_request') {
      return { isSupported: false, reason: `Ignored non-PR event: ${eventHeader}` };
    }

    try {
      const parsed = JSON.parse(rawBody);
      const validated = WebhookPRPayloadSchema.parse(parsed);

      const supportedActions = ['opened', 'synchronize', 'reopened'];
      if (!supportedActions.includes(validated.action)) {
        return { isSupported: false, reason: `Ignored PR action '${validated.action}'. Supported: ${supportedActions.join(', ')}` };
      }

      return { isSupported: true, payload: validated };
    } catch (err) {
      return { isSupported: false, reason: `Invalid webhook payload: ${(err as Error).message}` };
    }
  }
}
