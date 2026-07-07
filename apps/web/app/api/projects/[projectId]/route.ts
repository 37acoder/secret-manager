import { actorFrom, jsonError, jsonOk, readJson } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const body = await readJson(request);
    return jsonOk({ project: secretService.updateProject(projectId, body, actorFrom(request)) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    return jsonOk(secretService.deleteProject(projectId, actorFrom(request)));
  } catch (error) {
    return jsonError(error);
  }
}
