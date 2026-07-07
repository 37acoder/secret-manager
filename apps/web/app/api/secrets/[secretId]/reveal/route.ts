import { actorFrom, jsonError, jsonOk } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function POST(request: Request, { params }: { params: Promise<{ secretId: string }> }) {
  try {
    const { secretId } = await params;
    return jsonOk({ secret: await secretService.revealSecret(secretId, actorFrom(request), "secret.reveal") });
  } catch (error) {
    return jsonError(error);
  }
}
