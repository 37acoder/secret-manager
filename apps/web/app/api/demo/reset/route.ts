import { resetSecretServiceForTests } from "@/lib/secret-service";
import { jsonError, jsonOk } from "@/lib/api-response";

export async function POST() {
  try {
    await resetSecretServiceForTests();
    return jsonOk({ reset: true });
  } catch (error) {
    return jsonError(error);
  }
}
