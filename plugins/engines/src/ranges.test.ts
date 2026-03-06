import semver from 'semver';
import { describe, it, expect } from 'vitest';
import { parseRange, isRangeSatisfied } from './ranges.js';

describe('parseRange', () => {
  it.each([undefined, null, '', 'invalid'])('returns null for invalid range: %s', (input) => {
    expect(parseRange(input)).toBeNull();
  });

  it.each(['14.0.0', '>=14.0.0', '^14.0.0', '~14.0.0', '>=14.0.0 <15.0.0', '^14.0.0 || >=16.0.0'])(
    'returns a semver.Range object for valid range: %s',
    (input) => {
      const range = parseRange(input);
      expect(range).toBeInstanceOf(semver.Range);
      expect(range?.range).toBeTruthy();
    },
  );

  it('returns a semver.Range object for *', () => {
    const range = parseRange('*');
    expect(range).toBeInstanceOf(semver.Range);
    // This one has special handling internally for some reason
    expect(range?.range).toBe('');
    expect(range?.raw).toBe('*');
  });
});

describe('isRangeSatisfied', () => {
  it('returns true if the manifest range is invalid', () => {
    expect(isRangeSatisfied({ repoRange: '>=14.0.0', manifestRange: null })).toBe(true);
    expect(isRangeSatisfied({ repoRange: '>=14.0.0', manifestRange: undefined })).toBe(true);
    expect(isRangeSatisfied({ repoRange: '>=14.0.0', manifestRange: 'invalid' })).toBe(true);
    expect(isRangeSatisfied({ repoRange: '>=14.0.0', manifestRange: '' })).toBe(true);
  });

  it('returns true if the repo range fully overlaps the manifest range', () => {
    expect(isRangeSatisfied({ repoRange: '>=14.0.0', manifestRange: '>=12.0.0' })).toBe(true);
    expect(isRangeSatisfied({ repoRange: '^14.0.0', manifestRange: '>=14.0.0' })).toBe(true);
    expect(isRangeSatisfied({ repoRange: '14', manifestRange: '>=14.0.0' })).toBe(true);
    expect(isRangeSatisfied({ repoRange: '^14.2.0', manifestRange: '^14.1.0 || >=16' })).toBe(true);
    expect(isRangeSatisfied({ repoRange: '^14.2.0', manifestRange: '*' })).toBe(true);
  });

  it('returns false if the repo range is lower than the manifest range', () => {
    expect(isRangeSatisfied({ repoRange: '^14.0.0', manifestRange: '>=16.0.0' })).toBe(false);
  });

  it('returns false if the repo range is higher than the manifest range', () => {
    expect(isRangeSatisfied({ repoRange: '^14.0.0', manifestRange: '>=12.0.0 <14.0.0' })).toBe(
      false,
    );
  });

  it('returns false if the repo range only partially overlaps the manifest range', () => {
    expect(isRangeSatisfied({ repoRange: '>=14.0.0', manifestRange: '>=12.0.0 <14.5.0' })).toBe(
      false,
    );
    expect(isRangeSatisfied({ repoRange: '^14.0.0', manifestRange: '>=12.0.0 <14.5.0' })).toBe(
      false,
    );
    expect(isRangeSatisfied({ repoRange: '^14.2.0', manifestRange: '^12.0.0 || >=14.3.0' })).toBe(
      false,
    );
  });
});
