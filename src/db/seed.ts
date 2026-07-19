import { randomUUID } from 'node:crypto';
import { db } from './index';

interface SeedRule {
  ruleType: string;
  ruleKey: string;
  ruleValue: Record<string, unknown>;
}

const rules: SeedRule[] = [
  { ruleType: 'auto_book_service', ruleKey: 'oil_change', ruleValue: { serviceType: 'oil change', allowed: true, durationMinutes: 45 } },
  { ruleType: 'auto_book_service', ruleKey: 'battery_test_replace', ruleValue: { serviceType: 'battery test and replacement', allowed: true, durationMinutes: 45 } },
  { ruleType: 'auto_book_service', ruleKey: 'brake_inspection', ruleValue: { serviceType: 'brake inspection', allowed: true, durationMinutes: 60 } },
  { ruleType: 'auto_book_service', ruleKey: 'ac_performance_check', ruleValue: { serviceType: 'ac performance check', allowed: true, durationMinutes: 60 } },
  { ruleType: 'auto_book_service', ruleKey: 'check_engine_light_diag', ruleValue: { serviceType: 'check engine light diagnostic appointment', allowed: true, durationMinutes: 60 } },
  { ruleType: 'callback_service', ruleKey: 'complex_estimate', ruleValue: { serviceType: 'complex estimate request', allowed: false, queue: 'service_advisor' } },
  { ruleType: 'urgent_escalation', ruleKey: 'unsafe_breakdown', ruleValue: { label: 'Unsafe roadside breakdown', priority: 'urgent', action: 'transfer_or_urgent_callback' } },
  { ruleType: 'urgent_escalation', ruleKey: 'overheating_now', ruleValue: { label: 'Vehicle overheating now', priority: 'urgent', action: 'transfer_or_urgent_callback' } },
  { ruleType: 'urgent_escalation', ruleKey: 'engine_knock', ruleValue: { label: 'Engine knock', priority: 'urgent', action: 'urgent_callback' } },
  { ruleType: 'urgent_escalation', ruleKey: 'tow_needed', ruleValue: { label: 'Tow needed', priority: 'urgent', action: 'transfer_or_urgent_callback' } },
  { ruleType: 'mobile_rule', ruleKey: 'default_radius_miles', ruleValue: { radiusMiles: 25 } },
  {
    ruleType: 'booking_rule',
    ruleKey: 'shop_hours',
    ruleValue: {
      monday: ['08:00', '17:30'],
      tuesday: ['08:00', '17:30'],
      wednesday: ['08:00', '17:30'],
      thursday: ['08:00', '17:30'],
      friday: ['08:00', '17:30'],
    },
  },
  { ruleType: 'booking_rule', ruleKey: 'confirmation_required', ruleValue: { sms: true, voice_repeatback: true } },
  {
    ruleType: 'security_rule',
    ruleKey: 'prohibited_actions',
    ruleValue: { actions: ['invoice.update', 'estimate.finalize', 'work_order.close', 'refund.create', 'discount.override'] },
  },
];

export function seedBusinessRules(): void {
  const insert = db.prepare(
    `insert into business_rules (id, rule_type, rule_key, rule_value, active, updated_at)
     values (@id, @ruleType, @ruleKey, @ruleValue, 1, @updatedAt)
     on conflict(rule_key) do nothing`
  );

  const now = new Date().toISOString();
  const insertMany = db.transaction((rows: SeedRule[]) => {
    for (const rule of rows) {
      insert.run({
        id: randomUUID(),
        ruleType: rule.ruleType,
        ruleKey: rule.ruleKey,
        ruleValue: JSON.stringify(rule.ruleValue),
        updatedAt: now,
      });
    }
  });

  insertMany(rules);
}
