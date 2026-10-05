const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

// There are multiple logo click handlers.
content = content.replace(
  /onClick=\{\(\) => \{ setView\('marketplace'\); setActiveCategory\('All'\); \}\}/g,
  "onClick={() => { setView('marketplace'); setActiveCategory('All'); setIsVendorView(false); }}"
);

fs.writeFileSync('App.tsx', content);
