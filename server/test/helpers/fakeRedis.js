import { createHash } from 'node:crypto';

// A deterministic Redis test double. The optional live tests exercise actual Lua.
export class FakeRedis {
  isReady = true;
  entries = new Map();
  scripts = new Map();
  now = Date.now();

  read(key) {
    if (!this.isReady) throw new Error('Redis offline');
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= this.now) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  write(key, value, milliseconds) {
    if (!this.isReady) throw new Error('Redis offline');
    this.entries.set(key, { value: String(value), expires: this.now + milliseconds });
    return 'OK';
  }

  async get(key) { return this.read(key); }
  async set(key, value, { EX }) { return this.write(key, value, EX * 1000); }

  async eval(_script, { keys, arguments: args }) {
    if (keys.length === 1) {
      const version = this.read(keys[0]);
      if (version !== null) return version;
      this.write(keys[0], args[0], Number(args[1]) * 1000);
      return args[0];
    }
    if (this.read(keys[0]) !== args[0]) return 0;
    this.write(keys[1], args[1], Number(args[2]) * 1000);
    return 1;
  }

  async sendCommand(args) {
    if (!this.isReady) throw new Error('Redis offline');
    if (args[0] === 'SCRIPT' && args[1] === 'LOAD') {
      const sha = createHash('sha1').update(args[2]).digest('hex');
      this.scripts.set(sha, args[2]);
      return sha;
    }
    if (args[0] === 'EVALSHA') {
      const script = this.scripts.get(args[1]);
      if (!script) throw new Error('NOSCRIPT');
      const key = args[3];
      const previous = this.read(key);
      if (!script.includes('INCR')) {
        return [previous, previous === null ? -2 : this.entries.get(key).expires - this.now];
      }
      const hits = Number(previous || 0) + 1;
      const remaining = previous === null ? Number(args[5]) : this.entries.get(key).expires - this.now;
      this.write(key, hits, remaining);
      return [hits, remaining];
    }
    if (args[0] === 'DECR') {
      const value = Number(this.read(args[1]) || 0) - 1;
      this.write(args[1], value, this.entries.get(args[1]).expires - this.now);
      return value;
    }
    if (args[0] === 'DEL') return Number(this.entries.delete(args[1]));
    throw new Error(`Unsupported test command: ${args[0]}`);
  }
}
