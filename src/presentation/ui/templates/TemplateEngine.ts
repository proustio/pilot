/**
 * TemplateEngine utility to render HTML templates with variable interpolation.
 * Supports standard template literal syntax ${expression}.
 */
export class TemplateEngine {
    /**
     * Renders a template string using a view context.
     * 
     * @param template The HTML template string (as imported via Vite's ?raw).
     * @param context An object mapping variable names to their values.
     * @returns The rendered HTML string.
     */
    public static render(template: string, context: Record<string, any>): string {
        const keys = Object.keys(context);
        const values = Object.values(context);
        
        try {
            // Use new Function to create a scoped execution environment for the template literal.
            // This allows us to use standard JS expressions inside the ${} in the template.
            const renderer = new Function(...keys, `return \`${template}\`;`);
            return renderer.apply(context, values);
        } catch (error) {
            console.error('TemplateEngine: Error rendering template', error);
            console.error('Context keys:', keys);
            // Return the raw template as a fallback
            return template;
        }
    }
}
