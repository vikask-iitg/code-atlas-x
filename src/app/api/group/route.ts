import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { NextResponse } from "next/server";
import { LlmDiagramSchema, groundDiagram, type LlmDiagram } from "@/lib/diagramSchema";
import { heuristicDiagram } from "@/lib/heuristic";
import { SYSTEM_PROMPT, formatPayload, formatPrevious } from "@/lib/prompt";
import type { AnalysisPayload } from "@/lib/payload";
import type { Diagram } from "@/lib/types";

export const maxDuration = 120;

const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-5-5";

interface Body {
  payload: AnalysisPayload;
  instructions?: string;
  previous?: Diagram;
}

/** Set CV_DISABLE_LLM=1 to always use folder-based grouping. Credentials resolve from the
 * environment (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile). */
function llmEnabled() {
  return process.env.CV_DISABLE_LLM !== "1";
}

async function callClaude(body: Body, feedback?: string): Promise<LlmDiagram> {
  const client = new Anthropic();
  const parts = [formatPayload(body.payload)];
  if (body.previous) parts.push(formatPrevious(body.previous));
  if (body.instructions) parts.push(`## User instructions for this regeneration\n${body.instructions}`);
  if (feedback) parts.push(`## Fix these problems from your previous attempt\n${feedback}`);
  parts.push("Produce the architecture diagram now.");

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    output_config: { effort: "medium", format: betaZodOutputFormat(LlmDiagramSchema) },
    messages: [{ role: "user", content: parts.join("\n\n") }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (msg.stop_reason === "max_tokens") throw new Error("The model's answer was cut off (project too large).");
  if (!msg.parsed_output) throw new Error("The model returned output that did not match the diagram schema.");
  return msg.parsed_output;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body?.payload?.files?.length) {
    return NextResponse.json(
      {
        error: "No recognisable source files were found in this upload.",
        detail: "Supported at launch: JavaScript/TypeScript, Python, Java and Go. Check your ignore rules in the scan preview.",
      },
      { status: 422 },
    );
  }

  const notes: string[] = [];
  if (llmEnabled()) {
    // Failed jobs retry once (Reliability NFR); a retry also feeds back grounding problems (A6).
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await callClaude(body, feedback);
        const { diagram, problems } = groundDiagram(raw, body.payload, "claude");
        const rejected = problems.filter((p) => p.includes("rejected")).length;
        if (diagram.nodes.length >= 3 && rejected <= Math.max(2, raw.nodes.length * 0.2)) {
          return NextResponse.json({ diagram });
        }
        feedback = problems.join("\n");
        notes.push(`Attempt ${attempt + 1}: ${rejected} node(s) cited files that are not in the upload.`);
      } catch (err) {
        const msg =
          err instanceof Anthropic.AuthenticationError
            ? "Claude API credentials were rejected."
            : err instanceof Anthropic.RateLimitError
              ? "Claude API rate limit reached."
              : err instanceof Anthropic.APIError
                ? `Claude API error (${err.status ?? "network"}).`
                : err instanceof Error && /authentication method/i.test(err.message)
                  ? "Claude API isn't configured (set ANTHROPIC_API_KEY), so components were grouped by folder."
                  : err instanceof Error
                    ? err.message
                  : "Unknown error";
        notes.push(`Attempt ${attempt + 1}: ${msg}`);
        // Missing/invalid credentials won't fix themselves on retry.
        if (err instanceof Anthropic.AuthenticationError || (err instanceof Error && /api key|auth/i.test(err.message) && !(err instanceof Anthropic.APIError))) break;
      }
    }
  } else {
    notes.push("LLM grouping disabled (CV_DISABLE_LLM=1): using folder-based grouping.");
  }

  try {
    const { diagram } = groundDiagram(heuristicDiagram(body.payload), body.payload, "heuristic");
    diagram.warnings = [...notes, ...(diagram.warnings ?? [])];
    return NextResponse.json({ diagram });
  } catch (err) {
    return NextResponse.json(
      { error: "We couldn't group this project into components.", detail: err instanceof Error ? err.message : String(err) },
      { status: 422 },
    );
  }
}
