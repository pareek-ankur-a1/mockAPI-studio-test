/**
 * @file fakerMapper.js
 * @description Maps JSON Schema property definitions to @faker-js/faker methods.
 *
 * This utility powers the Phase 3 seeding route. Given a JSON Schema object,
 * it generates a realistic fake record that conforms to the schema's types
 * and formats.
 *
 * Mapping strategy (in priority order):
 *  1. Property NAME hints   → "email" → faker.internet.email(), "phone" → faker.phone.number()
 *  2. JSON Schema `format`  → "date-time" → faker.date.recent().toISOString()
 *  3. JSON Schema `type`    → "string" → faker.lorem.word(), "number" → faker.number.float()
 *  4. Enum values           → pick a random entry from the enum array
 *  5. Nested objects        → recurse into `properties`
 *  6. Arrays                → generate 1–3 items using `items` schema
 *  7. Unknown               → return null (safe fallback)
 */

import { faker } from '@faker-js/faker';

// ─── Name-hint lookup table ───────────────────────────────────────────────────
/**
 * Maps lowercase property name substrings to faker generators.
 * Checked BEFORE type/format for maximum realism.
 *
 * The key is tested with String.includes() so "firstName", "first_name",
 * "userFirstName" all match "firstname" → faker.person.firstName().
 */
const NAME_HINTS = [
  // Identity
  { hint: 'firstname', gen: () => faker.person.firstName() },
  { hint: 'lastname', gen: () => faker.person.lastName() },
  { hint: 'fullname', gen: () => faker.person.fullName() },
  { hint: 'username', gen: () => faker.internet.username() },
  { hint: 'name', gen: () => faker.person.fullName() },

  // Contact
  { hint: 'email', gen: () => faker.internet.email() },
  { hint: 'phone', gen: () => faker.phone.number({ style: 'international' }) },
  { hint: 'mobile', gen: () => faker.phone.number({ style: 'international' }) },

  // Internet
  { hint: 'url', gen: () => faker.internet.url() },
  { hint: 'website', gen: () => faker.internet.url() },
  { hint: 'avatar', gen: () => faker.image.avatar() },
  { hint: 'image', gen: () => faker.image.url() },
  { hint: 'password', gen: () => faker.internet.password({ length: 12 }) },

  // Location
  { hint: 'street', gen: () => faker.location.streetAddress() },
  { hint: 'address', gen: () => faker.location.streetAddress(true) },
  { hint: 'city', gen: () => faker.location.city() },
  { hint: 'state', gen: () => faker.location.state() },
  { hint: 'country', gen: () => faker.location.country() },
  { hint: 'zip', gen: () => faker.location.zipCode() },
  { hint: 'postal', gen: () => faker.location.zipCode() },
  { hint: 'latitude', gen: () => faker.location.latitude() },
  { hint: 'longitude', gen: () => faker.location.longitude() },

  // Commerce
  { hint: 'price', gen: () => parseFloat(faker.commerce.price()) },
  { hint: 'product', gen: () => faker.commerce.productName() },
  { hint: 'category', gen: () => faker.commerce.department() },
  { hint: 'brand', gen: () => faker.company.name() },
  { hint: 'company', gen: () => faker.company.name() },
  { hint: 'sku', gen: () => faker.string.alphanumeric(8).toUpperCase() },

  // Dates (string property names that imply dates)
  { hint: 'createdat', gen: () => faker.date.past().toISOString() },
  { hint: 'updatedat', gen: () => faker.date.recent().toISOString() },
  { hint: 'birthday', gen: () => faker.date.birthdate().toISOString().split('T')[0] },
  { hint: 'dob', gen: () => faker.date.birthdate().toISOString().split('T')[0] },

  // Identifiers
  { hint: 'uuid', gen: () => faker.string.uuid() },
  { hint: 'id', gen: () => faker.string.uuid() },

  // Content
  { hint: 'title', gen: () => faker.lorem.sentence({ min: 3, max: 6 }) },
  { hint: 'description', gen: () => faker.lorem.paragraph() },
  { hint: 'bio', gen: () => faker.person.bio() },
  { hint: 'summary', gen: () => faker.lorem.sentences(2) },
  { hint: 'body', gen: () => faker.lorem.paragraphs(2) },
  { hint: 'content', gen: () => faker.lorem.paragraphs(1) },
  { hint: 'tag', gen: () => faker.lorem.word() },
  { hint: 'color', gen: () => faker.color.human() },

  // Numeric
  { hint: 'age', gen: () => faker.number.int({ min: 18, max: 80 }) },
  { hint: 'quantity', gen: () => faker.number.int({ min: 1, max: 100 }) },
  { hint: 'stock', gen: () => faker.number.int({ min: 0, max: 1000 }) },
  { hint: 'rating', gen: () => parseFloat(faker.number.float({ min: 1, max: 5, fractionDigits: 1 })) },
  { hint: 'count', gen: () => faker.number.int({ min: 0, max: 500 }) },

  // Status / flags
  { hint: 'status', gen: () => faker.helpers.arrayElement(['active', 'inactive', 'pending', 'archived']) },
  { hint: 'role', gen: () => faker.helpers.arrayElement(['admin', 'user', 'moderator', 'guest']) },
  { hint: 'gender', gen: () => faker.person.sex() },
];

// ─── Format lookup table ──────────────────────────────────────────────────────
const FORMAT_MAP = {
  'email': () => faker.internet.email(),
  'uri': () => faker.internet.url(),
  'url': () => faker.internet.url(),
  'date-time': () => faker.date.recent().toISOString(),
  'date': () => faker.date.recent().toISOString().split('T')[0],
  'time': () => faker.date.recent().toTimeString().split(' ')[0],
  'uuid': () => faker.string.uuid(),
  'ipv4': () => faker.internet.ipv4(),
  'ipv6': () => faker.internet.ipv6(),
  'hostname': () => faker.internet.domainName(),
  'password': () => faker.internet.password({ length: 12 }),
};

// ─── Core generator ───────────────────────────────────────────────────────────

/**
 * Generates a fake value for a single JSON Schema property definition.
 *
 * @param {string}  propName   The property key name (used for hint matching)
 * @param {object}  propSchema The JSON Schema for this property
 * @param {number}  [depth=0]  Recursion depth guard (max 5)
 * @returns {*} A fake value matching the schema
 */
export function generateFakeValue(propName, propSchema, depth = 0) {
  // Recursion guard — prevents infinite loops on circular $ref schemas
  if (depth > 5) return null;

  if (!propSchema || typeof propSchema !== 'object') return null;

  // ── 1. Enum → pick randomly ──────────────────────────────────────────────
  if (Array.isArray(propSchema.enum) && propSchema.enum.length > 0) {
    return faker.helpers.arrayElement(propSchema.enum);
  }

  // ── 2. const → return the fixed value ───────────────────────────────────
  if (propSchema.const !== undefined) {
    return propSchema.const;
  }

  // ── 3. anyOf / oneOf → use the first valid branch ───────────────────────
  const compositeBranches = propSchema.anyOf || propSchema.oneOf;
  if (Array.isArray(compositeBranches) && compositeBranches.length > 0) {
    return generateFakeValue(propName, compositeBranches[0], depth + 1);
  }

  const normalizedName = propName.toLowerCase().replace(/[_\s-]/g, '');

  // ── 4. Property name hints (highest realism) ─────────────────────────────
  for (const { hint, gen } of NAME_HINTS) {
    if (normalizedName.includes(hint)) {
      return gen();
    }
  }

  // ── 5. JSON Schema `format` ───────────────────────────────────────────────
  if (propSchema.format && FORMAT_MAP[propSchema.format]) {
    return FORMAT_MAP[propSchema.format]();
  }

  // ── 6. JSON Schema `type` ────────────────────────────────────────────────
  const type = Array.isArray(propSchema.type) ? propSchema.type[0] : propSchema.type;

  switch (type) {
    case 'string': {
      const min = propSchema.minLength || 3;
      const max = propSchema.maxLength || 20;
      // If pattern is specified, generate a word that at least looks plausible
      if (propSchema.pattern) return faker.string.alphanumeric({ min, max });
      return faker.lorem.word({ length: { min, max } });
    }

    case 'number':
      return parseFloat(faker.number.float({
        min: propSchema.minimum ?? 0,
        max: propSchema.maximum ?? 10000,
        fractionDigits: 2,
      }));

    case 'integer':
      return faker.number.int({
        min: propSchema.minimum ?? 1,
        max: propSchema.maximum ?? 10000,
      });

    case 'boolean':
      return faker.datatype.boolean();

    case 'array': {
      // Generate between minItems and maxItems (default 1–3)
      const count = faker.number.int({
        min: propSchema.minItems ?? 1,
        max: propSchema.maxItems ?? 3,
      });
      const itemSchema = propSchema.items || { type: 'string' };
      return Array.from({ length: count }, () =>
        generateFakeValue(`${propName}Item`, itemSchema, depth + 1)
      );
    }

    case 'object':
      // Recurse into nested object properties
      return generateFakeRecord(propSchema, depth + 1);

    case 'null':
      return null;

    default:
      // Unknown or missing type — fall back to a short lorem word
      return faker.lorem.word();
  }
}

/**
 * Generates a complete fake record object from a top-level JSON Schema.
 *
 * @param {object} schema   Top-level JSON Schema (must have `type: "object"`)
 * @param {number} [depth=0]
 * @returns {object} A flat or nested fake record
 */
export function generateFakeRecord(schema, depth = 0) {
  const record = {};

  // Only iterate over `properties` — the standard way to define object fields
  if (!schema.properties || typeof schema.properties !== 'object') {
    return record; // Schema has no declared properties — return empty object
  }

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    record[propName] = generateFakeValue(propName, propSchema, depth);
  }

  return record;
}
