import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { HiOutlineMenu, HiX, HiChevronDown } from 'react-icons/hi';

// Define the navigation links
const navItems = [
  { name: 'Resources', href: '/' },
  { name: 'Jobs', href: '/jobs' },
];

export default function Navbar() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false); // State for mobile menu
  const [isBenchmarksOpen, setIsBenchmarksOpen] = useState(false); // State for Benchmarks dropdown
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsBenchmarksOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleBenchmarksClick = () => {
    setIsBenchmarksOpen(!isBenchmarksOpen);
  };

  const closeMenus = () => {
    setIsOpen(false);
    setIsBenchmarksOpen(false);
  };

  const isBenchmarksActive = router.pathname === '/benchmarks';

  return (
    <nav className="bg-gray-900 border-b border-gray-700 relative z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo and Desktop Links */}
          <div className="flex items-center">
            <Link href="/" className="flex-shrink-0 text-white font-bold text-xl cursor-default">
              NEUROCORE
            </Link>
            
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

                {/* Benchmarks Dropdown */}
                <div className="relative inline-block text-left" ref={dropdownRef}>
                  <button
                    onClick={handleBenchmarksClick}
                    className={`
                      ${isBenchmarksActive
                        ? 'bg-gray-800 text-white'
                        : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                      }
                      px-3 py-2 rounded-md text-sm font-medium inline-flex items-center
                    `}
                  >
                    Benchmarks
                    <HiChevronDown className="ml-1 h-4 w-4" />
                  </button>

                  {isBenchmarksOpen && (
                    <div className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                      <div className="py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
                        <Link
                          href="/benchmarks?tab=performance"
                          onClick={() => setIsBenchmarksOpen(false)}
                          className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                          role="menuitem"
                        >
                          Performance Benchmark
                        </Link>
                        <Link
                          href="/benchmarks?tab=ml"
                          onClick={() => setIsBenchmarksOpen(false)}
                          className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                          role="menuitem"
                        >
                          ML Benchmark
                        </Link>
                      </div>
                    </div>
                  )}
                </div>

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
              onClick={closeMenus}
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
          
          {/* Mobile Benchmarks Items */}
          <div className="border-t border-gray-700 pt-2 mt-2">
            <div className="px-3 py-2 text-base font-medium text-gray-400">Benchmarks</div>
            <Link
              href="/benchmarks?tab=performance"
              onClick={closeMenus}
              className={`
                ${isBenchmarksActive && router.query.tab !== 'ml'
                  ? 'bg-gray-800 text-white' 
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }
                block px-3 py-2 rounded-md text-base font-medium pl-6
              `}
            >
              Performance Benchmark
            </Link>
             <Link
              href="/benchmarks?tab=ml"
              onClick={closeMenus}
              className={`
                ${isBenchmarksActive && router.query.tab === 'ml'
                  ? 'bg-gray-800 text-white' 
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                }
                block px-3 py-2 rounded-md text-base font-medium pl-6
              `}
            >
              ML Benchmark
            </Link>
          </div>

        </div>
      </div>
    </nav>
  );
}