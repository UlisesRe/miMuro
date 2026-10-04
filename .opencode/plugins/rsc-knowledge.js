// rsc-knowledge:managed
// rsc knowledge sync for OpenCode. OpenCode has no prompt event and no channel to the person, so what
// sync has to say goes to the model, to be relayed. Cheap on every call: the fetch is throttled and
// every notice is said once. Turn it off with `rsc knowledge-sync off`.
import { onRequest, onTurn } from '../../.rsc/knowledge-sync.mjs';

export const RscKnowledgePlugin = async ({ directory, worktree }) => {
  const cwd = worktree || directory;
  const local = () => process.env.RSC_REMOTE_AGENT !== '1' && process.env.OPENCODE_REMOTE !== '1';
  return {
    'experimental.chat.system.transform': async (_input, output) => {
      if (!local()) return;
      try {
        const said = onRequest(cwd);
        if (said && Array.isArray(output?.system)) output.system.push(`Cuéntale esto al usuario en una línea:\n${said}`);
      } catch { /* fail open */ }
    },
    event: async ({ event }) => {
      if (event?.type === 'session.idle' && local()) { try { onTurn(cwd); } catch { /* fail open */ } }
    },
  };
};
