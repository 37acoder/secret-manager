import { actorFrom, jsonError, jsonOk, readJson } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function GET(_request: Request, { params }: { params: Promise<{ vaultId: string }> }) {
  try {
    const { vaultId } = await params;
    return jsonOk({ vault: await secretService.getVault(vaultId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ vaultId: string }> }) {
  try {
    const { vaultId } = await params;
    const body = await readJson(request);
    return jsonOk({ vault: await secretService.updateVault(vaultId, body, actorFrom(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ vaultId: string }> }) {
  try {
    const { vaultId } = await params;
    return jsonOk(await secretService.deleteVault(vaultId, actorFrom(request)));
  } catch (error) {
    return jsonError(error);
  }
}
