export interface WorkspaceEntity {
  id: string;
  workspaceId: string;
}

export class WorkspaceRepository<T extends WorkspaceEntity> {
  readonly #workspaceId: string;
  readonly #items: Map<string, T>;

  constructor(workspaceId: string, initial: T[] = []) {
    this.#workspaceId = workspaceId;
    this.#items = new Map(
      initial
        .filter((item) => item.workspaceId === workspaceId)
        .map((item) => [item.id, structuredClone(item)]),
    );
  }

  list(): T[] {
    return [...this.#items.values()].map((item) => structuredClone(item));
  }

  get(id: string): T | undefined {
    const item = this.#items.get(id);
    return item ? structuredClone(item) : undefined;
  }

  put(item: T): T {
    if (item.workspaceId !== this.#workspaceId)
      throw new WorkspaceIsolationError(this.#workspaceId, item.workspaceId);
    this.#items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  remove(id: string): boolean {
    return this.#items.delete(id);
  }

  query(predicate: (item: T) => boolean): T[] {
    return this.list().filter(predicate);
  }
}

export class WorkspaceIsolationError extends Error {
  constructor(expected: string, received: string) {
    super(`Workspace isolation violation: expected ${expected}, received ${received}`);
    this.name = "WorkspaceIsolationError";
  }
}
