/**
 * ══════════════════════════════════════════════════════════════════════════
 * THE RENDERER — variables in, a finished message out, or a refusal.
 *
 * Three rules, each enforced rather than hoped for:
 *
 *   1. every variable the template REQUIRES must be present and non-empty;
 *   2. every `{{placeholder}}` in the template must name a known variable;
 *   3. the rendered output must contain no `{{` at all.
 *
 * A violation is a `TemplateRenderError` naming the variable, never a message
 * with a hole in it. Pure: no I/O, no environment, import-safe anywhere.
 * ══════════════════════════════════════════════════════════════════════════
 */

import {
  findTemplate,
  MESSAGE_VARIABLES,
  type MessageKind,
  type MessageLocale,
  type MessageTemplate,
  type MessageVariable,
} from '@/lib/messaging/templates';

export type MessageVariables = Partial<Record<MessageVariable, string | number | null | undefined>>;

export interface RenderedMessage {
  templateId: string;
  templateVersion: string;
  kind: MessageKind;
  locale: MessageLocale;
  subject: string;
  text: string;
}

export class TemplateRenderError extends Error {
  constructor(
    readonly code: 'template_missing' | 'variable_missing' | 'variable_unknown' | 'unresolved_placeholder',
    readonly detail: string
  ) {
    super(`${code}: ${detail}`);
    this.name = 'TemplateRenderError';
  }
}

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const KNOWN = new Set<string>(MESSAGE_VARIABLES);

function isPresent(value: unknown): value is string | number {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '';
}

/** The placeholders a template references. Exported for the catalogue test. */
export function placeholdersOf(template: MessageTemplate): string[] {
  const names = new Set<string>();
  for (const source of [template.subject, template.text]) {
    // `replace` with a callback rather than `matchAll`: the project targets
    // ES5 and this module must stay importable from anywhere.
    source.replace(PLACEHOLDER, (whole, name: string) => {
      names.add(name);
      return whole;
    });
  }
  return Array.from(names);
}

export function renderTemplate(template: MessageTemplate, variables: MessageVariables): RenderedMessage {
  for (const name of placeholdersOf(template)) {
    if (!KNOWN.has(name)) throw new TemplateRenderError('variable_unknown', `${template.id} references unknown variable ${name}`);
  }
  for (const name of template.required) {
    if (!isPresent(variables[name])) throw new TemplateRenderError('variable_missing', `${template.id} requires ${name}`);
  }

  const substitute = (source: string): string =>
    source.replace(PLACEHOLDER, (_whole, name: string) => {
      const value = variables[name as MessageVariable];
      if (!isPresent(value)) throw new TemplateRenderError('variable_missing', `${template.id} requires ${name}`);
      return String(value);
    });

  const subject = substitute(template.subject);
  const text = substitute(template.text);

  // Belt and braces: a variable VALUE that itself contained braces must not
  // smuggle a placeholder into the output either.
  if (/\{\{/.test(subject) || /\{\{/.test(text)) {
    throw new TemplateRenderError('unresolved_placeholder', `${template.id} rendered with an unresolved placeholder`);
  }

  return { templateId: template.id, templateVersion: template.version, kind: template.kind, locale: template.locale, subject, text };
}

export function renderMessage(kind: MessageKind, locale: MessageLocale, variables: MessageVariables): RenderedMessage {
  const template = findTemplate(kind, locale);
  if (!template) throw new TemplateRenderError('template_missing', `${kind}/${locale}`);
  return renderTemplate(template, variables);
}
