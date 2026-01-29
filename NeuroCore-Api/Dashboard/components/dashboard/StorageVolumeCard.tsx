import React from 'react';
import ProgressBar from '../ui/ProgressBar'; // Reusing our progress bar

// 1. 🧠 Define the type for the data
//    This matches the 'StorageVolume' interface in your ClusterContext.tsx
interface StorageVolume {
  mount_point: string;
  usage_percent: number;
  used_tib: number;
  total_tib: number;
}

interface StorageVolumeCardProps {
  volume: StorageVolume;
}

export default function StorageVolumeCard({ volume }: StorageVolumeCardProps) {
  return (
    <div className="bg-gray-900 shadow-lg rounded-lg p-4 border border-gray-700">
      
      {/* --- Header --- */}
      <div className="mb-2">
        <h3 className="text-lg font-mono font-bold text-white">
          {volume.mount_point}
        </h3>
        <p className="text-xs text-gray-400">
          {volume.used_tib.toFixed(2)} TiB / {volume.total_tib.toFixed(2)} TiB
        </p>
      </div>

      {/* --- Progress Bar --- */}
      {/* We can reuse the same ProgressBar component! */}
      <ProgressBar label="Usage" value={volume.usage_percent} />
    </div>
  );
}