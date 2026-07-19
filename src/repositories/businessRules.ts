import { db } from '../db';
import type { BusinessRule } from '../types';

interface BusinessRuleRow {
  id: string;
  rule_type: string;
  rule_key: string;
  rule_value: string;
  active: number;
  updated_at: string;
}

function toBusinessRule(row: BusinessRuleRow): BusinessRule {
  return {
    id: row.id,
    ruleType: row.rule_type,
    ruleKey: row.rule_key,
    ruleValue: JSON.parse(row.rule_value),
    active: !!row.active,
    updatedAt: row.updated_at,
  };
}

export function getActiveRulesByType(ruleType: string): BusinessRule[] {
  const rows = db
    .prepare<[string], BusinessRuleRow>('select * from business_rules where rule_type = ? and active = 1')
    .all(ruleType);
  return rows.map(toBusinessRule);
}

export function getRuleByKey(ruleKey: string): BusinessRule | undefined {
  const row = db
    .prepare<[string], BusinessRuleRow>('select * from business_rules where rule_key = ? and active = 1')
    .get(ruleKey);
  return row ? toBusinessRule(row) : undefined;
}

export function getAllActiveRules(): BusinessRule[] {
  const rows = db.prepare<[], BusinessRuleRow>('select * from business_rules where active = 1').all();
  return rows.map(toBusinessRule);
}

export function getAutoBookServiceNames(): string[] {
  return getActiveRulesByType('auto_book_service')
    .filter((rule) => rule.ruleValue.allowed === true)
    .map((rule) => String(rule.ruleValue.serviceType));
}

export function getServiceDurationMinutes(serviceType: string): number {
  const rule = getActiveRulesByType('auto_book_service').find(
    (r) => String(r.ruleValue.serviceType).toLowerCase() === serviceType.toLowerCase()
  );
  return rule ? Number(rule.ruleValue.durationMinutes ?? 60) : 60;
}

export function getProhibitedActions(): string[] {
  const rule = getRuleByKey('prohibited_actions');
  return rule ? (rule.ruleValue.actions as string[]) : [];
}

export function getShopHours(): Record<string, [string, string]> {
  const rule = getRuleByKey('shop_hours');
  return (rule?.ruleValue as Record<string, [string, string]>) ?? {};
}
