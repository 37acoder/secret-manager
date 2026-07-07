import { jsonOk } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function GET() {
  return jsonOk({ auditEvents: secretService.listAuditEvents() });
}
