import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { StagingDeploymentEngineConfig } from './deploymentAgentService';

const exec = promisify(execFile);
const REMOTE = 'https://github.com/jk9krnvb6g-ai/Sam_Att.git';
const BRANCH = 'fix/a96-deployment-fail-closed';

/** Real source/build executors; intentionally does not assert production health or activation support. */
export function createVerifiedStagingHooks(npmCliPath: string): NonNullable<StagingDeploymentEngineConfig['hooks']> {
  if (!path.isAbsolute(npmCliPath) || !fs.statSync(npmCliPath).isFile()) throw new Error('NPM_CLI_REQUIRED');
  const run = async (command: string, args: string[], cwd: string) => {
    const result = await exec(command, command === 'git' ? ['-c', `safe.directory=${cwd}`, ...args] : args, {
      cwd, shell: false, timeout: 15 * 60_000, maxBuffer: 8 * 1024 * 1024,
      windowsHide: true, env: { ...process.env, NODE_ENV: 'test', CI: '1', GIT_TERMINAL_PROMPT: '0' },
    });
    return result.stdout.trim();
  };
  const npm = async (dir: string, args: string[]) => {
    try { await run(process.execPath, [npmCliPath, ...args], dir); return { ok: true, detail: `Completed npm ${args.join(' ')}` }; }
    catch { return { ok: false, detail: `Failed npm ${args.join(' ')}; inspect protected staging logs` }; }
  };
  return {
    fetchGitHubSource: async (sha, dir) => {
      try {
        if (!/^[0-9a-f]{40}$/i.test(sha) || fs.readdirSync(dir).length) throw new Error('SOURCE_TARGET_INVALID');
        await run('git', ['clone', '--no-checkout', '--single-branch', '--branch', BRANCH, REMOTE, '.'], dir);
        await run('git', ['merge-base', '--is-ancestor', sha, `origin/${BRANCH}`], dir);
        await run('git', ['checkout', '--detach', sha], dir);
        return { ok: true };
      } catch { return { ok: false, error: 'SOURCE_FETCH_OR_BRANCH_VERIFICATION_FAILED' }; }
    },
    verifyGitHubSource: async (sha, dir) => {
      try {
        const head = await run('git', ['rev-parse', 'HEAD'], dir);
        const origin = await run('git', ['remote', 'get-url', 'origin'], dir);
        const dirty = await run('git', ['status', '--porcelain', '--untracked-files=all'], dir);
        await run('git', ['fsck', '--no-reflogs', 'HEAD'], dir);
        return { ok: head.toLowerCase() === sha.toLowerCase() && origin === REMOTE && dirty === '' };
      } catch { return { ok: false, error: 'SOURCE_INTEGRITY_FAILED' }; }
    },
    runDependenciesCheck: dir => npm(dir, ['ci', '--ignore-scripts', '--no-audit', '--no-fund']),
    runTypecheck: dir => npm(dir, ['run', 'typecheck']),
    runUnitTests: dir => npm(dir, ['run', 'test:unit']),
    runIntegrationTests: async dir => {
      const result = await npm(dir, ['run', 'test:integration']);
      return result.ok ? npm(dir, ['run', 'test:security']) : result;
    },
    runBuild: async dir => {
      const result = await npm(dir, ['run', 'build']);
      const frontendBuildDir = path.join(dir, 'frontend_dist');
      const backendBuildDir = path.join(dir, 'backend_dist');
      if (result.ok) {
        fs.cpSync(path.join(dir, 'dist'), frontendBuildDir, { recursive: true });
        fs.cpSync(path.join(dir, 'dist-backend'), backendBuildDir, { recursive: true });
      }
      return { ...result, frontendBuildDir, backendBuildDir };
    },
  };
}
