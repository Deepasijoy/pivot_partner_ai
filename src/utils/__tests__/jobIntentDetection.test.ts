import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isActionableSkillAnalysisIntent } from '../jobIntentDetection';

// Covers the Part 1 chat-CTA fix's detection layer: a user asking to
// analyze their skills/skill gaps with no resume in context should short-
// circuit to the resume-upload CTA instead of a generic Groq round-trip
// (which, per real observed behavior, falls back to a 5-point manual
// questionnaire). Deterministic, pattern-based — no network/LLM call — so
// this is directly unit-testable like the existing isActionableJobIntent/
// isActionableRelocationIntent detectors it sits alongside.

describe('isActionableSkillAnalysisIntent', () => {
  test('matches the exact SideBar.tsx quick-start prompt text', () => {
    assert.equal(isActionableSkillAnalysisIntent('Find my skill gaps'), true);
  });

  test('matches common real phrasings', () => {
    const positives = [
      'Can you analyze my skills?',
      'analyse my skills please',
      'What are my skill gaps?',
      'what is my skill gap',
      'Can you do a skill gap analysis for me',
      'What skills am I missing for a data analyst role?',
      'What skills do I lack',
      'Am I qualified for a business analyst role?',
      'check my skills',
      'Please assess my resume',
      'Can you review my CV and tell me my gaps',
    ];
    for (const message of positives) {
      assert.equal(isActionableSkillAnalysisIntent(message), true, `expected a match for: "${message}"`);
    }
  });

  test('does not match unrelated messages', () => {
    const negatives = [
      '',
      '   ',
      'Hello!',
      'What is the weather like in Berlin?',
      'Help me plan my move',
      "I'm looking for a job",
      'What skills does a data analyst typically need?',
    ];
    for (const message of negatives) {
      assert.equal(isActionableSkillAnalysisIntent(message), false, `expected no match for: "${message}"`);
    }
  });

  test('is case-insensitive', () => {
    assert.equal(isActionableSkillAnalysisIntent('FIND MY SKILL GAPS'), true);
  });
});
