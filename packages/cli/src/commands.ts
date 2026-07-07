import { SecretManagerClient, type ProjectSummary, type VaultSummary } from "@secret-manager/api-client";

export type CliEnv = {
  [key: string]: string | undefined;
  SECRET_MANAGER_URL?: string | undefined;
  SECRET_MANAGER_TOKEN?: string | undefined;
};

export type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type CliIO = {
  env: CliEnv;
  fetchImpl?: typeof fetch;
};

const helpText = `SecretManager CLI

Usage:
  sm projects
  sm get PROJECT KEY
  sm export PROJECT --format env

Environment:
  SECRET_MANAGER_URL     Base URL for the local SecretManager app, defaults to http://localhost:3000
  SECRET_MANAGER_TOKEN   Read-scoped API token for get/export
`;

export async function runCli(argv: string[], io: CliIO): Promise<CliResult> {
  const command = argv[0];
  const baseUrl = io.env.SECRET_MANAGER_URL ?? "http://localhost:3000";
  const token = io.env.SECRET_MANAGER_TOKEN;
  const client = new SecretManagerClient({
    baseUrl,
    ...(token ? { token } : {}),
    ...(io.fetchImpl ? { fetchImpl: io.fetchImpl } : {})
  });

  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      return ok(helpText);
    }

    if (command === "projects") {
      return ok(await formatProjects(client));
    }

    if (command === "get") {
      requireToken(token);
      const project = requiredArg(argv[1], "Missing project or vault. Usage: sm get PROJECT KEY");
      const key = requiredArg(argv[2], "Missing secret key. Usage: sm get PROJECT KEY");
      const vault = await resolveVault(client, project);
      const response = await client.getSecret(vault.id, key);
      return ok(`${response.data.value}\n`);
    }

    if (command === "export") {
      requireToken(token);
      const project = requiredArg(argv[1], "Missing project or vault. Usage: sm export PROJECT --format env");
      const format = optionValue(argv, "--format") ?? "env";
      if (format !== "env") {
        throw new CliError("Unsupported export format. Use --format env.", 2);
      }
      const vault = await resolveVault(client, project);
      const response = await client.listSecretValues(vault.id);
      return ok(formatEnv(response.secrets));
    }

    throw new CliError(`Unknown command: ${command}\n\n${helpText}`, 2);
  } catch (error) {
    return fail(toCliMessage(error), error instanceof CliError ? error.exitCode : 1);
  }
}

async function formatProjects(client: SecretManagerClient): Promise<string> {
  const { projects } = await client.listProjects();
  if (projects.length === 0) return "No projects found.\n";

  const lines = [];
  for (const project of projects) {
    lines.push(`${project.id}\t${project.name}`);
    const { vaults } = await client.listVaults(project.id);
    for (const vault of vaults) {
      lines.push(`  ${vault.id}\t${vault.name}\t${vault.environment}\t${vault.secretCount} secrets`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function resolveVault(client: SecretManagerClient, selector: string): Promise<VaultSummary> {
  const { projects } = await client.listProjects();
  const vaultsByProject = await Promise.all(
    projects.map(async (project) => ({ project, vaults: (await client.listVaults(project.id)).vaults }))
  );

  for (const { vaults } of vaultsByProject) {
    const direct = vaults.find((vault) => matches(vault.id, selector) || matches(vault.name, selector));
    if (direct) return direct;
  }

  const projectMatch = vaultsByProject.find(({ project }) => matches(project.id, selector) || matches(project.name, selector));
  if (!projectMatch) {
    throw new CliError(`Project or vault not found: ${selector}`, 1);
  }
  if (projectMatch.vaults.length === 0) {
    throw new CliError(`Project has no vaults: ${displayProject(projectMatch.project)}`, 1);
  }
  if (projectMatch.vaults.length > 1) {
    throw new CliError("Project has multiple vaults: use a vault id or vault name from 'sm projects'.", 1);
  }
  return projectMatch.vaults[0]!;
}

function formatEnv(secrets: Array<{ key: string; value: string }>): string {
  return secrets.map((secret) => `${secret.key}=${quoteEnvValue(secret.value)}`).join("\n") + (secrets.length ? "\n" : "");
}

function quoteEnvValue(value: string): string {
  if (/^[A-Za-z0-9_./:@-]*$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n")}"`;
}

function requiredArg(value: string | undefined, message: string): string {
  if (!value) throw new CliError(message, 2);
  return value;
}

function requireToken(token: string | undefined): void {
  if (!token) {
    throw new CliError("Vault is locked: set SECRET_MANAGER_TOKEN to a read-scoped API token for get/export.", 1);
  }
}

function optionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function matches(candidate: string, selector: string): boolean {
  return candidate.toLowerCase() === selector.toLowerCase();
}

function displayProject(project: ProjectSummary): string {
  return `${project.id} (${project.name})`;
}

function toCliMessage(error: unknown): string {
  if (error instanceof CliError) return error.message;
  if (error instanceof Error) {
    const code = (error as Error & { code?: string }).code;
    if (code === "missing_token") return "Vault is locked: set SECRET_MANAGER_TOKEN to a read-scoped API token.";
    if (code === "invalid_token") return "Bad credentials: API token is invalid.";
    if (code === "token_revoked") return "Bad credentials: API token has been revoked.";
    if (code === "token_expired") return "Bad credentials: API token has expired.";
    if (code === "forbidden") return "Bad credentials: API token is not allowed to read this vault.";
    if (code === "not_found") return "Secret key not found.";
    return `Request failed: ${code ?? error.message}`;
  }
  return "Request failed.";
}

function ok(stdout: string): CliResult {
  return { stdout, stderr: "", exitCode: 0 };
}

function fail(message: string, exitCode: number): CliResult {
  return { stdout: "", stderr: `${message}\n`, exitCode };
}

class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.exitCode = exitCode;
  }
}
