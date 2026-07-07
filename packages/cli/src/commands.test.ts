import { describe, expect, it } from "vitest";
import { runCli } from "./commands.ts";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function fetchMock(routes: Record<string, unknown | Response>): typeof fetch {
  return async (input) => {
    const url = new URL(input.toString());
    const route = routes[url.pathname];
    if (route instanceof Response) return route;
    if (route) return json(route);
    return json({ requestId: "req_missing", error: { code: "not_found" } }, 404);
  };
}

const projects = {
  requestId: "req_projects",
  data: {
    projects: [{ id: "proj_demo", name: "Demo Workspace", description: "Demo" }]
  }
};

const vaults = {
  requestId: "req_vaults",
  data: {
    vaults: [{ id: "vault_demo", projectId: "proj_demo", name: "Production", environment: "prod", secretCount: 1, updatedAt: "now", locked: true }]
  }
};

describe("sm cli", () => {
  it("lists projects and vaults without printing secret values", async () => {
    const result = await runCli(["projects"], {
      env: { SECRET_MANAGER_URL: "http://localhost:3000" },
      fetchImpl: fetchMock({
        "/api/projects": projects,
        "/api/projects/proj_demo/vaults": vaults
      })
    });

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toContain("proj_demo\tDemo Workspace");
    expect(result.stdout).toContain("vault_demo\tProduction\tprod\t1 secrets");
    expect(result.stdout).not.toContain("demo-provider-secret-value");
  });

  it("prints only the requested secret value for get", async () => {
    const result = await runCli(["get", "proj_demo", "STRIPE_API_KEY"], {
      env: { SECRET_MANAGER_URL: "http://localhost:3000", SECRET_MANAGER_TOKEN: "sm_demo" },
      fetchImpl: fetchMock({
        "/api/projects": projects,
        "/api/projects/proj_demo/vaults": vaults,
        "/api/v1/vaults/vault_demo/secrets/STRIPE_API_KEY": {
          requestId: "req_secret",
          data: { key: "STRIPE_API_KEY", value: "demo-provider-secret-value", versionNumber: 1, versionId: "version_1" }
        }
      })
    });

    expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "demo-provider-secret-value\n" });
  });

  it("issues a temporary token from the vault password", async () => {
    const result = await runCli(["unlock", "proj_demo", "--password", "demo123"], {
      env: { SECRET_MANAGER_URL: "http://localhost:3000" },
      fetchImpl: fetchMock({
        "/api/projects": projects,
        "/api/projects/proj_demo/vaults": vaults,
        "/api/vaults/vault_demo/temporary-token": {
          token: "sm_tmp_demo",
          tokenRecord: {
            tokenPrefix: "sm_tmp_demo",
            vaultId: "vault_demo",
            scopes: ["read_secrets"],
            expiresAt: "2026-07-07T07:30:00.000Z"
          }
        }
      })
    });

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout:
        "SECRET_MANAGER_TOKEN=sm_tmp_demo\n" +
        "expiresAt=2026-07-07T07:30:00.000Z\n" +
        "Use this token for get/export. It is temporary and stored only as a hash plus in-memory decrypt key on the server.\n"
    });
  });

  it("exports explicit env output and quotes values that need it", async () => {
    const result = await runCli(["export", "vault_demo", "--format", "env"], {
      env: { SECRET_MANAGER_URL: "http://localhost:3000", SECRET_MANAGER_TOKEN: "sm_demo" },
      fetchImpl: fetchMock({
        "/api/projects": projects,
        "/api/projects/proj_demo/vaults": vaults,
        "/api/v1/vaults/vault_demo/secrets": {
          requestId: "req_export",
          data: {
            secrets: [
              { key: "PLAIN", value: "abc_123", versionNumber: 1, versionId: "version_1" },
              { key: "QUOTED", value: "hello world", versionNumber: 1, versionId: "version_2" }
            ]
          }
        }
      })
    });

    expect(result).toEqual({ exitCode: 0, stderr: "", stdout: "PLAIN=abc_123\nQUOTED=\"hello world\"\n" });
  });

  it("returns clear locked vault and unsupported export errors", async () => {
    await expect(runCli(["get", "proj_demo", "STRIPE_API_KEY"], { env: {} })).resolves.toMatchObject({
      exitCode: 1,
      stderr: "Vault is locked: run sm unlock PROJECT --password PASSWORD and set SECRET_MANAGER_TOKEN for get/export.\n"
    });

    await expect(
      runCli(["export", "proj_demo", "--format", "json"], {
        env: { SECRET_MANAGER_TOKEN: "sm_demo" },
        fetchImpl: fetchMock({})
      })
    ).resolves.toMatchObject({
      exitCode: 2,
      stderr: "Unsupported export format. Use --format env.\n"
    });
  });

  it("maps bad credentials and missing key errors without leaking submitted values", async () => {
    const invalidToken = await runCli(["get", "proj_demo", "STRIPE_API_KEY"], {
      env: { SECRET_MANAGER_TOKEN: "sm_bad" },
      fetchImpl: fetchMock({
        "/api/projects": projects,
        "/api/projects/proj_demo/vaults": vaults,
        "/api/v1/vaults/vault_demo/secrets/STRIPE_API_KEY": json({ requestId: "req_bad", error: { code: "invalid_token" } }, 401)
      })
    });

    expect(invalidToken).toMatchObject({ exitCode: 1, stderr: "Bad credentials: API token is invalid.\n" });
    expect(invalidToken.stderr).not.toContain("sm_bad");

    const missingKey = await runCli(["get", "proj_demo", "MISSING"], {
      env: { SECRET_MANAGER_TOKEN: "sm_demo" },
      fetchImpl: fetchMock({
        "/api/projects": projects,
        "/api/projects/proj_demo/vaults": vaults,
        "/api/v1/vaults/vault_demo/secrets/MISSING": json({ requestId: "req_missing", error: { code: "not_found" } }, 404)
      })
    });

    expect(missingKey).toMatchObject({ exitCode: 1, stderr: "Secret key not found.\n" });
  });
});
