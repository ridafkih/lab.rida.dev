import type {
  TextPart,
  ToolPart,
  ReasoningPart,
  StepStartPart,
  StepFinishPart,
  Part,
} from "@opencode-ai/sdk/client";

type MockMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Part[];
};

export const mockPartsMessages: Record<string, MockMessage[]> = {
  a1b2c3: [
    {
      id: "msg-1",
      role: "user",
      parts: [
        {
          id: "part-1",
          sessionID: "a1b2c3",
          messageID: "msg-1",
          type: "text",
          text: "Add OAuth authentication to the app",
        } satisfies TextPart,
      ],
    },
    {
      id: "msg-2",
      role: "assistant",
      parts: [
        {
          id: "part-2",
          sessionID: "a1b2c3",
          messageID: "msg-2",
          type: "step-start",
        } satisfies StepStartPart,
        {
          id: "part-3",
          sessionID: "a1b2c3",
          messageID: "msg-2",
          type: "reasoning",
          text: "The user wants OAuth authentication. I should set up next-auth with provider configuration. Let me check what providers would make sense and set up the necessary files.",
          time: { start: Date.now() - 5000, end: Date.now() - 4000 },
        } satisfies ReasoningPart,
        {
          id: "part-4",
          sessionID: "a1b2c3",
          messageID: "msg-2",
          type: "text",
          text: "I'll help you add OAuth authentication. Let me start by setting up the provider configuration and creating the necessary API routes.",
        } satisfies TextPart,
        {
          id: "part-5",
          sessionID: "a1b2c3",
          messageID: "msg-2",
          type: "tool",
          callID: "call-1",
          tool: "write",
          state: {
            status: "completed",
            input: {
              file_path: "src/lib/auth.ts",
              content: "export const authConfig = { providers: [] }",
            },
            output: "File written successfully",
            title: "Write src/lib/auth.ts",
            metadata: {},
            time: { start: Date.now() - 3000, end: Date.now() - 2000 },
          },
        } satisfies ToolPart,
        {
          id: "part-6",
          sessionID: "a1b2c3",
          messageID: "msg-2",
          type: "step-finish",
          reason: "end_turn",
          cost: 0.0023,
          tokens: {
            input: 1250,
            output: 340,
            reasoning: 120,
            cache: { read: 800, write: 200 },
          },
        } satisfies StepFinishPart,
      ],
    },
    {
      id: "msg-3",
      role: "user",
      parts: [
        {
          id: "part-7",
          sessionID: "a1b2c3",
          messageID: "msg-3",
          type: "text",
          text: "Use Google and GitHub as providers",
        } satisfies TextPart,
      ],
    },
    {
      id: "msg-4",
      role: "assistant",
      parts: [
        {
          id: "part-8",
          sessionID: "a1b2c3",
          messageID: "msg-4",
          type: "step-start",
        } satisfies StepStartPart,
        {
          id: "part-9",
          sessionID: "a1b2c3",
          messageID: "msg-4",
          type: "tool",
          callID: "call-2",
          tool: "read",
          state: {
            status: "completed",
            input: { file_path: "src/lib/auth.ts" },
            output: "export const authConfig = { providers: [] }",
            title: "Read src/lib/auth.ts",
            metadata: {},
            time: { start: Date.now() - 3000, end: Date.now() - 2800 },
          },
        } satisfies ToolPart,
        {
          id: "part-10",
          sessionID: "a1b2c3",
          messageID: "msg-4",
          type: "tool",
          callID: "call-3",
          tool: "edit",
          state: {
            status: "completed",
            input: {
              file_path: "src/lib/auth.ts",
              old_string: "providers: []",
              new_string: "providers: [GoogleProvider(), GitHubProvider()]",
            },
            output: "File edited successfully",
            title: "Edit src/lib/auth.ts",
            metadata: {},
            time: { start: Date.now() - 2500, end: Date.now() - 2000 },
          },
        } satisfies ToolPart,
        {
          id: "part-11",
          sessionID: "a1b2c3",
          messageID: "msg-4",
          type: "tool",
          callID: "call-4",
          tool: "write",
          state: {
            status: "completed",
            input: {
              file_path: "src/app/api/auth/[...nextauth]/route.ts",
              content:
                "import NextAuth from 'next-auth';\nexport { handler as GET, handler as POST };",
            },
            output: "File written successfully",
            title: "Write src/app/api/auth/[...nextauth]/route.ts",
            metadata: {},
            time: { start: Date.now() - 1800, end: Date.now() - 1500 },
          },
        } satisfies ToolPart,
        {
          id: "part-12",
          sessionID: "a1b2c3",
          messageID: "msg-4",
          type: "text",
          text: "I've set up both providers. For Google, I'm using the `google` provider from next-auth with the required scopes for email and profile. For GitHub, I've configured it to request `read:user` and `user:email` scopes.\n\nI've created the auth configuration in `src/lib/auth.ts` and added the API route at `src/app/api/auth/[...nextauth]/route.ts`.\n\nYou'll need to add these environment variables:\n- `GOOGLE_CLIENT_ID`\n- `GOOGLE_CLIENT_SECRET`\n- `GITHUB_CLIENT_ID`\n- `GITHUB_CLIENT_SECRET`",
        } satisfies TextPart,
        {
          id: "part-13",
          sessionID: "a1b2c3",
          messageID: "msg-4",
          type: "step-finish",
          reason: "end_turn",
          cost: 0.0045,
          tokens: {
            input: 2100,
            output: 520,
            reasoning: 0,
            cache: { read: 1200, write: 400 },
          },
        } satisfies StepFinishPart,
      ],
    },
    {
      id: "msg-5",
      role: "user",
      parts: [
        {
          id: "part-14",
          sessionID: "a1b2c3",
          messageID: "msg-5",
          type: "text",
          text: "Can you add a sign in button component?",
        } satisfies TextPart,
      ],
    },
    {
      id: "msg-6",
      role: "assistant",
      parts: [
        {
          id: "part-15",
          sessionID: "a1b2c3",
          messageID: "msg-6",
          type: "step-start",
        } satisfies StepStartPart,
        {
          id: "part-16",
          sessionID: "a1b2c3",
          messageID: "msg-6",
          type: "tool",
          callID: "call-5",
          tool: "write",
          state: {
            status: "running",
            input: {
              file_path: "src/components/sign-in-button.tsx",
              content: "...",
            },
            title: "Writing sign-in-button.tsx",
            time: { start: Date.now() },
          },
        } satisfies ToolPart,
      ],
    },
  ],
};
