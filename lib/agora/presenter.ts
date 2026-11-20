export type PresenterChoice = 'anam' | 'heygen' | 'orb' | string;

export type PresenterPlan =
  | { ok: true; kind: 'orb' }
  | { ok: true; kind: 'anam'; apiKey: string; avatarId: string }
  // HeyGen's LiveAvatar. The avatar id is optional there: without it LiveAvatar uses its default.
  | { ok: true; kind: 'heygen'; apiKey: string; avatarId?: string }
  | { ok: false; missing?: string[]; message?: string };

type Env = Record<string, string | undefined>;

/**
 * Decide which presenter to run and which variables are missing, by name only.
 * `avatarId` lets the app pick an avatar at run time instead of the one in the environment.
 */
export function resolvePresenter(choice: PresenterChoice, env: Env, avatarId?: string): PresenterPlan {
  if (choice === 'orb') return { ok: true, kind: 'orb' };
  if (choice === 'anam') {
    const apiKey = env.ANAM_API_KEY;
    const id = avatarId || env.ANAM_AVATAR_ID;
    const missing = [!apiKey && 'ANAM_API_KEY', !id && 'ANAM_AVATAR_ID'].filter(Boolean) as string[];
    return missing.length || !apiKey || !id ? { ok: false, missing } : { ok: true, kind: 'anam', apiKey, avatarId: id };
  }
  if (choice === 'heygen') {
    const apiKey = env.HEYGEN_API_KEY;
    if (!apiKey) return { ok: false, missing: ['HEYGEN_API_KEY'] };
    return { ok: true, kind: 'heygen', apiKey, avatarId: avatarId || env.HEYGEN_AVATAR_ID || undefined };
  }
  return { ok: false, message: `The "${choice}" presenter is not built yet. Use anam, heygen or orb.` };
}
