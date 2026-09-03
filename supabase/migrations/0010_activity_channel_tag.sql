-- Phase 1 voice: tag which channel produced a booking/feedback/escalation
-- row, so the customer-activity view can show a Call/Chat badge. Assigned
-- entirely by our own two call sites (chat route, voice route), never by
-- the model -- unlike agent_feedback.sentiment (deliberately unconstrained
-- per 0007's own comment, since that one IS LLM-assigned), a check
-- constraint here costs nothing and catches a real typo class for free.
-- default 'chat' backfills every existing row (all genuinely
-- chat-originated, pre-dating voice) atomically in the same statement.

alter table agent_bookings
  add column channel text not null default 'chat' check (channel in ('chat', 'call'));

alter table agent_feedback
  add column channel text not null default 'chat' check (channel in ('chat', 'call'));

alter table agent_escalations
  add column channel text not null default 'chat' check (channel in ('chat', 'call'));
