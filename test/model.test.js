import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDemo,validWorkspace,csv} from '../dist/model.js';
test('sample workspace and empty workspace pass backup validation',()=>{assert.equal(validWorkspace(makeDemo()),true);assert.equal(validWorkspace({version:1,parts:[],materials:[]}),true);});
test('backup validation rejects bad statuses, duplicate IDs, invalid quantities and malformed records',()=>{for(const mutate of [d=>d.parts[0].status='Unknown',d=>d.parts[0].quantity=-1,d=>d.parts[0].quantity=1.5,d=>d.parts.push({...d.parts[0]}),d=>d.materials[0].stock=-1,d=>d.parts[0].due='bad date',d=>d.parts[0]=null]){const data=makeDemo();mutate(data);assert.equal(validWorkspace(data),false);}assert.equal(validWorkspace({version:2,parts:[],materials:[]}),false);});
test('CSV escapes multiline notes, quotation marks, and spreadsheet formulas',()=>{assert.equal(csv([['a,b','say "hi"','line\nbreak','=SUM(A1)',' +123']]),'"a,b","say ""hi""","line\nbreak","\'=SUM(A1)","\' +123"');});
