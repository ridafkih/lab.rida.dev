const settingsTabs = [
  { label: "GitHub", href: "/settings/github" },
  { label: "Providers", href: "/settings/providers" },
  { label: "Projects", href: "/settings/projects" },
  { label: "API Keys", href: "/settings/api-keys" },
] as const;

export const defaultSettingsTab = settingsTabs[0];
