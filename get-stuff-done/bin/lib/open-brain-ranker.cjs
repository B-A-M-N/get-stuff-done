function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeCount(value, denominator = 10) {
  return clamp(toNumber(value, 0) / denominator, 0, 1);
}

function scoreRecency(updatedAt, nowInput = Date.now()) {
  const updatedMs = Date.parse(updatedAt || 0);
  const nowMs = typeof nowInput === 'string' ? Date.parse(nowInput) : nowInput;

  if (!Number.isFinite(updatedMs) || !Number.isFinite(nowMs)) return 0;

  const ageDays = Math.max(0, (nowMs - updatedMs) / (1000 * 60 * 60 * 24));
  return clamp(1 - ageDays / 30, 0, 1);
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = Number(left[index]) || 0;
    const rightValue = Number(right[index]) || 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return clamp(dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)), -1, 1);
}

function scoreFeedback(candidate) {
  const helpful = toNumber(candidate.helpful_count, 0);
  const harmful = toNumber(candidate.harmful_count, 0);
  return clamp((helpful - harmful) / 5, -1, 1);
}

function buildRanking(candidate, options = {}) {
  const similarity = cosineSimilarity(candidate.embedding, options.queryEmbedding);
  const recency = scoreRecency(candidate.updated_at || candidate.created_at, options.now);
  const reuse = normalizeCount(candidate.reuse_count, 8);
  const feedback = scoreFeedback(candidate);
  const projectScopeMatch = candidate.project_scope && options.projectScope && candidate.project_scope === options.projectScope ? 1 : 0;
  const importance = clamp(toNumber(candidate.importance_score, 0), 0, 1);

  const score =
    similarity * 0.35 +
    recency * 0.15 +
    reuse * 0.1 +
    feedback * 0.25 +
    projectScopeMatch * 0.1 +
    importance * 0.05;

  return {
    score,
    similarity,
    recency,
    reuse,
    feedback,
    project_scope_match: projectScopeMatch,
    importance,
  };
}

function rankOpenBrainCandidates(candidates, options = {}) {
  const limit = options.limit ?? 5;

  return [...(candidates || [])]
    .map((candidate) => ({
      ...candidate,
      ranking: buildRanking(candidate, options),
    }))
    .sort((left, right) => right.ranking.score - left.ranking.score)
    .slice(0, limit);
}

module.exports = {
  rankOpenBrainCandidates,
};
