export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function jsonOk<T>(data: T, status = 200) {
  return Response.json(data, { status });
}

export function jsonError(error: unknown, fallback = "Request failed") {
  const message = error instanceof Error && error.message.length < 80 ? error.message : fallback;
  return Response.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
}

export function actorFrom(request: Request) {
  return request.headers.get("x-secret-manager-actor") || "demo@37a.home";
}
