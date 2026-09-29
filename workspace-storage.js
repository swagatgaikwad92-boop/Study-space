// Workspace-level metadata: viewport, groups, ink. Kept apart from object records.
import { dbGet, dbPut } from './database.js';
import { validateStroke } from '../core/model.js';

export async function loadWorkspace() {
  try {
    const rec = await dbGet('workspace', 'main');
    if (!rec) return { viewport: null, groups: [], strokes: [] };
    const strokes = (Array.isArray(rec.strokes) ? rec.strokes : []).map(validateStroke).filter(Boolean);
    const groups = (Array.isArray(rec.groups) ? rec.groups : []).filter((g) => g && typeof g.id === 'string' && Array.isArray(g.members));
    const v = rec.viewport;
    const viewport = v && [v.x, v.y, v.scale].every(Number.isFinite) ? v : null;
    return { viewport, groups, strokes };
  } catch { return { viewport: null, groups: [], strokes: [] }; }
}

export const opWorkspace = (ws) => ({ store: 'workspace', put: { key: 'main', viewport: ws.viewport, groups: ws.groups, strokes: ws.strokes, savedAt: Date.now() } });
export const saveWorkspaceMeta = (ws) => dbPut('workspace', opWorkspace(ws).put);
