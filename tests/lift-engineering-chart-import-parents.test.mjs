import assert from "node:assert/strict";
import test from "node:test";
import { getOrCreateChartImportParents } from "../lib/lift-engineering/chart-import-parents.ts";

function candidate(identityKey, sourceRow) {
  return { identityKey, manufacturerChartId: identityKey, sourceRows: [sourceRow], value: { manufacturer_configuration: { identityKey }, status: "Imported" } };
}

function createStore() {
  const parents = new Map();
  const points = new Map();
  let nextId = 1;
  return {
    parents,
    points,
    async findByIdentityKeys(keys) { return keys.flatMap((key) => parents.has(key) ? [parents.get(key)] : []); },
    async insert(items) {
      if (items.some((item) => parents.has(item.identityKey))) {
        const error = new Error("duplicate key violates lift_load_charts_import_identity_idx");
        error.code = "23505";
        throw error;
      }
      const inserted = items.map((item) => ({ id: `chart-${nextId++}`, status: "Imported", identityKey: item.identityKey, sourceDocument: {}, manufacturerConfiguration: { identityKey: item.identityKey } }));
      inserted.forEach((parent) => parents.set(parent.identityKey, parent));
      return inserted;
    },
    async upsertPoints(chartId, radii) { for (const radius of radii) points.set(`${chartId}|${radius}`, { chartId, radius }); },
  };
}

async function importBatch(store, candidates, radiiByIdentity, batchNumber) {
  const result = await getOrCreateChartImportParents(candidates, store, { batchNumber, dataOnly: false });
  for (const [identity, radii] of Object.entries(radiiByIdentity)) {
    await store.upsertPoints(result.parentsByIdentity.get(identity).id, radii);
  }
  return result;
}

test("cross-batch import reuses configuration A and creates B once", async () => {
  const store = createStore();
  const first = await importBatch(store, [candidate("A", 2)], { A: [10, 12] }, 1);
  const aId = first.parentsByIdentity.get("A").id;
  const second = await importBatch(store, [candidate("A", 4), candidate("B", 5)], { A: [14], B: [10] }, 2);

  assert.equal(first.createdCount, 1);
  assert.equal(second.matchedCount, 1);
  assert.equal(second.createdCount, 1);
  assert.equal(second.parentsByIdentity.get("A").id, aId);
  assert.equal(store.parents.size, 2);
  assert.ok(store.points.has(`${aId}|14`));
  assert.ok(store.points.has(`${second.parentsByIdentity.get("B").id}|10`));
});

test("failed-batch retry and restarting the same revision are idempotent", async () => {
  const store = createStore();
  const first = await importBatch(store, [candidate("A", 2)], { A: [10, 12] }, 1);
  const aId = first.parentsByIdentity.get("A").id;
  await importBatch(store, [candidate("A", 4), candidate("B", 5)], { A: [14], B: [10] }, 2);

  const retry = await importBatch(store, [candidate("A", 4), candidate("B", 5)], { A: [14], B: [10] }, 2);
  const restarted = await importBatch(store, [candidate("A", 2), candidate("B", 5)], { A: [10, 12], B: [10] }, 1);

  assert.equal(retry.createdCount, 0);
  assert.equal(retry.matchedCount, 2);
  assert.equal(restarted.createdCount, 0);
  assert.equal(restarted.matchedCount, 2);
  assert.equal(retry.parentsByIdentity.get("A").id, aId);
  assert.equal(store.parents.size, 2);
  assert.equal(store.points.size, 4);
});

test("one exact configuration can span three or more separate batches", async () => {
  const store = createStore();
  const ids = [];
  for (let batch = 1; batch <= 4; batch += 1) {
    const result = await importBatch(store, [candidate("A", batch + 1)], { A: [batch * 2] }, batch);
    ids.push(result.parentsByIdentity.get("A").id);
  }
  assert.equal(new Set(ids).size, 1);
  assert.equal(store.parents.size, 1);
  assert.equal(store.points.size, 4);
});

test("a concurrent identity insert is re-fetched and reused after SQLSTATE 23505", async () => {
  const store = createStore();
  const originalFind = store.findByIdentityKeys.bind(store);
  let injected = false;
  store.findByIdentityKeys = async (keys) => {
    const existing = await originalFind(keys);
    if (!injected && keys.includes("A")) {
      injected = true;
      store.parents.set("A", { id: "concurrent-chart-A", status: "Imported", identityKey: "A", sourceDocument: {} });
    }
    return existing;
  };
  const result = await importBatch(store, [candidate("A", 19)], { A: [20] }, 3);
  assert.equal(result.parentsByIdentity.get("A").id, "concurrent-chart-A");
  assert.equal(result.createdCount, 0);
  assert.equal(result.matchedCount, 1);
  assert.ok(store.points.has("concurrent-chart-A|20"));
});

test("same import identity cannot overwrite a verified parent", async () => {
  const store = createStore();
  store.parents.set("A", { id: "verified-chart-A", status: "Verified", identityKey: "A", sourceDocument: {} });
  await assert.rejects(
    getOrCreateChartImportParents([candidate("A", 10)], store, { batchNumber: 7, dataOnly: false }),
    /is Verified; create a new chart revision/,
  );
  assert.equal(store.parents.get("A").status, "Verified");
});
