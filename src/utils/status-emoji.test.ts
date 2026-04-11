import { describe, it, expect } from 'vitest';
import { statusEmoji } from './status-emoji.js';

describe('statusEmoji', () => {
  it('returns green circle for up status', () => {
    expect(statusEmoji('up')).toBe('🟢');
  });

  it('returns red circle for down status', () => {
    expect(statusEmoji('down')).toBe('🔴');
  });

  it('returns green circle for recovery status', () => {
    expect(statusEmoji('recovery')).toBe('🟢');
  });

  it('returns white circle for unknown status', () => {
    expect(statusEmoji('unknown')).toBe('⚪');
  });

  it('returns white circle for unrecognized status', () => {
    expect(statusEmoji('something-else')).toBe('⚪');
    expect(statusEmoji('')).toBe('⚪');
  });
});
