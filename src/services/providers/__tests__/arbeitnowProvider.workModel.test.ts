import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mapArbeitnowJob, type ArbeitnowJob } from '../arbeitnowProvider';

// Regression coverage for the Arbeitnow work-model/eligibility bug: a real
// listing ("Remote Senior Accountant - Hybrid - NL/BE/DE/LU/FR", Valsoft
// Corp) had Arbeitnow's own `remote: true` flag set even though its title
// explicitly restricts it to five specific countries — inferWorkModel()
// used to trust `remote` first and only fall back to checking the title
// text for "hybrid" when `remote` was false, so this listing was
// mislabeled 'remote' (fully remote-from-anywhere) instead of 'hybrid',
// and mapArbeitnowJob() never populated remoteEligibility at all (Arbeitnow
// gives no structured field for it), so downstream classification always
// defaulted to 'unclear' regardless.

function baseJob(overrides: Partial<ArbeitnowJob> = {}): ArbeitnowJob {
  return {
    slug: 'test-job',
    company_name: 'Acme Corp',
    title: 'Remote Data Analyst',
    description: '',
    remote: true,
    url: 'https://arbeitnow.com/jobs/test-job',
    location: 'Anywhere',
    created_at: 1_700_000_000,
    ...overrides,
  };
}

describe('arbeitnowProvider — inferWorkModel via mapArbeitnowJob', () => {
  test('a title stating "Hybrid" plus specific countries is classified hybrid, even when remote: true', () => {
    const job = baseJob({
      title: 'Remote Senior Accountant - Hybrid - NL/BE/DE/LU/FR',
      company_name: 'Valsoft Corp',
      remote: true,
    });
    const result = mapArbeitnowJob(job);
    assert.equal(result.workModel, 'hybrid', 'the title\'s "Hybrid" language must win over the remote:true flag');
  });

  test('a title stating "Hybrid" with no job_types is still classified hybrid when remote: true', () => {
    const job = baseJob({ title: 'Sales Manager (Hybrid)', remote: true });
    assert.equal(mapArbeitnowJob(job).workModel, 'hybrid');
  });

  test('"hybrid" named only in job_types (not the title) still wins over remote: true', () => {
    const job = baseJob({ title: 'Senior Accountant', job_types: ['Hybrid'], remote: true });
    assert.equal(mapArbeitnowJob(job).workModel, 'hybrid');
  });

  test('a genuinely remote listing (no hybrid/restriction language) is still classified remote — no regression', () => {
    const job = baseJob({ title: 'Remote Data Analyst', remote: true });
    assert.equal(mapArbeitnowJob(job).workModel, 'remote');
  });

  test('remote: false with no hybrid language is still classified local — no regression', () => {
    const job = baseJob({ title: 'Data Analyst', remote: false });
    assert.equal(mapArbeitnowJob(job).workModel, 'local');
  });
});

describe('arbeitnowProvider — remoteEligibility population via mapArbeitnowJob', () => {
  test('remoteEligibility is populated from the title text instead of left undefined', () => {
    const job = baseJob({ title: 'Remote Senior Accountant - Hybrid - NL/BE/DE/LU/FR' });
    const result = mapArbeitnowJob(job);
    assert.ok(result.remoteEligibility, 'remoteEligibility must no longer default to undefined for every Arbeitnow job');
    assert.match(result.remoteEligibility ?? '', /NL\/BE\/DE\/LU\/FR/);
  });

  test('remoteEligibility includes job_types text alongside the title', () => {
    const job = baseJob({ title: 'Senior Accountant', job_types: ['Hybrid', 'Full-time'] });
    const result = mapArbeitnowJob(job);
    assert.match(result.remoteEligibility ?? '', /Hybrid/);
    assert.match(result.remoteEligibility ?? '', /Full-time/);
  });
});
