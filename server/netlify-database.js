// Adapt the existing D1-shaped persistence interface to parameterized Postgres.
// The single revision-checked UPDATE remains atomic in either database.
export function postgresWorkspaceDatabase(client,namespace){
 const queries=new Map([
  ['SELECT state_json, revision FROM workspace_state WHERE id = ?','SELECT state_json, revision FROM workspace_state WHERE id = $1'],
  ['UPDATE workspace_state SET state_json = ?, revision = ? WHERE id = ? AND revision = ?','UPDATE workspace_state SET state_json = $1, revision = $2 WHERE id = $3 AND revision = $4 RETURNING id'],
  ['INSERT OR IGNORE INTO workspace_state (id,state_json,revision) VALUES (?,?,?)','INSERT INTO workspace_state (id,state_json,revision) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING RETURNING id']
 ]);
 return {prepare(sql){const query=queries.get(sql);if(!query)throw Error('Unsupported workspace query.');let values=[];return {bind(...args){values=args.map((v,n)=>((sql.startsWith('SELECT')||sql.startsWith('INSERT'))?n===0:n===2)&&v==='team'?namespace:v);return this;},async first(){const rows=await client.sql.unsafe(query,values);return rows[0]||null;},async run(){const rows=await client.sql.unsafe(query,values);return {meta:{changes:rows.length}};}};}};
}
