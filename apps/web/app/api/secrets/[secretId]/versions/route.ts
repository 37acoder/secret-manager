import { jsonError, jsonOk } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function GET(_request: Request, { params }: { params: Promise<{ secretId: string }> }) {
  try {
    const { secretId } = await params;
    return jsonOk({ versions: await secretService.listVersions(secretId) });
  } catch (error) {
    return jsonError(error);
  }
}
