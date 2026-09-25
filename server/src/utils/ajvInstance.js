/**
 * @file ajvInstance.js
 * @description Singleton Ajv (Another JSON Schema Validator) instance.
 *
 * WHY a singleton?
 * ────────────────
 * Ajv.compile() is expensive — it parses the JSON Schema and compiles it into
 * a highly optimised validation function. Calling it on every request would
 * waste CPU and memory. Ajv caches compiled schemas internally by their `$id`,
 * so we create ONE global instance and reuse it across all middleware calls.
 *
 * Configuration choices:
 *  - allErrors: true   → Don't stop at the first error. Return ALL validation
 *                        failures at once so the client can fix everything in
 *                        one round-trip (better developer experience).
 *  - removeAdditional  → NOT enabled. We allow extra fields in payloads
 *                        (like `_id` from clients) to pass validation silently.
 *                        The controller strips non-schema fields before saving.
 *  - useDefaults: true → Populate missing fields with `default` values from
 *                        the schema, making schemas more expressive.
 *  - coerceTypes: false → Do NOT coerce "123" to 123. Mock APIs should reflect
 *                         real type errors so users catch them in development.
 *
 * ajv-formats adds support for standard string formats:
 *   email, uri, date, date-time, uuid, ipv4, etc.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({
  allErrors: true,  // Collect all errors, not just the first
  useDefaults: true,  // Apply `default` values from schema
  coerceTypes: false, // Strict typing — "123" ≠ 123
});

// Register format validators (email, uri, date-time, uuid, etc.)
addFormats(ajv);

export default ajv;
