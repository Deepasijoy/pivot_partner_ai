import type { Skill, SkillGap, CourseRecommendation } from '../types';
import { mockSkillTaxonomy, mockCourses } from './mockData';

// ESCO skill ids that denote organizational scope/authority (e.g. "manage
// data," "information confidentiality") rather than a self-study-able
// ability. Confirmed empirically that ESCO's own skillType/reuseLevel
// attributes don't discriminate this axis — e.g. "information
// confidentiality" and "data mining" share identical skillType/reuseLevel
// despite one requiring org mandate and the other being self-learnable — so
// this is a small hand-curated list, not derived from taxonomy metadata.
// Expand deliberately; each id should be a skill no solo project or course
// can realistically close.
const ORG_CONTEXT_SKILL_IDS = new Set<string>([
  'skill:453', // establish data processes
  'skill:1581', // manage data
  'skill:1640', // information confidentiality
  'skill:679', // integrate ICT data
]);

export function normalizeSkills(rawSkills: string[]): Skill[] {
  const allSkills = [...mockSkillTaxonomy.technical, ...mockSkillTaxonomy.business];

  return rawSkills
    .map((rawSkill) => allSkills.find((skill) => skill.name.toLowerCase() === rawSkill.toLowerCase()))
    .filter((skill): skill is Skill => skill !== undefined);
}

export function calculateSkillGaps(userSkills: Skill[], jobRequirements: Skill[]): SkillGap[] {
  const userSkillNames = new Set(userSkills.map((skill) => skill.name.toLowerCase()));

  const missingSkills = jobRequirements.filter((skill) => !userSkillNames.has(skill.name.toLowerCase()));

  return missingSkills.map((skill) => {
    let estimatedTimeWeeks: number;
    if (skill.demandLevel === 'very_high') {
      estimatedTimeWeeks = 4;
    } else if (skill.demandLevel === 'high') {
      estimatedTimeWeeks = 2;
    } else {
      estimatedTimeWeeks = 1;
    }

    return {
      skill,
      currentLevel: 0,
      requiredLevel: 90,
      estimatedTimeWeeks,
      requiresOrgContext: skill.escoId ? ORG_CONTEXT_SKILL_IDS.has(skill.escoId) : false,
    };
  });
}

export function calculateMatchScore(userSkills: Skill[], requiredSkills: Skill[], niceToHave: Skill[] = []): number {
  const userSkillNames = new Set(userSkills.map((skill) => skill.name.toLowerCase()));

  const countRequired = requiredSkills.filter((skill) => userSkillNames.has(skill.name.toLowerCase())).length;
  const requiredPoints = requiredSkills.length > 0 ? (countRequired / requiredSkills.length) * 70 : 0;

  const countNice = niceToHave.filter((skill) => userSkillNames.has(skill.name.toLowerCase())).length;
  const nicePoints = niceToHave.length > 0 ? (countNice / niceToHave.length) * 30 : 0;

  return Math.round(requiredPoints + nicePoints);
}

export function recommendCourses(
  gaps: SkillGap[],
  courses: CourseRecommendation[] = mockCourses
): CourseRecommendation[] {
  const recommended: CourseRecommendation[] = [];
  const seenIds = new Set<string>();

  for (const gap of gaps) {
    const skillNameLower = gap.skill.name.toLowerCase();
    const matchingCourses = courses.filter((course) => course.skillGained.toLowerCase() === skillNameLower);

    for (const course of matchingCourses) {
      if (!seenIds.has(course.id)) {
        seenIds.add(course.id);
        recommended.push(course);
      }
    }
  }

  return recommended.slice(0, 3);
}
