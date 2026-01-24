import React from 'react';

interface ProgressBarProps {
  label: string;
  value: number; // A number between 0 and 100
  customValue?: string;
}

export default function ProgressBar({ label, value, customValue }: ProgressBarProps) {
  // 1. Create a safe value. If 'value' is undefined, null, or NaN, default to 0.
  const safeValue = value || 0;

  // Determine color based on value
  let barColor = 'bg-blue-500'; // Default
  if (safeValue > 70) barColor = 'bg-yellow-500';
  if (safeValue > 90) barColor = 'bg-red-500';

  return (
    <div className="w-full">
      {/* Labels */}
      <div className="flex justify-between text-xs font-medium text-gray-300 mb-1">
        <span>{label}</span>
        {/* 2. Use the customValue if provided, otherwise safeValue for calculations */}
        <span>{customValue ? customValue : `${safeValue.toFixed(0)}%`}</span>
      </div>
      {/* Bar */}
      <div className="w-full bg-gray-700 rounded-full h-2.5">
        <div
          className={`h-2.5 rounded-full ${barColor} transition-all duration-300`}
          // 3. Use the safeValue for the style
          style={{ width: `${safeValue}%` }}
        ></div>
      </div>
    </div>
  );
}