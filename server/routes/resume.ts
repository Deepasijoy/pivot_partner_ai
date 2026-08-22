import { Router } from 'express';
import { analyzeResumeText } from '../services/claudeService';
import { normalizeSkillsAgainstTaxonomy } from '../utils/skillNormalization';
import { mapErrorToResponse, ValidationError } from '../utils/errors';
import type { AnalyzeResumeRequestBody } from '../types';
import type { ResumeProfile } from '../../src/types';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const body = req.body as Partial<AnalyzeResumeRequestBody>;
    if (!body || typeof body.resumeText !== 'string' || body.resumeText.trim().length < 20) {
      throw new ValidationError('Request must include "resumeText" with at least 20 characters.');
    }

    const raw = await analyzeResumeText(body.resumeText);

    // Validate/sanitize before trusting anything Claude returned — the schema
    // guarantees shape, not sane values or a controlled skill vocabulary.
    const skills = normalizeSkillsAgainstTaxonomy(raw.skills);
    const transferableSkills = normalizeSkillsAgainstTaxonomy(raw.transferableSkills).filter(
      (skill) => skill.category === 'business'
    );
    const yearsExperience = Math.min(60, Math.max(0, Math.round(raw.yearsExperience)));
    const industries = raw.industries.filter((industry) => industry.trim().length > 0).slice(0, 6);
    const careerPaths = raw.careerPaths
      .filter((path) => path.title.trim().length > 0 && path.reason.trim().length > 0)
      .slice(0, 5);
    const professionalSummary = raw.professionalSummary.trim();

    const profile: ResumeProfile = {
      skills,
      experience: professionalSummary || `${yearsExperience} years of professional experience.`,
      yearsExperience,
      industries: industries.length > 0 ? industries : ['General Business'],
      professionalSummary: professionalSummary || undefined,
      likelyRole: raw.likelyRole.trim() || undefined,
      seniority: raw.seniority.trim() || undefined,
      transferableSkills: transferableSkills.length > 0 ? transferableSkills : undefined,
      careerPaths: careerPaths.length > 0 ? careerPaths : undefined,
    };

    res.json(profile);
  } catch (err) {
    const { status, body: errorBody } = mapErrorToResponse(err);
    if (status >= 500) {
      console.error('[POST /api/analyze-resume] failed:', err);
    }
    res.status(status).json(errorBody);
  }
});

export default router;
