import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({
  allErrors: true,  // Collect all errors, not just the first
  useDefaults: true,  // Apply `default` values from schema
  coerceTypes: false, // Strict typing, "123" ≠ 123
});

// Register format validators (email, uri, date-time, uuid, etc.)
addFormats(ajv);

export default ajv;