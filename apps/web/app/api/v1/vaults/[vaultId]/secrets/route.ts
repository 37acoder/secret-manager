import {
  createRequestId,
  toDeveloperApiError,
  toDeveloperApiSuccess
} from "../../../../../../../../packages/core/src/developer-api";
import { developerApi } from "../../../../../../lib/developer-api-store";

export async function GET(request: Request, context: { params: Promise<{ vaultId: string }> }) {
  const requestId = createRequestId();
  try {
    const params = await context.params;
    const data = await developerApi.listSecrets({
      token: bearerToken(request),
      vaultId: params.vaultId
    });
    return json(toDeveloperApiSuccess(requestId, { secrets: data }));
  } catch (error) {
    return json(toDeveloperApiError(requestId, error));
  }
}

export async function POST(request: Request, context: { params: Promise<{ vaultId: string }> }) {
  const requestId = createRequestId();
  try {
    const params = await context.params;
    const body = await request.json() as { key?: unknown; value?: unknown };
    const data = await developerApi.upsertSecret({
      token: bearerToken(request),
      vaultId: params.vaultId,
      key: body.key as string,
      value: body.value as string
    });
    return json(toDeveloperApiSuccess(requestId, data, 201));
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
