const fs = require('fs');
let content = fs.readFileSync('App.tsx', 'utf8');

const regex = /const handleToggleVendor = \(\) => \{[\s\S]*?\n  \};\n/;

const newFunc = `const handleToggleVendor = () => {
    const nextVendorView = !isVendorView;
    setIsVendorView(nextVendorView);
    
    setView('portal');
    setPortalTab(nextVendorView ? 'vendor' : 'client');
    
    if (nextVendorView) {
      if (activeBottomTab === 'plan' || activeBottomTab === 'events') {
        setPortalInitialTab('overview');
        setActiveBottomTab('home');
      } else if (activeBottomTab === 'chat') {
        setPortalInitialTab('messages');
      } else if (activeBottomTab === 'profile') {
        setPortalInitialTab('profile');
      } else if (activeBottomTab === 'home') {
        setPortalInitialTab('overview');
      }
    } else {
      if (activeBottomTab === 'bookings' || activeBottomTab === 'calendar') {
        setPortalInitialTab('overview');
        setActiveBottomTab('home');
      } else if (activeBottomTab === 'chat') {
        setPortalInitialTab('chats');
      } else if (activeBottomTab === 'profile') {
        setPortalInitialTab('profile');
      } else if (activeBottomTab === 'home') {
        setPortalInitialTab('overview');
      }
    }
  };
`;

content = content.replace(regex, newFunc);
fs.writeFileSync('App.tsx', content);
console.log('Done');
