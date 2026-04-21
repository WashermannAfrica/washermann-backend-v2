/**
 * TypeORM column value transformers.
 *
 * PostgreSQL BIGINT and DECIMAL columns come back as strings from the driver.
 * These transformers convert them to the correct JS types at read/write time.
 */

/** BIGINT → number (safe for values ≤ Number.MAX_SAFE_INTEGER ~9 quadrillion) */
export const BigIntTransformer = {
  to:   (v: number | null | undefined): string | null  => (v != null ? String(v) : null),
  from: (v: string | null | undefined): number         => parseInt(v ?? '0', 10),
};

/** DECIMAL / NUMERIC → number */
export const DecimalTransformer = {
  to:   (v: number | null | undefined): string | null  => (v != null ? String(v) : null),
  from: (v: string | null | undefined): number         => parseFloat(v ?? '0'),
};
