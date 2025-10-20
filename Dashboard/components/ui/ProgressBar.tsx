import React from 'react';

interface ProgressBarProps {
  label: string;
  value: number; // A number between 0 and 100
}

export default function ProgressBar({ label, value }: ProgressBarProps) {
  // Determine color based on value
  let barColor = 'bg-blue-500'; // Default
  if (value > 70) barColor = 'bg-yellow-500';
  if (value > 90) barColor = 'bg-red-500';

  return (
    <div className="w-full">
      {/* Labels */}
      <div className="flex justify-between text-xs font-medium text-gray-300 mb-1">
        <span>{label}</span>
        <span>{value.toFixed(0)}%</span>
      </div>
      {/* Bar */}
      <div className="w-full bg-gray-700 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full ${barColor} transition-all duration-300`}
          style={{ width: `${value}%` }}
        ></div>
      </div>
    </div>
  );
}