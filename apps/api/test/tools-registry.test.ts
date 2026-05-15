import { describe, expect, it } from 'vitest';
import {
  CONFIRM_TOOL_NAME,
  agentAuthCapabilities,
  getToolDefinition,
  toFunctionDeclaration,
} from '../src/tools/registry.js';

describe('tool registry', () => {
  it('exposes voice-safe action tools and the confirmation tool', () => {
    expect(
      getToolDefinition('waitlist_add_contact')?.requiresConfirmation,
    ).toBe(true);
    expect(
      getToolDefinition('calendar_create_event')?.requiresConfirmation,
    ).toBe(true);
    expect(getToolDefinition(CONFIRM_TOOL_NAME)?.requiresConfirmation).toBe(
      false,
    );
  });

  it('maps tools to Gemini function declarations', () => {
    const tool = getToolDefinition('contact_update_notes');
    expect(tool).toBeDefined();
    const declaration = toFunctionDeclaration(tool!);
    expect(declaration.name).toBe('contact_update_notes');
    expect(declaration.parametersJsonSchema).toMatchObject({
      type: 'object',
      required: ['notes'],
    });
  });

  it('maps tools to Agent Auth capabilities', () => {
    const names = agentAuthCapabilities.map((capability) => capability.name);
    expect(names).toContain('waitlist_add_contact');
    expect(names).toContain(CONFIRM_TOOL_NAME);
  });
});
