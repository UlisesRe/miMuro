// rsc-update:managed
// rsc update check for OpenCode: checked once per OpenCode run, and the notice goes to the model to be
// relayed. It rides on EVERY system prompt of the run, not just the first: OpenCode's first call is
// its title generator, which would swallow a once-only notice before the agent ever sees it.
// Turn auto-update off with .rsc/.no-auto-update.
import { updateNotice } from '../../.rsc/auto-update.mjs';

export const RscUpdatePlugin = async ({ directory, worktree }) => {
  const cwd = worktree || directory;
  const pending = process.env.RSC_NO_UPDATE_CHECK ? Promise.resolve('') : updateNotice(cwd).catch(() => '');
  return {
    'experimental.chat.system.transform': async (_input, output) => {
      const said = (await pending).trim();
      if (said && Array.isArray(output?.system)) output.system.push(said + '\nMention this only in your first reply of the session.');
    },
  };
};
