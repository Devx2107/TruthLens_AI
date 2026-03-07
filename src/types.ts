export interface AnalysisResult {
  credibilityScore: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  manipulationTechniques: string[];
  explanation: string;
}
