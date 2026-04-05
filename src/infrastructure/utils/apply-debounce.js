const fs = require('fs');
const glob = require('glob');
const path = require('path');

const srcDir = path.resolve(__dirname, '../../src');

const files = glob.sync(`${srcDir}/presentation/ui/**/*.ts`);
files.push(`${srcDir}/presentation/3d/interaction/ClickHandler.ts`);

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Add import if not present and we need it
    if (content.includes("addEventListener('click'") && !content.includes("debounce")) {
        // Calculate relative path for import
        const debouncePath = path.relative(path.dirname(file), `${srcDir}/infrastructure/utils/debounce`);
        const importPath = debouncePath.startsWith('.') ? debouncePath : `./${debouncePath}`;
        
        let needsConfig = false;
        if (!content.includes('Config')) {
            needsConfig = true;
        }

        // We will replace addEventListener('click', (e) => { ... })
        // or addEventListener('click', handler)
        // with addEventListener('click', debounce((e) => { ... }, Config.timing.interactionTimeout))
        
        const lines = content.split('\n');
        let modified = false;
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            if (line.includes("addEventListener('click'") && !line.includes("debounce(")) {
                // Find the second argument
                const parts = line.split("addEventListener('click',");
                if (parts.length === 2) {
                    const prefix = parts[0] + "addEventListener('click', debounce(";
                    
                    // We need to find where the arguments of addEventListener end.
                    // This is hard with regex because of nested parentheses and braces mapping multiple lines.
                    // Instead, let's use a simpler heuristic for one-liners and simple multi-liners.
                }
            }
        }
    }
});
