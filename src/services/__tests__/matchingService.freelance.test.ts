import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { matchFreelanceForUser, generateCareerPaths } from '../matchingService';
import type { FreelanceGig, ResumeProfile, Skill } from '../../types';

// Step D regression: a production user must never receive a mock freelance
// gig merely because none of the matching substrate was genuinely
// relevant — the confirmed bug (a Teacher or Journalist, zero overlap with
// every gig in mockFreelanceGigs, still got "Freelance: Power BI Dashboard
// Development" at 0%, purely from array-order tie-breaking once every raw
// score tied at 0).

function skill(name: string, category: Skill['category'] = 'technical'): Skill {
  return { name, category, demandLevel: 'high', proficiency: 70 };
}

function gig(overrides: Partial<FreelanceGig>): FreelanceGig {
  return {
    id: `gig_${Math.random().toString(36).slice(2)}`,
    title: 'Untitled Gig',
    budget: '$1K-3K',
    duration: '2 weeks',
    requiredSkills: [],
    matchPercentage: 0,
    platform: 'Upwork',
    ...overrides,
  };
}

function profile(overrides: Partial<ResumeProfile>): ResumeProfile {
  return { skills: [], experience: '', yearsExperience: 5, industries: [], ...overrides };
}

const teacherSkills = [skill('Communication', 'business'), skill('Curriculum Development', 'general'), skill('Classroom Management', 'general')];

describe('Step D — freelance matching never falls back to an irrelevant mock gig', () => {
  test('no relevant live freelance result -> no mock gig returned; the honest unavailable placeholder is shown instead', () => {
    // Reproduces the exact live bug: a Teacher candidate against the REAL
    // mockFreelanceGigs fixture (all technical/business gigs — Power BI,
    // SQL, React, AWS, Financial Forecasting, Market Research, Content
    // Writing, ...) has zero overlap with any of them.
    const paths = generateCareerPaths(teacherSkills, [], 'Teacher', ['Education']);
    const freelancePath = paths[paths.length - 1];

    assert.equal(freelancePath.isUnavailable, true);
    assert.equal(freelancePath.matchPercentage, 0);
    assert.match(freelancePath.whyItFits, /No relevant freelance opportunities/);
    assert.ok(
      !freelancePath.title.startsWith('Freelance: Power BI'),
      'must never default to the first array entry merely because every gig tied at 0'
    );
  });

  test('relevant freelance result -> returned as a real, same-domain-gated match', () => {
    const dataAnalystGig = gig({
      title: 'Data Analyst Consulting',
      requiredSkills: [skill('SQL'), skill('Data Analysis')],
    });
    const [match] = matchFreelanceForUser([skill('SQL'), skill('Python')], 'Data Analyst', ['SaaS'], [dataAnalystGig]);
    assert.equal(match.title, 'Data Analyst Consulting');
    assert.ok(match.matchPercentage > 0);
    assert.equal(match.occupationCategory, 'same_domain');
  });

  test('unrelated gig -> suppressed (occupation-gated), even with a coincidental skill match', () => {
    // A Banker candidate has "Excel" — which happens to also appear in a
    // Web Developer-style gig's requirements alongside genuinely unrelated
    // technical skills. The occupation gate must discount this, not let
    // one shared generic skill read as a real fit.
    const webDevGig = gig({
      title: 'Web Developer Consulting',
      requiredSkills: [skill('JavaScript'), skill('Excel', 'business')],
    });
    const bankerGig = gig({
      // "Financial Analyst" (not "Banker") so this genuinely resolves to
      // the SAME ESCO occupation the candidate's own skill-cluster
      // fallback resolves to (see below) — "Banker" alone isn't an ESCO
      // occupation label.
      title: 'Financial Analyst Consulting',
      requiredSkills: [skill('Financial Analysis', 'business'), skill('Excel', 'business')],
    });
    const bankerSkills = [skill('Financial Analysis', 'business'), skill('Excel', 'business'), skill('Budgeting', 'business')];

    const [unrelatedMatch] = matchFreelanceForUser(bankerSkills, 'Banker', ['Finance'], [webDevGig]);
    const [sameDomainMatch] = matchFreelanceForUser(bankerSkills, 'Banker', ['Finance'], [bankerGig]);

    assert.equal(unrelatedMatch.occupationCategory, 'unrelated');
    assert.ok(unrelatedMatch.matchPercentage <= 30, `expected a suppressed score, got ${unrelatedMatch.matchPercentage}`);
    assert.equal(sameDomainMatch.occupationCategory, 'same_domain');
    assert.ok(
      sameDomainMatch.matchPercentage > unrelatedMatch.matchPercentage,
      'the same-domain gig must score higher than the unrelated one despite comparable skill overlap'
    );
  });

  test('adjacent legitimate freelance transition -> allowed, not suppressed', () => {
    // Data Analyst candidate, a "Business Analyst"-titled freelance gig —
    // ISCO minor groups 251 <-> 242 are a curated adjacent pair in
    // occupationMatchingService.ts (confirmed real ESCO occupation
    // adjacency, not a hand-named domain).
    const businessAnalystGig = gig({
      title: 'Business Analyst Consulting',
      requiredSkills: [skill('business analysis', 'business'), skill('market research', 'business')],
    });
    const dataAnalystSkills = [skill('business analysis', 'business'), skill('market research', 'business'), skill('use databases')];

    const [match] = matchFreelanceForUser(dataAnalystSkills, 'Data Analyst', [], [businessAnalystGig]);
    assert.equal(match.occupationCategory, 'adjacent');
    assert.ok(match.matchPercentage > 30, 'an adjacent transition must not be suppressed like an unrelated one');
  });

  test('no likelyRole/industries context -> ungated, existing behavior preserved (backward compatible)', () => {
    const anyGig = gig({ title: 'Random Gig', requiredSkills: [skill('Python')] });
    const [match] = matchFreelanceForUser([skill('Python')], undefined, undefined, [anyGig]);
    assert.equal(match.occupationCategory, 'unknown');
    // Freelance gigs now go through the exact same scorer/bands as job
    // listings (scoreJob(), via matchingService.ts's asScorableJobOpportunity
    // wrapper) — no separate, gig-only formula any more, so this is no
    // longer pinned to the old calculateMatchScore-only value. Just confirm
    // a real, positive score, ungated as 'unknown' means it should be.
    assert.ok(match.matchPercentage > 0, 'an ungated match with a matched skill must still score positively');
  });
});
