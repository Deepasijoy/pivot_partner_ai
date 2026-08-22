import type { Skill, SkillGap, CourseRecommendation } from '../types';
import { mockSkillTaxonomy, mockCourses } from './mockData';

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
