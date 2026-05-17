const fs = require('fs');
const path = require('path');

const publicDir = 'c:\\Users\\rawad\\Desktop\\tool\\public';

const replacements = [
    {
        pattern: /https:\/\/0utlawrp\.com\/assets\/landing\/img\/logo\.png/g,
        replacement: (filePath) => filePath.includes('\\en\\') ? '../logo.png' : 'logo.png'
    },
    {
        pattern: /https:\/\/0utlawrp\.com\/assets\/media\/avatars\/[^\s"']+\.png/g,
        replacement: (filePath) => filePath.includes('\\en\\') ? '../logo.png' : 'logo.png'
    }
];

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            processDir(filePath);
        } else if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.css')) {
            let content = fs.readFileSync(filePath, 'utf8');
            let changed = false;
            for (const r of replacements) {
                if (r.pattern.test(content)) {
                    content = content.replace(r.pattern, r.replacement(filePath));
                    changed = true;
                }
            }
            if (changed) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Updated ${filePath}`);
            }
        }
    }
}

processDir(publicDir);
