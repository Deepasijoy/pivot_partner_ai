import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectSkills, extractListedSkillPhrases, buildUnknownSkill, SKILL_ALIASES } from '../skillExtractionService';

function names(skills: ReturnType<typeof detectSkills>): string[] {
  return skills.map((skill) => skill.name).sort();
}

describe('detectSkills — shared by resume and job-description parsing', () => {
  test('detects an exact taxonomy skill name', () => {
    assert.ok(names(detectSkills('Built dashboards in Power BI for the finance team.')).includes('Power BI'));
  });

  test('does not false-positive on a substring of an unrelated word', () => {
    // "SQL" must not fire on "MySQL"; "Excel" must not fire on "excellent".
    const result = names(detectSkills('The candidate must be an excellent communicator with MySQL exposure.'));
    assert.ok(!result.includes('Excel'));
  });

  // -------------------------------------------------------------------
  // Regression: the alias table previously only applied to resume text
  // (resumeParserService.ts had its own detectSkills with SKILL_ALIASES;
  // jobService.ts's detectSkills had no alias table at all). Both now go
  // through the same shared detectSkills(), so a job description gets the
  // same aliases a resume always did.
  // -------------------------------------------------------------------
  describe('aliases apply identically to resume text and job-description text', () => {
    const aliasCases: Array<[alias: string, canonical: string]> = [
      ['spreadsheets', 'Excel'],
      ['js', 'JavaScript'],
      ['powerbi', 'Power BI'],
      ['digital marketing', 'Marketing Strategy'],
    ];

    for (const [alias, canonical] of aliasCases) {
      test(`"${alias}" -> "${canonical}" (resume-style sentence)`, () => {
        const resumeText = `Experienced with ${alias} across multiple projects.`;
        assert.ok(names(detectSkills(resumeText)).includes(canonical));
      });

      test(`"${alias}" -> "${canonical}" (job-description-style sentence)`, () => {
        const jobText = `Requirements: candidates should have hands-on ${alias} experience.`;
        assert.ok(names(detectSkills(jobText)).includes(canonical));
      });
    }

    test('the literal case from the audit: "spreadsheets required" now detects Excel in a job description', () => {
      const jobDescription = 'The role requires strong spreadsheets skills and attention to detail.';
      assert.ok(names(detectSkills(jobDescription)).includes('Excel'));
    });
  });

  test('every SKILL_ALIASES canonical name is a real taxonomy skill (no invented targets)', () => {
    // Sanity check on the shared table itself, not a specific alias.
    const canonicalNames = new Set(Object.values(SKILL_ALIASES));
    for (const canonical of canonicalNames) {
      assert.ok(names(detectSkills(canonical)).includes(canonical), `"${canonical}" should be a detectable taxonomy skill`);
    }
  });

  test('fuzzy nearby-token matching still works for multi-word skill names', () => {
    const text = 'Delivered data-driven analysis of quarterly sales trends for leadership.';
    assert.ok(names(detectSkills(text)).includes('Data Analysis'));
  });

  test('preserves a labeled, non-taxonomy skill phrase verbatim, never inventing one', () => {
    const text = 'Skills: Marine Biology, Scientific Writing, Python';
    const result = detectSkills(text);
    const marineBiology = result.find((skill) => skill.name === 'Marine Biology');
    assert.ok(marineBiology, 'Marine Biology should be preserved from the labeled Skills: section');
    assert.equal(marineBiology?.category, 'general');
    assert.ok(names(result).includes('Python'), 'Python should still be detected via the taxonomy');
  });

  test('does NOT invent a skill from unlabeled prose', () => {
    const text = 'She spent years conducting marine biology fieldwork along the coast.';
    const result = names(detectSkills(text));
    assert.ok(!result.includes('Marine Biology'), 'an unlabeled mention must not be captured — this is the known, documented boundary');
  });
});

describe('extractListedSkillPhrases / buildUnknownSkill (unchanged behavior)', () => {
  test('splits a labeled inline list into individual phrases', () => {
    assert.deepEqual(extractListedSkillPhrases('Requirements: Kotlin, Snowflake, dbt'), ['Kotlin', 'Snowflake', 'dbt']);
  });

  test('buildUnknownSkill preserves the phrase as-written with a neutral, non-invented category', () => {
    const skill = buildUnknownSkill('Advertising');
    assert.equal(skill.name, 'Advertising');
    assert.equal(skill.category, 'general');
    assert.equal(skill.demandLevel, 'medium');
  });
});

// ---------------------------------------------------------------------------
// Regression: splitIntoPhrases previously only split on
// [,;•·|\n] / a spaced hyphen — it never split on ':' or '(' / ')', so a
// resume's own labeled "Skills:" section (the single most authoritative
// signal in the document) produced malformed phrases like "Databases: SQL"
// and "Python (Pandas" / "Scikit-learn)" sitting alongside the correctly-
// detected clean forms. Fixed in skillExtractionService.ts's
// splitIntoPhrases() — see AUDIT.md Q3/Q5 and Top 10 problem #2.
// ---------------------------------------------------------------------------
describe('splitIntoPhrases delimiter fix — colon-labeled sub-lists and parenthetical lists', () => {
  test('"Databases: SQL, MySQL" — the label is discarded, not glued to the first skill', () => {
    assert.deepEqual(extractListedSkillPhrases('Skills:\nDatabases: SQL, MySQL'), ['SQL', 'MySQL']);
  });

  test('"Python (Pandas, Scikit-learn)" — parenthetical list splits into separate skills, no dangling parens', () => {
    assert.deepEqual(extractListedSkillPhrases('Skills:\nPython (Pandas, Scikit-learn)'), ['Python', 'Pandas', 'Scikit-learn']);
  });

  test('"Visualization & BI Tools: Power BI, DAX, Power Query" — a label with no taxonomy/alias entry is discarded, not fabricated as its own skill', () => {
    assert.deepEqual(extractListedSkillPhrases('Skills:\nVisualization & BI Tools: Power BI, DAX, Power Query'), [
      'Power BI',
      'DAX',
      'Power Query',
    ]);
  });

  test('end-to-end via detectSkills: none of the three labels ever appear as a fabricated skill', () => {
    const text = [
      'Skills:',
      'Databases: SQL, MySQL',
      'Python (Pandas, Scikit-learn)',
      'Visualization & BI Tools: Power BI, DAX, Power Query',
    ].join('\n');
    const result = names(detectSkills(text));
    for (const expected of ['SQL', 'MySQL', 'Python', 'Power BI']) {
      assert.ok(result.includes(expected), `expected "${expected}" to be detected`);
    }
    for (const label of ['Databases: SQL', 'Databases', 'Python (Pandas', 'Scikit-learn)', 'Visualization & BI Tools']) {
      assert.ok(!result.includes(label), `"${label}" must not appear as a detected skill`);
    }
  });
});

// ---------------------------------------------------------------------------
// Regression: the confirmed production bug where "Your Skills" contained
// resume-section content (job titles, employer names, dates, degree lines)
// — root-caused to extractListedSkillPhrases's "Skills:" section scan only
// stopping at another skill-labeled header or a blank line. PDF text
// extraction (resumeParserService.ts) drops blank lines entirely, and
// "Experience:"/"Education:" aren't skill-labeled headers, so the scan swept
// the rest of the resume in as if it were still the skills list. Fixed by
// recognizing ANY short "Label:" line as a section boundary — a structural
// signal, not a word blacklist — see GENERIC_SECTION_HEADER_LINE_PATTERN.
// ---------------------------------------------------------------------------
describe('a "Skills:" section never leaks into a following resume section (structural boundary, not a word blacklist)', () => {
  // Mirrors exactly what resumeParserService.ts's PDF text extraction
  // produces: one row per visual line, blank lines already removed.
  const marineBiologistResumeText = [
    'Alex Rivera',
    'Title: Marine Biologist',
    'Summary:',
    '8 years of experience in marine biology and oceanography research,',
    'focusing on coastal ecosystem health and marine conservation.',
    'Skills:',
    'Python, SQL, Marine Biology, Oceanography, Field Research',
    'Experience:',
    'Marine Biologist - Coastal Research Institute (2018-2026)',
    'Conducted marine biology fieldwork and oceanography surveys.',
    'Used Python and SQL to analyze species population datasets.',
    'Education:',
    'B.S. Marine Biology, State University',
  ].join('\n');

  test('genuine listed skills are still extracted', () => {
    const phrases = extractListedSkillPhrases(marineBiologistResumeText);
    for (const expected of ['Python', 'SQL', 'Marine Biology', 'Oceanography', 'Field Research']) {
      assert.ok(phrases.includes(expected), `expected "${expected}" to be extracted`);
    }
  });

  test('the job title, employer, and date range from the Experience section are never treated as skills', () => {
    const phrases = extractListedSkillPhrases(marineBiologistResumeText);
    for (const artifact of ['Experience', 'Marine Biologist - Coastal Research Institute (2018-2026)', 'Coastal Research Institute (2018-2026)']) {
      assert.ok(!phrases.includes(artifact), `"${artifact}" must not be extracted as a skill`);
    }
  });

  test('the degree line and university from the Education section are never treated as skills', () => {
    const phrases = extractListedSkillPhrases(marineBiologistResumeText);
    for (const artifact of ['Education', 'B.S. Marine Biology', 'State University']) {
      assert.ok(!phrases.includes(artifact), `"${artifact}" must not be extracted as a skill`);
    }
  });

  test('end-to-end via detectSkills: "Your Skills" contains only real/labeled skills, no resume artifacts', () => {
    const skills = names(detectSkills(marineBiologistResumeText));
    assert.ok(skills.includes('Python'));
    assert.ok(skills.includes('SQL'));
    assert.ok(skills.includes('Marine Biology'));
    for (const artifact of ['Experience', 'Education', 'Marine Biologist', 'State University', 'Coastal Research Institute (2018-2026)']) {
      assert.ok(!skills.includes(artifact), `"${artifact}" must not appear in detected skills`);
    }
  });

  test('an arbitrary, unrecognized section name ("Volunteer Work:") is also recognized as a boundary — this is a structural rule, not a hardcoded word list', () => {
    const text = [
      'Skills:',
      'Excel, Budgeting',
      'Volunteer Work:',
      'Habitat for Humanity - Site Coordinator (2021-2023)',
    ].join('\n');
    const phrases = extractListedSkillPhrases(text);
    assert.ok(phrases.includes('Excel'));
    assert.ok(phrases.includes('Budgeting'));
    assert.ok(!phrases.includes('Volunteer Work'));
    assert.ok(!phrases.includes('Habitat for Humanity - Site Coordinator (2021-2023)'));
  });

  test('a genuine multi-line skills list with no following header is still captured in full (no regression from the fix)', () => {
    const text = ['Skills:', 'Python, SQL, Excel, Budgeting, Financial Analysis'].join('\n');
    const phrases = extractListedSkillPhrases(text);
    for (const expected of ['Python', 'SQL', 'Excel', 'Budgeting', 'Financial Analysis']) {
      assert.ok(phrases.includes(expected));
    }
  });
});
