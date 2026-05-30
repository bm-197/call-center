export type TemplateVariables = Record<
  string,
  string | number | boolean | null
>;

const TOKEN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

export function renderTemplate(
  template: string,
  variables: TemplateVariables,
): string {
  return template.replace(TOKEN, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

export function recipientVariables(input: {
  phoneNumber: string;
  displayName?: string | null;
  email?: string | null;
  variables?: unknown;
}): TemplateVariables {
  const custom =
    input.variables && typeof input.variables === 'object'
      ? (input.variables as TemplateVariables)
      : {};
  const [firstName, ...rest] = (input.displayName ?? '')
    .split(/\s+/)
    .filter(Boolean);
  return {
    ...custom,
    phoneNumber: input.phoneNumber,
    displayName: input.displayName ?? '',
    firstName: custom.firstName ?? firstName ?? '',
    lastName: custom.lastName ?? rest.join(' '),
    email: input.email ?? '',
  };
}
