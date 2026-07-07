import { actorFrom, jsonError, jsonOk, readJson } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function GET(_request: Request, { params }: { params: Promise<{ secretId: string }> }) {
  try {
    const { secretId } = await params;
    return jsonOk({ secret: secretService.getSecret(secretId) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ secretId: string }> }) {
  try {
    const { secretId } = await params;
    const body = await readJson(request);
    return jsonOk({ secret: secretService.updateSecret(secretId, body, actorFrom(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ secretId: string }> }) {
  try {
    const { secretId } = await params;
    return jsonOk(secretService.deleteSecret(secretId, actorFrom(request)));
  } catch (error) {
    return jsonError(error);
  }
}
