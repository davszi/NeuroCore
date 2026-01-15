import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { HiOutlineRefresh } from 'react-icons/hi';
import { UserStorage } from '@/types/cluster';

interface UserStorageTableProps {
  selectedVolume: string;
}

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error('Failed to load storage data');
  return res.json();
});

export default function UserStorageTable({ selectedVolume }: UserStorageTableProps) {
  const { data, error, isLoading } = useSWR<{ user_storage: UserStorage[] }>(
    `/api/cluster-state?volume=${selectedVolume}`, 
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, 
      errorRetryCount: 1,
    }
  );

  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = useMemo(() => {
    if (!data?.user_storage) return [];
    return data.user_storage
      .filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [data, searchTerm]);

  // --- Loading State ---
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-gray-900 border border-gray-700 rounded-lg">
        <HiOutlineRefresh className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
        <span className="text-gray-300 font-medium">Scanning volume: {selectedVolume}</span>
        <span className="text-gray-500 text-sm mt-1">
          This checks actual disk usage and can take 15-20 seconds.
        </span>
      </div>
    );
  }

  // --- Error State ---
  if (error) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-900 rounded-lg text-red-200">
        <p className="font-bold">Scan Failed</p> 
        <p className="text-sm">The operation timed out or failed. Please try again later.</p>
      </div>
    );
  }

  // --- Empty State ---
  if (!data?.user_storage?.length) {
    return (
      <div className="p-6 bg-gray-900 border border-gray-700 rounded-lg text-center text-gray-400">
        No user folders found in <strong>{selectedVolume}</strong>.
      </div>
    );
  }

  // --- Data Table ---
  return (
    <div className="max-h-96 overflow-y-auto border border-gray-700 rounded-lg p-4 bg-gray-900 animate-in fade-in duration-300">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-white">User Storage: {selectedVolume}</h3>
        <span className="text-xs text-gray-400">
          Total Users: {filteredUsers.length}
        </span>
      </div>

      <input
        type="text"
        placeholder="Search users..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full mb-4 px-3 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
      />

      <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-800 sticky top-0">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Username</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Used (GiB)</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Files</th>
          </tr>
        </thead>
        <tbody className="bg-gray-900 divide-y divide-gray-800">
          {filteredUsers.map(user => (
            <tr key={user.username} className="hover:bg-gray-800 transition-colors">
              <td className="px-4 py-2 text-cyan-300 font-mono">{user.username}</td>
              <td className="px-4 py-2 text-gray-200">
                {user.used_storage_space_gb.toFixed(2)}
              </td>
              <td className="px-4 py-2 text-gray-400 text-sm">
                {user.total_files.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}