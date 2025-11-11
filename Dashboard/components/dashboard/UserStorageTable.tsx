import React from 'react';
import { useCluster } from '@/context/ClusterContext';

// 1. 🧠 Define the type for the data
//    This matches the 'UserStorage' interface in your ClusterContext.tsx
interface UserStorage {
  username: string;
  used_storage_space_gb: number;
  total_files: number;
}

export default function UserStorageTable() {
  // 3. 🎁 Get the static 'userStorage' data from the context
  //    (This is the mock data for 'aansari', 'aasteine', etc.)
  const { userStorage } = useCluster();

  return (
    <div className="bg-gray-900 shadow-md rounded-lg overflow-hidden border border-gray-700">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          
          {/* --- Table Header --- */}
          <thead className="bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Username</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Used Storage Space</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Total Files</th>
            </tr>
          </thead>

          {/* --- Table Body --- */}
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {userStorage.map((user) => (
              <tr key={user.username} className="hover:bg-gray-800">
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-cyan-300">{user.username}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">{user.used_storage_space_gb.toFixed(2)} GiB</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-200">{user.total_files.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}