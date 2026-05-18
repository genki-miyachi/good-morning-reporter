import { config } from 'dotenv';
import { syncCommunityFacts } from './v2/community-facts.js';

config();

syncCommunityFacts()
  .then((count) => console.log('Synced', count, 'facts'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
