import type { LearningVerb } from './model.ts';

export type VerbPatch = Partial<Pick<LearningVerb, 'status' | 'hard'>>;
export type BulkUndo = { id: string; before: VerbPatch; after: VerbPatch }[];

export function bulkVerbs(verbs: LearningVerb[], ids: Set<string>, patch: VerbPatch): BulkUndo {
  return verbs.filter(v => ids.has(v.id)).map(v => {
    const before: VerbPatch = {};
    if (patch.status !== undefined) before.status = v.status;
    if (patch.hard !== undefined) before.hard = v.hard;
    Object.assign(v, patch);
    return { id: v.id, before, after: { ...patch } };
  });
}

// Restore only fields still equal to this action; subsequent individual edits survive.
export function undoBulkVerbs(verbs: LearningVerb[], undo: BulkUndo) {
  for (const change of undo) {
    const v = verbs.find(v => v.id === change.id);
    if (!v) continue;
    if (change.after.status !== undefined && v.status === change.after.status) v.status = change.before.status!;
    if (change.after.hard !== undefined && v.hard === change.after.hard) v.hard = change.before.hard!;
  }
}
