// Einfache Job-Queue auf Datenbankbasis. Bei Last später durch BullMQ/Redis o. Ä. ersetzbar.
import { jobs, applications, events } from './db.js';
import { transmit } from './services/transmit/index.js';
import { emit } from './services/webhooks.js';

const HANDLERS = {
  transmit: ({ applicationId }) => transmit(applicationId),
};
const BACKOFF = [60, 300, 1800, 7200]; // Sekunden

async function tick() {
  let job;
  while ((job = jobs.claim())) {
    try {
      await HANDLERS[job.type](job.payload);
      jobs.done(job.id);
    } catch (err) {
      const appId = job.payload.applicationId;
      if (appId) events.add(appId, 'job_error', { job: job.type, attempt: job.attempts, error: err.message }, 'worker');
      if (job.attempts >= BACKOFF.length) {
        jobs.fail(job.id, err.message);
        emit('job.failed', { jobId: job.id, type: job.type, applicationId: appId, error: err.message });
        const app = appId && applications.get(appId);
        if (app) events.add(app.id, 'needs_attention', { reason: err.message }, 'worker');
      } else {
        jobs.retry(job.id, err.message, BACKOFF[job.attempts - 1]);
      }
    }
  }
}

export function startWorker(intervalMs = 3000) {
  const t = setInterval(() => tick().catch(console.error), intervalMs);
  return () => clearInterval(t);
}
