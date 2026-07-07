import { actorFrom, jsonError, jsonOk, readJson } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function POST(request: Request, { params }: { params: Promise<{ vaultId: string }> }) {
  try {
    const { vaultId } = await params;
    const body = await readJson(request);
    const format = body?.format === "encrypted" ? "encrypted" : "plaintext";
    if (format === "encrypted") {
      return jsonOk({ export: await secretService.exportEncryptedBackup(vaultId, actorFrom(request)) });
    }
    return jsonOk({ export: await secretService.exportPlaintext(vaultId, body, actorFrom(request)) });
  } catch (error) {
    return jsonError(error);
  }
}
