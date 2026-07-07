export const demoDashboard = {
  metrics: [
    { label: "Projects", value: "2", note: "Demo workspace" },
    { label: "Vaults", value: "4", note: "dev, staging, prod" },
    { label: "Secrets", value: "12", note: "values masked by default" },
    { label: "Audit events", value: "38", note: "fake local data" }
  ],
  secrets: [
    {
      key: "PAYMENTS_API_KEY",
      vault: "payments-prod",
      maskedValue: "••••••••••••",
      status: "masked"
    },
    {
      key: "WEBHOOK_SIGNING_SECRET",
      vault: "payments-staging",
      maskedValue: "••••••••••••",
      status: "masked"
    },
    {
      key: "DEMO_DB_URL",
      vault: "demo-dev",
      maskedValue: "••••••••••••",
      status: "masked"
    }
  ],
  auditEvents: [
    { action: "Secret version created", time: "2 minutes ago" },
    { action: "Secret reveal requested", time: "8 minutes ago" },
    { action: "Read-only API token created", time: "25 minutes ago" }
  ]
} as const;

export const demoProjects = [
  { name: "Payments Demo", slug: "payments-demo", vaultCount: 3, owner: "owner@example.test" },
  { name: "Agent Sandbox", slug: "agent-sandbox", vaultCount: 1, owner: "admin@example.test" }
] as const;
