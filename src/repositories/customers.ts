import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { Customer } from '../types';

interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
  marketing_opt_in: number;
  created_at: string;
  updated_at: string;
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name ?? undefined,
    phone: row.phone,
    email: row.email ?? undefined,
    marketingOptIn: !!row.marketing_opt_in,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findCustomerByPhone(phone: string): Customer | undefined {
  const row = db.prepare<[string], CustomerRow>('select * from customers where phone = ?').get(phone);
  return row ? toCustomer(row) : undefined;
}

export function getCustomerById(id: string): Customer | undefined {
  const row = db.prepare<[string], CustomerRow>('select * from customers where id = ?').get(id);
  return row ? toCustomer(row) : undefined;
}

export function createCustomer(input: Pick<Customer, 'firstName' | 'lastName' | 'phone' | 'email' | 'marketingOptIn'>): Customer {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `insert into customers (id, first_name, last_name, phone, email, marketing_opt_in, created_at, updated_at)
     values (@id, @firstName, @lastName, @phone, @email, @marketingOptIn, @createdAt, @updatedAt)`
  ).run({
    id,
    firstName: input.firstName,
    lastName: input.lastName ?? null,
    phone: input.phone,
    email: input.email ?? null,
    marketingOptIn: input.marketingOptIn ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  });
  return getCustomerById(id)!;
}
