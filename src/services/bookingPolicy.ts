import { getAutoBookServiceNames } from '../repositories/businessRules';

export interface AutoBookPolicyResult {
  allowed: boolean;
  normalizedServiceType: string;
  approvedServices: string[];
  reason?: string;
}

function normalizeServiceType(value: string): string {
  return value.trim().toLowerCase();
}

export function evaluateAutoBookPolicy(serviceType: string): AutoBookPolicyResult {
  const approvedServices = getAutoBookServiceNames();
  const normalizedServiceType = normalizeServiceType(serviceType);
  const allowed = approvedServices.some((svc) => normalizeServiceType(svc) === normalizedServiceType);

  return {
    allowed,
    normalizedServiceType,
    approvedServices,
    reason: allowed
      ? undefined
      : `"${serviceType}" is not approved for auto-booking. Use an appointment request plus callback handoff.`,
  };
}