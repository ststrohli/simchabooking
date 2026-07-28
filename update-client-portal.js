const fs = require('fs');
const content = fs.readFileSync('components/ClientPortal.tsx', 'utf8');
const newContent = content.replace(
  /const \[activeTab, setActiveTab\] = useState<'overview' \| 'plan' \| 'events' \| 'chats' \| 'profile'>\('overview'\);/,
  `const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'events' | 'chats' | 'profile'>(initialTab as any || 'overview');
  
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab as any);
  }, [initialTab]);`
);
fs.writeFileSync('components/ClientPortal.tsx', newContent);
