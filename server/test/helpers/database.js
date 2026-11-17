import Project from '../../src/models/Project.js';
import Resource from '../../src/models/Resource.js';
import MockData from '../../src/models/MockData.js';

export const projectId = '111111111111111111111111';
export const resourceId = '222222222222222222222222';
export const ownerId = '333333333333333333333333';
const plain = (value) => JSON.parse(JSON.stringify(value));

function query(load) {
  let skip = 0;
  let limit = Infinity;
  const result = () => {
    const value = load();
    return Array.isArray(value) ? value.slice(skip, skip + limit) : value;
  };
  return {
    sort() { return this; },
    skip(value) { skip = value; return this; },
    limit(value) { limit = value; return this; },
    async lean() { return plain(result()); },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
  };
}

export function mockDatabase(t) {
  const project = { _id: projectId, prefix: 'proj_test', owner: ownerId, name: 'Test' };
  let projectExists = true;
  let resourceExists = true;
  const resource = {
    _id: resourceId, projectId, resourceName: 'products',
    schemaDefinition: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] },
    markModified() {}, async save() { return this; }, toObject() { return plain(this); },
  };
  const records = new Map();
  let sequence = 0;
  const state = { project, resource, records, partialSeed: false, reads: 0 };
  const insert = (record) => {
    const doc = {
      _id: String(++sequence).padStart(24, '0'), createdAt: new Date(), ...record,
      markModified() {}, async save() { return this; },
    };
    records.set(doc._id, doc);
    return doc;
  };
  const matches = (doc, filter) => Object.entries(filter).every(([key, value]) =>
    value?.$in ? value.$in.includes(doc[key]) : String(doc[key]) === String(value));

  t.mock.method(Project, 'findOne', (filter) => query(() => {
    state.reads++;
    return projectExists && matches(project, filter) ? project : null;
  }));
  t.mock.method(Project, 'findByIdAndDelete', async () => { projectExists = false; });
  t.mock.method(Resource, 'findOne', (filter) => query(() => resourceExists && matches(resource, filter) ? resource : null));
  t.mock.method(Resource, 'findById', () => query(() => resourceExists ? resource : null));
  t.mock.method(Resource, 'find', () => query(() => resourceExists ? [resource] : []));
  t.mock.method(Resource, 'deleteMany', async () => { resourceExists = false; });
  t.mock.method(Resource, 'findByIdAndDelete', async () => { resourceExists = false; });
  t.mock.method(MockData, 'create', async (record) => insert(record));
  t.mock.method(MockData, 'find', (filter) => query(() => [...records.values()].filter((r) => matches(r, filter))));
  t.mock.method(MockData, 'countDocuments', async (filter) => [...records.values()].filter((r) => matches(r, filter)).length);
  t.mock.method(MockData, 'findOne', (filter) => query(() => [...records.values()].find((r) => matches(r, filter)) || null));
  t.mock.method(MockData, 'findOneAndDelete', async (filter) => {
    const record = [...records.values()].find((r) => matches(r, filter));
    if (record) records.delete(record._id);
    return record || null;
  });
  t.mock.method(MockData, 'deleteMany', async (filter) => {
    let deletedCount = 0;
    for (const record of records.values()) {
      if (matches(record, filter)) { records.delete(record._id); deletedCount++; }
    }
    return { deletedCount };
  });
  t.mock.method(MockData, 'insertMany', async (documents) => {
    if (state.partialSeed) {
      insert(documents[0]);
      const error = new Error('partial seed');
      error.name = 'MongoBulkWriteError';
      error.result = { insertedCount: 1 };
      throw error;
    }
    documents.forEach(insert);
    return { insertedCount: documents.length };
  });
  return state;
}
