// Server mock (MOCK_AI=1): canned model outputs so the real endpoints work without a key.
import type { ExtractModelOutput } from '../../src/ai/contracts';

export function mockExtractOutput(): ExtractModelOutput {
  return {
    projectName: null,
    members: [
      { name: 'Sam', hoursPerDay: null },
      { name: 'Priya', hoursPerDay: null },
    ],
    tasks: [
      { key: 'schema', title: 'Design the database schema', ownerName: 'Sam', estimateHours: 3, estimateInferred: false, status: 'todo', dependsOnKeys: [], evidence: "I'll do the DB schema tonight", confidence: 'high' },
      { key: 'api', title: 'Build the API', ownerName: 'Priya', estimateHours: 4, estimateInferred: true, status: 'todo', dependsOnKeys: ['schema'], evidence: "I'll build the API once the schema is in", confidence: 'high' },
      { key: 'ui', title: 'Build the main UI', ownerName: null, estimateHours: 4, estimateInferred: true, status: 'todo', dependsOnKeys: ['api'], evidence: 'someone has to do the UI', confidence: 'medium' },
      { key: 'demo', title: 'Record the demo video', ownerName: 'Sam', estimateHours: 1.5, estimateInferred: true, status: 'todo', dependsOnKeys: ['ui'], evidence: 'Sam records the demo at the end', confidence: 'medium' },
    ],
    openQuestions: [{ taskKey: 'ui', field: 'owner', question: 'Who will build the main UI?' }],
  };
}
