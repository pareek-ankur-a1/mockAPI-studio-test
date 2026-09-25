/**
 * @file generatePrefix.js
 * @description Utility for generating unique project URL prefixes.
 *
 * Format: "proj_" + 5 random lowercase alphanumeric characters
 * Example: "proj_8f72k", "proj_x91mz"
 *
 * Character space: [a-z0-9] = 36 chars → 36^5 ≈ 60,466,176 unique values.
 * Collision probability is extremely low at normal usage scales.
 * The `unique` index on Project.prefix provides the final collision guard.
 */

const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PREFIX_LENGTH = 5;
const PREFIX_NAMESPACE = 'proj_';

/**
 * Generates a random project prefix string.
 *
 * @returns {string} A string like "proj_8f72k"
 */
export function generatePrefix() {
  let suffix = '';
  for (let i = 0; i < PREFIX_LENGTH; i++) {
    // Math.random() * CHARSET.length gives a float in [0, 36)
    // Math.floor() converts to an integer index in [0, 35]
    suffix += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return `${PREFIX_NAMESPACE}${suffix}`;
}
