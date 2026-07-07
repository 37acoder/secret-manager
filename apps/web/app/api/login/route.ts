import { actorFrom, jsonError, jsonOk, readJson } from "@/lib/api-response";
import { secretService } from "@/lib/secret-service";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const actor = typeof body.email === "string" ? body.email : actorFrom(request);
    return jsonOk(await secretService.login(actor));
  } catch (error) {
    return jsonError(error);
  }
}
