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
  fromCache: boolean;
}

export interface BatchAnalysisResponse {
  mode: 'batch';
  results: AnalysisResult[];
  errors?: { input: string; message: string }[];
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
  feedback?: { scanId: string; rating: 'up' | 'down' };
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
}
