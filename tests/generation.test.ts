import { describe, expect, it } from 'vitest';
import { estimatedCost, validateReferenceLimits } from '../lib/generation';

describe('regras da geração', () => {
  it('calcula custo por duração e resolução', () => {
    expect(estimatedCost(5, '720p')).toBe(0.5);
    expect(estimatedCost(30, '1080p')).toBe(6);
  });
  it('rejeita excesso de duração e aceita referências mistas', () => {
    expect(() => validateReferenceLimits([{ duration: 15 }, { duration: 16 }], [{}])).toThrow('soma');
    expect(() => validateReferenceLimits([{ duration: 5 }], [{}])).not.toThrow();
  });
});
