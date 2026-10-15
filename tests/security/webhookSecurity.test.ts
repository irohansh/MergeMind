import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { GitHubWebhookHandler } from '../../src/github/webhookHandler.js';

describe('Webhook Security & HMAC Verification Tests', () => {
  const secret = 'super-secure-webhook-secret-12345';
  const handler = new GitHubWebhookHandler(secret);

  const samplePayload = JSON.stringify({
    action: 'opened',
    number: 42,
    pull_request: {
      id: 100,
      number: 42,
      title: 'Fix auth flaw',
      body: 'Addresses vulnerability',
      head: { sha: 'abc1234', ref: 'fix-branch' },
      base: { sha: 'def5678', ref: 'main' },
      user: { login: 'security-tester' },
    },
    repository: {
      name: 'secure-repo',
      owner: { login: 'acme-corp' },
    },
  });

  it('accepts requests with valid HMAC-SHA256 signature', () => {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(samplePayload)
      .digest('hex');

    const isValid = handler.verifySignature(samplePayload, `sha256=${signature}`);
    expect(isValid).toBe(true);
  });

  it('rejects requests with tampered or modified payload', () => {
    const signature = crypto
      .createHmac('sha256', secret)
      .update(samplePayload)
      .digest('hex');

    const tamperedPayload = samplePayload.replace('Fix auth flaw', 'Malicious change');
    const isValid = handler.verifySignature(tamperedPayload, `sha256=${signature}`);
    expect(isValid).toBe(false);
  });

  it('rejects requests with forged or invalid signatures', () => {
    const forgedSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    const isValid = handler.verifySignature(samplePayload, forgedSignature);
    expect(isValid).toBe(false);
  });

  it('safely rejects malformed or missing signature headers', () => {
    expect(handler.verifySignature(samplePayload, undefined)).toBe(false);
    expect(handler.verifySignature(samplePayload, 'md5=invalid')).toBe(false);
  });

  it('correctly parses valid PR events and ignores non-PR events', () => {
    const prResult = handler.parseEvent('pull_request', samplePayload);
    expect(prResult.isSupported).toBe(true);
    expect(prResult.payload?.pull_request.number).toBe(42);

    const pushResult = handler.parseEvent('push', samplePayload);
    expect(pushResult.isSupported).toBe(false);
  });
});
