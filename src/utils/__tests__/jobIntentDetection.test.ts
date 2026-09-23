import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isActionableSkillAnalysisIntent, isActionableWorkModelComparisonIntent } from '../jobIntentDetection';

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

  // Covers the reported miss: the landing page's own hero CTA copy ("Get my
  // free skill gap assessment") didn't match any fixed phrase in the
  // original pattern list, so it fell through to a generic Groq round-trip.
  // These exercise the combinator broadening (skill(s) + a
  // gap/assess/analyze/review/evaluate word anywhere in the message, or "my
  // resume/cv" + an analyze/review/check/assess word) rather than a fixed
  // phrase list.
  test('matches free-typed combinations, not just fixed phrases', () => {
    const positives = [
      'Get my free skill gap assessment',
      'skill gap assessment',
      'assess my skills',
      'review my CV',
      'what skills am I missing',
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
      // "resume" as a verb (not "my resume") must not combine with an
      // unrelated review/check/assess word elsewhere in the message.
      "Can we resume the meeting after lunch?",
      // "analytical"/"analyst" must not match the analy[sz] combinator —
      // both are real job-title/domain words this app's own chat uses.
      'The new manager has strong analytical skills',
    ];
    for (const message of negatives) {
      assert.equal(isActionableSkillAnalysisIntent(message), false, `expected no match for: "${message}"`);
    }
  });

  test('is case-insensitive', () => {
    assert.equal(isActionableSkillAnalysisIntent('FIND MY SKILL GAPS'), true);
  });
});

describe('isActionableWorkModelComparisonIntent', () => {
  test('matches the reported bug phrase and the sidebar quick-start prompts', () => {
    const positives = [
      'should I look locally or remote',
      'Should I look locally, remotely or freelance?',
      'Compare local vs remote vs freelance',
      'local vs remote',
      'Is it better to work locally or remotely?',
    ];
    for (const message of positives) {
      assert.equal(isActionableWorkModelComparisonIntent(message), true, `expected a match for: "${message}"`);
    }
  });

  test('does not match messages mentioning only one side', () => {
    const negatives = [
      '',
      '   ',
      'Hello!',
      'Help me plan my move',
      'What jobs are available locally?',
      'I want a remote job',
    ];
    for (const message of negatives) {
      assert.equal(isActionableWorkModelComparisonIntent(message), false, `expected no match for: "${message}"`);
    }
  });
});
