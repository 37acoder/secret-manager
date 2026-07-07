import { actorFrom, jsonError, jsonOk, readJson } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function GET(_request: Request, { params }: { params: Promise<{ vaultId: string }> }) {
  const { vaultId } = await params;
  return jsonOk({ secrets: secretService.listSecrets(vaultId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ vaultId: string }> }) {
  try {
    const { vaultId } = await params;
    const body = await readJson(request);
    return jsonOk({ secret: secretService.createSecret(vaultId, body, actorFrom(request)) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
