import { actorFrom, jsonError, jsonOk, readJson } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function GET() {
  return jsonOk({ projects: await secretService.listProjects() });
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    return jsonOk({ project: await secretService.createProject(body, actorFrom(request)) }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
