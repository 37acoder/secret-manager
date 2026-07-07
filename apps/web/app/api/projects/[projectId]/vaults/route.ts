import { actorFrom, jsonError, jsonOk, readJson } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return jsonOk({ vaults: secretService.listVaults(projectId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const body = await readJson(request);
    return jsonOk({ vault: secretService.createVault(projectId, body, actorFrom(request)) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
