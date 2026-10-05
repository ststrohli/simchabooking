const fs = require('fs');

let clientPortal = fs.readFileSync('components/ClientPortal.tsx', 'utf8');
clientPortal = clientPortal.replace(
  /\{\!\['overview', 'plan', 'events', 'chats', 'profile'\]\.includes\(activeTab\) && \(/g,
  '{!isSidebarOpen && ('
);
fs.writeFileSync('components/ClientPortal.tsx', clientPortal);

let vendorPortal = fs.readFileSync('components/VendorPortal.tsx', 'utf8');
vendorPortal = vendorPortal.replace(
  /\{\!\['overview', 'bookings', 'calendar', 'messages', 'profile'\]\.includes\(activeTab\) && \(/g,
  '{!isSidebarOpen && ('
);
fs.writeFileSync('components/VendorPortal.tsx', vendorPortal);

console.log('Fixed');
