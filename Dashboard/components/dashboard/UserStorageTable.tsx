import { useState, useMemo } from 'react';
import { useCluster } from '@/context/ClusterContext';

interface UserStorageTableProps {
  selectedVolume: string;
}

export default function UserStorageTable({ selectedVolume }: UserStorageTableProps) {
  const { clusterState } = useCluster();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredUsers = useMemo(() => {
    if (!clusterState.user_storage) return [];
    return clusterState.user_storage
      .filter(u => u.mount_point === selectedVolume)
      .filter(u => u.username.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [clusterState.user_storage, selectedVolume, searchTerm]);

  if (!clusterState.user_storage?.length) {
    return <p className="text-gray-400">No user storage data available for this volume.</p>;
  }

  return (
    <div className="max-h-96 overflow-y-auto border border-gray-700 rounded-lg p-4 bg-gray-900">
      <h3 className="text-lg font-semibold text-white mb-3">User Storage: {selectedVolume}</h3>

      {/* Search Input */}
      <input
        type="text"
        placeholder="Search users..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full mb-4 px-3 py-2 rounded-lg bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-yellow-400"
      />

      {/* User Table */}
      <table className="min-w-full divide-y divide-gray-700">
        <thead className="bg-gray-800">
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Username</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Used Storage (GiB)</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-300">Total Files</th>
          </tr>
        </thead>
        <tbody className="bg-gray-900 divide-y divide-gray-800">
          {filteredUsers.map(user => (
            <tr key={user.username} className="hover:bg-gray-800">
              <td className="px-4 py-2 text-cyan-300">{user.username}</td>
              <td className="px-4 py-2">{user.used_storage_space_gb.toFixed(2)}</td>
              <td className="px-4 py-2">{user.total_files.toLocaleString()}</td>
            </tr>
          ))}
          {filteredUsers.length === 0 && (
            <tr>
              <td colSpan={3} className="px-4 py-2 text-gray-400 text-center">
                No users match your search.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
