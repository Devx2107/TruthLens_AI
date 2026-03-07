import { AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';
import type { AnalysisResult } from '../types';
import CredibilityMeter from './CredibilityMeter';

interface ResultCardProps {
  result: AnalysisResult;
}

export default function ResultCard({ result }: ResultCardProps) {
  const getRiskIcon = () => {
    if (result.riskLevel === 'Low') {
      return <CheckCircle className="w-6 h-6 text-green-500" />;
    }
    if (result.riskLevel === 'Medium') {
      return <AlertTriangle className="w-6 h-6 text-yellow-500" />;
    }
    return <AlertCircle className="w-6 h-6 text-red-500" />;
  };

  const getRiskBadgeColor = () => {
    if (result.riskLevel === 'Low') return 'bg-green-100 text-green-800';
    if (result.riskLevel === 'Medium') return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 space-y-6 animate-fadeIn">
      <CredibilityMeter score={result.credibilityScore} riskLevel={result.riskLevel} />

      <div className="flex items-center gap-3">
        {getRiskIcon()}
        <div>
          <p className="text-sm text-gray-500">Risk Level</p>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${getRiskBadgeColor()}`}>
            {result.riskLevel}
          </span>
        </div>
      </div>

      {result.manipulationTechniques.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Manipulation Techniques Detected</h3>
          <ul className="space-y-1">
            {result.manipulationTechniques.map((technique, index) => (
              <li key={index} className="text-sm text-gray-600 flex items-start gap-2">
                <span className="text-red-400 mt-0.5">•</span>
                <span>{technique}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Explanation</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{result.explanation}</p>
      </div>
    </div>
  );
}
