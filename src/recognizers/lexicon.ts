// Grammatical "function words" (articles, copulas, auxiliaries, pronouns, prepositions,
// conjunctions, interrogatives). They pepper natural-language sentences but rarely appear,
// unquoted, in a shell invocation. Recognizers use their presence to tell a prose request
// ("find the largest file") apart from a command ("find . -name x").
export const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'am', 'be', 'been', 'being', 'of', 'to', 'for',
  'and', 'or', 'but', 'that', 'this', 'these', 'those', 'with', 'from', 'into', 'my', 'your',
  'his', 'her', 'their', 'our', 'it', 'its', 'you', 'he', 'she', 'they', 'we', 'do', 'does',
  'did', 'should', 'would', 'could', 'can', 'will', 'than', 'then', 'what', 'why', 'how', 'who',
  'whom', 'whose', 'when', 'where', 'which',
]);
