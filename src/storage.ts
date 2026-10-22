import { Capacitor } from '@capacitor/core';
import { freshState, type Entry, type Snapshot, type State } from './model';

export interface Store {
  read(): Promise<Snapshot>;
  saveState(state: State): Promise<void>;
  replace(snapshot: Snapshot): Promise<void>;
}
const empty = (): Snapshot => ({ entries: [], state: freshState() });
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}
function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('保存被中断'));
  });
}
async function browserStore(): Promise<Store> {
  const opening = indexedDB.open('hanzi100-mobile', 1);
  opening.onupgradeneeded = () => {
    opening.result.createObjectStore('entries', { keyPath: 'id' });
    opening.result.createObjectStore('state');
  };
  const db = await request(opening);
  return {
    async read() {
      const tx = db.transaction(['entries', 'state']);
      const entries = request(tx.objectStore('entries').getAll()) as Promise<Entry[]>;
      const state = request(tx.objectStore('state').get('user')) as Promise<State | undefined>;
      return { entries: await entries, state: (await state) || freshState() };
    },
    async saveState(state) {
      const tx = db.transaction('state', 'readwrite');
      const done = complete(tx);
      tx.objectStore('state').put(state, 'user');
      await done;
    },
    async replace(snapshot) {
      const tx = db.transaction(['entries', 'state'], 'readwrite'),
        done = complete(tx);
      tx.objectStore('entries').clear();
      snapshot.entries.forEach((e) => tx.objectStore('entries').put(e));
      tx.objectStore('state').put(snapshot.state, 'user');
      await done;
    },
  };
}
async function nativeStore(): Promise<Store> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency();
  const existing = await sqlite.isConnection('hanzi100', false);
  const db = existing.result
    ? await sqlite.retrieveConnection('hanzi100', false)
    : await sqlite.createConnection('hanzi100', false, 'no-encryption', 1, false);
  await db.open();
  await db.execute(
    'CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, data TEXT NOT NULL);',
  );
  return {
    async read() {
      const entries = await db.query('SELECT data FROM entries ORDER BY rowid');
      const state = await db.query('SELECT data FROM app_state WHERE id=1');
      return {
        entries: (entries.values || []).map((row) => JSON.parse(row.data)),
        state: state.values?.length ? JSON.parse(state.values[0].data) : empty().state,
      };
    },
    async saveState(state) {
      await db.run('INSERT OR REPLACE INTO app_state(id,data) VALUES(1,?)', [
        JSON.stringify(state),
      ]);
    },
    async replace(snapshot) {
      await db.executeSet(
        [
          { statement: 'DELETE FROM entries', values: [] },
          ...snapshot.entries.map((e) => ({
            statement: 'INSERT INTO entries(id,data) VALUES(?,?)',
            values: [e.id, JSON.stringify(e)],
          })),
          {
            statement: 'INSERT OR REPLACE INTO app_state(id,data) VALUES(1,?)',
            values: [JSON.stringify(snapshot.state)],
          },
        ],
        true,
      );
    },
  };
}
export const openStore = (): Promise<Store> =>
  Capacitor.isNativePlatform() ? nativeStore() : browserStore();
