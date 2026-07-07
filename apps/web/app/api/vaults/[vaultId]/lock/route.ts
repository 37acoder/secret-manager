import { actorFrom, jsonError, jsonOk } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function POST(request: Request, { params }: { params: Promise<{ vaultId: string }> }) {
  try {
    const { vaultId } = await params;
    return jsonOk({ vault: secretService.lockVault(vaultId, actorFrom(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
