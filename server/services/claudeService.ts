import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { ChatContext } from '../types';
import { ClaudeConfigError, ClaudeUpstreamError } from '../utils/errors';

const DEFAULT_MODEL = 'claude-opus-5';

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ClaudeConfigError('ANTHROPIC_API_KEY is not set on the server.');
  }
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

function getModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

const CHAT_SYSTEM_PROMPT = `You are PivotPartner AI, an AI Career + Finance Copilot.

You help professionals:
- understand their skills
- identify transferable skills
- explore career paths
- find remote work
- explore freelance work
- understand skill gaps
- find learning paths
- compare local vs remote earning scenarios
- understand potential cross-border employment routes

Important:
- Do not present immigration, tax, legal, employment, or financial estimates as guaranteed facts.
- Use terms such as "estimated", "potentially", and "based on available information" when discussing anything uncertain.
- Base your answers on the user context provided in this conversation. Do not invent details about the user (their skills, experience, location, or goals) that were not supplied.
- If the context you were given is missing information needed to answer well, say plainly what additional information would help (e.g., "I don't have your resume yet — upload it so I can give a more specific answer").
- Keep responses concise and actionable.`;

function buildContextBlock(context?: ChatContext): string {
  if (!context || Object.keys(context).length === 0) {
    return 'No user context has been provided yet.';
  }
  return `User context (JSON):\n${JSON.stringify(context, null, 2)}`;
}

export async function getChatCompletion(message: string, context?: ChatContext): Promise<string> {
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: getModel(),
      max_tokens: 2048,
      system: CHAT_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${buildContextBlock(context)}\n\nUser message: ${message}`,
        },
      ],
    });

    const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    if (!textBlock) {
      throw new ClaudeUpstreamError('Claude returned no text content.');
    }
    return textBlock.text;
  } catch (err) {
    if (err instanceof ClaudeConfigError) throw err;
    if (err instanceof Anthropic.APIError) throw err;
    throw new ClaudeUpstreamError(err instanceof Error ? err.message : 'Unknown Claude API failure.');
  }
}

const ResumeAnalysisSchema = z.object({
  professionalSummary: z.string(),
  likelyRole: z.string(),
  seniority: z.string(),
  yearsExperience: z.number(),
  industries: z.array(z.string()),
  skills: z.array(z.string()),
  transferableSkills: z.array(z.string()),
  careerPaths: z.array(z.object({ title: z.string(), reason: z.string() })),
});

export type RawResumeAnalysis = z.infer<typeof ResumeAnalysisSchema>;

const RESUME_SYSTEM_PROMPT = `You are PivotPartner AI's resume analysis engine.

Read the resume text supplied by the user and extract a structured profile:
- professionalSummary: a 1-2 sentence summary of who this person is professionally.
- likelyRole: the single job title that best matches their experience.
- seniority: one of "Entry-level", "Junior", "Mid-level", "Senior", or "Principal / Lead".
- yearsExperience: total years of professional experience as a number.
- industries: the industries this person has worked in.
- skills: concrete skills demonstrated in the resume (technical and business/soft skills).
- transferableSkills: skills from this resume that would transfer well to a different industry or role.
- careerPaths: 2-4 plausible next career paths, each with a short reason grounded in the resume content.

Only extract what is actually supported by the resume text. Do not invent employers, skills, or experience that are not present or reasonably implied by the text.`;

export async function analyzeResumeText(resumeText: string): Promise<RawResumeAnalysis> {
  const client = getClient();

  try {
    const response = await client.messages.parse({
      model: getModel(),
      max_tokens: 4096,
      system: RESUME_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Resume text:\n\n${resumeText}` }],
      output_config: { format: zodOutputFormat(ResumeAnalysisSchema) },
    });

    if (!response.parsed_output) {
      throw new ClaudeUpstreamError('Claude did not return a resume analysis matching the expected structure.');
    }

    return response.parsed_output;
  } catch (err) {
    if (err instanceof ClaudeConfigError || err instanceof ClaudeUpstreamError) throw err;
    if (err instanceof Anthropic.APIError) throw err;
    throw new ClaudeUpstreamError(err instanceof Error ? err.message : 'Unknown Claude API failure.');
  }
}
