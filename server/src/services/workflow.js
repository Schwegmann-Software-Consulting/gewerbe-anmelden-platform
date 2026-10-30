// Statusmaschine eines Antrags. Jede Änderung wird protokolliert und als Webhook gemeldet.
import { applications, events, jobs } from '../db.js';
import { config } from '../config.js';
import { emit } from './webhooks.js';

const ALLOWED = {
  draft: ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'draft', 'cancelled'],
  paid: ['in_review', 'queued', 'cancelled'],
  in_review: ['queued', 'needs_info', 'cancelled'],
  needs_info: ['in_review', 'cancelled'],
  queued: ['transmitted', 'manual_required', 'in_review'],
  manual_required: ['transmitted', 'in_review'],
  transmitted: ['acknowledged', 'needs_info', 'rejected', 'completed'],
  acknowledged: ['completed', 'needs_info', 'rejected'],
  rejected: ['in_review', 'cancelled'],
  completed: [],
  cancelled: [],
};

export class TransitionError extends Error {}

export function setStatus(app, to, { actor = 'system', note, payload = {} } = {}) {
  if (app.status === to) return app;
  if (!ALLOWED[app.status]?.includes(to)) {
    throw new TransitionError(`Statuswechsel ${app.status} → ${to} ist nicht erlaubt`);
  }
  applications.update(app.id, { status: to });
  events.add(app.id, 'status', { from: app.status, to, note, ...payload }, actor);
  emit('application.status_changed', { id: app.id, ref: app.ref, cityId: app.cityId, from: app.status, to, note });
  return { ...app, status: to };
}

// Nach erfolgreicher Zahlung: Prüfung durch Mensch oder direkt in die Übermittlung
export function onPaid(app, payment) {
  applications.update(app.id, { payment });
  let next = setStatus(app, 'paid', { actor: 'payment', payload: { provider: payment.provider } });
  if (config.reviewRequired) {
    next = setStatus(next, 'in_review');
  } else {
    next = queueTransmission(next, 'system');
  }
  return next;
}

export function queueTransmission(app, actor) {
  const next = setStatus(app, 'queued', { actor });
  jobs.enqueue('transmit', { applicationId: app.id });
  return next;
}
