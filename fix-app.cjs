const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const bannerToHeaderRegex = /\{\/\* Floating Header Controls \(\? Ask on Right & Role Switcher on Left below header\) \*\/\}.*?<\/header>\n\s*\)\}\n/s;
const permissionErrorBannerRegex = /\{permissionErrorBanner && \([\s\S]*?\}\n\s*<a href="#main-content"[\s\S]*?<\/a>\n/s;

let match1 = content.match(permissionErrorBannerRegex);
let match2 = content.match(bannerToHeaderRegex);

if (match1 && match2) {
  let extract1 = match1[0];
  let extract2 = match2[0];
  
  // Remove `{view !== 'portal' && (` and `)}` from the header block
  extract2 = extract2.replace(/\{view !== 'portal' && \(\n\s*(<header[\s\S]*?<\/header>)\n\s*\)\}\n/, '$1\n');

  // Remove them from their original location
  content = content.replace(match1[0], '');
  content = content.replace(match2[0], '');

  // Insert them right before {renderActiveView()} in the main return
  const insertRegex = /(<motion\.div\s*initial=\{\{ opacity: 0, y: 15 \}\}\s*animate=\{\{ opacity: 1, y: 0 \}\}\s*transition=\{\{ duration: 0\.5, ease: \[0\.16, 1, 0\.3, 1\] \}\}\s*className="min-h-screen bg-black text-zinc-100 flex flex-col relative pb-28"\s*>)\n\s*\{renderActiveView\(\)\}/s;
  
  content = content.replace(insertRegex, `$1\n      ${extract1}      ${extract2}      {renderActiveView()}`);
  
  // Now remove the inner toggle from vendor portal routing
  content = content.replace(/const renderVendorToggle = \(\) => \{[\s\S]*?\};\n\n/s, '');
  content = content.replace(/\{renderVendorToggle\(\)\}\n/g, '');

  fs.writeFileSync('App.tsx', content);
  console.log('Success');
} else {
  console.log('Regex did not match');
  console.log('Match1:', !!match1);
  console.log('Match2:', !!match2);
}
