import { google } from "@ai-sdk/google";
import { convertToModelMessages, streamText } from "ai";
import { z } from "zod";

export const maxDuration = 60;

const requestSchema = z.object({
  messages: z.array(z.unknown()),
  mode: z.enum(["fast", "ultra"]).default("ultra"),
  intensity: z.number().min(0).max(100).default(70),
});

const baseSystem = `
You are Neural Ultra, an English-first premium AI assistant powered by Gemini.
Be accurate, direct, practical, and context-aware.
Never fabricate sources, actions, tool results, benchmarks, or capabilities.
Do not expose hidden chain-of-thought.
Do not claim that Neural Ultra is universally superior to other models.
When uncertain, state the uncertainty and give the safest useful next step.
Use headings, bullets, code, or tables only when they improve clarity.
`.trim();

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const messages = await convertToModelMessages(body.messages as never);

    const system =
      body.mode === "fast"
        ? `${baseSystem}
Fast mode: answer immediately with the shortest complete answer.
Do not perform unnecessary planning or verification.`
        : `${baseSystem}
Ultra mode: answer immediately, then silently check accuracy,
missing requirements, safety, and internal consistency before finishing.
Use a short verification note only when it materially helps the user.`;

    const result = streamText({
      model: google("gemini-3.8-flash"),
      system,
      messages,
      temperature: body.mode === "fast" ? 0.35 : 0.2,
      maxOutputTokens: body.mode === "fast" ? 1200 : 2600,
      abortSignal: request.signal,
    });

    return result.toUIMessageStreamResponse();
  } catch {
    return Response.json(
      { error: "The Neural Ultra request could not be processed." },
      { status: 400 },
    );
  }
}
