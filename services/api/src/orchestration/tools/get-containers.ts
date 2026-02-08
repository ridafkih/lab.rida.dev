import { z } from "zod";
import { tool } from "ai";
import { findSessionById } from "../../repositories/session.repository";
import { getSessionContainersWithDetails } from "../../repositories/container-session.repository";

const inputSchema = z.object({
  sessionId: z.string().describe("The session ID to get containers for"),
});

export const getContainersTool = tool({
  description: "Gets container information for a session including name, image, status, and ports.",
  inputSchema,
  execute: async ({ sessionId }) => {
    const session = await findSessionById(sessionId);

    if (!session) {
      return { error: "Session not found", containers: [] };
    }

    const containers = await getSessionContainersWithDetails(sessionId);

    return {
      containers: containers.map((container) => ({
        id: container.id,
        name: container.hostname ?? container.image.split("/").pop()?.split(":")[0],
        image: container.image,
        status: container.status,
      })),
    };
  },
});
