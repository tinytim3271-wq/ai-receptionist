-- SQLite adaptation of 001_create_ai_voice_tables.sql / 002_seed_business_rules.sql
-- uuid -> TEXT (app-generated via crypto.randomUUID()), jsonb -> TEXT (JSON string), timestamptz -> TEXT (ISO 8601)

create table if not exists customers (
  id text primary key,
  first_name text not null,
  last_name text,
  phone text not null,
  email text,
  marketing_opt_in integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create unique index if not exists idx_customers_phone on customers(phone);

create table if not exists vehicles (
  id text primary key,
  customer_id text not null references customers(id) on delete cascade,
  year integer,
  make text,
  model text,
  trim text,
  vin text,
  plate text,
  mileage integer,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_vehicles_customer_id on vehicles(customer_id);
create index if not exists idx_vehicles_vin on vehicles(vin);

create table if not exists service_locations (
  id text primary key,
  customer_id text references customers(id) on delete set null,
  location_type text not null check (location_type in ('shop','customer_address','fleet_site')),
  address1 text,
  address2 text,
  city text,
  state text,
  postal_code text,
  latitude real,
  longitude real,
  access_notes text,
  created_at text not null
);

create index if not exists idx_service_locations_customer_id on service_locations(customer_id);

create table if not exists calls (
  id text primary key,
  external_call_id text unique,
  customer_id text references customers(id) on delete set null,
  vehicle_id text references vehicles(id) on delete set null,
  phone_number text not null,
  direction text not null check (direction in ('inbound','outbound')),
  channel text not null default 'voice',
  started_at text not null,
  answered_at text,
  ended_at text,
  duration_seconds integer,
  answered_by text not null check (answered_by in ('ai','human','voicemail','abandoned')),
  transferred_to text,
  recording_url text,
  transcript text,
  transcript_summary text,
  disposition text,
  sentiment text,
  priority_score integer not null default 0,
  escalation_reason text,
  created_at text not null
);

create index if not exists idx_calls_phone_number on calls(phone_number);
create index if not exists idx_calls_started_at on calls(started_at desc);
create index if not exists idx_calls_customer_id on calls(customer_id);

create table if not exists appointment_requests (
  id text primary key,
  call_id text references calls(id) on delete set null,
  customer_id text references customers(id) on delete set null,
  vehicle_id text references vehicles(id) on delete set null,
  service_channel text not null check (service_channel in ('shop','mobile')),
  requested_service text,
  concern_category text,
  symptom_summary text,
  urgency text not null check (urgency in ('low','normal','high','emergency')),
  drivable integer,
  tow_needed integer not null default 0,
  preferred_date text,
  preferred_time_window text,
  requested_location_id text references service_locations(id) on delete set null,
  status text not null check (status in ('new','quoted','booked','needs_callback','declined','duplicate')),
  created_by text not null default 'ai_agent',
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_appointment_requests_call_id on appointment_requests(call_id);
create index if not exists idx_appointment_requests_status on appointment_requests(status);
create index if not exists idx_appointment_requests_preferred_date on appointment_requests(preferred_date);

create table if not exists appointments (
  id text primary key,
  appointment_request_id text references appointment_requests(id) on delete set null,
  customer_id text references customers(id) on delete set null,
  vehicle_id text references vehicles(id) on delete set null,
  service_channel text not null check (service_channel in ('shop','mobile')),
  scheduled_start text not null,
  scheduled_end text,
  service_type text not null,
  bay_id text,
  mobile_unit_id text,
  advisor_id text,
  source text not null default 'ai_receptionist',
  confirmation_status text not null check (confirmation_status in ('pending','sent','confirmed','failed')),
  status text not null check (status in ('scheduled','confirmed','arrived','in_progress','completed','cancelled','no_show')),
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_appointments_customer_id on appointments(customer_id);
create index if not exists idx_appointments_scheduled_start on appointments(scheduled_start);
create index if not exists idx_appointments_status on appointments(status);

create table if not exists callback_tasks (
  id text primary key,
  call_id text references calls(id) on delete set null,
  customer_id text references customers(id) on delete set null,
  vehicle_id text references vehicles(id) on delete set null,
  reason text not null,
  queue_name text not null,
  priority text not null check (priority in ('low','normal','high','urgent')),
  due_at text,
  assigned_to text,
  status text not null check (status in ('open','in_progress','completed','cancelled')),
  created_by text not null default 'ai_agent',
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_callback_tasks_status on callback_tasks(status);
create index if not exists idx_callback_tasks_priority on callback_tasks(priority);
create index if not exists idx_callback_tasks_due_at on callback_tasks(due_at);

create table if not exists ai_interactions (
  id text primary key,
  call_id text references calls(id) on delete set null,
  model_name text not null,
  model_vendor text,
  prompt_version text not null,
  action_type text not null,
  action_payload text not null,
  confidence real,
  decision_outcome text,
  approved_by_human integer not null default 0,
  approved_by text,
  created_at text not null
);

create index if not exists idx_ai_interactions_call_id on ai_interactions(call_id);
create index if not exists idx_ai_interactions_action_type on ai_interactions(action_type);
create index if not exists idx_ai_interactions_created_at on ai_interactions(created_at desc);

create table if not exists ai_guardrail_events (
  id text primary key,
  call_id text references calls(id) on delete set null,
  event_type text not null,
  severity text not null check (severity in ('info','warning','critical')),
  rule_name text not null,
  raw_output text,
  action_taken text not null,
  created_at text not null
);

create index if not exists idx_ai_guardrail_events_call_id on ai_guardrail_events(call_id);
create index if not exists idx_ai_guardrail_events_severity on ai_guardrail_events(severity);

create table if not exists business_rules (
  id text primary key,
  rule_type text not null,
  rule_key text not null unique,
  rule_value text not null,
  active integer not null default 1,
  updated_at text not null
);

create index if not exists idx_business_rules_rule_type on business_rules(rule_type);
create index if not exists idx_business_rules_active on business_rules(active);
