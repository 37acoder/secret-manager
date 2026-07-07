import {
  createRequestId,
  toDeveloperApiError,
  toDeveloperApiSuccess
} from "../../../../../../../../../packages/core/src/developer-api";
import { secretService } from "../../../../../../../lib/secret-service";

export async function GET(request: Request, context: { params: Promise<{ vaultId: string; key: string }> }) {
  const requestId = createRequestId();
  try {
    const params = await context.params;
    const data = secretService.readSecretWithToken(params.vaultId, params.key, bearerToken(request));
    return json(toDeveloperApiSuccess(requestId, data));
  } catch (error) {
    return json(toDeveloperApiError(requestId, error));
  }
}

export async function PUT(request: Request, context: { params: Promise<{ vaultId: string; key: string }> }) {
  const requestId = createRequestId();
  try {
    const params = await context.params;
    return json(toDeveloperApiError(requestId, new Error("Temporary CLI tokens are read-only.")));
  } catch (error) {
    return json(toDeveloperApiError(requestId, error));
  }
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7) : "";
}

function json(result: { status: number; body: unknown }) {
  return Response.json(result.body, { status: result.status });
}
