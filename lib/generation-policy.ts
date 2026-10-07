export interface GenerationCandidate { id: string; score: number; blockers: string[]; }

export function isGenerationEligible(job: GenerationCandidate) {
  return job.score >= 80 && job.blockers.length === 0;
}

export function selectAutomaticGenerationQueue<T extends GenerationCandidate>(jobs: T[], limit = 3) {
  return jobs.filter(isGenerationEligible).sort((a, b) => b.score - a.score).slice(0, limit);
}
