export type InputKind = 'text' | 'url' | 'image';
export type AnalysisMode = 'single' | 'batch' | 'compare';
export type RiskLevel = 'Low' | 'Medium' | 'High';
export type AnalysisEngine = 'gemini' | 'groq' | 'heuristic';
export type SourceCredibilityTier = 'Official' | 'Established' | 'Recognized' | 'Unknown' | 'Low-signal';

export interface SourceCredibility {
  score: number;
  domain: string;
  tier?: SourceCredibilityTier;
  signals?: string[];
  label?: 'Established publisher' | 'Limited signal' | 'Caution signal';
  rationale?: string;
}

export interface ClaimAnalysis {
  claim: string;
  score: number;
  confidence: number;
  verdict: 'Likely true' | 'Mixed' | 'Likely false';
  rationale: string;
  evidence?: EvidenceLink[];
}

export interface EvidenceLink {
  title: string;
  url: string;
  publisher: string | null;
  kind?: 'fact-check' | 'primary' | 'reporting';
  strength?: 'Strong' | 'Moderate' | 'Related';
  rating?: string | null;
  reviewDate?: string | null;
  claimText?: string | null;
}

export interface AnalysisResult {
  id: string;
  input: string;
  inputType: InputKind;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceDescription: string | null;
  sourceExcerpt: string;
  sourceCredibility: SourceCredibility | null;
  credibilityScore: number;
  confidence: number;
  riskLevel: RiskLevel;
  manipulationTechniques: string[];
  claims: ClaimAnalysis[];
  summary: string;
  explanation: string;
  warnings: string[];
  engine: AnalysisEngine;
  createdAt: string;
  analyzedAt?: string;
  fromCache: boolean;
  isPublic?: boolean;
  detectedLanguage?: string;
  analysisLanguage?: string;
  previousScanId?: string | null;
}

export interface BatchAnalysisResponse {
  mode: 'batch';
  results: AnalysisResult[];
  errors?: { input: string; message: string; code?: string }[];
}

export interface AnalyzeItem {
  input: string;
  inputType: InputKind;
}

export interface AnalyzeRequest {
  mode?: AnalysisMode;
  input?: string;
  inputType?: InputKind;
  items?: AnalyzeItem[];
  message?: string;
  url?: string;
  imageData?: string;
  mimeType?: string;
  forceRefresh?: boolean;
  outputLanguage?: 'auto' | 'en' | 'hi';
  previousScanId?: string;
  feedback?: { scanId: string; rating: 'up' | 'down'; comment?: string };
}

export interface UsageStats {
  count: number;
}

export interface ComparisonResult {
  left: AnalysisResult;
  right: AnalysisResult;
}

export interface SessionSnapshot {
  id: string;
  email: string | null;
  isAdmin: boolean;
}

export interface WatchlistItem {
  id: string;
  query: string;
  createdAt: string;
  lastCheckedAt: string | null;
  latestResult: AnalysisResult | null;
}

export interface FeedbackItem {
  id: string;
  scanId: string;
  rating: 'up' | 'down';
  comment: string | null;
  status: 'open' | 'reviewed' | 'corrected';
  createdAt: string;
}
