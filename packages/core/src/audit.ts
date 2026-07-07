import { redact } from "@secret-manager/crypto";

export type AuditAction =
  | "secret.create"
  | "secret.update"
  | "secret.reveal"
  | "secret.delete";

export interface AuditEvent {
  id: string;
  accountId: string;
  actorUserId: string;
  action: AuditAction;
  targetType: "secret";
  targetId: string;
  outcome: "success" | "failure";
  metadata: Record<string, unknown>;
  requestId?: string | undefined;
  createdAt: Date;
}

export interface AuditSink {
  write(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent>;
}

export class InMemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];

  async write(event: Omit<AuditEvent, "id" | "createdAt">): Promise<AuditEvent> {
    const stored: AuditEvent = {
      ...event,
      id: `audit_${this.events.length + 1}`,
      metadata: redact(event.metadata) as Record<string, unknown>,
      createdAt: new Date()
    };
    this.events.push(stored);
    return stored;
  }
}
