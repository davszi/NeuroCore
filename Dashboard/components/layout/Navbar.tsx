import Link from 'next/link';
import { useRouter } from 'next/router';

// Define the navigation links
const navItems = [
  { name: 'Dashboard', href: '/' },
  { name: 'Jobs', href: '/jobs' },
  { name: 'Monitoring', href: '/monitoring' },
  { name: 'Logs', href: '/logs' },
];

export default function Navbar() {
  const router = useRouter();

  return (
    <nav className="bg-gray-900 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 text-white font-bold text-xl">
              NEUROCORE
            </div>
            {/* Navigation Links */}
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-4">
                {navItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`
                      ${router.pathname === item.href
                        ? 'bg-gray-800 text-white' // Active link
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white' // Inactive link
                      }
                      px-3 py-2 rounded-md text-sm font-medium
                    `}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}