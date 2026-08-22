import type { FinanceScenario } from '../types';
import { expensesConfig, taxRatesConfig } from './config';

function normalizeLocation(location: string): string {
  return location
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toLowerCase();
}

export function estimateExpensesByLocation(location: string): number {
  const key = normalizeLocation(location);
  return expensesConfig[key as keyof typeof expensesConfig] ?? expensesConfig.default;
}

export function calculateLocalJobScenario(salary: number, location: string, _familySize: number): FinanceScenario {
  const annualTaxes = salary * taxRatesConfig.local;
  const monthlyExpenses = estimateExpensesByLocation(location);
  const annualExpenses = monthlyExpenses * 12;
  const annualNet = salary - annualTaxes - annualExpenses;
  const monthlyNet = annualNet / 12;

  return { salary, annualTaxes, annualExpenses, annualNet, monthlyNet };
}

export function calculateRemoteJobScenario(salary: number, location: string, _familySize: number): FinanceScenario {
  const annualTaxes = salary * taxRatesConfig.remote;
  const monthlyExpenses = estimateExpensesByLocation(location);
  const annualExpenses = monthlyExpenses * 12;
  const annualNet = salary - annualTaxes - annualExpenses;
  const monthlyNet = annualNet / 12;

  return { salary, annualTaxes, annualExpenses, annualNet, monthlyNet };
}

export function compareScenarios(
  localScenario: FinanceScenario,
  remoteScenario: FinanceScenario
): { annualDifference: number; monthlyDifference: number; recommendation: string; verdict: string } {
  const annualDifference = remoteScenario.annualNet - localScenario.annualNet;
  const monthlyDifference = remoteScenario.monthlyNet - localScenario.monthlyNet;

  let verdict: string;
  let recommendation: string;

  if (annualDifference > 50000) {
    verdict = 'Remote strongly recommended';
    recommendation = `Remote work nets $${annualDifference.toLocaleString()} more per year — a substantial gain.`;
  } else if (annualDifference > 20000) {
    verdict = 'Remote recommended';
    recommendation = `Remote work nets $${annualDifference.toLocaleString()} more per year.`;
  } else if (annualDifference > 0) {
    verdict = 'Remote slightly better';
    recommendation = `Remote work nets $${annualDifference.toLocaleString()} more per year.`;
  } else {
    verdict = 'Local job better';
    recommendation = `The local job nets $${Math.abs(annualDifference).toLocaleString()} more per year.`;
  }

  return { annualDifference, monthlyDifference, recommendation, verdict };
}