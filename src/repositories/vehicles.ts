import { randomUUID } from 'node:crypto';
import { db } from '../db';
import type { Vehicle } from '../types';

interface VehicleRow {
  id: string;
  customer_id: string;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  vin: string | null;
  plate: string | null;
  mileage: number | null;
  created_at: string;
  updated_at: string;
}

function toVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    customerId: row.customer_id,
    year: row.year ?? undefined,
    make: row.make ?? undefined,
    model: row.model ?? undefined,
    trim: row.trim ?? undefined,
    vin: row.vin ?? undefined,
    plate: row.plate ?? undefined,
    mileage: row.mileage ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getVehicleById(id: string): Vehicle | undefined {
  const row = db.prepare<[string], VehicleRow>('select * from vehicles where id = ?').get(id);
  return row ? toVehicle(row) : undefined;
}

export function listVehiclesByCustomer(customerId: string): Vehicle[] {
  const rows = db.prepare<[string], VehicleRow>('select * from vehicles where customer_id = ?').all(customerId);
  return rows.map(toVehicle);
}

export function createVehicle(input: Omit<Vehicle, 'id' | 'createdAt' | 'updatedAt'>): Vehicle {
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    `insert into vehicles (id, customer_id, year, make, model, trim, vin, plate, mileage, created_at, updated_at)
     values (@id, @customerId, @year, @make, @model, @trim, @vin, @plate, @mileage, @createdAt, @updatedAt)`
  ).run({
    id,
    customerId: input.customerId,
    year: input.year ?? null,
    make: input.make ?? null,
    model: input.model ?? null,
    trim: input.trim ?? null,
    vin: input.vin ?? null,
    plate: input.plate ?? null,
    mileage: input.mileage ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return getVehicleById(id)!;
}
