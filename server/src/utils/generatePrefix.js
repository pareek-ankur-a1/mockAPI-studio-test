/* Character space: [a-z0-9] = 36 chars → 36^5 ≈ 60,466,176 unique values.
 * Collision probability is extremely low at normal usage scales.
 * The `unique` index on Project.prefix provides the final collision guard.
 */

const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const PREFIX_LENGTH = 5;
const PREFIX_NAMESPACE = 'proj_';

export function generatePrefix() {
  let suffix = '';
  for (let i = 0; i < PREFIX_LENGTH; i++) {
    suffix += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return `${PREFIX_NAMESPACE}${suffix}`;
}