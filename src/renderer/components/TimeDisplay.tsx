import React from 'react';
import { Clock } from 'lucide-react';

interface TimeDisplayProps {
  isoDate: string;
}

export const TimeDisplay: React.FC<TimeDisplayProps> = ({ isoDate }) => {
  const date = new Date(isoDate);
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);

  let label: string;
  if (diffDays === 0) label = 'Heute';
  else if (diffDays === 1) label = 'Gestern';
  else if (diffDays < 7) label = `Vor ${diffDays} Tagen`;
  else label = date.toLocaleDateString('de-DE');

  return (
    <div className="flex items-center" title={date.toLocaleString('de-DE')}>
      <Clock className="w-4 h-4 mr-1.5 shrink-0" />
      <span>{label}</span>
    </div>
  );
};
