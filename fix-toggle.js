const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const target = `    // Only update portalTab if user is currently inside the portal view - DO NOT redirect!
    if (view === 'portal') {
      setPortalTab(nextVendorView ? 'vendor' : 'client');`;

const replacement = `    // Always navigate to portal when toggling
    setView('portal');
    setPortalTab(nextVendorView ? 'vendor' : 'client');`;

content = content.replace(target, replacement);

// Now remove the closing brace of `if (view === 'portal') {`
// Let's use string manipulation to find it.

// Just doing a basic string replacement won't work well for the closing brace.
// Let's use a regex that matches the whole function body.
