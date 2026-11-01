import assert from 'node:assert/strict';
import {weekDays,duration,parseDuration,validateChanges,decimal} from '../week-changes-core.js';
assert.deepEqual(weekDays('2026-10-30','2026-10'),['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31']);
assert.deepEqual(weekDays('2026-11-06','2026-11'),['2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08']);
assert.deepEqual(weekDays('2027-01-01','2027-01'),['2027-01-01','2027-01-02','2027-01-03']);
assert.equal(duration(1,40),100);assert.equal(decimal(100),'1,67');for(const [h,m]of [[0,0],[1,60],[-1,30],['1.5',0],[24,1]])assert.throws(()=>duration(h,m));
const rows=weekDays('2026-10-30','2026-10').map(day=>({day,supplementary_minutes:0,cause:'',absence_scope:null,absence_minutes:null}));rows[0].supplementary_minutes=100;rows[1]={...rows[1],cause:'F',absence_scope:'full'};rows[2]={...rows[2],cause:'PHR',absence_scope:'partial',absence_minutes:90};
assert.equal(validateChanges(rows,'2026-10-30','2026-10','2026-10-31').length,6);
assert.throws(()=>validateChanges(rows,'2026-10-30','2026-10','2026-10-30'));assert.throws(()=>validateChanges([...rows.slice(0,5),rows[0]],'2026-10-30','2026-10','2026-10-31'));
assert.throws(()=>validateChanges(rows.map((r,i)=>i===2?{...r,absence_minutes:0}:r),'2026-10-30','2026-10','2026-10-31'));
console.log('Passed: week/month boundaries, minutes and decimals, no changes, full/partial absences, duplicate and future-day rejection.');

for(const text of ['1,30','1.30','1:30','1;30','1 30','1h30','1 h 30','1 ora e 30 minuti','90 min','90 minuti'])assert.equal(parseDuration(text),90,text);
assert.equal(parseDuration('1'),60);assert.equal(parseDuration('1,5'),65);assert.equal(parseDuration('24:00'),1440);assert.equal(parseDuration('0:40'),40);assert.equal(decimal(parseDuration('3:40')),'3,67');assert.equal(decimal(parseDuration('1,30')),'1,50');
for(const text of ['','0','1:75','24:01','-1:30','1,30,0','abc','1.50h','1441 min','1:30 extra'])assert.throws(()=>parseDuration(text),text);
console.log('Passed: flexible duration formats, precise minutes, decimal output and malformed input rejection.');
