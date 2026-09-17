import { Queue, Worker, type ConnectionOptions, type Processor } from 'bullmq';

// Central registry of the autonomous-loop queues. Every job here is passive and
// unattended. Active scanning is NOT a queue — it only runs from an approved
// gate check (see @quarry/core assertActiveScanAllowed).
export const QUEUE_NAMES = {
  discovery: 'discovery',
  reconPassive: 'recon-passive',
  analyze: 'analyze',
  report: 'report',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

function connection(): ConnectionOptions {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    // Do not retry forever at boot; fail fast so the process can log and stay up.
    maxRetriesPerRequest: null,
  };
}

const queues = new Map<QueueName, Queue>();

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: connection() });
    queues.set(name, q);
  }
  return q;
}

export function registerWorker(name: QueueName, processor: Processor): Worker {
  return new Worker(name, processor, { connection: connection() });
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}
