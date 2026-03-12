const electron = require('electron');
console.log('Type of electron:', typeof electron);
console.log('Value of electron:', electron);
if (typeof electron === 'object') {
    console.log('Keys:', Object.keys(electron));
}
process.exit(0);
