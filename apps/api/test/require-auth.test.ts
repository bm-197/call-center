import { describe, expect, it } from 'vitest';
import { roleMeetsMinimum } from '../src/common/middleware/require-auth.js';

describe('roleMeetsMinimum', () => {
  it('allows invited members to read org data and accept handoffs', () => {
    expect(roleMeetsMinimum('member', 'viewer')).toBe(true);
    expect(roleMeetsMinimum('member', 'agent')).toBe(true);
  });

  it('keeps admin actions restricted above regular members', () => {
    expect(roleMeetsMinimum('member', 'admin')).toBe(false);
    expect(roleMeetsMinimum('admin', 'member')).toBe(true);
    expect(roleMeetsMinimum('owner', 'admin')).toBe(true);
  });
});
