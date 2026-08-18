/**
 * Single source of truth for the admin navigation tree. Consumed by BOTH
 * src/components/admin/AdminShell.tsx (renders the sidebar) and
 * src/lib/admin-search.ts (builds the search index). Previously these were two
 * hand-maintained lists that drifted apart — new pages appeared in the sidebar
 * but not in search (and vice-versa). Keep this the only place nav lives.
 *
 * Pure data only (no React/icon imports) so it can be imported by non-React code.
 * `iconName` is a react-icons/fa component name resolved to a component in
 * AdminShell's NAV_ICONS map. `hidden` entries are searchable but not rendered in
 * the sidebar (e.g. the top-bar account page, deep settings pages).
 */

export type AdminRole = 'admin' | 'editor';

export interface AdminNavEntry {
  name: string;
  href: string;
  iconName: string;
  roles: AdminRole[];
  description?: string;
  keywords?: string[];
  hidden?: boolean; // searchable but not shown in the sidebar
  children?: AdminNavEntry[];
}

export const ADMIN_NAV: AdminNavEntry[] = [
  { name: 'Dashboard', href: '/admin/dashboard', iconName: 'FaHome', roles: ['admin', 'editor'], description: 'View dashboard overview', keywords: ['dashboard', 'overview', 'stats', 'home'] },
  { name: 'Analytics', href: '/admin/analytics', iconName: 'FaChartLine', roles: ['admin', 'editor'], description: 'View site analytics and traffic', keywords: ['analytics', 'stats', 'traffic', 'visitors', 'engagement', 'ga4', 'google analytics'] },
  { name: 'Pages', href: '/admin/pages', iconName: 'FaFileAlt', roles: ['admin', 'editor'], description: 'Manage website pages', keywords: ['pages', 'content', 'create', 'edit', 'delete', 'homepage', 'contact'] },
  { name: 'Landing Pages', href: '/admin/landing-pages', iconName: 'FaBullhorn', roles: ['admin', 'editor'], description: 'Manage marketing landing pages', keywords: ['landing', 'campaigns', 'marketing', 'lead', 'pages'] },
  {
    name: 'Store', href: '/admin/store/products', iconName: 'FaStore', roles: ['admin', 'editor'],
    children: [
      { name: 'Products', href: '/admin/store/products', iconName: 'FaBoxOpen', roles: ['admin', 'editor'], description: 'Manage store products, prices, variants and stock', keywords: ['store', 'shop', 'products', 'ecommerce', 'catalog', 'price', 'variants', 'stock', 'inventory'] },
      { name: 'Orders', href: '/admin/store/orders', iconName: 'FaShoppingCart', roles: ['admin', 'editor'], description: 'View and fulfil store orders', keywords: ['store', 'orders', 'sales', 'fulfil', 'fulfill', 'payments', 'stripe', 'checkout'] },
      { name: 'Gift Cards', href: '/admin/store/gift-cards', iconName: 'FaGift', roles: ['admin', 'editor'], description: 'Issue, redeem and manage gift cards', keywords: ['gift', 'cards', 'voucher', 'giftcard', 'qr', 'redeem', 'balance'] },
      { name: 'Customers', href: '/admin/store/customers', iconName: 'FaUserFriends', roles: ['admin', 'editor'], description: 'Storefront customer accounts', keywords: ['store', 'customers', 'buyers', 'clients', 'accounts'] },
    ],
  },
  {
    name: 'Booking', href: '/admin/booking/appointments', iconName: 'FaCalendarAlt', roles: ['admin', 'editor'],
    children: [
      { name: 'Appointments', href: '/admin/booking/appointments', iconName: 'FaCalendarCheck', roles: ['admin', 'editor'], description: 'View and manage appointments', keywords: ['booking', 'appointments', 'calendar', 'schedule', 'reservations'] },
      { name: 'Services', href: '/admin/booking/services', iconName: 'FaConciergeBell', roles: ['admin', 'editor'], description: 'Manage bookable services, duration and price', keywords: ['booking', 'services', 'duration', 'price', 'offerings'] },
      { name: 'Availability', href: '/admin/booking/availability', iconName: 'FaClock', roles: ['admin', 'editor'], description: 'Weekly opening hours and slot intervals', keywords: ['booking', 'availability', 'hours', 'opening', 'schedule', 'slots'] },
    ],
  },
  { name: 'Media', href: '/admin/media', iconName: 'FaImages', roles: ['admin', 'editor'], description: 'Manage images and files', keywords: ['media', 'images', 'files', 'upload', 'gallery', 'logo', 'favicon'] },
  { name: 'Forms', href: '/admin/forms', iconName: 'FaEdit', roles: ['admin', 'editor'], description: 'Manage contact forms and submissions', keywords: ['forms', 'submissions', 'contact', 'messages', 'inquiries'] },
  { name: 'Menu', href: '/admin/menu', iconName: 'FaList', roles: ['admin', 'editor'], description: 'Configure site navigation', keywords: ['menu', 'navigation', 'links', 'structure'] },
  { name: 'Footer', href: '/admin/footer', iconName: 'FaListAlt', roles: ['admin', 'editor'], description: 'Manage footer content and social links', keywords: ['footer', 'links', 'social', 'linkedin', 'facebook', 'instagram', 'telegram'] },
  { name: 'Theme Settings', href: '/admin/theme', iconName: 'FaPalette', roles: ['admin', 'editor'], description: 'Customize site theme colors and appearance', keywords: ['theme', 'colors', 'appearance', 'branding', 'logo', 'favicon', 'styling'] },
  { name: 'Languages', href: '/admin/i18n', iconName: 'FaLanguage', roles: ['admin'], description: 'Locales and machine translation', keywords: ['languages', 'i18n', 'locale', 'translation', 'translate', 'multilingual'] },
  { name: 'Users', href: '/admin/users', iconName: 'FaUsers', roles: ['admin'], description: 'Manage user accounts and permissions', keywords: ['users', 'accounts', 'roles', 'permissions', 'access'] },
  { name: 'SEO', href: '/admin/seo', iconName: 'FaSearch', roles: ['admin', 'editor'], description: 'SEO, GTM, Analytics, Ahrefs, IPinfo, OG image', keywords: ['seo', 'meta', 'og image', 'gtm', 'google tag manager', 'analytics', 'ahrefs', 'ipinfo', 'sitemap', 'robots'] },
  { name: 'Cookie Settings', href: '/admin/cookies', iconName: 'FaCookie', roles: ['admin', 'editor'], description: 'Manage cookie consent and tracking', keywords: ['cookies', 'consent', 'privacy', 'gdpr', 'tracking'] },
  { name: 'Cloudflare', href: '/admin/cloudflare', iconName: 'FaCloud', roles: ['admin'], description: 'Cache, DNS, Turnstile, and WAF status (API token in Settings → Integrations)', keywords: ['cloudflare', 'cdn', 'cache', 'dns', 'turnstile', 'waf'] },
  { name: 'CloudPanel', href: '/admin/cloudpanel', iconName: 'FaServer', roles: ['admin'], description: 'Manage CloudPanel sites, databases and panel users on this server', keywords: ['cloudpanel', 'clpctl', 'server', 'hosting', 'vhost', 'nginx', 'site user', 'lets encrypt', 'certificate', 'ssl', 'provision', 'control panel'] },
  { name: 'Integrations', href: '/admin/settings?tab=integrations', iconName: 'FaPlug', roles: ['admin'], description: 'Connect third-party services (under Settings)', keywords: ['integrations', 'smtp', 'telegram', 'whatsapp', 'brevo', 'stripe', 'recaptcha', 'cloudflare', 'email', 'notifications', 'api keys', 'secrets'] },
  { name: 'Backups', href: '/admin/backups', iconName: 'FaDatabase', roles: ['admin'], description: 'Manage database backups', keywords: ['backups', 'restore', 'database', 'recovery'] },
  { name: 'Automation', href: '/admin/automation', iconName: 'FaRobot', roles: ['admin'], description: 'Daily site audit, dependency PRs, panel updates', keywords: ['automation', 'audit', 'cron', 'schedule', 'dependencies', 'auto-fix', 'reports', 'updates'] },
  { name: 'OODA', href: '/admin/ooda', iconName: 'FaSyncAlt', roles: ['admin'], description: 'Self-improvement loop — observe, orient, decide, act', keywords: ['ooda', 'automation', 'self-healing', 'loop', 'observe', 'orient', 'decide', 'act'] },
  { name: 'Security (Aikido)', href: '/admin/aikido', iconName: 'FaShieldAlt', roles: ['admin'], description: 'Aikido scanner — issues, blocked IPs, brute-force protection', keywords: ['security', 'aikido', 'blocked', 'ips', 'brute force', 'protection', 'scanner', 'issues'] },
  { name: 'Audit Log', href: '/admin/audit', iconName: 'FaHistory', roles: ['admin'], description: 'Admin action history — who did what and when', keywords: ['audit', 'log', 'history', 'activity', 'security', 'accountability', 'trail'] },
  {
    name: 'Settings', href: '/admin/settings', iconName: 'FaCog', roles: ['admin', 'editor'],
    description: 'Site identity, branding, integrations, infrastructure', keywords: ['settings', 'configuration', 'general', 'site', 'domain', 'identity', 'branding'],
    children: [
      { name: 'Environment', href: '/admin/settings/environment', iconName: 'FaCog', roles: ['admin'], description: 'Environment variables (.env.local)', keywords: ['environment', 'env', 'variables', 'config', 'nextauth', 'database'] },
    ],
  },

  // Searchable but not in the sidebar (reachable from the top bar or other pages):
  { name: 'Account', href: '/admin/account', iconName: 'FaUser', roles: ['admin', 'editor'], hidden: true, description: 'Your account — email, password, 2FA', keywords: ['account', 'profile', 'password', 'email', 'change password', '2fa', 'mfa', 'two factor', 'me'] },
  { name: 'Two-Factor (MFA)', href: '/admin/mfa-setup', iconName: 'FaShieldAlt', roles: ['admin', 'editor'], hidden: true, description: 'Configure two-factor authentication', keywords: ['mfa', '2fa', 'authentication', 'totp', 'authenticator', 'security'] },
  { name: 'Typography', href: '/admin/typography', iconName: 'FaPalette', roles: ['admin', 'editor'], hidden: true, description: 'Manage fonts and text styles', keywords: ['typography', 'fonts', 'text', 'heading', 'body'] },
];
