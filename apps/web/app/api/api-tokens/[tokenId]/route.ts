import {
  createRequestId,
  toDeveloperApiError,
  toDeveloperApiSuccess
} from "../../../../../../packages/core/src/developer-api";
import { developerApi } from "../../../../lib/developer-api-store";

export async function DELETE(_request: Request, context: { params: Promise<{ tokenId: string }> }) {
  const requestId = createRequestId();
  try {
    const params = await context.params;
    const revoked = await developerApi.revokeTokenId(params.tokenId);
    return json(toDeveloperApiSuccess(requestId, { revoked }));
  } catch (error) {
    return json(toDeveloperApiError(requestId, error));
  }
}

function json(result: { status: number; body: unknown }) {
  return Response.json(result.body, { status: result.status });
}
