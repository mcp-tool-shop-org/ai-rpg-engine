// Prompt template types — structured in, text out

export type PromptTemplate = {
  system: string;
  render(context: Record<string, unknown>): string;
};

export function template(system: string, render: (ctx: Record<string, unknown>) => string): PromptTemplate {
  return { system, render };
}
