import { DEFAULT_COPILOT_MODEL, COPILOT_DEFAULT_MODEL_ENV_VAR } from '../types.js';

describe('Default Copilot Model', () => {
  test('DEFAULT_COPILOT_MODEL is gpt-4.1', () => {
    expect(DEFAULT_COPILOT_MODEL).toBe('gpt-4.1');
  });

  test('COPILOT_DEFAULT_MODEL_ENV_VAR is COPILOT_DEFAULT_MODEL', () => {
    expect(COPILOT_DEFAULT_MODEL_ENV_VAR).toBe('COPILOT_DEFAULT_MODEL');
  });
});
