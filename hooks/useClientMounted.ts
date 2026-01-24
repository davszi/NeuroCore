import { useState, useEffect } from 'react';

/**
 * This hook returns `true` only after the component has mounted on the client.
 * This is used to prevent hydration mismatches with server-rendered content.
 */
export function useClientMounted() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return isMounted;
}