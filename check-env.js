require('dotenv').config();

console.log('Checking environment variables...');
console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'Set' : 'Not set');
console.log('EMAIL_PASS:', process.env.EMAIL_PASS ? 'Set' : 'Not set');
console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
console.log('MONGOMongo_URI:', process.env.MONGOMongo_URI ? 'Set' : 'Not set');
console.log('NODE_ENV:', process.env.NODE_ENV || 'development'); 