import { describe, it, expect } from 'vitest';
import { greet, VERSION } from './index.js';

describe('greet', () => {
  it('should greet a person by name', () => {
    expect(greet('World')).toBe('Hello, World!');
  });

  it('should handle empty string', () => {
    expect(greet('')).toBe('Hello, !');
  });
});

describe('VERSION', () => {
  it('should export VERSION constant', () => {
    expect(VERSION).toBeDefined();
    expect(typeof VERSION).toBe('string');
  });
});
