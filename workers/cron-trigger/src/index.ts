export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const res = await fetch(
      `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'gm-cron-trigger',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            dry_run: 'false',
            readonly: 'false',
          },
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub API error: ${res.status} ${body}`);
    }

    console.log('Dispatched workflow successfully');
  },
};

interface Env {
  GITHUB_TOKEN: string;
  GITHUB_REPO: string;
  WORKFLOW_FILE: string;
}
