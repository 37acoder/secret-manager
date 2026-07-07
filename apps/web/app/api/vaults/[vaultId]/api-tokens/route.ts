import {
  createRequestId,
  toDeveloperApiError,
  toDeveloperApiSuccess,
  type ApiTokenScope
} from "../../../../../../../packages/core/src/developer-api";
import { developerApi } from "../../../../../lib/developer-api-store";

export async function POST(request: Request, context: { params: Promise<{ vaultId: string }> }) {
  const requestId = createRequestId();
  try {
    const params = await context.params;
    const body = await request.json() as {
      name?: unknown;
      scopes?: unknown;
      expiresAt?: unknown;
    };
    const data = await developerApi.createToken({
      vaultId: params.vaultId,
      name: body.name as string,
      scopes: body.scopes as ApiTokenScope[],
      expiresAt: body.expiresAt as string | null | undefined
    });
    return json(toDeveloperApiSuccess(requestId, data, 201));
  } catch (error) {
    return json(toDeveloperApiError(requestId, error));
  }
}

function json(result: { status: number; body: unknown }) {
  return Response.json(result.body, { status: result.status });
}
