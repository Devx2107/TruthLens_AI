export type InputKind = 'text' | 'url';
export type AnalysisMode = 'single' | 'batch';
export type RiskLevel = 'Low' | 'Medium' | 'High';
export type AnalysisEngine = 'gemini' | 'heuristic';

export interface ClaimAnalysis {
  claim: string;
  score: number;
  confidence: number;
  verdict: 'Likely true' | 'Mixed' | 'Likely false';
  rationale: string;
}

export interface AnalysisResult {
  id: string;
  input: string;
  inputType: InputKind;
  sourceUrl: string | null;
  sourceTitle: string | null;
  sourceDescription: string | null;
  sourceExcerpt: string;
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
}

export interface SessionSnapshot {
  id: string;
  email: string | null;
}

