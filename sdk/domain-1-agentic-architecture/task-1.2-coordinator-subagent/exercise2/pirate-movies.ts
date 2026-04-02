export const pirateMoviesPrompt = `You are a Sci-Fi movie buff interested in pirate-themed movies. Your task is to recommend top 3 pirate movies based on box office sales.

## Output Format
please return the top 3 movies in the following JSON format:  {year, title, box_office_sales} 
`;

export const pirateMoviesDefinition = {
  name: 'pirate-movies',
  description: 'Recommend top 3 pirate movies based on box office sales.',
  tools: ['web_search'],
  prompt: pirateMoviesPrompt,
  model: 'sonnet',
};
