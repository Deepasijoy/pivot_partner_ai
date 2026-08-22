import Anthropic from '@anthropic-ai/sdk';
import type { ApiErrorResponse } from '../types';

export class ClaudeConfigError extends Error {}
export class ClaudeUpstreamError extends Error {}
export class ValidationError extends Error {}

export function mapErrorToResponse(err: unknown): { status: number; body: ApiErrorResponse } {
  if (err instanceof ValidationError) {
    return { status: 400, body: { error: err.message } };
  }

  if (err instanceof ClaudeConfigError) {
    return {
      status: 500,
      body: { error: 'Claude API is not configured correctly on the server. Set ANTHROPIC_API_KEY.' },
    };
  }

  if (err instanceof Anthropic.AuthenticationError) {
    return {
      status: 500,
      body: { error: "The server's Claude API key was rejected. Check ANTHROPIC_API_KEY." },
    };
  }

  if (err instanceof Anthropic.RateLimitError) {
    return { status: 502, body: { error: 'Claude API rate limit exceeded. Please try again shortly.' } };
  }

  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, body: { error: 'Could not reach the Claude API.' } };
  }

  if (err instanceof Anthropic.APIError) {
    return { status: 502, body: { error: 'Claude API request failed.' } };
  }

  if (err instanceof ClaudeUpstreamError) {
    return { status: 502, body: { error: err.message } };
  }

  return { status: 500, body: { error: 'Unexpected server error.' } };
}
