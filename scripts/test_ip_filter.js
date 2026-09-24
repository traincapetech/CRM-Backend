const { isIPInRange } = require('../middleware/ipFilter');

const testCases = [
  // IPv4 Cases
  { ip: '122.183.57.15', range: '122.183.57.15', expected: true, desc: 'IPv4 exact match' },
  { ip: '122.183.57.15', range: '122.183.57.16', expected: false, desc: 'IPv4 exact mismatch' },
  { ip: '122.183.57.15', range: '122.183.0.0/16', expected: true, desc: 'IPv4 CIDR match (/16)' },
  { ip: '122.183.57.15', range: '122.183.57.0/24', expected: true, desc: 'IPv4 CIDR match (/24)' },
  { ip: '122.184.57.15', range: '122.183.0.0/16', expected: false, desc: 'IPv4 CIDR mismatch (/16)' },
  
  // IPv6 Cases
  { ip: '2401:4900:8f87:b514:8e8:858f:d6f0:2d77', range: '2401:4900:8f87:b514:8e8:858f:d6f0:2d77', expected: true, desc: 'IPv6 exact match' },
  { ip: '2401:4900:8f87:b514:8e8:858f:d6f0:2d77', range: '2401:4900:8f87:b514:8e8:858f:d6f0:2d78', expected: false, desc: 'IPv6 exact mismatch' },
  { ip: '2401:4900:8f87:b514:8e8:858f:d6f0:2d77', range: '2401:4900:8f87:b514::/64', expected: true, desc: 'IPv6 CIDR match (/64)' },
  { ip: '2401:4900:8f87:b514:8e8:858f:d6f0:2d77', range: '2401:4900::/32', expected: true, desc: 'IPv6 CIDR match (/32)' },
  { ip: '2402:4900:8f87:b514:8e8:858f:d6f0:2d77', range: '2401:4900::/32', expected: false, desc: 'IPv6 CIDR mismatch (/32)' },
  { ip: '2401:4900:8f87:b514:8e8:858f:d6f0:2d77', range: '2401:4900:8f87:b520::/60', expected: false, desc: 'IPv6 CIDR boundary mismatch (/60)' },
  { ip: '2401:4900:8f87:b514:8e8:858f:d6f0:2d77', range: '2401:4900:8f87:b514::/60', expected: true, desc: 'IPv6 CIDR boundary match (/60)' }
];

let passed = 0;
let failed = 0;

console.log('🧪 Starting IP Filter matching tests...\n');

for (const tc of testCases) {
  const result = isIPInRange(tc.ip, tc.range);
  if (result === tc.expected) {
    console.log(`✅ [PASS] ${tc.desc}: ip="${tc.ip}", range="${tc.range}" -> got ${result}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${tc.desc}: ip="${tc.ip}", range="${tc.range}" -> expected ${tc.expected}, got ${result}`);
    failed++;
  }
}

console.log(`\n📋 Test Summary: Passed ${passed}/${testCases.length}, Failed ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 All IP matching tests passed successfully!');
  process.exit(0);
}
