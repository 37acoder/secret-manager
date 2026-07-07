export type SecretManagerClientOptions = {
  baseUrl: string;
  token?: string | undefined;
  fetchImpl?: typeof fetch;
};

export type ProjectSummary = {
  id: string;
  name: string;
  description?: string;
};

export type VaultSummary = {
  id: string;
  projectId: string;
  name: string;
  environment: string;
  secretCount: number;
  updatedAt: string;
};

export type SecretSummary = {
  id: string;
  vaultId: string;
  key: string;
  maskedValue: string;
  version: number;
  updatedAt: string;
  description: string;
};

export type DeveloperSecret = {
  key: string;
  value: string;
  versionNumber: number;
  versionId: string;
};

export class SecretManagerClient {
  private readonly fetchImpl: typeof fetch;
  private readonly options: SecretManagerClientOptions;

  constructor(options: SecretManagerClientOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listProjects(): Promise<{ requestId: string; projects: ProjectSummary[] }> {
    const response = await this.request<{ requestId?: string; data?: { projects: ProjectSummary[] }; projects?: ProjectSummary[] }>("/api/projects");
    return { requestId: response.requestId ?? "", projects: response.data?.projects ?? response.projects ?? [] };
  }

  async listVaults(projectId: string): Promise<{ requestId: string; vaults: VaultSummary[] }> {
    const response = await this.request<{ requestId?: string; data?: { vaults: VaultSummary[] }; vaults?: VaultSummary[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/vaults`
    );
    return { requestId: response.requestId ?? "", vaults: response.data?.vaults ?? response.vaults ?? [] };
  }

  async listSecretMetadata(vaultId: string): Promise<{ requestId: string; secrets: SecretSummary[] }> {
    const response = await this.request<{ requestId?: string; data?: { secrets: SecretSummary[] }; secrets?: SecretSummary[] }>(
      `/api/vaults/${encodeURIComponent(vaultId)}/secrets`
    );
    return { requestId: response.requestId ?? "", secrets: response.data?.secrets ?? response.secrets ?? [] };
  }

  async listSecretValues(vaultId: string): Promise<{ requestId: string; secrets: DeveloperSecret[] }> {
    const response = await this.request<{ requestId: string; data: { secrets: DeveloperSecret[] } }>(
      `/api/v1/vaults/${encodeURIComponent(vaultId)}/secrets`
    );
    return { requestId: response.requestId, secrets: response.data.secrets };
  }

  async getSecret(vaultId: string, key: string): Promise<{ requestId: string; data: { key: string; value: string } }> {
    return this.request(`/api/v1/vaults/${encodeURIComponent(vaultId)}/secrets/${encodeURIComponent(key)}`);
  }

  async upsertSecret(input: {
    vaultId: string;
    key: string;
    value: string;
  }): Promise<{ requestId: string; data: { key: string; versionNumber: number; versionId: string; created: boolean } }> {
    return this.request(`/api/v1/vaults/${encodeURIComponent(input.vaultId)}/secrets/${encodeURIComponent(input.key)}`, {
      method: "PUT",
      body: JSON.stringify({ value: input.value })
    });
  }

  async createSecret(input: {
    vaultId: string;
    key: string;
    value: string;
  }): Promise<{ requestId: string; data: { key: string; versionNumber: number; versionId: string; created: boolean } }> {
    return this.request(`/api/v1/vaults/${encodeURIComponent(input.vaultId)}/secrets`, {
      method: "POST",
      body: JSON.stringify({ key: input.key, value: input.value })
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("content-type", "application/json");
    if (this.options.token) {
      headers.set("authorization", `Bearer ${this.options.token}`);
    }

    const response = await this.fetchImpl(`${this.options.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers
    });
    const payload = await response.json() as { requestId?: string; error?: { code?: string } };

    if (!response.ok) {
      const error = new Error(payload.error?.code ?? "request_failed");
      Object.assign(error, {
        code: payload.error?.code,
        requestId: payload.requestId
      });
      throw error;
    }

    return payload as T;
  }
}
