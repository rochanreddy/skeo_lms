// Everything in this folder writes thousands of records and deletes its own
// previous run. server/.env holds the real connection string, so one forgotten
// MONGODB_URI would aim all of that at the live database -- and dotenv would
// supply it without a word. Refusing here is cheaper than remembering.
export function assertThrowawayDb(uri = process.env.MONGODB_URI) {
  let url;
  try {
    url = new URL(uri);
  } catch {
    throw new Error('MONGODB_URI must be a local throwaway database, e.g. mongodb://127.0.0.1:27019/skeo_loadtest');
  }
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  const name = url.pathname.slice(1);
  if (!local || !/load/i.test(name)) {
    throw new Error(`Refusing to touch ${url.hostname}/${name}: load tests only run on a local database with "load" in its name.`);
  }
  return uri;
}
