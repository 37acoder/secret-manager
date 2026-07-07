import { actorFrom, jsonError, jsonOk, readJson } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function POST(request: Request, { params }: { params: Promise<{ vaultId: string }> }) {
  try {
    const { vaultId } = await params;
    const body = await readJson(request);
    return jsonOk({ vault: secretService.unlockVault(vaultId, body, actorFrom(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
