interface CredibilityMeterProps {
  score: number;
  riskLevel: 'Low' | 'Medium' | 'High';
}

export default function CredibilityMeter({ score, riskLevel }: CredibilityMeterProps) {
  const getColor = () => {
    if (riskLevel === 'Low') return 'bg-green-500';
    if (riskLevel === 'Medium') return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTextColor = () => {
    if (riskLevel === 'Low') return 'text-green-600';
    if (riskLevel === 'Medium') return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700">Credibility Score</span>
        <span className={`text-2xl font-bold ${getTextColor()}`}>{score}/100</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
        <div
          className={`h-full ${getColor()} transition-all duration-500 ease-out`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
