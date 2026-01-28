import { SessionView } from "@/compositions/session-view";

const exampleMessages = [
  {
    id: "1",
    role: "user" as const,
    content: "Can you help me fix the authentication redirect loop?",
  },
  {
    id: "2",
    role: "assistant" as const,
    content:
      "I'll take a look at the authentication flow. Let me first examine the relevant files.",
    toolCalls: [
      { id: "t1", name: "Read auth/middleware.ts", status: "completed" as const, duration: "1.2s" },
      { id: "t2", name: "Read lib/session.ts", status: "completed" as const, duration: "0.8s" },
    ],
  },
  {
    id: "3",
    role: "assistant" as const,
    content:
      "I found the issue. The redirect logic in middleware.ts is checking for an authenticated session, but the session cookie isn't being set correctly after login. The problem is on line 42 where the cookie options are missing the `path` attribute.",
    toolCalls: [
      {
        id: "t3",
        name: "Edit auth/middleware.ts",
        status: "in_progress" as const,
        duration: "3.4s",
      },
    ],
  },
  {
    id: "4",
    role: "assistant" as const,
    content:
      "I've fixed the issue by adding the correct path attribute to the cookie options. The redirect loop should be resolved now.",
  },
];

export default function SessionPage() {
  return <SessionView messages={exampleMessages} />;
}
