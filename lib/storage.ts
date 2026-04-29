import { Project, emptyProject } from './types';

const STORAGE_KEY = 'venturelab_project';
const CLASS_KEY = 'venturelab_classid';
const TEAM_KEY = 'venturelab_teamid';

export function genId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

export function toDeviceCode(teamId: string): string {
  return teamId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function normalizeClassId(raw: string): string {
  return (raw || '').trim().replace(/\//g, '').replace(/\s+/g, '-');
}

export function loadLocal(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...emptyProject(), ...JSON.parse(raw) };
  } catch {}
  return emptyProject();
}

export function saveLocal(project: Project): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
  } catch {}
}

export function getStoredClassId(): string {
  try {
    return localStorage.getItem(CLASS_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredClassId(id: string): void {
  try {
    localStorage.setItem(CLASS_KEY, id);
  } catch {}
}

export function getOrCreateTeamId(): string {
  try {
    let id = localStorage.getItem(TEAM_KEY);
    if (!id) {
      id = genId();
      localStorage.setItem(TEAM_KEY, id);
    }
    return id;
  } catch {
    return genId();
  }
}

export function setStoredTeamId(id: string): void {
  try {
    localStorage.setItem(TEAM_KEY, id);
  } catch {}
}
