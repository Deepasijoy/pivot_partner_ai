import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectIndustries } from '../industryDetectionService';

// Regression: detectIndustries() previously scanned the ENTIRE resume text
// with plain substring matching, so a bare "Education:" section-heading
// line always false-positived the 'Education' industry — contaminating
// resolveCandidateDomain() for any candidate whose profession has nothing
// to do with education (confirmed live for the Marketing profile: industries
// resolved to ['Education', 'Marketing'], and since resolveCandidateDomain()
// returns on the first industry that maps to a domain, 'Education' won out
// over 'Marketing', misclassifying the candidate's whole occupation domain).
// Fixed by excluding bare section-heading lines (a structural signal, not a
// word blacklist — the same GENERIC_SECTION_HEADER_LINE_PATTERN
// skillExtractionService.ts already uses) before the keyword scan runs;
// genuine content under a heading is scanned exactly as before.

describe('detectIndustries — bare section headings never become industries (structural fix, not a word blacklist)', () => {
  test('1. "Education:" heading alone (no other content) produces no industries', () => {
    const text = ['Skills:', 'Excel, Budgeting', 'Education:', 'B.A. Sociology, State University'].join('\n');
    // Neither the heading nor the degree field itself names a recognized
    // industry keyword, so General Business is the honest fallback.
    assert.deepEqual(detectIndustries(text), ['General Business']);
  });

  test('2. "Experience:" heading alone produces no industries (no INDUSTRY_KEYWORDS entry matches "experience" itself)', () => {
    const text = ['Skills:', 'Excel', 'Experience:', 'Banker - First National Bank (2019-2026)'].join('\n');
    const result = detectIndustries(text);
    assert.ok(!result.includes('Experience'), 'a heading word must never itself become an industry label');
  });

  test('an arbitrary, unrecognized heading ("Certifications:", "Projects:") is also excluded — a structural rule, not a fixed word list', () => {
    const text = [
      'Summary:',
      'Marketing professional with a passion for growth campaigns.',
      'Certifications:',
      'Google Ads Certified',
      'Projects:',
      'Led a rebrand for a consumer app.',
    ].join('\n');
    const result = detectIndustries(text);
    assert.ok(result.includes('Marketing'), 'genuine marketing content must still be detected');
  });
});

describe('detectIndustries — legitimate industry content keeps working (no over-suppression)', () => {
  test('3. genuine education-industry content in flowing prose (not a heading) still detects Education', () => {
    const text = [
      'Title: Teacher',
      'Summary:',
      '6 years of experience in secondary education, teaching mathematics',
      'and leading curriculum development initiatives.',
      'Skills:',
      'Communication, Curriculum Development, Classroom Management',
      'Experience:',
      'Teacher - Lincoln High School (2020-2026)',
      'Taught mathematics and led curriculum development for the department.',
      'Education:',
      'B.Ed. Education, State University',
    ].join('\n');
    assert.ok(detectIndustries(text).includes('Education'), 'a genuine mention of "education" in real content must still be detected');
  });

  test('a resume with NO "Education:" heading at all, but "education" genuinely appearing in professional content, still detects it', () => {
    const text =
      '10 years of experience in corporate education and training programs for Fortune 500 clients, ' +
      'designing curricula and leading workshops nationwide.';
    assert.ok(detectIndustries(text).includes('Education'));
  });

  test('4. marketing content produces the Marketing industry', () => {
    const text = [
      'Title: Marketing professional',
      'Summary:',
      '6 years of experience in marketing, running digital marketing',
      'campaigns and content programs for consumer brands.',
      'Skills:',
      'Digital Marketing, Content Strategy, SEO',
      'Experience:',
      'Marketing Professional - Consumer Brands Co (2020-2026)',
      'Ran digital marketing campaigns and managed content strategy.',
      'Education:',
      'B.A. Marketing, State University',
    ].join('\n');
    assert.deepEqual(detectIndustries(text), ['Marketing']);
  });

  test('5. Marine Biology content is not overridden by the Education heading', () => {
    const text = [
      'Title: Marine Biologist',
      'Summary:',
      '8 years of experience in marine biology and oceanography research,',
      'focusing on coastal ecosystem health and marine conservation.',
      'Skills:',
      'Python, SQL, Marine Biology, Oceanography, Field Research',
      'Experience:',
      'Marine Biologist - Coastal Research Institute (2018-2026)',
      'Conducted marine biology fieldwork and oceanography surveys.',
      'Education:',
      'B.S. Marine Biology, State University',
    ].join('\n');
    const result = detectIndustries(text);
    assert.ok(result.includes('Marine Science'));
    assert.ok(!result.includes('Education'), '"Education:" is a bare heading here — no genuine education content exists in this resume');
  });

  test('6. industry extraction remains stable across many resume sections, none of which leak as industries themselves', () => {
    const text = [
      'Title: Banker',
      'Summary:',
      '7 years of experience in retail and commercial banking and finance.',
      'Skills:',
      'Financial Analysis, Excel, Budgeting',
      'Experience:',
      'Banker - First National Bank (2019-2026)',
      'Certifications:',
      'Certified Financial Analyst',
      'Projects:',
      'Led a lending-process automation initiative.',
      'Publications:',
      'Co-authored an internal risk-management whitepaper.',
      'References:',
      'Available upon request.',
      'Education:',
      'B.A. Finance, State University',
    ].join('\n');
    const result = detectIndustries(text);
    assert.ok(result.includes('Finance'));
    assert.ok(!result.includes('Education'), 'no genuine education content exists in this resume — only the heading, which must not leak');
  });
});

// ---------------------------------------------------------------------------
// Regression: "Industry detection should represent meaningful professional
// experience/domain, not merely a single skill or isolated keyword
// mention." A single "Digital Marketing" skill-list mention (a fellowship,
// a single project) should not by itself classify a candidate's whole
// career as Marketing; genuine, repeated, or role-defining marketing
// experience should. Separately, "social media" (a complete word inside a
// standard digital-marketing phrase) must never trigger Journalism &
// Media — fixed by removing the ambiguous bare 'media' keyword entirely
// rather than trying to special-case "social media" out of a substring
// check.
// ---------------------------------------------------------------------------
describe('detectIndustries — evidence strength (weak isolated mentions vs. meaningful professional evidence)', () => {
  test('1. "social media" in a genuine marketing context produces Marketing evidence but never Journalism & Media', () => {
    const text = [
      'Title: Growth Marketing Manager',
      'Summary:',
      '10 years of experience in growth marketing and digital marketing, running',
      'social media campaigns, paid social media advertising, and content',
      'marketing programs for consumer brands.',
      'Skills:',
      'Growth Marketing, Digital Marketing, Social Media Marketing, Content Marketing',
    ].join('\n');
    const result = detectIndustries(text);
    assert.ok(result.includes('Marketing'), 'genuine, repeated marketing content must still be detected');
    assert.ok(!result.includes('Journalism & Media'), '"social media" must never trigger Journalism & Media');
  });

  test('2. a single "Digital Marketing" mention in a fellowship/skills context does not by itself classify the industry as Marketing', () => {
    const text = [
      'Title: Product Fellow',
      'Summary:',
      '6 years of experience in product management and operations for',
      'early-stage startups, focused on user growth, retention, and analytics.',
      'Fellowship:',
      'Completed a Product & Growth fellowship covering analytics,',
      'experimentation, and campaign strategy.',
      'Skills:',
      'Product Management, SQL, Python, Power BI, Digital Marketing, Data Analysis',
    ].join('\n');
    const result = detectIndustries(text);
    assert.ok(
      !result.includes('Marketing'),
      'a single unreinforced "Digital Marketing" skill mention must not alone make Marketing a primary industry'
    );
  });

  test('3a. genuine, repeated marketing experience (a real job title) still produces Marketing', () => {
    const text = [
      'Title: Marketing Manager',
      'Experience:',
      'Marketing Manager - Acme Corp (2019-2026)',
      'Led marketing campaigns and go-to-market strategy for the flagship product line.',
    ].join('\n');
    assert.ok(detectIndustries(text).includes('Marketing'));
  });

  test('3b. "Head of Marketing" (role-before-keyword phrasing) is recognized as strong evidence even at a single mention', () => {
    const text = 'Title: Head of Marketing\nSummary:\nOversee brand strategy for a mid-size consumer goods company.';
    assert.ok(detectIndustries(text).includes('Marketing'));
  });

  test('3c. an explicit "years of marketing experience" phrase is strong evidence even at a single mention', () => {
    const text = 'Summary:\n8 years of marketing experience across B2B and B2C consumer brands.';
    assert.ok(detectIndustries(text).includes('Marketing'));
  });

  test('4. genuine journalism/reporting/newspaper experience produces Journalism & Media', () => {
    const text = [
      'Title: Journalist',
      'Summary:',
      '5 years of experience as a journalist, reporting for a regional newspaper',
      'and covering investigative stories for the newsroom.',
    ].join('\n');
    const result = detectIndustries(text);
    assert.ok(result.includes('Journalism & Media'));
  });

  test('unambiguous business terms that resemble the removed "media" keyword in spirit ("financial reporting", "publishing research") are not treated as Journalism & Media evidence', () => {
    const text = [
      'Title: Financial Analyst',
      'Summary:',
      '6 years of experience in financial reporting and publishing quarterly',
      'research notes for institutional investors.',
    ].join('\n');
    assert.ok(!detectIndustries(text).includes('Journalism & Media'));
  });
});
