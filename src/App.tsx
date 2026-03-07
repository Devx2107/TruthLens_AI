import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { AnalysisResult } from './types';
import ResultCard from './components/ResultCard';

const FAKE_EXAMPLE = "Hot water cures all viruses. Share immediately!";
const REAL_EXAMPLE = "ISRO launches new satellite to monitor climate change.";

function App() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const analyzeMessage = async (text: string) => {
    if (!text.trim()) {
      setError('Please enter a message to analyze');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze message');
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError('Unable to analyze the message. Please try again.');
      console.error('Analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = () => {
    analyzeMessage(message);
  };

  const handleExample = (example: string) => {
    setMessage(example);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Search className="w-8 h-8 text-blue-600" />
            <h1 className="text-4xl font-bold text-gray-900">TruthLens AI</h1>
          </div>
          <p className="text-gray-600 text-lg">Detect misinformation instantly</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste a news headline or message here to analyze..."
            className="w-full h-32 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-gray-700"
            disabled={loading}
          />

          <div className="mt-4 flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleAnalyze}
              disabled={loading || !message.trim()}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Analyze Claim
                </>
              )}
            </button>
          </div>

          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => handleExample(FAKE_EXAMPLE)}
              disabled={loading}
              className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              Fake News Example
            </button>
            <button
              onClick={() => handleExample(REAL_EXAMPLE)}
              disabled={loading}
              className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors text-sm"
            >
              Real News Example
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {result && <ResultCard result={result} />}
      </div>
    </div>
  );
}

export default App;
