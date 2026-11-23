import {getUser} from '@netlify/identity';
import {getDatabase} from '@netlify/database';
import {createNetlifyApi} from '../../server/netlify-api.js';
import {deployment} from '../generated/deployment.mjs';

const handler=createNetlifyApi({getUser,getDatabase,getEnv:()=>({...process.env,CONTEXT:deployment.context,BRANCH:deployment.branch})});
export default handler;
export const config={path:'/api/*'};
