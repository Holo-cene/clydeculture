import { task } from '@trigger.dev/sdk/v3';

export const sweepTask = task({
  id: 'sweep',
  run: async () => {
    console.log('sweep starting');
    return { status: 'ok' };
  },
});
