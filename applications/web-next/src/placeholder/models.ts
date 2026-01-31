export const modelGroups = [
  {
    provider: "Anthropic",
    models: [
      { label: "Claude Opus 4", value: "claude-opus-4" },
      { label: "Claude Sonnet 4", value: "claude-sonnet-4" },
      { label: "Claude Haiku 3.5", value: "claude-haiku-3.5" },
    ],
  },
  {
    provider: "OpenAI",
    models: [
      { label: "GPT-4o", value: "gpt-4o" },
      { label: "GPT-4o Mini", value: "gpt-4o-mini" },
      { label: "o1", value: "o1" },
      { label: "o3 Mini", value: "o3-mini" },
    ],
  },
  {
    provider: "Google",
    models: [
      { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" },
      { label: "Gemini 2.0 Pro", value: "gemini-2.0-pro" },
    ],
  },
];

export const defaultModel = "anthropic/claude-sonnet-4";
