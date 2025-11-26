import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { HiOutlineMenu, HiX } from 'react-icons/hi'; // <-- 1. Import icons

// Define the navigation links
const navItems = [
  { name: 'Resources', href: '/' },
  { name: 'Jobs', href: '/jobs' },
  { name: 'Benchmarks', href: '/benchmarks' },
];

export default function Navbar() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false); // State for mobile menu

  return (
    <nav className="bg-gray-900 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo and Desktop Links */}
          <div className="flex items-center">
            <div className="flex-shrink-0 text-white font-bold text-xl">
              NEUROCORE
            </div>
            
            {/* Desktop Navigation (hidden on mobile) */}
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

          {/* Mobile Menu Button (visible on mobile) */}
          <div className="-mr-2 flex md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              type="button"
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-white"
              aria-controls="mobile-menu"
              aria-expanded={isOpen}
            >
              <span className="sr-only">Open main menu</span>
              
              {/* 2. Use the imported icon components */}
              {isOpen ? (
                <HiX className="block h-6 w-6" aria-hidden="true" />
              ) : (
                <HiOutlineMenu className="block h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>

        </div>
      </div>

      {/* Mobile Menu Panel (conditionally rendered) */}
      <div 
        className={`${isOpen ? 'block' : 'hidden'} md:hidden`} 
        id="mobile-menu"
      >
        <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
          {navItems.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setIsOpen(false)} // Close menu on click
              className={`
                ${router.pathname === item.href
                  ? 'bg-gray-800 text-white' // Active link
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white' // Inactive link
                }
                block px-3 py-2 rounded-md text-base font-medium
              `}
            >
              {item.name}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}