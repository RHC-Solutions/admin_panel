'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { motion } from 'framer-motion';
import AdminSearch from './AdminSearch';
import { ADMIN_NAV, type AdminNavEntry } from '@adminpanel/lib/admin-nav';
import {
  FaHome, FaFileAlt, FaImages, FaUsers, FaCog, FaChartLine,
  FaBars, FaTimes, FaSignOutAlt, FaEdit, FaCookie, FaSearch, FaList, FaDatabase,
  FaPalette, FaListAlt, FaCloud, FaChevronDown, FaChevronRight, FaTrash, FaSpinner, FaShieldAlt,
  FaPlug, FaBullhorn, FaRobot, FaSyncAlt, FaHistory, FaStore, FaBoxOpen, FaShoppingCart, FaUserFriends,
  FaCalendarAlt, FaConciergeBell, FaCalendarCheck, FaClock, FaGift, FaLanguage, FaUser, FaServer,
} from 'react-icons/fa';

interface NavItem {
  name: string;
  href: string;
  icon: any;
  roles: string[];
  children?: NavItem[];
}

// Resolve admin-nav.ts iconName strings to components. The nav tree itself lives in
// src/lib/admin-nav.ts (shared with search) and carries no React imports.
const NAV_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  FaHome, FaChartLine, FaCog, FaFileAlt, FaBullhorn, FaStore, FaBoxOpen, FaShoppingCart,
  FaGift, FaUserFriends, FaCalendarAlt, FaCalendarCheck, FaConciergeBell, FaClock, FaImages,
  FaEdit, FaList, FaListAlt, FaPalette, FaLanguage, FaUsers, FaSearch, FaCookie, FaCloud,
  FaPlug, FaDatabase, FaRobot, FaSyncAlt, FaShieldAlt, FaHistory, FaUser, FaServer,
};

interface AdminShellProps {
  children: React.ReactNode;
  title: string;
}

export default function AdminShell({ children, title }: AdminShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const role = (session?.user as any)?.role as 'admin' | 'editor' | undefined;
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [purgingCache, setPurgingCache] = useState(false);
  const [cacheMessage, setCacheMessage] = useState('');

  const navigation: NavItem[] = useMemo(() => {
    const toItem = (n: AdminNavEntry): NavItem => ({
      name: n.name,
      href: n.href,
      roles: n.roles,
      icon: NAV_ICONS[n.iconName] || FaCog,
      children: n.children?.filter((c) => !c.hidden).map(toItem),
    });
    return ADMIN_NAV.filter((n) => !n.hidden).map(toItem);
  }, []);

  const filterNavigation = (items: NavItem[]): NavItem[] => {
    return items
      .filter((item) => (role ? item.roles.includes(role) : true))
      .map((item) => ({
        ...item,
        children: item.children ? filterNavigation(item.children) : undefined,
      }));
  };

  const filteredNavigation = useMemo(
    () => filterNavigation(navigation),
    [navigation, role]
  );

  // Auto-expand parent items if child is active
  useEffect(() => {
    const expanded: string[] = [];
    filteredNavigation.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some((child) => pathname === child.href);
        if (hasActiveChild || pathname.startsWith(item.href + '/')) {
          expanded.push(item.name);
        }
      }
    });
    setExpandedItems(expanded);
  }, [pathname, filteredNavigation]);

  const toggleExpand = (itemName: string) => {
    setExpandedItems((prev) =>
      prev.includes(itemName) ? prev.filter((n) => n !== itemName) : [...prev, itemName]
    );
  };

  const handleLogout = async () => {
    const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com';
    const callbackUrl = `${base}/admin/login`;
    await signOut({ callbackUrl });
  };

  const handlePurgeCache = async () => {
    if (!confirm('Are you sure you want to purge the entire Cloudflare cache? This will clear all cached content.')) {
      return;
    }

    setPurgingCache(true);
    setCacheMessage('');

    try {
      const response = await fetch('/api/cms/cloudflare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'purge-cache' }),
      });

      const data = await response.json();

      if (response.ok) {
        setCacheMessage('✓ Cache purged successfully');
        setTimeout(() => setCacheMessage(''), 3000);
      } else {
        setCacheMessage('✗ ' + (data.error || 'Failed to purge cache'));
        setTimeout(() => setCacheMessage(''), 5000);
      }
    } catch (error) {
      console.error('Cache purge error:', error);
      setCacheMessage('✗ Error purging cache');
      setTimeout(() => setCacheMessage(''), 5000);
    } finally {
      setPurgingCache(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark text-text-primary">
      {/* Top Navigation Bar */}
      <nav className="bg-dark-card border-b border-dark-border fixed w-full top-0 z-50">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left side */}
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden lg:block p-2 rounded-lg text-text-secondary hover:text-cyber-green hover:bg-dark-lighter transition-colors"
              >
                <FaBars className="text-xl" />
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg text-text-secondary hover:text-cyber-green hover:bg-dark-lighter transition-colors"
              >
                {mobileMenuOpen ? <FaTimes className="text-xl" /> : <FaBars className="text-xl" />}
              </button>
              <div className="ml-4">
                <h1 className="text-xl font-bold">
                  <span className="text-gradient">RHC</span> CMS
                </h1>
                <p className="text-xs text-text-muted font-mono hidden sm:block">&gt; {title}</p>
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center space-x-4">
              <AdminSearch />
              {session?.user && (
                <Link
                  href="/admin/account"
                  title="Account settings"
                  className="hidden md:flex items-center space-x-2 text-sm rounded-lg px-2 py-1 hover:bg-dark-lighter transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-linear-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-semibold">
                    {session.user.name?.charAt(0) || 'U'}
                  </div>
                  <div>
                    <p className="text-text-primary font-medium">{session.user.name}</p>
                    <p className="text-text-muted text-xs">{session.user.email}</p>
                  </div>
                </Link>
              )}
              <Link
                href="/"
                target="_blank"
                className="text-text-secondary hover:text-cyber-cyan transition-colors text-sm hidden sm:block"
              >
                View Site →
              </Link>
              {role === 'admin' && (
                <button
                  onClick={handlePurgeCache}
                  disabled={purgingCache}
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-dark-lighter hover:bg-orange-500/20 
                           text-text-secondary hover:text-orange-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Purge Entire Cache"
                >
                  {purgingCache ? <FaSpinner className="animate-spin" /> : <FaTrash />}
                  <span className="hidden lg:inline">Purge Cache</span>
                </button>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-dark-lighter hover:bg-cyber-red/20 
                         text-text-secondary hover:text-cyber-red transition-all"
              >
                <FaSignOutAlt />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Cache Message Notification */}
      {cacheMessage && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={`fixed top-20 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
            cacheMessage.startsWith('✓')
              ? 'bg-green-500/90 text-white'
              : 'bg-red-500/90 text-white'
          }`}
        >
          {cacheMessage}
        </motion.div>
      )}

      {/* Sidebar - Desktop */}
      <aside
        className={`hidden lg:block fixed left-0 top-16 h-[calc(100vh-4rem)] bg-dark-card border-r border-dark-border 
                   transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'} overflow-y-auto`}
      >
        <nav className="p-4 space-y-2">
          {filteredNavigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedItems.includes(item.name);
            const hasActiveChild = item.children?.some((child) => pathname === child.href);
            
            return (
              <div key={item.name}>
                {hasChildren ? (
                  <>
                    <div className="relative">
                      <Link
                        href={item.href}
                        className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                          isActive || hasActiveChild
                            ? 'bg-linear-to-r from-cyber-green to-cyber-cyan text-dark font-bold shadow-glow-cyber-green'
                            : 'text-text-secondary hover:text-cyber-green hover:bg-dark-lighter'
                        }`}
                      >
                        <Icon className="text-xl shrink-0" />
                        {sidebarOpen && <span className="whitespace-nowrap flex-1">{item.name}</span>}
                      </Link>
                      {sidebarOpen && (
                        <button
                          onClick={() => toggleExpand(item.name)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-dark-lighter/50 rounded"
                        >
                          {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                        </button>
                      )}
                    </div>
                    {sidebarOpen && isExpanded && (
                      <div className="ml-8 mt-1 space-y-1">
                        {item.children?.map((child) => {
                          const ChildIcon = child.icon;
                          const isChildActive = pathname === child.href;
                          return (
                            <Link
                              key={child.name}
                              href={child.href}
                              className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-all text-sm ${
                                isChildActive
                                  ? 'bg-cyber-cyan/20 text-cyber-cyan font-semibold'
                                  : 'text-text-secondary hover:text-cyber-green hover:bg-dark-lighter'
                              }`}
                            >
                              <ChildIcon className="text-base shrink-0" />
                              <span className="whitespace-nowrap">{child.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.href}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                      isActive
                        ? 'bg-linear-to-r from-cyber-green to-cyber-cyan text-dark font-bold shadow-glow-cyber-green'
                        : 'text-text-secondary hover:text-cyber-green hover:bg-dark-lighter'
                    }`}
                  >
                    <Icon className="text-xl shrink-0" />
                    {sidebarOpen && <span className="whitespace-nowrap">{item.name}</span>}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -300, opacity: 0 }}
          className="lg:hidden fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-dark-card border-r border-dark-border z-40 overflow-y-auto"
        >
          <nav className="p-4 space-y-2">
            {filteredNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              const hasChildren = item.children && item.children.length > 0;
              const isExpanded = expandedItems.includes(item.name);
              const hasActiveChild = item.children?.some((child) => pathname === child.href);
              
              return (
                <div key={item.name}>
                  {hasChildren ? (
                    <>
                      <div className="relative">
                        <Link
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                            isActive || hasActiveChild
                              ? 'bg-linear-to-r from-cyber-green to-cyber-cyan text-dark font-bold'
                              : 'text-text-secondary hover:text-cyber-green hover:bg-dark-lighter'
                          }`}
                        >
                          <Icon className="text-xl" />
                          <span className="flex-1">{item.name}</span>
                        </Link>
                        <button
                          onClick={() => toggleExpand(item.name)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-dark-lighter/50 rounded"
                        >
                          {isExpanded ? <FaChevronDown /> : <FaChevronRight />}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="ml-8 mt-1 space-y-1">
                          {item.children?.map((child) => {
                            const ChildIcon = child.icon;
                            const isChildActive = pathname === child.href;
                            return (
                              <Link
                                key={child.name}
                                href={child.href}
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center space-x-3 px-4 py-2 rounded-lg transition-all text-sm ${
                                  isChildActive
                                    ? 'bg-cyber-cyan/20 text-cyber-cyan font-semibold'
                                    : 'text-text-secondary hover:text-cyber-green hover:bg-dark-lighter'
                                }`}
                              >
                                <ChildIcon className="text-base" />
                                <span>{child.name}</span>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                        isActive
                          ? 'bg-linear-to-r from-cyber-green to-cyber-cyan text-dark font-bold'
                          : 'text-text-secondary hover:text-cyber-green hover:bg-dark-lighter'
                      }`}
                    >
                      <Icon className="text-xl" />
                      <span>{item.name}</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
        </motion.div>
      )}

      {/* Main Content */}
      <main
        className={`pt-16 transition-all duration-300 ${
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'
        }`}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
